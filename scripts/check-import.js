const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const total = await db.resident.count()
  console.log('Total residents:', total)
  const found = await db.resident.findMany({
    where: { firstName: { in: ['Alice', 'Henry', 'Grace'] } },
    select: { firstName: true, lastName: true, status: true }
  })
  console.log('Imported residents found:', found.length)
  found.forEach(r => console.log('  -', r.firstName, r.lastName, r.status))
}
main().catch(console.error).finally(() => db.$disconnect())
