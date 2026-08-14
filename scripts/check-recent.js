const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const recent = await db.invoiceItem.findMany({
    where: { billed: false },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { description: true, quantity: true, unitPrice: true, total: true, createdAt: true }
  })
  recent.forEach(i => console.log(`${i.description} | qty:${i.quantity} price:${i.unitPrice} total:${i.total} | ${i.createdAt.toISOString()}`))
}
main().catch(console.error).finally(() => db.$disconnect())
