const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const logs = await db.auditLog.findMany({
    where: { entityId: 'cmsqokady0001vm4o32m0ptvd', userRole: 'EXTERNAL_FHIR' },
    orderBy: { createdAt: 'desc' },
    take: 5,
  })
  console.log(`Found ${logs.length} FHIR audit entries for visit cmsqokady...`)
  for (const l of logs) {
    console.log('  Action:', l.action)
    console.log('  Description:', l.description)
    console.log('  Metadata:', JSON.stringify(l.metadata, null, 4))
    console.log('  ---')
  }
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
