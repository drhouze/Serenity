/* eslint-disable */
// Backfill unique codes for existing residents, users, products
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

function pad(num, len = 4) {
  return String(num).padStart(len, '0')
}

async function backfillResidents() {
  const residents = await db.resident.findMany({ orderBy: { admissionDate: 'asc' } })
  let count = 0
  for (let i = 0; i < residents.length; i++) {
    if (!residents[i].code) {
      const code = `RES-${pad(i + 1)}`
      await db.resident.update({ where: { id: residents[i].id }, data: { code } })
      count++
    }
  }
  console.log(`  ✓ Residents: ${count} codes assigned (${residents.length} total)`)
}

async function backfillUsers() {
  const users = await db.user.findMany({ orderBy: { createdAt: 'asc' } })
  let count = 0
  for (let i = 0; i < users.length; i++) {
    if (!users[i].code) {
      const code = `USR-${pad(i + 1)}`
      await db.user.update({ where: { id: users[i].id }, data: { code } })
      count++
    }
  }
  console.log(`  ✓ Users: ${count} codes assigned (${users.length} total)`)
}

async function backfillProducts() {
  const products = await db.product.findMany({ orderBy: { createdAt: 'asc' } })
  let count = 0
  for (let i = 0; i < products.length; i++) {
    if (!products[i].code) {
      const code = `PRD-${pad(i + 1)}`
      await db.product.update({ where: { id: products[i].id }, data: { code } })
      count++
    }
  }
  console.log(`  ✓ Products: ${count} codes assigned (${products.length} total)`)
}

async function backfillStaff() {
  const staff = await db.staff.findMany({ orderBy: { hireDate: 'asc' } })
  let count = 0
  for (let i = 0; i < staff.length; i++) {
    // Staff doesn't have a code field, skip
  }
  console.log(`  - Staff: no code field (skipped)`)
}

async function main() {
  console.log('Backfilling unique codes...')
  await backfillResidents()
  await backfillUsers()
  await backfillProducts()
  await backfillStaff()

  // Show sample
  console.log('\nSample codes:')
  const r = await db.resident.findFirst({ select: { code: true, firstName: true, lastName: true } })
  console.log(`  Resident: ${r?.code} — ${r?.firstName} ${r?.lastName}`)
  const u = await db.user.findFirst({ select: { code: true, name: true, role: true } })
  console.log(`  User: ${u?.code} — ${u?.name} (${u?.role})`)
  const p = await db.product.findFirst({ select: { code: true, name: true } })
  console.log(`  Product: ${p?.code} — ${p?.name}`)
  const i = await db.invoice.findFirst({ select: { invoiceNumber: true, recipient: true } })
  console.log(`  Invoice: ${i?.invoiceNumber} — ${i?.recipient}`)

  console.log('\nDone!')
}

main().catch(console.error).finally(() => db.$disconnect())
