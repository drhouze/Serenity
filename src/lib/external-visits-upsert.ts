import { db } from '@/lib/db'

/**
 * Shared "upsert" logic for visits pushed from external apps (legacy JSON
 * or FHIR Encounter). Implements a two-tier matching strategy so that:
 *
 *   1. **Auto-complete appointment**: if a SCHEDULED visit exists in Serenity
 *      for the same resident + visitType, scheduled within ±1 day of the
 *      doctor's actual visit time, we UPDATE that appointment's status to
 *      COMPLETED and fill in the clinical fields. This is the user's
 *      "auto-complete the appointment when fetching the visit note" case —
 *      e.g. the receptionist scheduled a 10am visit, but the doctor actually
 *      did the visit at 10:15am in the doctor app and pushed the note →
 *      Serenity auto-completes the 10am appointment with the doctor's note.
 *
 *   2. **Replace previous note**: if a COMPLETED/CANCELLED visit already
 *      exists for the same resident + visitType + same calendar day (and was
 *      created within the last 7 days), we REPLACE it. This handles "doctor
 *      edited the note in their app and re-pushed" — the latest version wins.
 *
 *   3. **Create**: otherwise, create a new COMPLETED visit.
 *
 * The `commonVisitData` object should be pre-built by the caller with all the
 * mapped fields (chiefComplaint, vitalsNote, findings, diagnosis,
 * treatmentPlan, prescription, followUpNote, completedByName, completedAt,
 * duration, externalSource, staffId, etc.) — same shape as `db.visit.create({ data: ... })`.
 *
 * Returns `{ visit, action, matchedVisit }` where:
 *   - `visit` is the final Visit record (created or updated)
 *   - `action` is one of:
 *       'created'           — new visit created (no existing match)
 *       'updated'           — existing note replaced (case 2)
 *       'appointment_completed' — SCHEDULED visit auto-completed (case 1)
 *   - `matchedVisit` is the pre-existing visit that was updated (or null if created)
 */
export async function upsertExternalVisit(opts: {
  residentId: string
  visitType: string
  scheduledAt: Date
  status: string                  // 'COMPLETED' | 'SCHEDULED' | ...
  commonVisitData: any            // pre-built data object for db.visit.create/update
}): Promise<{
  visit: any
  action: 'created' | 'updated' | 'appointment_completed'
  matchedVisit: any | null
}> {
  const { residentId, visitType, scheduledAt, status, commonVisitData } = opts

  // ===== 1. Auto-complete a SCHEDULED appointment =====
  //
  // Look for a SCHEDULED visit for the same resident + visitType, scheduled
  // within ±1 calendar day of the doctor's actual visit time. The ±1 day
  // window handles:
  //   - timezone drift (doctor app sends UTC midnight, our appointment is local 8am)
  //   - appointments that were scheduled for the morning but the doctor did
  //     the visit the evening before (or vice versa)
  //   - appointments that were scheduled for a date but the doctor back-dated
  //     the visit note to when they actually saw the patient
  //
  // Only matches SCHEDULED visits (so we don't accidentally overwrite an
  // already-completed visit — that's case 2 below).
  //
  if (status === 'COMPLETED') {
    const dayStart = new Date(scheduledAt)
    dayStart.setHours(0, 0, 0, 0)
    dayStart.setDate(dayStart.getDate() - 1)  // ±1 day window

    const dayEnd = new Date(scheduledAt)
    dayEnd.setHours(23, 59, 59, 999)
    dayEnd.setDate(dayEnd.getDate() + 1)

    const scheduledAppointment = await db.visit.findFirst({
      where: {
        residentId,
        visitType,
        status: 'SCHEDULED',
        scheduledAt: { gte: dayStart, lte: dayEnd },
      },
      orderBy: { scheduledAt: 'asc' },  // earliest first — closest to the actual visit time
    })

    if (scheduledAppointment) {
      const visit = await db.visit.update({
        where: { id: scheduledAppointment.id },
        data: commonVisitData,
      })
      return { visit, action: 'appointment_completed', matchedVisit: scheduledAppointment }
    }
  }

  // ===== 2. Replace an existing note (same resident + visitType + same day) =====
  //
  // If a COMPLETED/CANCELLED visit already exists for the same calendar day
  // (created within the last 7 days — to avoid overwriting historical records),
  // the doctor most likely edited their note and re-pushed. Replace it.
  //
  const visitDay = new Date(scheduledAt)
  visitDay.setHours(0, 0, 0, 0)
  const dayStart = new Date(visitDay)
  const dayEnd = new Date(visitDay)
  dayEnd.setDate(dayEnd.getDate() + 1)

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const existingNote = await db.visit.findFirst({
    where: {
      residentId,
      visitType,
      scheduledAt: { gte: dayStart, lt: dayEnd },
      status: { not: 'SCHEDULED' },  // don't match SCHEDULED — that's case 1
      createdAt: { gte: sevenDaysAgo },
    },
    orderBy: { createdAt: 'desc' },
  })

  if (existingNote) {
    const visit = await db.visit.update({
      where: { id: existingNote.id },
      data: commonVisitData,
    })
    return { visit, action: 'updated', matchedVisit: existingNote }
  }

  // ===== 3. Create a new visit =====
  const visit = await db.visit.create({ data: commonVisitData })
  return { visit, action: 'created', matchedVisit: null }
}
