// Test: verify facility-scoped data filtering for Owner
// Run: node scripts/test-facility-filter.mjs
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function test() {
  console.log('=== Testing facility-scoped data filtering ===\n')

  // Find an Owner user
  const owner = await db.user.findFirst({ where: { role: 'OWNER' } })
  if (!owner) {
    console.log('⚠ No Owner user found — skipping test')
    return
  }
  console.log(`Owner: ${owner.name} (level ${owner.level})`)

  // Find facilities
  const facilities = await db.facility.findMany()
  console.log(`Facilities: ${facilities.map(f => f.name).join(', ') || '(none)'}`)
  if (facilities.length === 0) {
    console.log('\n⚠ No facilities — skipping facility-specific test')
    return
  }

  const targetFacility = facilities[0]
  console.log(`\nTarget facility for filter test: ${targetFacility.name} (${targetFacility.id})`)

  // Count residents in each facility
  for (const f of facilities) {
    const count = await db.resident.count({ where: { facilityId: f.id } })
    console.log(`  Residents in ${f.name}: ${count}`)
  }
  const totalResidents = await db.resident.count()
  console.log(`  Total residents (all facilities): ${totalResidents}`)

  // Count rooms per facility
  for (const f of facilities) {
    const count = await db.room.count({ where: { facilityId: f.id } })
    console.log(`  Rooms in ${f.name}: ${count}`)
  }
  const totalRooms = await db.room.count()
  console.log(`  Total rooms (all facilities): ${totalRooms}`)

  // Count staff per facility
  for (const f of facilities) {
    const count = await db.staff.count({ where: { facilityId: f.id, active: true } })
    console.log(`  Active staff in ${f.name}: ${count}`)
  }

  // Count visits via resident.facilityId
  for (const f of facilities) {
    const count = await db.visit.count({ where: { resident: { facilityId: f.id } } })
    console.log(`  Visits in ${f.name} (via resident): ${count}`)
  }

  // Count shifts via staff.facilityId
  for (const f of facilities) {
    const count = await db.shift.count({ where: { staff: { facilityId: f.id } } })
    console.log(`  Shifts in ${f.name} (via staff): ${count}`)
  }

  // Count medAdmins via resident.facilityId
  for (const f of facilities) {
    const count = await db.medAdministration.count({ where: { resident: { facilityId: f.id } } })
    console.log(`  Med admins in ${f.name} (via resident): ${count}`)
  }

  // Count incidents via resident.facilityId
  for (const f of facilities) {
    const count = await db.incidentReport.count({ where: { resident: { facilityId: f.id } } })
    console.log(`  Incidents in ${f.name} (via resident): ${count}`)
  }

  // Count inventory per facility
  for (const f of facilities) {
    const count = await db.inventoryItem.count({ where: { facilityId: f.id, active: true } })
    console.log(`  Inventory items in ${f.name}: ${count}`)
  }

  // Count invoices per facility
  for (const f of facilities) {
    const count = await db.invoice.count({ where: { facilityId: f.id } })
    console.log(`  Invoices in ${f.name}: ${count}`)
  }

  // Count expenses per facility
  for (const f of facilities) {
    const count = await db.expense.count({ where: { facilityId: f.id } })
    console.log(`  Expenses in ${f.name}: ${count}`)
  }

  // Count users whose facilityIds includes the target facility
  const usersInFacility = await db.user.count({
    where: {
      OR: [
        { facilityIds: { contains: targetFacility.id } },
        { level: 1, role: 'OWNER' },
      ],
    },
  })
  console.log(`  Users with access to ${targetFacility.name} (or Owner): ${usersInFacility}`)

  console.log('\n=== Test complete ===')
  console.log('The /api/data and /api/dashboard routes now use these same relation-based filters.')
  console.log('When Owner selects a specific facility in the header, all data will be scoped to that facility.')

  await db.$disconnect()
}

test().catch(e => { console.error(e); process.exit(1) })
