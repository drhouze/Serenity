// Migration: Assign facilityId to all legacy records that have NULL facilityId
// Run: node scripts/assign-facility-ids.mjs
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function migrate() {
  console.log('=== Assigning facilityId to legacy records ===\n')

  // Get the first (primary) facility
  const facilities = await db.facility.findMany({ orderBy: { name: 'asc' } })
  if (facilities.length === 0) {
    console.log('⚠ No facilities found — create one first')
    return
  }
  const primaryFacility = facilities[0]
  console.log(`Primary facility: ${primaryFacility.name} (${primaryFacility.id})`)
  console.log(`Total facilities: ${facilities.length}\n`)

  // For records with a residentId link: derive facilityId from the resident
  // For direct-facilityId records: assign to primary facility

  // 1. Invoices
  const invoicesNoFacility = await db.invoice.count({ where: { facilityId: null } })
  if (invoicesNoFacility > 0) {
    // Try to derive from resident
    const invoicesWithResident = await db.invoice.findMany({
      where: { facilityId: null, residentId: { not: null } },
      select: { id: true, residentId: true }
    })
    for (const inv of invoicesWithResident) {
      const resident = await db.resident.findUnique({ where: { id: inv.residentId }, select: { facilityId: true } })
      if (resident?.facilityId) {
        await db.invoice.update({ where: { id: inv.id }, data: { facilityId: resident.facilityId } })
      }
    }
    // For invoices without a resident, assign to primary facility
    await db.invoice.updateMany({ where: { facilityId: null }, data: { facilityId: primaryFacility.id } })
    console.log(`✅ Invoices: ${invoicesNoFacility} updated`)
  } else {
    console.log('✅ Invoices: no NULL facilityId records')
  }

  // 2. Expenses
  const expensesNoFacility = await db.expense.count({ where: { facilityId: null } })
  if (expensesNoFacility > 0) {
    await db.expense.updateMany({ where: { facilityId: null }, data: { facilityId: primaryFacility.id } })
    console.log(`✅ Expenses: ${expensesNoFacility} updated`)
  } else {
    console.log('✅ Expenses: no NULL facilityId records')
  }

  // 3. Products
  const productsNoFacility = await db.product.count({ where: { facilityId: null } })
  if (productsNoFacility > 0) {
    await db.product.updateMany({ where: { facilityId: null }, data: { facilityId: primaryFacility.id } })
    console.log(`✅ Products: ${productsNoFacility} updated`)
  } else {
    console.log('✅ Products: no NULL facilityId records')
  }

  // 4. Inventory Items
  const inventoryNoFacility = await db.inventoryItem.count({ where: { facilityId: null } })
  if (inventoryNoFacility > 0) {
    await db.inventoryItem.updateMany({ where: { facilityId: null }, data: { facilityId: primaryFacility.id } })
    console.log(`✅ Inventory Items: ${inventoryNoFacility} updated`)
  } else {
    console.log('✅ Inventory Items: no NULL facilityId records')
  }

  // 5. Rooms (should already have facilityId from earlier migration, but check)
  const roomsNoFacility = await db.room.count({ where: { facilityId: null } })
  if (roomsNoFacility > 0) {
    await db.room.updateMany({ where: { facilityId: null }, data: { facilityId: primaryFacility.id } })
    console.log(`✅ Rooms: ${roomsNoFacility} updated`)
  } else {
    console.log('✅ Rooms: no NULL facilityId records')
  }

  // 6. Staff
  const staffNoFacility = await db.staff.count({ where: { facilityId: null } })
  if (staffNoFacility > 0) {
    await db.staff.updateMany({ where: { facilityId: null }, data: { facilityId: primaryFacility.id } })
    console.log(`✅ Staff: ${staffNoFacility} updated`)
  } else {
    console.log('✅ Staff: no NULL facilityId records')
  }

  // 7. Residents (should already have facilityId)
  const residentsNoFacility = await db.resident.count({ where: { facilityId: null } })
  if (residentsNoFacility > 0) {
    await db.resident.updateMany({ where: { facilityId: null }, data: { facilityId: primaryFacility.id } })
    console.log(`✅ Residents: ${residentsNoFacility} updated`)
  } else {
    console.log('✅ Residents: no NULL facilityId records')
  }

  // Verify
  console.log('\n=== Verification ===')
  console.log(`Invoices with NULL facilityId: ${await db.invoice.count({ where: { facilityId: null } })}`)
  console.log(`Expenses with NULL facilityId: ${await db.expense.count({ where: { facilityId: null } })}`)
  console.log(`Products with NULL facilityId: ${await db.product.count({ where: { facilityId: null } })}`)
  console.log(`Inventory with NULL facilityId: ${await db.inventoryItem.count({ where: { facilityId: null } })}`)
  console.log(`Rooms with NULL facilityId: ${await db.room.count({ where: { facilityId: null } })}`)
  console.log(`Staff with NULL facilityId: ${await db.staff.count({ where: { facilityId: null } })}`)
  console.log(`Residents with NULL facilityId: ${await db.resident.count({ where: { facilityId: null } })}`)

  console.log('\n=== Migration complete ===')
  await db.$disconnect()
}

migrate().catch(e => { console.error(e); process.exit(1) })
