const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  // Check how many med administrations are scheduled for today vs future days
  const today = new Date(); today.setHours(0,0,0,0)
  const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1)
  const dayAfter = new Date(today); dayAfter.setDate(dayAfter.getDate() + 2)

  const todayCount = await db.medAdministration.count({
    where: { scheduledAt: { gte: today, lt: tomorrow } }
  })
  const tomorrowCount = await db.medAdministration.count({
    where: { scheduledAt: { gte: tomorrow, lt: dayAfter } }
  })

  console.log('Med administrations scheduled:')
  console.log(`  Today: ${todayCount}`)
  console.log(`  Tomorrow: ${tomorrowCount}`)
  console.log(`  (Tomorrow should be >0 if auto-recurring, 0 if not)`)

  // Check a sample med administration
  const sample = await db.medAdministration.findFirst({
    include: { medication: true, resident: { include: { room: true } } },
    orderBy: { scheduledAt: 'desc' }
  })
  if (sample) {
    console.log('\nSample med admin:')
    console.log(`  Resident: ${sample.resident?.firstName} ${sample.resident?.lastName} (Room ${sample.resident?.room?.roomNumber})`)
    console.log(`  Medication: ${sample.medication?.name} ${sample.medication?.dosage}`)
    console.log(`  Frequency: ${sample.medication?.frequency}`)
    console.log(`  Scheduled: ${sample.scheduledAt.toISOString()}`)
    console.log(`  Status: ${sample.status}`)
  }

  // Count active medications
  const activeMeds = await db.medication.count({ where: { active: true } })
  console.log(`\nTotal active medications: ${activeMeds}`)
  
  // Check if there are meds scheduled beyond today
  const futureMeds = await db.medAdministration.count({
    where: { scheduledAt: { gte: tomorrow } }
  })
  console.log(`Meds scheduled beyond today: ${futureMeds}`)
}

main().catch(console.error).finally(() => db.$disconnect())
