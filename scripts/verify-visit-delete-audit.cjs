const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const logs = await db.auditLog.findMany({
    where: { action: 'VISIT_DELETED', entityId: 'cmsre42ee0002rggig528km4d' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  console.log(`Found ${logs.length} VISIT_DELETED audit entries for the test visit`)
  for (const l of logs) {
    console.log('---')
    console.log('  user        :', l.userName, '(', l.userRole, ')')
    console.log('  action      :', l.action)
    console.log('  description :', l.description)
    console.log('  facility    :', l.facilityName)
    console.log('  metadata    :', JSON.stringify(l.metadata, null, 2))
  }
  const ok = logs.length === 1
  console.log()
  console.log(ok ? '✓ PASS: VISIT_DELETED audit entry written with full context' : '✗ FAIL: expected 1 entry, found ' + logs.length)
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
