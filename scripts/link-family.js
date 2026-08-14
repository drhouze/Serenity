const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const family = await db.user.findUnique({ where: { email: 'family@home.com' } })
  if (!family) { console.log('No family user'); return }
  // Link to first 2 residents
  const residents = await db.resident.findMany({ where: { status: 'ACTIVE' }, take: 2, orderBy: { lastName: 'asc' } })
  const ids = residents.map(r => r.id).join(',')
  await db.user.update({ where: { id: family.id }, data: { linkedResidentIds: ids } })
  console.log('Linked family user to:', residents.map(r => `${r.firstName} ${r.lastName}`).join(', '))
}
main().catch(console.error).finally(() => db.$disconnect())
