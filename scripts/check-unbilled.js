const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const count = await db.invoiceItem.count({ where: { billed: false } })
  console.log('Unbilled items:', count)
  const total = await db.invoiceItem.aggregate({ where: { billed: false }, _sum: { total: true } })
  console.log('Total value:', total._sum.total)
}
main().catch(console.error).finally(() => db.$disconnect())
