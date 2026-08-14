const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const meds = await db.medication.findMany({
    where: { residentId: 'cmr7jkig30001renq5yndmrv5' },
    include: { resident: { select: { firstName: true, lastName: true, status: true } } }
  })
  console.log(`Total medications for Robert Johnson: ${meds.length}`)
  for (const m of meds) {
    console.log(`  - ${m.name} ${m.dosage} | active: ${m.active} | freq: ${m.frequency}`)
  }
  
  const admins = await db.medAdministration.count({
    where: { residentId: 'cmr7jkig30001renq5yndmrv5' }
  })
  console.log(`\nMed administrations: ${admins}`)
}
main().catch(console.error).finally(() => db.$disconnect())
