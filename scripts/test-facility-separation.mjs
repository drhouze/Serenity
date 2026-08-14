// Test facility data separation — verify that a manager/nurse from one facility
// CANNOT patch/delete records belonging to another facility.
//
// Usage: node scripts/test-facility-separation.mjs
//
// Prerequisites:
//   - Dev server running on port 3000
//   - A MANAGER user with facilityIds containing only one facility

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
const require = createRequire(import.meta.url)
const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')

const PORT = process.env.PORT || '3000'
const BASE_URL = `http://localhost:${PORT}`

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    throw new Error(`Login failed for ${email}: ${res.status} ${await res.text()}`)
  }
  const setCookie = res.headers.get('set-cookie') || ''
  return setCookie.split(';')[0]
}

async function main() {
  console.log('=== Facility Data Separation Test ===\n')

  // Find a MANAGER user in the DB
  const db = new PrismaClient()
  const managers = await db.user.findMany({
    where: { role: 'MANAGER', active: true },
    select: { id: true, email: true, name: true, facilityIds: true, passwordHash: true },
  })
  if (managers.length === 0) {
    console.log('⚠ No MANAGER users found in DB — skipping test')
    await db.$disconnect()
    return
  }
  // Pick the first manager and set their password
  const manager = managers[0]
  const password = 'Manager123!'
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  await db.user.update({ where: { id: manager.id }, data: { passwordHash: salt + ':' + hash } })
  console.log(`Using MANAGER: ${manager.email} (${manager.name})`)
  console.log(`  facilityIds: ${manager.facilityIds || '(none)'}`)
  await db.$disconnect()

  const managerCookie = await login(manager.email, password)
  console.log('✓ Logged in as MANAGER')

  // Find a developer cookie for comparison
  const devEmail = 'dev@gmail.com'
  const devPassword = 'dev123356'
  let devCookie
  try {
    devCookie = await login(devEmail, devPassword)
    console.log('✓ Logged in as APP_DEVELOPER')
  } catch {
    console.log('⚠ Could not login as developer — skipping cross-role test')
  }

  // Get all facilities
  const facilitiesRes = await fetch(`${BASE_URL}/api/facilities`, { headers: { Cookie: devCookie } })
  const facilities = await facilitiesRes.json()
  console.log(`\nFound ${facilities.length} facilities:`)
  for (const f of facilities) {
    console.log(`  ${f.id} - ${f.name}`)
  }

  // Manager's accessible facility IDs
  const managerFids = (manager.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
  console.log(`\nManager's accessible facility IDs: ${managerFids.length}`)

  if (managerFids.length === 0) {
    console.log('⚠ Manager has no facilityIds — skipping cross-facility test')
    return
  }

  // Find a facility that the manager CANNOT access AND has residents
  const inaccessibleFid = facilities.find(f =>
    !managerFids.includes(f.id) &&
    (f._count?.residents || 0) > 0
  )
  if (!inaccessibleFid) {
    console.log('⚠ No inaccessible facility with residents found — skipping test')
    return
  }
  console.log(`\nInaccessible facility for manager: ${inaccessibleFid.id} - ${inaccessibleFid.name} (${inaccessibleFid._count?.residents} residents)`)

  // Find a resident in the inaccessible facility (use developer cookie to fetch all)
  const residentsRes = await fetch(`${BASE_URL}/api/facilities`, { headers: { Cookie: devCookie } })
  // We need residents — use the data API directly with developer cookie
  const allResidentsRes = await fetch(`${BASE_URL}/api/data?type=residents&facilityId=${inaccessibleFid.id}`, { headers: { Cookie: devCookie } })
  const allResidents = await allResidentsRes.json()
  const inaccessibleResident = Array.isArray(allResidents) ? allResidents.find(r => r.facilityId === inaccessibleFid.id) : null
  if (!inaccessibleResident) {
    console.log(`⚠ No residents found in inaccessible facility — skipping PATCH test`)
    return
  }
  console.log(`Target resident: ${inaccessibleResident.code} ${inaccessibleResident.firstName} (facility: ${inaccessibleResident.facilityId})`)

  // === Test 1: Manager PATCHes resident in inaccessible facility — should be 403 ===
  console.log('\n[1/3] Attempting PATCH on inaccessible resident as MANAGER...')
  const patchRes = await fetch(
    `${BASE_URL}/api/data?type=residents&id=${inaccessibleResident.id}`,
    {
      method: 'PATCH',
      headers: { Cookie: managerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ allergies: 'TEST-INJECTION-ATTEMPT' }),
    },
  )
  console.log(`  HTTP ${patchRes.status}`)
  const patchResult = await patchRes.json()
  if (patchRes.status === 403) {
    console.log(`✓ BLOCKED — facility separation enforced: ${patchResult.error}`)
  } else if (patchRes.ok) {
    console.log(`✗ SECURITY HOLE — Manager patched resident in inaccessible facility!`)
    console.log(JSON.stringify(patchResult, null, 2))
    process.exit(1)
  } else {
    console.log(`? Unexpected status: ${patchRes.status}`)
    console.log(JSON.stringify(patchResult, null, 2))
  }

  // === Test 2: Manager DELETEs resident in inaccessible facility — should be 403 ===
  console.log('\n[2/3] Attempting DELETE on inaccessible resident as MANAGER...')
  const deleteRes = await fetch(
    `${BASE_URL}/api/data?type=residents&id=${inaccessibleResident.id}`,
    {
      method: 'DELETE',
      headers: { Cookie: managerCookie },
    },
  )
  console.log(`  HTTP ${deleteRes.status}`)
  const deleteResult = await deleteRes.json()
  if (deleteRes.status === 403) {
    console.log(`✓ BLOCKED — facility separation enforced: ${deleteResult.error}`)
  } else if (deleteRes.ok) {
    console.log(`✗ SECURITY HOLE — Manager deleted resident in inaccessible facility!`)
    process.exit(1)
  } else {
    console.log(`? Unexpected status: ${deleteRes.status}`)
    console.log(JSON.stringify(deleteResult, null, 2))
  }

  // === Test 3: Manager creates a vital sign for an inaccessible resident — should be 403 ===
  console.log('\n[3/3] Attempting to POST vital sign for inaccessible resident as MANAGER...')
  const postRes = await fetch(
    `${BASE_URL}/api/data?type=vitals`,
    {
      method: 'POST',
      headers: { Cookie: managerCookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        residentId: inaccessibleResident.id,
        temperature: 36.5,
        recordedAt: new Date().toISOString(),
      }),
    },
  )
  console.log(`  HTTP ${postRes.status}`)
  const postResult = await postRes.json()
  if (postRes.status === 403) {
    console.log(`✓ BLOCKED — facility separation enforced: ${postResult.error}`)
  } else if (postRes.ok) {
    console.log(`✗ SECURITY HOLE — Manager created vital sign for inaccessible resident!`)
    process.exit(1)
  } else {
    console.log(`? Unexpected status: ${postRes.status}`)
    console.log(JSON.stringify(postResult, null, 2))
  }

  console.log('\n=== FACILITY SEPARATION TEST PASSED ===')
  console.log('Manager cannot PATCH/DELETE/POST records belonging to an inaccessible facility.')

  // === Regression check: Manager CAN fetch their own facility's residents ===
  console.log('\n=== Regression Check: Manager CAN access their own facility ===')
  const ownResidentsRes = await fetch(
    `${BASE_URL}/api/data?type=residents&facilityId=${managerFids[0]}`,
    { headers: { Cookie: managerCookie } },
  )
  if (!ownResidentsRes.ok) {
    console.log(`✗ Manager CANNOT fetch own facility residents: HTTP ${ownResidentsRes.status}`)
    process.exit(1)
  }
  const ownResidents = await ownResidentsRes.json()
  console.log(`✓ Manager can fetch own facility residents: ${ownResidents.length} records`)

  // Find an own-facility resident to PATCH (sanity check that PATCH still works for own facility)
  const ownResident = Array.isArray(ownResidents) ? ownResidents.find(r => r.facilityId === managerFids[0]) : null
  if (ownResident) {
    const ownPatchRes = await fetch(
      `${BASE_URL}/api/data?type=residents&id=${ownResident.id}`,
      {
        method: 'PATCH',
        headers: { Cookie: managerCookie, 'Content-Type': 'application/json' },
        body: JSON.stringify({ allergies: 'TEST-OWN-FACILITY-OK' }),
      },
    )
    if (ownPatchRes.ok) {
      console.log(`✓ Manager CAN patch own facility's resident (HTTP ${ownPatchRes.status})`)
      // Revert the change
      await fetch(
        `${BASE_URL}/api/data?type=residents&id=${ownResident.id}`,
        {
          method: 'PATCH',
          headers: { Cookie: managerCookie, 'Content-Type': 'application/json' },
          body: JSON.stringify({ allergies: ownResident.allergies }),
        },
      )
    } else {
      console.log(`✗ Manager CANNOT patch own facility's resident: HTTP ${ownPatchRes.status}`)
      const r = await ownPatchRes.json()
      console.log(JSON.stringify(r))
      process.exit(1)
    }
  } else {
    console.log('⚠ No own-facility resident found — skipping PATCH regression check')
  }

  console.log('\n=== ALL TESTS PASSED ===')
}

main().catch(err => {
  console.error('\n=== TEST FAILED ===')
  console.error(err)
  process.exit(1)
})
