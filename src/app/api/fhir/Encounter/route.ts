import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateExternalApiKey } from '@/lib/external-auth'
import { logAudit } from '@/lib/audit'
import { getFacilityName } from '@/lib/audit'
import { upsertExternalVisit } from '@/lib/external-visits-upsert'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/fhir/Encounter
 *
 * FHIR R4 Encounter resource — receives visit notes from external apps.
 * Auth: X-API-Key header (ext_... format)
 *
 * The external app sends a FHIR Encounter resource. The patient is identified by
 * the `subject.identifier` field, which contains our system + value (RES-0001).
 *
 * If the patient's identifier uses our system → resolve directly (NO mapping needed).
 * If the patient's identifier uses a different system → fall back to code mapping or name matching.
 *
 * Body (FHIR R4 Encounter):
 *   {
 *     "resourceType": "Encounter",
 *     "status": "finished",
 *     "class": { "code": "AMB", "display": "Ambulatory" },
 *     "subject": {
 *       "identifier": {
 *         "system": "https://serenity-care.home/facility/demo-fac-1",
 *         "value": "RES-0001"
 *       }
 *     },
 *     "period": { "start": "2026-08-12T10:00:00Z", "end": "2026-08-12T10:30:00Z" },
 *     "participant": [{
 *       "individual": { "display": "Dr. Tan" }
 *     }],
 *     "reasonCode": [{ "text": "Hypertension follow-up" }],
 *     "diagnosis": [{
 *       "condition": { "display": "Hypertension, well-controlled" }
 *     }],
 *     "appointment": { "identifier": { "value": "followup-2026-09-12" } },
 *     "extension": [
 *       { "url": ".../soapSubjective", "valueString": "..." },
 *       { "url": ".../soapObjective",  "valueString": "..." },
 *       { "url": ".../soapAssessment", "valueString": "..." },
 *       { "url": ".../soapPlan",       "valueString": "..." },
 *       { "url": ".../prescription",   "valueString": "..." },
 *       { "url": ".../vitalsNote",     "valueString": "..." },
 *       { "url": ".../followUpNote",   "valueString": "..." },
 *       { "url": ".../visitType",      "valueString": "DOCTOR" }
 *     ]
 *   }
 *
 * FHIR field mapping → Visit model columns (NO `notes` field — the Visit model
 * does not have one; previous versions of this route constructed a `notes`
 * string and tried to save it, which caused Prisma to throw "Unknown argument
 * `notes`"). Fields are now mapped directly to the structured Visit columns
 * that /api/external/visits also uses, so the Serenity Visits module renders
 * them identically regardless of which endpoint the external app calls:
 *
 *   Encounter.status                → Visit.status (finished→COMPLETED, planned→SCHEDULED, ...)
 *   Encounter.class.code            → Visit.visitType (AMB→DOCTOR, PHYS→PHYSIO, ...) — overridable via visitType extension
 *   Encounter.subject.identifier    → Visit.residentId (resolved via identifier)
 *   Encounter.period.start          → Visit.scheduledAt + Visit.completedAt (when status=COMPLETED)
 *   Encounter.period.end            → Visit.completedAt + duration computed from start/end
 *   Encounter.participant[0].individual.display → Visit.completedByName (doctor name) + Visit.staffId (if a matching Staff record exists)
 *   Encounter.reasonCode[0].text    → Visit.chiefComplaint (falls back to soapSubjective / description)
 *   Encounter.diagnosis[0].condition.display → Visit.diagnosis (falls back to soapAssessment)
 *   extension[soapSubjective]       → Visit.chiefComplaint (preferred over reasonCode if present)
 *   extension[soapObjective]        → Visit.findings
 *   extension[soapAssessment]       → Visit.diagnosis (preferred over diagnosis.condition.display if present)
 *   extension[soapPlan]             → Visit.treatmentPlan
 *   extension[prescription]         → Visit.prescription
 *   extension[vitalsNote]           → Visit.vitalsNote
 *   extension[followUpNote]         → Visit.followUpNote
 *   Encounter.appointment.identifier.value OR extension[followUpDate]
 *                                    → creates a separate SCHEDULED follow-up visit + sets Visit.followUpNote
 *   auth.externalAppName            → Visit.externalSource (for the "Synced from X" badge)
 *
 * Replace-on-resave behaviour (parity with /api/external/visits):
 *   If an existing visit exists for the same resident + visitType + same
 *   calendar day (created within the last 7 days), it is REPLACED with the
 *   new payload instead of creating a duplicate. The response includes
 *   `action: "created" | "updated"` so the caller knows which happened.
 *
 * Response (FHIR OperationOutcome with extension):
 *   {
 *     "resourceType": "OperationOutcome",
 *     "issue": [{ "severity": "information", "code": "informational", "diagnostics": "..." }],
 *     "extension": [{ "url": ".../visitId", "valueString": "..." }]
 *   }
 */
export async function POST(req: NextRequest) {
  const auth = await validateExternalApiKey(req)
  if (!auth.valid) {
    return NextResponse.json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'security', diagnostics: auth.error }]
    }, { status: 401 })
  }

  try {
    const encounter = await req.json()

    if (encounter.resourceType !== 'Encounter') {
      return NextResponse.json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'structure', diagnostics: `Expected resourceType 'Encounter', got '${encounter.resourceType}'` }]
      }, { status: 400 })
    }

    // ===== 1. Resolve the facility =====
    const facilityId = searchParams(req, 'facilityId') || auth.facilityId
    if (!facilityId) {
      return NextResponse.json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'required', diagnostics: 'facilityId query parameter is required' }]
      }, { status: 400 })
    }
    if (auth.facilityId && auth.facilityId !== facilityId) {
      return NextResponse.json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'security', diagnostics: 'This API key does not have access to the requested facility' }]
      }, { status: 403 })
    }

    // ===== 2. Resolve the patient (subject) =====
    const subject = encounter.subject
    if (!subject?.identifier) {
      return NextResponse.json({
        resourceType: 'OperationOutcome',
        issue: [{ severity: 'error', code: 'required', diagnostics: 'Encounter.subject.identifier is required. Provide the patient identifier from GET /api/fhir/Patient.' }]
      }, { status: 400 })
    }

    const identifierSystem = subject.identifier.system || ''
    const identifierValue = subject.identifier.value || ''
    const ourSystem = `https://serenity-care.home/facility/${facilityId}`

    let resolvedResident: { id: string; code: string; matchedBy: string } | null = null

    if (identifierSystem === ourSystem) {
      // === Best case: the external app stored OUR identifier ===
      // Resolve directly by our resident code — NO mapping needed!
      const resident = await db.resident.findFirst({
        where: {
          code: identifierValue,
          facilityId,
          status: { in: ['ACTIVE', 'HOSPITALIZED', 'OUT_WITH_FAMILY'] },
        },
        select: { id: true, code: true },
      })
      if (resident) {
        resolvedResident = { id: resident.id, code: resident.code!, matchedBy: 'identifier' }
      }
    } else {
      // === Fallback: the external app used their own identifier system ===
      // Try code mapping → then direct code match → then name match
      const { resolveResidentByExternalCode } = await import('@/lib/external-auth')
      const resolved = await resolveResidentByExternalCode(
        identifierValue,
        auth.externalAppName || 'External',
        facilityId
      )
      if (resolved) {
        resolvedResident = { id: resolved.residentId, code: resolved.residentCode, matchedBy: resolved.matchedBy }
      }
    }

    if (!resolvedResident) {
      return NextResponse.json({
        resourceType: 'OperationOutcome',
        issue: [{
          severity: 'error',
          code: 'not-found',
          diagnostics: `Could not resolve patient with identifier ${identifierSystem}|${identifierValue}. ` +
            `Make sure you stored the identifier from GET /api/fhir/Patient when you first fetched the patient. ` +
            `If you're using your own codes, set up a code mapping in Settings → External Integration.`
        }]
      }, { status: 404 })
    }

    // ===== 3. Map FHIR Encounter fields to our Visit model columns =====

    // Status: FHIR → our enum
    const statusMap: Record<string, string> = {
      'finished': 'COMPLETED',
      'planned': 'SCHEDULED',
      'arrived': 'COMPLETED',
      'in-progress': 'COMPLETED',
      'cancelled': 'CANCELLED',
      'entered-in-error': 'CANCELLED',
    }
    const visitStatus = statusMap[encounter.status] || 'COMPLETED'

    // Visit type: FHIR Encounter.class.code → our Visit.visitType
    const classCodeMap: Record<string, string> = {
      'AMB': 'DOCTOR',
      'EMER': 'OTHER',
      'HH': 'NURSE_ASSESSMENT',
      'IMP': 'OTHER',
      'PHYS': 'PHYSIO',
      'DIET': 'DIETITIAN',
    }
    // Also check if there's a custom extension for visitType
    const visitTypeExt = findExtension(encounter, 'visitType')
    const visitType = visitTypeExt || classCodeMap[encounter.class?.code] || 'DOCTOR'

    // Period (scheduledAt + completedAt + duration)
    const scheduledAtStr = encounter.period?.start || new Date().toISOString()
    const scheduledAt = new Date(scheduledAtStr)
    const periodEnd = encounter.period?.end ? new Date(encounter.period.end) : null
    let completedAt: Date | null = null
    let durationMin: number | null = null
    if (visitStatus === 'COMPLETED') {
      completedAt = periodEnd || scheduledAt
      if (periodEnd && periodEnd.getTime() > scheduledAt.getTime()) {
        durationMin = Math.round((periodEnd.getTime() - scheduledAt.getTime()) / 60000)
      }
    }

    // ----- Structured clinical fields (mapped from FHIR + extensions) -----

    // SOAP extensions (preferred source for chief complaint / findings / diagnosis / treatment plan)
    const soapSubjective = findExtension(encounter, ['soapSubjective', 'subjective'])
    const soapObjective  = findExtension(encounter, ['soapObjective', 'objective'])
    const soapAssessment = findExtension(encounter, ['soapAssessment', 'assessment'])
    const soapPlan       = findExtension(encounter, ['soapPlan', 'plan'])

    // Participant (doctor name)
    const participants: string[] = (encounter.participant || [])
      .map((p: any) => p.individual?.display || p.individual?.identifier?.value)
      .filter(Boolean)
    const doctorName = participants.length > 0 ? participants.join(', ') : null

    // Reason (FHIR reasonCode)
    const reasons: string[] = (encounter.reasonCode || [])
      .map((r: any) => r.text || r.coding?.[0]?.display)
      .filter(Boolean)
    const reasonText = reasons.length > 0 ? reasons.join('; ') : null

    // Diagnosis (FHIR Encounter.diagnosis[].condition.display)
    const diagnoses: string[] = (encounter.diagnosis || [])
      .map((d: any) => d.condition?.display || d.condition?.reference)
      .filter(Boolean)
    const diagnosisFromFhir = diagnoses.length > 0 ? diagnoses.join('; ') : null

    // Other extensions
    const prescriptionExt = findExtension(encounter, 'prescription')
    const prescriptionsExt = findExtension(encounter, 'prescriptions')
    const vitalsNoteExt = findExtension(encounter, 'vitalsNote')
    const followUpNoteExt = findExtension(encounter, 'followUpNote')
    const textNotes = findExtension(encounter, 'notes') || encounter.text?.div || encounter.description

    // Build prescription value (prefer array form, fall back to single string)
    let prescriptionValue: string | null = null
    if (prescriptionsExt) {
      prescriptionValue = Array.isArray(prescriptionsExt) ? prescriptionsExt.join('\n') : String(prescriptionsExt)
    } else if (prescriptionExt) {
      prescriptionValue = prescriptionExt
    }

    // ----- Final column mapping (SOAP extensions win where they exist) -----
    const chiefComplaint  = soapSubjective || reasonText || textNotes || null
    const findings        = soapObjective || null
    const diagnosisValue  = soapAssessment || diagnosisFromFhir || null
    const treatmentPlan   = soapPlan || null
    const prescription    = prescriptionValue
    const vitalsNoteValue = vitalsNoteExt || null

    // Follow-up date: appointment.identifier.value OR extension[followUpDate]
    const followUpDateStr =
      encounter.appointment?.identifier?.value ||
      encounter.extension?.find((e: any) => e.url?.includes('followUpDate'))?.valueDateTime ||
      null
    let followUpNoteValue: string | null = followUpNoteExt
    if (followUpDateStr && !followUpNoteValue) {
      try {
        const fuDate = new Date(followUpDateStr)
        if (!isNaN(fuDate.getTime())) {
          followUpNoteValue = `Follow-up scheduled for ${fuDate.toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })}`
        }
      } catch { /* ignore bad date */ }
    }

    // ===== 4. Try to link the doctor to a Staff record (same logic as /api/external/visits) =====
    let staffId: string | null = null
    if (doctorName) {
      const cleanName = doctorName
        .replace(/^(dr\.?|datuk|dato'|prof)\s+/i, '') // strip "Dr. " prefix
        .trim()
      if (cleanName.length >= 2) {
        const parts = cleanName.split(/\s+/)
        const first = parts[0]
        const last = parts.slice(1).join(' ') || first
        const match = await db.staff.findFirst({
          where: {
            facilityId,
            active: true,
            OR: [
              { firstName: { equals: first }, lastName: { equals: last } },
              { firstName: { equals: first }, lastName: { equals: '' } },
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

    // ===== 5. Upsert the visit (auto-complete appointment, replace note, or create) =====
    //
    // Delegates to the shared `upsertExternalVisit` helper so the FHIR
    // endpoint behaves identically to the legacy /api/external/visits:
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
      residentId: resolvedResident.id,
      staffId,
      visitType,
      scheduledAt,
      status: visitStatus,
      completedAt,
      completedByName: doctorName,
      chiefComplaint,
      vitalsNote: vitalsNoteValue,
      findings,
      diagnosis: diagnosisValue,
      treatmentPlan,
      prescription,
      followUpNote: followUpNoteValue,
      duration: durationMin,
      externalSource: auth.externalAppName || 'External App (FHIR)',
    }

    const { visit, action, matchedVisit } = await upsertExternalVisit({
      residentId: resolvedResident.id,
      visitType,
      scheduledAt,
      status: visitStatus,
      commonVisitData,
    })

    // ===== 6. If there's a follow-up appointment, create a SCHEDULED visit =====
    let followUpVisitId: string | null = null
    if (followUpDateStr) {
      try {
        const fuDate = new Date(followUpDateStr)
        if (!isNaN(fuDate.getTime())) {
          const fu = await db.visit.create({
            data: {
              residentId: resolvedResident.id,
              staffId,
              visitType,
              scheduledAt: fuDate,
              status: 'SCHEDULED',
              chiefComplaint: `Follow-up visit scheduled by ${doctorName || 'doctor'} via ${auth.externalAppName || 'External App'} (FHIR)`,
              externalSource: auth.externalAppName || 'External App (FHIR)',
            },
          })
          followUpVisitId = fu.id
        }
      } catch (e: any) {
        console.error('Failed to create follow-up visit (FHIR):', e)
      }
    }

    // ===== 7. Audit log =====
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
      userName: auth.externalAppName || 'External App (FHIR)',
      userRole: 'EXTERNAL_FHIR',
      action: auditAction,
      entityType: 'VISIT',
      entityId: visit.id,
      description: `FHIR Encounter ${actionDescription} from "${auth.externalAppName}" — ${resolvedResident.code} (${visitType})${doctorName ? ` by ${doctorName}` : ''}`,
      metadata: {
        visitId: visit.id,
        previousVisitId: matchedVisit?.id || null,
        previousStatus: matchedVisit?.status || null,
        action,
        residentCode: resolvedResident.code,
        identifierSystem,
        identifierValue,
        matchedBy: resolvedResident.matchedBy,
        visitType,
        visitStatus,
        doctorName,
        staffLinked: !!staffId,
        hasFollowUp: !!followUpVisitId,
        followUpVisitId,
        source: auth.externalAppName,
        protocol: 'FHIR',
      },
      facilityId,
      facilityName: facName,
    }).catch(() => {})

    // ===== 8. Return FHIR-compliant response =====
    const diagMessage =
      action === 'appointment_completed'
        ? `Encounter auto-completed scheduled appointment — visit note attached to resident ${resolvedResident.code} (resolved via ${resolvedResident.matchedBy}). Visit ID: ${visit.id}${staffId ? '. Doctor linked to staff record.' : ''}`
        : action === 'updated'
          ? `Encounter updated successfully. Visit note replaced for resident ${resolvedResident.code}. Visit ID: ${visit.id}`
          : `Encounter synced successfully. Visit created for resident ${resolvedResident.code} (resolved via ${resolvedResident.matchedBy}). Visit ID: ${visit.id}${staffId ? '. Doctor linked to staff record.' : ''}`
    return NextResponse.json({
      resourceType: 'OperationOutcome',
      issue: [{
        severity: 'information',
        code: 'informational',
        diagnostics: diagMessage,
      }],
      // Extensions so external apps using FHIR can still read the visit ID + action
      extension: [
        { url: 'http://serenity-care.home/fhir/StructureDefinition/visitId', valueString: visit.id },
        { url: 'http://serenity-care.home/fhir/StructureDefinition/action', valueString: action },
        ...(matchedVisit ? [{
          url: 'http://serenity-care.home/fhir/StructureDefinition/matchedVisitId',
          valueString: matchedVisit.id,
        }] : []),
        ...(followUpVisitId ? [{
          url: 'http://serenity-care.home/fhir/StructureDefinition/followUpVisitId',
          valueString: followUpVisitId,
        }] : []),
      ],
    }, { status: action === 'created' ? 201 : 200 })

  } catch (e: any) {
    console.error('FHIR Encounter error:', e)
    return NextResponse.json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', diagnostics: e.message }]
    }, { status: 500 })
  }
}

// ===== Helpers =====

/** Read a query parameter from the request URL. */
function searchParams(req: NextRequest, key: string): string | null {
  const url = new URL(req.url)
  return url.searchParams.get(key)
}

/**
 * Find an extension value by URL substring(s). Accepts a single substring or
 * an array of substrings (first match wins). Returns the valueString, or null
 * if no matching extension is found.
 *
 * FHIR extensions look like:
 *   { url: "http://serenity-care.home/fhir/StructureDefinition/soapSubjective",
 *     valueString: "Patient complains of..." }
 *
 * We match on substring so callers don't need to know the full URL — just the
 * meaningful suffix (e.g. "soapSubjective" or "subjective").
 */
function findExtension(encounter: any, urlSubstrings: string | string[]): string | null {
  const substrings = Array.isArray(urlSubstrings) ? urlSubstrings : [urlSubstrings]
  const exts: any[] = encounter.extension || []
  for (const sub of substrings) {
    const match = exts.find(e => e?.url?.includes(sub))
    if (match?.valueString) return match.valueString
  }
  return null
}
