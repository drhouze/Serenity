/* eslint-disable */
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  // Check if any facilities exist
  const count = await db.facility.count()
  if (count > 0) {
    console.log(`${count} facilities already exist. Skipping.`)
    const all = await db.facility.findMany()
    all.forEach(f => console.log(`  - ${f.id}: ${f.name}`))
    return
  }

  // Create default facility
  const facility = await db.facility.create({
    data: {
      name: 'Serenity Care Home',
      address: null,
      phone: null,
      email: null,
      director: null,
      active: true,
    },
  })
  console.log(`Created default facility: ${facility.name} (${facility.id})`)

  // Assign all existing records to this facility
  const residents = await db.resident.updateMany({ where: { facilityId: null }, data: { facilityId: facility.id } })
  console.log(`  ✓ Assigned ${residents.count} residents`)
  
  const rooms = await db.room.updateMany({ where: { facilityId: null }, data: { facilityId: facility.id } })
  console.log(`  ✓ Assigned ${rooms.count} rooms`)
  
  const staff = await db.staff.updateMany({ where: { facilityId: null }, data: { facilityId: facility.id } })
  console.log(`  ✓ Assigned ${staff.count} staff`)
  
  const expenses = await db.expense.updateMany({ where: { facilityId: null }, data: { facilityId: facility.id } })
  console.log(`  ✓ Assigned ${expenses.count} expenses`)
  
  const products = await db.product.updateMany({ where: { facilityId: null }, data: { facilityId: facility.id } })
  console.log(`  ✓ Assigned ${products.count} products`)
  
  const inventory = await db.inventoryItem.updateMany({ where: { facilityId: null }, data: { facilityId: facility.id } })
  console.log(`  ✓ Assigned ${inventory.count} inventory items`)

  // Assign owner to all facilities (facilityIds field on User)
  const owners = await db.user.findMany({ where: { role: 'OWNER' } })
  for (const owner of owners) {
    await db.user.update({ where: { id: owner.id }, data: { facilityIds: facility.id } })
    console.log(`  ✓ Assigned facility to owner: ${owner.name}`)
  }
  
  // Assign other users to the facility
  const otherUsers = await db.user.findMany({ where: { role: { not: 'OWNER' } } })
  for (const u of otherUsers) {
    await db.user.update({ where: { id: u.id }, data: { facilityIds: facility.id } })
    console.log(`  ✓ Assigned facility to user: ${u.name}`)
  }
}

main().catch(console.error).finally(() => db.$disconnect())
