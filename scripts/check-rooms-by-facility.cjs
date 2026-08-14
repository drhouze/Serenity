const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const facilities = await db.facility.findMany({ select: { id: true, name: true } })
  for (const f of facilities) {
    const count = await db.room.count({ where: { facilityId: f.id } })
    console.log(`${f.name}: ${count} rooms`)
  }
  await db.$disconnect()
})()
