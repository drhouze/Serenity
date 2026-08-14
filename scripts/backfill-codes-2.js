/* eslint-disable */
// Backfill codes for staff, rooms, inventory items
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

function pad(num, len = 4) { return String(num).padStart(len, '0') }

async function main() {
  console.log('Backfilling codes for staff, rooms, inventory...')

  // Staff
  const staff = await db.staff.findMany({ orderBy: { hireDate: 'asc' } })
  let sc = 0
  for (let i = 0; i < staff.length; i++) {
    if (!staff[i].code) {
      await db.staff.update({ where: { id: staff[i].id }, data: { code: `STF-${pad(i + 1)}` } })
      sc++
    }
  }
  console.log(`  ✓ Staff: ${sc} codes assigned (${staff.length} total)`)

  // Rooms
  const rooms = await db.room.findMany({ orderBy: { roomNumber: 'asc' } })
  let rc = 0
  for (let i = 0; i < rooms.length; i++) {
    if (!rooms[i].code) {
      await db.room.update({ where: { id: rooms[i].id }, data: { code: `ROM-${pad(i + 1)}` } })
      rc++
    }
  }
  console.log(`  ✓ Rooms: ${rc} codes assigned (${rooms.length} total)`)

  // Inventory
  const items = await db.inventoryItem.findMany({ orderBy: { createdAt: 'asc' } })
  let ic = 0
  for (let i = 0; i < items.length; i++) {
    if (!items[i].code) {
      await db.inventoryItem.update({ where: { id: items[i].id }, data: { code: `ITM-${pad(i + 1)}` } })
      ic++
    }
  }
  console.log(`  ✓ Inventory: ${ic} codes assigned (${items.length} total)`)

  // Summary
  console.log('\nSample codes:')
  const s = await db.staff.findFirst({ select: { code: true, firstName: true, lastName: true } })
  console.log(`  Staff: ${s?.code} — ${s?.firstName} ${s?.lastName}`)
  const r = await db.room.findFirst({ select: { code: true, roomNumber: true } })
  console.log(`  Room: ${r?.code} — Room ${r?.roomNumber}`)
  const it = await db.inventoryItem.findFirst({ select: { code: true, name: true } })
  console.log(`  Inventory: ${it?.code} — ${it?.name}`)
}

main().catch(console.error).finally(() => db.$disconnect())
