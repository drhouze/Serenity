const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const ids = ['cmsr1krp40001q29pm5xrmon1', 'cmsr1krp50003q29pe9v8h8he', 'cmsr1krp50005q29p6h6hhmmr', 'cmsr1krp60007q29p1nuc1s3t']
  for (const id of ids) {
    await db.medAdministration.delete({ where: { id } }).catch(() => {})
  }
  console.log('Cleaned up 4 test med administration records')
  await db.$disconnect()
})()
