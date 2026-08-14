const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const count = await db.invoiceItem.count({ where: { billed: false } })
  const total = await db.invoiceItem.aggregate({ where: { billed: false }, _sum: { total: true } })
  console.log('Unbilled items:', count, 'Total:', total._sum.total)
  // Check for monthly charges
  const monthly = await db.invoiceItem.findMany({
    where: { billed: false, description: { contains: '2026' } },
    take: 5,
    select: { description: true, quantity: true, unitPrice: true, total: true }
  })
  monthly.forEach(i => console.log('  -', i.description, '|', i.total))
}
main().catch(console.error).finally(() => db.$disconnect())
