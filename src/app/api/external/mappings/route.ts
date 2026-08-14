import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { validateExternalApiKey } from '@/lib/external-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/external/mappings?facilityId=X&appName=Doctor App
 *   Returns the current code mappings for a facility + external app.
 *
 * POST /api/external/mappings
 *   Body: { facilityId, appName, mappings: [{ externalCode: 'DR-001', residentCode: 'RES-0001', residentId: '...' }] }
 *   Saves the code mappings (overwrites existing).
 *
 * Auth: X-API-Key header OR Developer/Owner session
 */
export async function GET(req: NextRequest) {
  // Allow both API key and session auth for this endpoint
  const auth = await validateExternalApiKey(req)
  const isExternal = auth.valid

  // If not external API key, check session
  if (!isExternal) {
    const { getSessionUser } = await import('@/lib/auth')
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }
  }

  const { searchParams } = new URL(req.url)
  const facilityId = searchParams.get('facilityId')
  const appName = searchParams.get('appName') || 'External'

  if (!facilityId) {
    return NextResponse.json({ error: 'facilityId is required' }, { status: 400 })
  }

  const setting = await db.setting.findUnique({
    where: { key: `externalCodeMapping:${facilityId}:${appName}` },
  })

  if (!setting) {
    return NextResponse.json({ facilityId, appName, mappings: [] })
  }

  try {
    const mappings = JSON.parse(setting.value)
    return NextResponse.json({ facilityId, appName, mappings })
  } catch {
    return NextResponse.json({ facilityId, appName, mappings: [] })
  }
}

export async function POST(req: NextRequest) {
  // Only Developer/Owner can manage mappings (not external apps)
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { facilityId, appName, mappings } = body

    if (!facilityId || !appName) {
      return NextResponse.json({ error: 'facilityId and appName are required' }, { status: 400 })
    }

    const key = `externalCodeMapping:${facilityId}:${appName}`

    // Validate mappings — each must have externalCode + residentCode + residentId
    const validatedMappings = (mappings || []).map((m: any) => ({
      externalCode: String(m.externalCode || '').trim(),
      residentCode: String(m.residentCode || '').trim(),
      residentId: String(m.residentId || '').trim(),
    })).filter((m: any) => m.externalCode && m.residentCode && m.residentId)

    await db.setting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(validatedMappings) },
      update: { value: JSON.stringify(validatedMappings) },
    })

    return NextResponse.json({ success: true, mappingCount: validatedMappings.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
