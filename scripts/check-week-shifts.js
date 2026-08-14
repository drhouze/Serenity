const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  // Check shifts for Jul 13-19
  const weekStart = new Date('2026-07-13T00:00:00.000Z')
  const weekEnd = new Date('2026-07-20T00:00:00.000Z')
  const count = await db.shift.count({ where: { date: { gte: weekStart, lt: weekEnd } } })
  console.log(`Shifts for Jul 13-19: ${count}`)
  
  // Check shifts for Jul 6-12
  const ws2 = new Date('2026-07-06T00:00:00.000Z')
  const we2 = new Date('2026-07-13T00:00:00.000Z')
  const count2 = await db.shift.count({ where: { date: { gte: ws2, lt: we2 } } })
  console.log(`Shifts for Jul 6-12: ${count2}`)
  
  // Check all shift dates
  const allShifts = await db.shift.findMany({ select: { date: true }, orderBy: { date: 'asc' } })
  const dates = [...new Set(allShifts.map(s => s.date.toISOString().slice(0, 10)))]
  console.log(`\nAll shift dates in DB (${dates.length} unique dates):`)
  dates.forEach(d => console.log(`  ${d}`))
}
main().finally(() => db.$disconnect())
