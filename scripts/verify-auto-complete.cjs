const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const fs = require('fs')
  const apptId = fs.readFileSync('/tmp/test-appt-id.txt', 'utf8').trim()
  console.log(`=== Verify visit content for auto-completed appointment ${apptId} ===`)
  const visit = await db.visit.findUnique({
    where: { id: apptId },
    include: { resident: { select: { code: true, firstName: true, lastName: true } }, staff: true },
  })
  if (!visit) { console.log('Visit not found'); process.exit(1) }
  console.log('Visit ID           :', visit.id)
  console.log('Resident           :', visit.resident.code, '-', visit.resident.firstName, visit.resident.lastName)
  console.log('Visit Type         :', visit.visitType)
  console.log('ScheduledAt        :', visit.scheduledAt.toISOString())
  console.log('Status             :', visit.status, '(should be COMPLETED)')
  console.log('CompletedAt        :', visit.completedAt?.toISOString() || 'null', '(should be set)')
  console.log('CompletedByName    :', visit.completedByName, '(should be Dr. Tan Wei Ming)')
  console.log('ExternalSource     :', visit.externalSource, '(should be AICMS)')
  console.log()
  console.log('--- Clinical fields (should all be populated from doctor app push) ---')
  console.log('Chief Complaint    :', visit.chiefComplaint)
  console.log('Findings           :', visit.findings)
  console.log('Diagnosis          :', visit.diagnosis)
  console.log('Treatment Plan     :', visit.treatmentPlan)
  console.log('Prescription       :', visit.prescription)

  const ok =
    visit.status === 'COMPLETED' &&
    visit.completedByName === 'Dr. Tan Wei Ming' &&
    visit.externalSource === 'AICMS' &&
    visit.chiefComplaint === 'Patient complains of mild headache.' &&
    visit.findings === 'BP 140/90, HR 76.' &&
    visit.diagnosis === 'Hypertension stage 1.' &&
    visit.prescription === 'Metformin 500mg BD'
  console.log()
  console.log(ok ? '✓ PASS: appointment auto-completed with full clinical fields' : '✗ FAIL: content not as expected')

  // Count how many visits exist for this resident today — should be 1 (no duplicate created)
  const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0)
  const dayEnd = new Date(); dayEnd.setDate(dayEnd.getDate() + 1)
  const todaysVisits = await db.visit.findMany({
    where: { residentId: visit.residentId, scheduledAt: { gte: dayStart, lt: dayEnd } },
    select: { id: true, status: true, visitType: true, scheduledAt: true },
  })
  console.log()
  console.log(`=== Visits for this resident today: ${todaysVisits.length} (should be 1 — no duplicate) ===`)
  for (const v of todaysVisits) console.log(`  ${v.id} | ${v.visitType} | ${v.status} | ${v.scheduledAt.toISOString()}`)
  if (todaysVisits.length === 1) {
    console.log('✓ PASS: no duplicate visit created')
  } else {
    console.log('✗ FAIL: expected 1 visit, found ' + todaysVisits.length)
  }
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
