const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const fs = require('fs')
  const ids = []
  for (const f of ['/tmp/test-appt-id.txt', '/tmp/test-appt-id-fhir.txt']) {
    try { ids.push(fs.readFileSync(f, 'utf8').trim()) } catch {}
  }
  // Also delete the DIETITIAN test visit from the replace test
  ids.push('cmsrell700003rg1e2zswh6it')
  for (const id of ids) {
    try { await db.visit.delete({ where: { id } }); console.log('Deleted', id) }
    catch (e) { console.log('Skip', id, '(already gone)') }
  }
  await db.$disconnect()
})()
