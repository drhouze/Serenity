const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const r = await db.resident.count()
  const s = await db.staff.count()
  const i = await db.invoice.count()
  console.log('residents:', r, 'staff:', s, 'invoices:', i)
}
main().catch(console.error).finally(() => db.$disconnect())
