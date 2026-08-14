// Setup a fresh SCHEDULED appointment for the FHIR test (since the legacy one was already auto-completed)
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
const RESIDENT_ID = 'cmsqkcs3l0001vmuy40r5ftvr'
;(async () => {
  const apptTime = new Date()
  apptTime.setHours(11, 0, 0, 0)  // 11am today — different from the 10am one we already used
  const appointment = await db.visit.create({
    data: { residentId: RESIDENT_ID, visitType: 'PHYSIO', scheduledAt: apptTime, status: 'SCHEDULED' },
  })
  console.log(`Created SCHEDULED PHYSIO appointment at 11am: ${appointment.id}`)
  require('fs').writeFileSync('/tmp/test-appt-id-fhir.txt', appointment.id)
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
