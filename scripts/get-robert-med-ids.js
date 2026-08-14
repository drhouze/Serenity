const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const meds = await db.medication.findMany({ where: { residentId: 'cmr7jkig30001renq5yndmrv5' }, select: { id: true, name: true, frequency: true } })
  for (const m of meds) {
    console.log(`${m.id}|${m.name}|${m.frequency}`)
  }
}
main().catch(console.error).finally(() => db.$disconnect())
