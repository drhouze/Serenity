const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const rooms = await db.room.findMany({ include: { _count: { select: { beds: true } } } })
  let created = 0
  for (const room of rooms) {
    if (room._count.beds > 0) continue // already has beds
    const bedLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
    for (let i = 0; i < room.capacity; i++) {
      const suffix = i < 26 ? bedLabels[i] : `${i + 1}`
      await db.bed.create({
        data: {
          code: `${room.roomNumber}-${suffix}`,
          label: i < 26 ? `Bed ${bedLabels[i]}` : `Bed ${i + 1}`,
          roomId: room.id,
          status: 'AVAILABLE',
        },
      }).catch(() => {})
      created++
    }
    console.log(`  ✓ Created ${room.capacity} beds for Room ${room.roomNumber}`)
  }
  console.log(`Total beds created: ${created}`)
  // Also update bed status for residents who already have roomId but no bedId
  const residentsWithRoomNoBed = await db.resident.findMany({
    where: { roomId: { not: null }, bedId: null, status: 'ACTIVE' },
    select: { id: true, roomId: true },
  })
  for (const r of residentsWithRoomNoBed) {
    const bed = await db.bed.findFirst({ where: { roomId: r.roomId, status: 'AVAILABLE' } })
    if (bed) {
      await db.resident.update({ where: { id: r.id }, data: { bedId: bed.id } })
      await db.bed.update({ where: { id: bed.id }, data: { status: 'OCCUPIED' } })
      console.log(`  ✓ Assigned resident ${r.id} to bed ${bed.code}`)
    }
  }
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
