import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateExternalApiKey, resolveResidentByExternalCode } from '@/lib/external-auth'
import { logAudit } from '@/lib/audit'
import { getFacilityName } from '@/lib/audit'
import { upsertExternalVisit } from '@/lib/external-visits-upsert'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/external/visits
 *
 * External API for doctor apps to push visit notes to Serenity.
 * Auth: X-API-Key header (ext_... format)
 *
 * === PAYLOAD (any subset is accepted; missing fields are silently ignored) ===
 *
 * Required:
 *   - facilityId           "demo-fac-1"
 *   - externalResidentCode "DR-001" (or RES-0001, or "John Doe" — see resolveResidentByExternalCode)
 *   - visitType            "DOCTOR" | "PHYSIO" | "DIETITIAN" | "NURSE_ASSESSMENT" | "OTHER"
 *   - scheduledAt          ISO 8601 timestamp — the actual visit date/time
 *
 * Optional (pick whichever shape matches your doctor app):
 *
 *   --- Simple shape (free text) ---
 *   - doctorName           "Dr. Tan"
 *   - notes                "Patient stable. BP 130/85. Continue current medication."   → chiefComplaint
 *   - diagnosis            "Hypertension, well-controlled"                              → diagnosis
 *   - prescription         "Continue Metformin 500mg BD"                                → prescription
 *   - followUpDate         ISO 8601                                                     → followUpNote + creates a SCHEDULED visit
 *
 *   --- SOAP shape (structured) ---
 *   - doctorName           "Dr. Tan"
 *   - soap: {
 *       subjective: "Patient complains of mild headache for 3 days, no nausea.",        → chiefComplaint
 *       objective:  "BP 140/90, HR 76, afebrile, no oedema.",                            → findings
 *       assessment: "Hypertension stage 1, otherwise stable.",                           → diagnosis
 *       plan:       "Continue Metformin 500mg BD; add Amlodipine 5mg OD; reduce salt."   → treatmentPlan
 *     }
 *   - prescription         "Metformin 500mg BD, Amlodipine 5mg OD"                      → prescription
 *   - vitalsNote           "BP 140/90, HR 76, Temp 37.0"                                → vitalsNote
 *   - followUpDate         ISO 8601                                                     → followUpNote + creates a SCHEDULED visit
 *
 *   --- Optional visit timing ---
 *   - status               "COMPLETED" (default) | "SCHEDULED"
 *   - visitStart           ISO 8601 — used for completedAt + duration calc
 *   - visitEnd             ISO 8601 — used for duration calc
 *   - duration             Number of minutes (overridden by visitStart/visitEnd if both present)
 *
 * Returns:
 *   { success: true, visitId, residentCode, residentId, matchedBy, message }
 *
 * Provenance:
 *   - `completedByName` is set to `doctorName` (so Serenity UI shows who did the visit)
 *   - `externalSource` is set to the API key's `externalAppName` (so Serenity UI shows a "Synced from X" badge)
 *   - If `doctorName` matches an active Staff record (by firstName + lastName, case-insensitive,
 *     scoped to the facility), `staffId` is linked — so the visit appears with the doctor's
 *     staff profile in the Visits module.
 */
export async function POST(req: NextRequest) {
  const auth = await validateExternalApiKey(req)
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  try {
    const body = await req.json()
    const {
      facilityId,
      externalResidentCode,
      visitType,
      scheduledAt,
      status,
      doctorName,
      notes,
      diagnosis,
      prescription,
      followUpDate,
      // SOAP-structured payload
      soap,
      // Optional timing
      visitStart,
      visitEnd,
      duration,
    } = body

    // Validate required fields
    if (!facilityId) return NextResponse.json({ error: 'facilityId is required' }, { status: 400 })
    if (!externalResidentCode) return NextResponse.json({ error: 'externalResidentCode is required' }, { status: 400 })
    if (!visitType) return NextResponse.json({ error: 'visitType is required' }, { status: 400 })
    if (!scheduledAt) return NextResponse.json({ error: 'scheduledAt is required' }, { status: 400 })

    // Verify the API key has access to this facility
    if (auth.facilityId && auth.facilityId !== facilityId) {
      return NextResponse.json({ error: 'This API key does not have access to the requested facility' }, { status: 403 })
    }

    // Resolve the resident by external code
    const resolved = await resolveResidentByExternalCode(externalResidentCode, auth.externalAppName || 'External', facilityId)
    if (!resolved) {
      return NextResponse.json({
        error: `Could not find a resident matching external code "${externalResidentCode}". Please set up a code mapping in Settings → External Integration.`,
        externalResidentCode,
      }, { status: 404 })
    }

    // ---------- Map doctor-app payload → Serenity Visit columns ----------
    //
    // The Visit model has these structured clinical columns:
    //   chiefComplaint, vitalsNote, findings, diagnosis, treatmentPlan,
    //   prescription, followUpNote, recommendations
    //
    // The doctor app can send EITHER a SOAP-structured payload OR a flat
    // free-text payload. We map both to the same columns:

    const soapSubjective = soap?.subjective?.trim()
    const soapObjective  = soap?.objective?.trim()
    const soapAssessment = soap?.assessment?.trim()
    const soapPlan       = soap?.plan?.trim()

    // Chief complaint: prefer SOAP subjective, fall back to flat `notes`
    const chiefComplaint = soapSubjective || (notes && notes.trim()) || null

    // Findings (objective exam): prefer SOAP objective
    const findings = soapObjective || null

    // Diagnosis: prefer SOAP assessment, fall back to flat `diagnosis`
    const diagnosisValue = soapAssessment || (diagnosis && diagnosis.trim()) || null

    // Treatment plan: prefer SOAP plan
    const treatmentPlan = soapPlan || null

    // Prescription: straight pass-through (no SOAP equivalent)
    const prescriptionValue = prescription && prescription.trim() || null

    // Vitals note: straight pass-through
    const vitalsNoteValue = body.vitalsNote && body.vitalsNote.trim() || null

    // Follow-up note: synthesise from followUpDate
    let followUpNoteValue: string | null = null
    if (followUpDate) {
      try {
        const fuDate = new Date(followUpDate)
        if (!isNaN(fuDate.getTime())) {
          followUpNoteValue = `Follow-up scheduled for ${fuDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`
        }
      } catch { /* ignore bad date */ }
    }

    // ---------- Resolve the doctor to a Staff record (so the visit displays with a real staff profile) ----------
    //
    // Match by firstName + lastName, case-insensitive, scoped to the facility.
    // Accepts "Dr. Tan" → firstName="Dr.", lastName="Tan" — won't match (Malaysian doctors usually registered as just "Tan").
    // Also tries splitting on space and matching each token as either firstName or lastName.
    //
    let staffId: string | null = null
    if (doctorName && typeof doctorName === 'string') {
      const cleanName = doctorName
        .replace(/^(dr\.?|datuk|dato'|prof)\s+/i, '') // strip "Dr. " prefix
        .trim()
      if (cleanName.length >= 2) {
        const parts = cleanName.split(/\s+/)
        const first = parts[0]
        const last = parts.slice(1).join(' ') || first
        // Try exact firstName + lastName match
        const match = await db.staff.findFirst({
          where: {
            facilityId,
            active: true,
            OR: [
              { firstName: { equals: first }, lastName: { equals: last } },
              { firstName: { equals: first }, lastName: { equals: '' } },
              // Single-name doctors: "Tan" matches either firstName or lastName
              ...(parts.length === 1 ? [
                { firstName: { equals: cleanName } },
                { lastName: { equals: cleanName } },
              ] : []),
            ],
          },
          select: { id: true },
        })
        if (match) staffId = match.id
      }
    }

    // ---------- Compute completedAt + duration ----------
    //
    // For COMPLETED visits:
    //   - completedAt defaults to visitStart (if provided) else scheduledAt else now
    //   - duration is computed from visitStart + visitEnd if both are present,
    //     otherwise falls back to the explicit `duration` field
    //
    const finalStatus = status || 'COMPLETED'
    const visitScheduledAt = new Date(scheduledAt)
    let completedAt: Date | null = null
    let durationMin: number | null = null

    if (finalStatus === 'COMPLETED') {
      completedAt = visitStart ? new Date(visitStart) : visitScheduledAt
      if (visitStart && visitEnd) {
        const diffMs = new Date(visitEnd).getTime() - new Date(visitStart).getTime()
        if (diffMs > 0) durationMin = Math.round(diffMs / 60000)
      } else if (typeof duration === 'number' && duration > 0) {
        durationMin = duration
      }
    }

    // ---------- Upsert the visit (auto-complete appointment, replace note, or create) ----------
    //
    // Delegates to the shared `upsertExternalVisit` helper so the legacy
    // endpoint and the FHIR Encounter endpoint behave identically:
    //
    //   1. If a SCHEDULED visit exists in Serenity for the same resident +
    //      visitType, scheduled within ±1 day of the doctor's actual visit
    //      time → UPDATE its status to COMPLETED + fill in the clinical
    //      fields (auto-completes the appointment).
    //   2. Else if a COMPLETED/CANCELLED visit exists for the same resident
    //      + visitType + same calendar day (created within 7 days) → REPLACE
    //      it (handles "doctor edited the note and re-pushed").
    //   3. Otherwise → CREATE a new COMPLETED visit.
    //
    const commonVisitData = {
      residentId: resolved.residentId,
      staffId,                              // linked Staff if we found one
      visitType,
      scheduledAt: visitScheduledAt,        // the actual visit date/time (from doctor app)
      status: finalStatus,
      completedAt,
      completedByName: doctorName || null,  // who performed the visit (shown in UI)
      // Structured clinical fields:
      chiefComplaint,
      vitalsNote: vitalsNoteValue,
      findings,
      diagnosis: diagnosisValue,
      treatmentPlan,
      prescription: prescriptionValue,
      followUpNote: followUpNoteValue,
      duration: durationMin,
      // Provenance marker — Serenity UI shows a "Synced from <appName>" badge when this is set
      externalSource: auth.externalAppName || 'External App',
    }

    const { visit, action, matchedVisit } = await upsertExternalVisit({
      residentId: resolved.residentId,
      visitType,
      scheduledAt: visitScheduledAt,
      status: finalStatus,
      commonVisitData,
    })

    // If a follow-up date was provided, create a SCHEDULED visit for it
    let followUpVisitId: string | null = null
    if (followUpDate) {
      try {
        const fuDate = new Date(followUpDate)
        if (!isNaN(fuDate.getTime())) {
          const fu = await db.visit.create({
            data: {
              residentId: resolved.residentId,
              staffId,
              visitType,
              scheduledAt: fuDate,
              status: 'SCHEDULED',
              chiefComplaint: `Follow-up visit scheduled by ${doctorName || 'doctor'} via ${auth.externalAppName || 'External App'}`,
              externalSource: auth.externalAppName || 'External App',
            },
          })
          followUpVisitId = fu.id
        }
      } catch (e: any) {
        console.error('Failed to create follow-up visit:', e)
      }
    }

    // Log the sync
    const facName = await getFacilityName(facilityId)
    const auditAction =
      action === 'appointment_completed' ? 'VISIT_COMPLETED' :
      action === 'updated' ? 'VISIT_UPDATED' :
      'VISIT_COMPLETED'
    const actionDescription =
      action === 'appointment_completed' ? 'auto-completed scheduled appointment with visit note' :
      action === 'updated' ? 'updated visit note (replaced previous version)' :
      'synced visit note'
    await logAudit({
      userId: null,
      userName: auth.externalAppName || 'External App',
      userRole: 'EXTERNAL_API',
      action: auditAction,
      entityType: 'VISIT',
      entityId: visit.id,
      description: `External app "${auth.externalAppName}" ${actionDescription} for ${resolved.residentCode} (${externalResidentCode}) — ${visitType}${doctorName ? ` by ${doctorName}` : ''}`,
      metadata: {
        visitId: visit.id,
        previousVisitId: matchedVisit?.id || null,   // the SCHEDULED appointment or replaced note
        previousStatus: matchedVisit?.status || null, // 'SCHEDULED' when auto-completing
        action,
        residentId: resolved.residentId,
        externalResidentCode,
        matchedBy: resolved.matchedBy,
        visitType,
        doctorName,
        staffLinked: !!staffId,
        hasFollowUp: !!followUpVisitId,
        followUpVisitId,
        source: auth.externalAppName,
      },
      facilityId,
      facilityName: facName,
    }).catch(() => {})

    const message =
      action === 'appointment_completed'
        ? `Appointment auto-completed — visit note attached to scheduled ${visitType.toLowerCase()} visit. Resident matched by ${resolved.matchedBy}.${staffId ? ' Doctor linked to staff record.' : ''}`
        : action === 'updated'
          ? `Visit note updated (replaced previous version). Resident matched by ${resolved.matchedBy}.${staffId ? ' Doctor linked to staff record.' : ''}`
          : `Visit note synced successfully. Resident matched by ${resolved.matchedBy}.${staffId ? ' Doctor linked to staff record.' : ''}`

    return NextResponse.json({
      success: true,
      action,                                  // "created" | "updated" | "appointment_completed"
      visitId: visit.id,
      matchedVisitId: matchedVisit?.id || null, // the appointment/note that was updated (null when created)
      followUpVisitId,
      residentCode: resolved.residentCode,
      residentId: resolved.residentId,
      matchedBy: resolved.matchedBy,
      staffLinked: !!staffId,
      message,
    })
  } catch (e: any) {
    console.error('External API /visits error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
