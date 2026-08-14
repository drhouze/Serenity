const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const active = await db.resident.count({ where: { status: 'ACTIVE' } })
  const discharged = await db.resident.count({ where: { status: 'DISCHARGED' } })
  console.log('Active:', active, 'Discharged:', discharged)
  const d = await db.resident.findMany({ where: { status: 'DISCHARGED' }, select: { firstName: true, lastName: true, dischargeDate: true } })
  d.forEach(r => console.log('  -', r.firstName, r.lastName, r.dischargeDate))
}
main().catch(console.error).finally(() => db.$disconnect())
