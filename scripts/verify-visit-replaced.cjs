const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const visit = await db.visit.findUnique({
    where: { id: 'cmsqokady0001vm4o32m0ptvd' },
    include: { resident: { select: { code: true, firstName: true, lastName: true } } },
  })
  console.log('Visit ID           :', visit.id)
  console.log('Resident           :', visit.resident.code, '-', visit.resident.firstName, visit.resident.lastName)
  console.log('Visit Type         :', visit.visitType)
  console.log('Status             :', visit.status)
  console.log('ScheduledAt        :', visit.scheduledAt.toISOString())
  console.log('CompletedByName    :', visit.completedByName)
  console.log('ExternalSource     :', visit.externalSource)
  console.log()
  console.log('--- Clinical note fields (should be the UPDATED content) ---')
  console.log('Chief Complaint    :', visit.chiefComplaint)
  console.log('Findings           :', visit.findings)
  console.log('Diagnosis          :', visit.diagnosis)
  console.log('Treatment Plan     :', visit.treatmentPlan)
  console.log('Prescription       :', visit.prescription)
  console.log()

  // Verify the latest content won
  const ok =
    visit.chiefComplaint?.startsWith('UPDATED:') &&
    visit.findings?.includes('128/82') &&
    visit.prescription?.includes('Amlodipine')
  console.log(ok ? '✓ PASS: visit content was REPLACED with the latest version' : '✗ FAIL: visit content was NOT replaced')
  console.log()

  // Also check the audit log entry for VISIT_UPDATED action
  const logs = await db.auditLog.findMany({
    where: { entityId: visit.id, action: 'VISIT_UPDATED' },
    orderBy: { createdAt: 'desc' },
    take: 3,
  })
  console.log('Audit entries for VISIT_UPDATED:', logs.length)
  if (logs.length > 0) {
    console.log('  Latest:', logs[0].description)
    console.log('  Metadata action:', logs[0].metadata?.action, '| previousVisitId:', logs[0].metadata?.previousVisitId)
  }

  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
