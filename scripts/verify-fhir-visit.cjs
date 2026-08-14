const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  // Fetch the visit pushed via FHIR (visitId from Test 1+2)
  const visit = await db.visit.findUnique({
    where: { id: 'cmsqokady0001vm4o32m0ptvd' },
    include: { resident: { select: { code: true, firstName: true, lastName: true } }, staff: true },
  })
  if (!visit) { console.log('Visit not found'); process.exit(1) }

  console.log('=== Visit pushed via FHIR Encounter (after Test 2 — replaced content) ===')
  console.log('Visit ID           :', visit.id)
  console.log('Visit Type         :', visit.visitType, '   Status:', visit.status)
  console.log('Resident           :', visit.resident.code, '-', visit.resident.firstName, visit.resident.lastName)
  console.log('ScheduledAt        :', visit.scheduledAt.toISOString())
  console.log('CompletedAt        :', visit.completedAt?.toISOString() || 'null', '  Duration:', visit.duration ?? 'null', 'min')
  console.log('CompletedByName    :', visit.completedByName || 'null')
  console.log('StaffLinked        :', !!visit.staff, visit.staff ? `(${visit.staff.firstName} ${visit.staff.lastName}, ${visit.staff.role})` : '')
  console.log('ExternalSource     :', visit.externalSource)
  console.log()
  console.log('--- Structured clinical fields ---')
  console.log('Chief Complaint    :', visit.chiefComplaint || '(null)')
  console.log('Findings           :', visit.findings || '(null)')
  console.log('Diagnosis          :', visit.diagnosis || '(null)')
  console.log('Treatment Plan     :', visit.treatmentPlan || '(null)')
  console.log('Prescription       :', visit.prescription || '(null)')
  console.log('Vitals Note        :', visit.vitalsNote || '(null)')
  console.log('Follow-up Note     :', visit.followUpNote || '(null)')
  console.log()
  // Verify NO notes column was set (it shouldn't exist on the model anyway)
  const rawVisit = await db.$queryRawUnsafe('SELECT * FROM Visit WHERE id = ?', visit.id)
  const cols = Object.keys(rawVisit[0])
  console.log('Visit table columns:', cols.join(', '))
  console.log('Has notes column?  :', cols.includes('notes') ? 'YES (would be a bug)' : 'NO ✓')

  // Verify content was REPLACED with the Test 2 payload
  const ok =
    visit.chiefComplaint?.startsWith('UPDATED:') &&
    visit.findings?.includes('128/82') &&
    visit.diagnosis?.includes('well-controlled') &&
    visit.treatmentPlan?.includes('Amlodipine') &&
    visit.prescription?.includes('Amlodipine') &&
    visit.completedByName === 'Dr. Tan Wei Ming' &&
    visit.externalSource === 'AICMS'
  console.log()
  console.log(ok ? '✓ PASS: visit content was REPLACED with Test 2 payload + all structured fields populated' : '✗ FAIL: content not as expected')

  // Also check the follow-up visit was created
  const followUp = await db.visit.findFirst({
    where: { residentId: visit.residentId, status: 'SCHEDULED', scheduledAt: { gte: new Date('2026-09-12T00:00:00Z') } },
    orderBy: { createdAt: 'desc' },
  })
  console.log()
  console.log('=== Follow-up SCHEDULED visit (created from FHIR appointment.identifier) ===')
  if (followUp) {
    console.log('Follow-up Visit ID :', followUp.id)
    console.log('ScheduledAt        :', followUp.scheduledAt.toISOString())
    console.log('Status             :', followUp.status)
    console.log('ExternalSource     :', followUp.externalSource)
    console.log('ChiefComplaint     :', followUp.chiefComplaint)
    console.log(ok && followUp ? '✓ PASS: follow-up SCHEDULED visit created' : '✗ FAIL')
  } else {
    console.log('✗ FAIL: no follow-up visit found')
  }

  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
