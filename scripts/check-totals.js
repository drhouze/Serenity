const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const all = await db.invoiceItem.findMany({ where: { billed: false } })
  const total = all.reduce((s, i) => s + i.total, 0)
  console.log('Count:', all.length, 'Total:', total)
}
main().catch(console.error).finally(() => db.$disconnect())
