const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const logs = await db.auditLog.findMany({
    where: { userRole: 'EXTERNAL_API', entityId: 'cmsqokady0001vm4o32m0ptvd' },
    take: 3,
    orderBy: { createdAt: 'desc' },
  })
  for (const l of logs) {
    console.log('Audit entry:')
    console.log('  user        :', l.userName, '(', l.userRole, ')')
    console.log('  action      :', l.action)
    console.log('  description :', l.description)
    console.log('  facility    :', l.facilityName)
    console.log('  metadata    :', l.metadata)
  }
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
