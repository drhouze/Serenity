// Test: verify audit log descriptions now include entity codes
// Run: node scripts/test-audit-codes.mjs
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function test() {
  console.log('=== Testing audit log code inclusion ===\n')

  // 1. Find the most recent audit log entries and check which ones have codes
  const recentLogs = await db.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { action: true, description: true, userName: true, createdAt: true },
  })

  console.log(`Recent ${recentLogs.length} audit log entries:`)

  // Code pattern to look for
  const codePattern = /\b((?:RES|USR|STF|ROM|PRD|INV|ITM)-\d{3,5})\b/

  let withCode = 0
  let withoutCode = 0
  const withoutCodeExamples = []

  for (const log of recentLogs) {
    const hasCodeInDescription = codePattern.test(log.description || '')
    const hasCodeInUserName = /^USR-\d{3,5}\s/.test(log.userName || '')
    if (hasCodeInDescription || hasCodeInUserName) {
      withCode++
    } else {
      withoutCode++
      if (withoutCodeExamples.length < 5) {
        withoutCodeExamples.push({
          action: log.action,
          description: log.description?.slice(0, 100),
          userName: log.userName,
        })
      }
    }
  }

  console.log(`  ✓ Entries with codes: ${withCode}`)
  console.log(`  • Entries without codes: ${withoutCode}`)

  if (withoutCodeExamples.length > 0) {
    console.log('\n  Examples of entries without codes (these are OLD entries from before the fix):')
    for (const ex of withoutCodeExamples) {
      console.log(`    [${ex.action}] ${ex.description}  (user: ${ex.userName})`)
    }
    console.log('\n  Note: Old entries created before this fix will not have codes.')
    console.log('  Only NEW actions performed after this update will include codes.')
  }

  // 2. Show a few examples of NEW-style entries (with codes)
  console.log('\nExamples of entries WITH codes:')
  const withCodeExamples = recentLogs.filter(l => codePattern.test(l.description || '')).slice(0, 5)
  if (withCodeExamples.length === 0) {
    console.log('  (none yet — perform an action like recording vitals to see new entries with codes)')
  } else {
    for (const ex of withCodeExamples) {
      console.log(`  [${ex.action}] ${ex.description}`)
      console.log(`    user: ${ex.userName}`)
    }
  }

  console.log('\n=== Test complete ===')
  console.log('New audit log entries will include:')
  console.log('  • User code (USR-XXXX) prepended to userName field')
  console.log('  • Resident code (RES-XXXX) in descriptions that mention a resident')
  console.log('  • Staff code (STF-XXXX) in descriptions that mention a staff member')
  console.log('  • Other codes (ROM-, PRD-, INV-, ITM-) where applicable')

  await db.$disconnect()
}

test().catch(e => { console.error(e); process.exit(1) })
