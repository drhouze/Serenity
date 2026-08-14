// Test the backup and restore endpoints end-to-end
// Usage: node scripts/test-backup-restore.mjs
//
// What this does:
//   1. Start the Next.js dev server (if not already running)
//   2. Login as APP_DEVELOPER
//   3. Call GET /api/backup — save the JSON file
//   4. Verify the JSON has the expected tables
//   5. Call POST /api/restore with the same file
//   6. Verify restore returns success with imported count > 0
//
// This test is non-destructive: it backs up then restores the same data,
// so the database ends up exactly as it started (minus any race conditions
// with concurrent writes).

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

const BACKUP_FILE = path.join(ROOT, 'db', `test-backup-${Date.now()}.json`)

// Read credentials from .env.local or use defaults
const envPath = path.join(ROOT, '.env.local')
const envText = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
const getEnv = (key) => {
  const m = envText.match(new RegExp(`^${key}=(.+)$`, 'm'))
  return m ? m[1].trim().replace(/^["']|["']$/g, '') : ''
}

const PORT = process.env.PORT || '3000'
const BASE_URL = `http://localhost:${PORT}`

// Try developer credentials from env, otherwise fail with helpful message
const DEV_EMAIL = process.env.DEV_EMAIL || getEnv('DEV_EMAIL') || 'dev@local.test'
const DEV_PASSWORD = process.env.DEV_PASSWORD || getEnv('DEV_PASSWORD') || ''

async function main() {
  console.log('=== Backup / Restore End-to-End Test ===\n')
  console.log(`Target: ${BASE_URL}`)

  // Step 1: Login
  console.log('\n[1/5] Logging in as APP_DEVELOPER...')
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: DEV_EMAIL, password: DEV_PASSWORD }),
  })
  if (!loginRes.ok) {
    console.error(`Login failed: ${loginRes.status} ${await loginRes.text()}`)
    process.exit(1)
  }
  const setCookie = loginRes.headers.get('set-cookie') || ''
  const cookie = setCookie.split(';')[0]
  console.log(`✓ Logged in as ${DEV_EMAIL}`)

  // Step 2: Backup
  console.log('\n[2/5] Calling GET /api/backup...')
  const t0 = Date.now()
  const backupRes = await fetch(`${BASE_URL}/api/backup`, {
    headers: { Cookie: cookie },
  })
  if (!backupRes.ok) {
    console.error(`Backup failed: ${backupRes.status} ${await backupRes.text()}`)
    process.exit(1)
  }
  const backupText = await backupRes.text()
  const backupMs = Date.now() - t0
  fs.writeFileSync(BACKUP_FILE, backupText)
  const backupSize = Buffer.byteLength(backupText)
  console.log(`✓ Backup downloaded in ${backupMs}ms (${(backupSize / 1024).toFixed(1)} KB)`)
  console.log(`  Saved to: ${BACKUP_FILE}`)

  // Step 3: Validate backup JSON
  console.log('\n[3/5] Validating backup JSON structure...')
  const backup = JSON.parse(backupText)
  if (!backup._meta) {
    console.error('✗ Missing _meta in backup')
    process.exit(1)
  }
  if (!backup.data) {
    console.error('✗ Missing data in backup')
    process.exit(1)
  }
  const tables = Object.keys(backup.data)
  console.log(`✓ Backup contains ${tables.length} tables`)
  const expectedTables = ['organizations', 'facilities', 'users', 'residents', 'rooms', 'staff', 'invoices']
  for (const t of expectedTables) {
    if (!tables.includes(t)) {
      console.error(`✗ Missing expected table: ${t}`)
      process.exit(1)
    }
  }
  console.log(`✓ All expected tables present`)
  console.log(`  Scope: ${backup._meta.scope}`)
  console.log(`  Exported by: ${backup._meta.exportedBy}`)
  console.log(`  Version: ${backup._meta.version}`)

  // Print row counts for top tables
  console.log('\n  Row counts:')
  for (const t of ['organizations', 'facilities', 'users', 'residents', 'rooms', 'staff', 'medications', 'invoices', 'auditLogs']) {
    const count = backup.data[t]?.length || 0
    console.log(`    ${t}: ${count}`)
  }

  // Step 4: Restore
  console.log('\n[4/5] Calling POST /api/restore with the same backup file...')
  const formData = new FormData()
  const fileBuffer = fs.readFileSync(BACKUP_FILE)
  const blob = new Blob([fileBuffer], { type: 'application/json' })
  formData.append('file', blob, path.basename(BACKUP_FILE))

  const t1 = Date.now()
  const restoreRes = await fetch(`${BASE_URL}/api/restore`, {
    method: 'POST',
    headers: { Cookie: cookie },
    body: formData,
  })
  const restoreMs = Date.now() - t1
  const restoreResult = await restoreRes.json()
  if (!restoreRes.ok) {
    console.error(`✗ Restore failed: ${restoreRes.status}`)
    console.error(JSON.stringify(restoreResult, null, 2))
    process.exit(1)
  }
  console.log(`✓ Restore completed in ${restoreMs}ms`)
  console.log(`  Imported: ${restoreResult.imported}`)
  console.log(`  Errors: ${restoreResult.errors}`)
  console.log(`  Message: ${restoreResult.message}`)

  if (restoreResult.imported === 0) {
    console.error('✗ Expected imported > 0, got 0')
    process.exit(1)
  }

  // Step 5: Verify by re-fetching one table
  console.log('\n[5/5] Verifying data integrity post-restore...')
  const verifyRes = await fetch(`${BASE_URL}/api/facilities`, {
    headers: { Cookie: cookie },
  })
  if (!verifyRes.ok) {
    console.error(`✗ Verify fetch failed: ${verifyRes.status}`)
    process.exit(1)
  }
  const facilities = await verifyRes.json()
  const expectedCount = backup.data.facilities.length
  if (facilities.length !== expectedCount) {
    console.error(`✗ Facility count mismatch: expected ${expectedCount}, got ${facilities.length}`)
    process.exit(1)
  }
  console.log(`✓ Facilities count matches backup (${facilities.length})`)

  // Cleanup
  fs.unlinkSync(BACKUP_FILE)
  console.log(`\n✓ Cleaned up test backup file`)

  console.log('\n=== ALL TESTS PASSED ===')
  console.log('Backup and restore endpoints work correctly.')
}

main().catch(err => {
  console.error('\n=== TEST FAILED ===')
  console.error(err)
  process.exit(1)
})
