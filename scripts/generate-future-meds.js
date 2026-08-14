/* eslint-disable */
// Generate medication administrations for the next 7 days
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

async function main() {
  console.log('Generating medication administrations for next 7 days...')
  
  const activeMeds = await db.medication.findMany({
    where: { active: true },
    include: { resident: { select: { id: true, status: true, firstName: true, lastName: true } } },
  })

  const validMeds = activeMeds.filter(m => m.resident?.status === 'ACTIVE')
  console.log(`Active medications for ACTIVE residents: ${validMeds.length}`)

  let created = 0
  let skipped = 0

  for (let dayOffset = 1; dayOffset <= 7; dayOffset++) {
    const scheduleDate = new Date()
    scheduleDate.setDate(scheduleDate.getDate() + dayOffset)
    scheduleDate.setHours(0, 0, 0, 0)
    
    const dayStart = new Date(scheduleDate)
    const dayEnd = new Date(scheduleDate)
    dayEnd.setHours(23, 59, 59, 999)

    for (const med of validMeds) {
      const existing = await db.medAdministration.findFirst({
        where: {
          medicationId: med.id,
          scheduledAt: { gte: dayStart, lte: dayEnd },
        },
      })

      if (existing) {
        skipped++
        continue
      }

      let scheduledAt = new Date(scheduleDate)
      const freq = (med.frequency || '').toLowerCase()
      if (freq.includes('bedtime')) scheduledAt.setHours(22, 0, 0, 0)
      else if (freq.includes('morning') || freq.includes('breakfast')) scheduledAt.setHours(8, 0, 0, 0)
      else if (freq.includes('evening')) scheduledAt.setHours(18, 0, 0, 0)
      else if (freq.includes('night')) scheduledAt.setHours(22, 0, 0, 0)
      else scheduledAt.setHours(8, 0, 0, 0)

      const dosesPerDay = freq.includes('twice') ? 2 : 1

      for (let dose = 0; dose < dosesPerDay; dose++) {
        const doseTime = new Date(scheduledAt)
        if (dose === 1) doseTime.setHours(20, 0, 0, 0)

        await db.medAdministration.create({
          data: {
            medicationId: med.id,
            residentId: med.residentId,
            scheduledAt: doseTime,
            status: 'PENDING',
          },
        }).catch(() => {})
        created++
      }
    }
  }

  console.log(`\nDone! Created ${created} med administrations, skipped ${skipped} (already existed)`)
  
  // Verify
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  tomorrow.setHours(0, 0, 0, 0)
  const dayAfter = new Date(tomorrow)
  dayAfter.setDate(dayAfter.getDate() + 1)
  
  const tomorrowCount = await db.medAdministration.count({
    where: { scheduledAt: { gte: tomorrow, lt: dayAfter } }
  })
  console.log(`Tomorrow's pending meds: ${tomorrowCount}`)
}

main().catch(console.error).finally(() => db.$disconnect())
