const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const dayAfter = new Date(tomorrow)
  dayAfter.setDate(dayAfter.getDate() + 1)

  const tomorrowPending = await db.medAdministration.count({
    where: {
      scheduledAt: { gte: tomorrow, lt: dayAfter },
      status: 'PENDING'
    }
  })
  
  const todayPending = await db.medAdministration.count({
    where: {
      scheduledAt: { gte: new Date(new Date().setHours(0,0,0,0)), lt: new Date(new Date().setHours(23,59,59,999)) },
      status: 'PENDING'
    }
  })

  console.log(`Today's pending meds: ${todayPending}`)
  console.log(`Tomorrow's pending meds: ${tomorrowPending}`)
  
  // Check next 7 days
  for (let i = 1; i <= 7; i++) {
    const d = new Date()
    d.setDate(d.getDate() + i)
    d.setHours(0, 0, 0, 0)
    const e = new Date(d)
    e.setDate(e.getDate() + 1)
    const count = await db.medAdministration.count({
      where: { scheduledAt: { gte: d, lt: e }, status: 'PENDING' }
    })
    console.log(`  Day +${i} (${d.toDateString()}): ${count} pending`)
  }
}
main().catch(console.error).finally(() => db.$disconnect())
