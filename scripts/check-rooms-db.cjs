const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const count = await db.room.count()
  console.log(`Total rooms in DB: ${count}`)
  const rooms = await db.room.findMany({ take: 5, select: { id: true, roomNumber: true, facilityId: true, status: true } })
  for (const r of rooms) console.log(`  ${r.roomNumber} | fac=${r.facilityId} | status=${r.status}`)
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
