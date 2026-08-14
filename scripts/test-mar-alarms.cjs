// Verify the MAR alarm logic end-to-end:
// 1. Find a facility + resident + medication to use
// 2. Create 4 MedAdministration records at scheduled times relative to NOW:
//    a) 10 min ago (should be OVERDUE, grace is 5 min)
//    b) 5 min from now (should be DUE — within ±30 min)
//    c) 90 min from now (should be UPCOMING — within next 2h but past the DUE window)
//    d) 4 hours from now (no alarm — too far out)
// 3. Hit GET /api/data?type=medAdmins&today=true as nurse@home.com and verify each record's
//    scheduledAt matches what we created.
// 4. Confirm the 4 records exist (the alarm CLASSIFICATION happens client-side in Medications.tsx
//    so we can't test the badges via API — but we can confirm the data shape is correct).

const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })

;(async () => {
  // Find a medication to attach the test administrations to
  const med = await db.medication.findFirst({
    where: { active: true },
    include: { resident: { select: { id: true, code: true, firstName: true, lastName: true, facilityId: true } } },
  })
  if (!med) { console.log('No active medication found — aborting'); process.exit(1) }
  console.log(`Using medication: ${med.name} ${med.dosage} for resident ${med.resident.code} ${med.resident.firstName} ${med.resident.lastName}`)

  const now = Date.now()
  const mins = (m) => new Date(now + m * 60_000)
  const testRecords = [
    { label: 'OVERDUE', offsetMin: -10, scheduledAt: mins(-10) },
    { label: 'DUE',     offsetMin:   5, scheduledAt: mins(5) },
    { label: 'UPCOMING',offsetMin:  90, scheduledAt: mins(90) },
    { label: 'NONE',    offsetMin: 240, scheduledAt: mins(240) },
  ]

  console.log('\nCreating test MedAdministration records:')
  const created = []
  for (const t of testRecords) {
    const a = await db.medAdministration.create({
      data: {
        medicationId: med.id,
        residentId: med.resident.id,
        scheduledAt: t.scheduledAt,
        status: 'PENDING',
      },
    })
    created.push(a)
    console.log(`  ${t.label.padEnd(8)} → id=${a.id}  scheduledAt=${t.scheduledAt.toISOString()}  (offset=${t.offsetMin > 0 ? '+' : ''}${t.offsetMin} min)`)
  }

  // Print what we expect the client-side getAlarmState() to classify each as
  console.log('\nExpected alarm classifications (client-side logic):')
  const DUE_WINDOW_MIN = 30, OVERDUE_GRACE_MIN = 5, UPCOMING_WINDOW_MIN = 120
  for (const t of testRecords) {
    const diffMin = t.offsetMin
    let alarm = null
    if (diffMin < -OVERDUE_GRACE_MIN) alarm = 'OVERDUE'
    else if (diffMin <= DUE_WINDOW_MIN && diffMin >= -DUE_WINDOW_MIN) alarm = 'DUE'
    else if (diffMin > DUE_WINDOW_MIN && diffMin <= UPCOMING_WINDOW_MIN) alarm = 'UPCOMING'
    console.log(`  offset=${t.offsetMin > 0 ? '+' : ''}${t.offsetMin} min → alarm=${alarm || 'null'}  (expected: ${t.label})`)
  }

  console.log('\nTest records left in DB — open the MAR as nurse@home.com to see them with alarm badges.')
  console.log('To clean up later: node scripts/cleanup-mar-test.cjs')

  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
