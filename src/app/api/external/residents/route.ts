import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateExternalApiKey } from '@/lib/external-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/external/residents
 *
 * External API for doctor apps to fetch residents from a facility.
 * Auth: X-API-Key header (ext_... format)
 *
 * Query params:
 *   - facilityId: (required) the facility to fetch residents for
 *
 * Returns an array of residents with their code, name, room, and medical info.
 * Only ACTIVE / HOSPITALIZED / OUT_WITH_FAMILY residents are returned (no DISCHARGED / DECEASED).
 *
 * Response shape:
 *   [
 *     {
 *       "residentCode": "RES-0001",
 *       "firstName": "John",
 *       "lastName": "Doe",
 *       "roomNumber": "101",
 *       "gender": "Male",
 *       "dateOfBirth": "1950-05-15T00:00:00.000Z",
 *       "allergies": "Penicillin",
 *       "conditions": "Hypertension, Diabetes",
 *       "status": "ACTIVE",
 *       "medications": [
 *         { "name": "Metformin", "dosage": "500mg", "frequency": "Twice daily", "route": "Oral Tablet" }
 *       ]
 *     }
 *   ]
 */
export async function GET(req: NextRequest) {
  const auth = await validateExternalApiKey(req)
  if (!auth.valid) {
    return NextResponse.json({ error: auth.error }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const facilityId = searchParams.get('facilityId') || auth.facilityId

  if (!facilityId) {
    return NextResponse.json({ error: 'facilityId query parameter is required' }, { status: 400 })
  }

  // Verify the API key has access to this facility
  if (auth.facilityId && auth.facilityId !== facilityId) {
    return NextResponse.json({ error: 'This API key does not have access to the requested facility' }, { status: 403 })
  }

  try {
    const residents = await db.resident.findMany({
      where: {
        facilityId,
        status: { in: ['ACTIVE', 'HOSPITALIZED', 'OUT_WITH_FAMILY'] },
      },
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        dateOfBirth: true,
        gender: true,
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

    // Transform to external-friendly format (no internal IDs leaked)
    const externalResidents = residents.map(r => ({
      residentCode: r.code,
      firstName: r.firstName,
      lastName: r.lastName,
      dateOfBirth: r.dateOfBirth,
      gender: r.gender,
      roomNumber: r.room?.roomNumber || null,
      allergies: r.allergies || 'None',
      conditions: r.conditions || 'None',
      dietaryNeeds: r.dietaryNeeds || 'Regular',
      status: r.status,
      medications: r.medications.map(m => ({
        name: m.name,
        dosage: m.dosage,
        frequency: m.frequency,
        route: m.route,
      })),
    }))

    return NextResponse.json({
      facilityId,
      residentCount: externalResidents.length,
      syncedAt: new Date().toISOString(),
      residents: externalResidents,
    })
  } catch (e: any) {
    console.error('External API /residents error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
