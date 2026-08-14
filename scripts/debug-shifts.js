const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  
  // Check shifts for today and next 7 days
  const weekStart = new Date(today)
  const day = weekStart.getDay()
  const diff = day === 0 ? -6 : 1 - day
  weekStart.setDate(weekStart.getDate() + diff)
  
  const weekEnd = new Date(weekStart)
  weekEnd.setDate(weekEnd.getDate() + 7)
  
  console.log('Week start:', weekStart.toISOString())
  console.log('Week end:', weekEnd.toISOString())
  console.log('Today:', today.toISOString())
  console.log('')
  
  const shifts = await db.shift.findMany({
    where: { date: { gte: weekStart, lt: weekEnd } },
    include: { staff: true },
    orderBy: { date: 'asc' }
  })
  
  console.log(`Shifts in current week: ${shifts.length}`)
  
  // Group by date
  const byDate = {}
  for (const s of shifts) {
    const d = s.date.toISOString().slice(0, 10)
    if (!byDate[d]) byDate[d] = []
    byDate[d].push(s)
  }
  
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    const key = d.toISOString().slice(0, 10)
    const dayShifts = byDate[key] || []
    console.log(`  ${d.toDateString()} (${key}): ${dayShifts.length} shifts`)
    for (const s of dayShifts.slice(0, 3)) {
      console.log(`    - ${s.staff?.firstName} ${s.staff?.lastName} | ${s.shiftType} ${s.startTime}-${s.endTime} | date: ${s.date.toISOString()}`)
    }
  }
  
  // Also check total shifts
  const total = await db.shift.count()
  console.log(`\nTotal shifts in DB: ${total}`)
  
  // Check the earliest and latest shift dates
  const earliest = await db.shift.findFirst({ orderBy: { date: 'asc' }, select: { date: true } })
  const latest = await db.shift.findFirst({ orderBy: { date: 'desc' }, select: { date: true } })
  console.log(`Earliest shift: ${earliest?.date.toISOString()}`)
  console.log(`Latest shift: ${latest?.date.toISOString()}`)
}
main().catch(console.error).finally(() => db.$disconnect())
