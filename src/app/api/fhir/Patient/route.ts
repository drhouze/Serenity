import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateExternalApiKey } from '@/lib/external-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/fhir/Patient
 *
 * FHIR R4 Patient resource — returns residents as FHIR Patient resources.
 * Auth: X-API-Key header (ext_... format)
 *
 * Query params:
 *   - facilityId: (required) the facility to fetch residents for
 *   - _id: (optional) FHIR resource ID — returns a single patient by our resident code
 *   - identifier: (optional) FHIR search by identifier — e.g. "RES-0001"
 *
 * FHIR Patient resource shape (simplified):
 *   {
 *     "resourceType": "Patient",
 *     "id": "RES-0001",
 *     "identifier": [
 *       { "system": "https://serenity-care.home/facility/<facilityId>", "value": "RES-0001" }
 *     ],
 *     "name": [{ "family": "Doe", "given": ["John"] }],
 *     "gender": "male",
 *     "birthDate": "1950-05-15",
 *     "active": true,
 *     "address": [{ "text": "Room 101" }],
 *     "extension": [
 *       { "url": "http://serenity-care.home/fhir/StructureDefinition/allergies", "valueString": "Penicillin" },
 *       { "url": "http://serenity-care.home/fhir/StructureDefinition/conditions", "valueString": "Hypertension" },
 *       { "url": "http://serenity-care.home/fhir/StructureDefinition/dietaryNeeds", "valueString": "Diabetic" },
 *       { "url": "http://serenity-care.home/fhir/StructureDefinition/status", "valueString": "ACTIVE" }
 *     ]
 *   }
 *
 * The external app should store the identifier (system + value) as a cross-reference.
 * When sending an Encounter, they reference the patient by this identifier — no mapping needed.
 */
export async function GET(req: NextRequest) {
  const auth = await validateExternalApiKey(req)
  if (!auth.valid) {
    return NextResponse.json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'security', diagnostics: auth.error }]
    }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const facilityId = searchParams.get('facilityId') || auth.facilityId

  if (!facilityId) {
    return NextResponse.json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'required', diagnostics: 'facilityId query parameter is required' }]
    }, { status: 400 })
  }

  // Verify the API key has access to this facility
  if (auth.facilityId && auth.facilityId !== facilityId) {
    return NextResponse.json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'security', diagnostics: 'This API key does not have access to the requested facility' }]
    }, { status: 403 })
  }

  // The identifier system — this is the canonical URI for YOUR app's resident codes
  const identifierSystem = `https://serenity-care.home/facility/${facilityId}`

  // Fetch the facility name (for the response bundle so external apps can display it)
  const facility = await db.facility.findUnique({
    where: { id: facilityId },
    select: { name: true },
  })
  const facilityName = facility?.name || 'Unknown Facility'

  // Build where clause — supports FHIR search params
  const where: any = {
    facilityId,
    status: { in: ['ACTIVE', 'HOSPITALIZED', 'OUT_WITH_FAMILY'] },
  }

  // FHIR _id search (by our resident code)
  const fhirId = searchParams.get('_id')
  if (fhirId) {
    where.code = fhirId
  }

  // FHIR identifier search — e.g. identifier=RES-0001 or identifier=https://serenity-care.home/facility/demo-fac-1|RES-0001
  const identifierSearch = searchParams.get('identifier')
  if (identifierSearch && !fhirId) {
    // Parse "system|value" or just "value"
    const parts = identifierSearch.split('|')
    const codeValue = parts.length > 1 ? parts[1] : parts[0]
    where.code = codeValue
  }

  // FHIR name search — e.g. name=John or name=John Doe
  const nameSearch = searchParams.get('name')
  if (nameSearch) {
    const nameParts = nameSearch.trim().split(/\s+/)
    if (nameParts.length === 1) {
      // Single word — search in both first and last name
      where.OR = [
        { firstName: { contains: nameParts[0] } },
        { lastName: { contains: nameParts[0] } },
      ]
    } else {
      // Multiple words — first word = firstName, rest = lastName
      where.firstName = { contains: nameParts[0] }
      where.lastName = { contains: nameParts.slice(1).join(' ') }
    }
  }

  // FHIR birthDate search — e.g. birthDate=1950-05-15
  const birthDateSearch = searchParams.get('birthDate')
  if (birthDateSearch) {
    // Parse the date and filter by dateOfBirth
    const d = new Date(birthDateSearch)
    if (!isNaN(d.getTime())) {
      const start = new Date(d.getFullYear(), d.getMonth(), d.getDate())
      const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
      where.dateOfBirth = { gte: start, lt: end }
    }
  }

  // IC/Passport search — via icPassportNumber field
  const icSearch = searchParams.get('ic')
  if (icSearch) {
    where.icPassportNumber = { contains: icSearch }
  }

  try {
    const residents = await db.resident.findMany({
      where,
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
        icPassportNumber: true,
        allergies: true,
        conditions: true,
        dietaryNeeds: true,
        status: true,
        room: { select: { roomNumber: true } },
        medications: {
          where: { active: true },
          select: { name: true, dosage: true, frequency: true, route: true },
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })

    // Transform to FHIR R4 Patient resources
    const fhirPatients = residents.map(r => ({
      resourceType: 'Patient' as const,
      id: r.code,  // FHIR id = our resident code (RES-0001)
      identifier: [
        // Primary identifier — your app's code (canonical)
        {
          system: identifierSystem,
          value: r.code,
          use: 'official' as const,
        },
        // IC / Passport number (for matching by IC)
        ...(r.icPassportNumber ? [{
          system: 'http://hl7.org/fhir/sid/my-ic',
          value: r.icPassportNumber,
          use: 'official' as const,
        }] : []),
        // Internal DB ID (for reference, not for external apps to use)
        {
          system: 'https://serenity-care.home/internal',
          value: r.id,
          use: 'secondary' as const,
        },
      ],
      name: [{
        use: 'official' as const,
        family: r.lastName,
        given: [r.firstName],
        text: `${r.firstName} ${r.lastName}`,
      }],
      gender: r.gender?.toLowerCase() || 'unknown',
      birthDate: r.dateOfBirth ? r.dateOfBirth.toISOString().slice(0, 10) : undefined,
      active: r.status === 'ACTIVE',
      address: r.room?.roomNumber ? [{
        use: 'current' as const,
        text: `Room ${r.room.roomNumber}`,
      }] : undefined,
      // Extensions for app-specific fields
      extension: [
        // Facility name — so external apps can display it
        {
          url: 'http://serenity-care.home/fhir/StructureDefinition/facilityName',
          valueString: facilityName,
        },
        // Facility ID
        {
          url: 'http://serenity-care.home/fhir/StructureDefinition/facilityId',
          valueString: facilityId,
        },
        ...(r.allergies && r.allergies !== 'None' ? [{
          url: 'http://serenity-care.home/fhir/StructureDefinition/allergies',
          valueString: r.allergies,
        }] : []),
        ...(r.conditions ? [{
          url: 'http://serenity-care.home/fhir/StructureDefinition/conditions',
          valueString: r.conditions,
        }] : []),
        ...(r.dietaryNeeds ? [{
          url: 'http://serenity-care.home/fhir/StructureDefinition/dietaryNeeds',
          valueString: r.dietaryNeeds,
        }] : []),
        {
          url: 'http://serenity-care.home/fhir/StructureDefinition/residentStatus',
          valueString: r.status,
        },
      ],
      // Contained resources — active medications
      contained: r.medications.length > 0 ? r.medications.map(m => ({
        resourceType: 'MedicationStatement' as const,
        status: 'active' as const,
        medicationCodeableConcept: {
          text: `${m.name} ${m.dosage || ''} (${m.frequency || ''})`,
        },
        dosage: [{
          route: m.route ? { text: m.route } : undefined,
        }],
      })) : undefined,
    }))

    // FHIR Bundle response — includes facility name + ID for external apps
    return NextResponse.json({
      resourceType: 'Bundle',
      type: 'searchset',
      total: fhirPatients.length,
      timestamp: new Date().toISOString(),
      // Extension on the bundle itself — so external apps can read facility name without parsing each Patient
      extension: [
        { url: 'http://serenity-care.home/fhir/StructureDefinition/facilityName', valueString: facilityName },
        { url: 'http://serenity-care.home/fhir/StructureDefinition/facilityId', valueString: facilityId },
      ],
      entry: fhirPatients.map(resource => ({ resource })),
    })
  } catch (e: any) {
    return NextResponse.json({
      resourceType: 'OperationOutcome',
      issue: [{ severity: 'error', code: 'exception', diagnostics: e.message }]
    }, { status: 500 })
  }
}
