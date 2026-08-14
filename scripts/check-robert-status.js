const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const r = await db.resident.findUnique({ where: { id: 'cmr7jkig30001renq5yndmrv5' }, select: { status: true, firstName: true, lastName: true } })
  console.log(`${r.firstName} ${r.lastName} status: ${r.status}`)
}
main().finally(() => db.$disconnect())
