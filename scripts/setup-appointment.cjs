// Test scenario:
// 1. Create a SCHEDULED visit (appointment) in Serenity for resident C-0085 at 10am today.
// 2. Push a visit note from the "doctor app" via /api/external/visits for a visit that
//    happened at 10:15am today (slightly after the appointment).
// 3. Verify the SCHEDULED appointment was auto-completed (status=COMPLETED) with the doctor's
//    clinical fields, and that NO duplicate visit was created.
// 4. Repeat the test using the FHIR Encounter endpoint.

const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })

const FACILITY_ID = 'cmrbc9fhq0004s5dwy4l8m74x'  // DR HOUZE(main) — AICMS's facility
const RESIDENT_ID = 'cmsqkcs3l0001vmuy40r5ftvr'   // C-0085 - KOAY SAW GAIK

;(async () => {
  // === Step 1: Create a SCHEDULED visit (the "appointment" in the app) ===
  const apptTime = new Date()
  apptTime.setHours(10, 0, 0, 0)  // 10:00am today

  console.log('=== Step 1: Create a SCHEDULED appointment at 10am today ===')
  const appointment = await db.visit.create({
    data: {
      residentId: RESIDENT_ID,
      visitType: 'DOCTOR',
      scheduledAt: apptTime,
      status: 'SCHEDULED',
    },
  })
  console.log(`  Created appointment ID: ${appointment.id}`)
  console.log(`  scheduledAt: ${appointment.scheduledAt.toISOString()}`)
  console.log(`  status: ${appointment.status}`)
  console.log()

  console.log('=== Step 2: Push a visit note via /api/external/visits at 10:15am (15 min later) ===')
  console.log('  (Run scripts/test-auto-complete.sh to do the actual HTTP push)')
  console.log()

  // Save the appointment ID for the shell script to verify against
  console.log(`APPOINTMENT_ID=${appointment.id}`)
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
