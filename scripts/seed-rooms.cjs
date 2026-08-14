const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const facilities = await db.facility.findMany({ select: { id: true, name: true } })
  for (const f of facilities) {
    const count = await db.room.count({ where: { facilityId: f.id } })
    if (count === 0) {
      // Seed 5 rooms
      for (let i = 101; i <= 105; i++) {
        await db.room.create({
          data: {
            roomNumber: String(i),
            floor: 1,
            capacity: i <= 102 ? 2 : 1,
            type: i <= 102 ? 'SEMI_PRIVATE' : 'PRIVATE',
            status: 'AVAILABLE',
            facilityId: f.id,
          }
        })
      }
      console.log(`✓ Seeded 5 rooms for ${f.name}`)
    } else {
      console.log(`• ${f.name} already has ${count} rooms — skipping`)
    }
  }
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
