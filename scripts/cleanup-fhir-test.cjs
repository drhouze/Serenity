const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const toDelete = [
    'cmsr1vfj50001q2lb6wxk98vy',
    'cmsr1vfsd0005q2lb1zaai9jh',
  ]
  for (const id of toDelete) {
    try { await db.visit.delete({ where: { id } }); console.log('Deleted', id) }
    catch (e) { console.log('Skip', id, '(already gone)') }
  }
  await db.$disconnect()
})()
