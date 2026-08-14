import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/custom-field-versions?entityId=xxx&entityType=resident
 * — lists all measurement versions for an entity, newest first.
 *
 * POST /api/custom-field-versions
 * — creates a new measurement version (snapshot of current custom field values).
 *   Body: { entityId, entityType?, label?, values: { fieldId: value, ... } }
 *   Also updates CustomFieldValue to the new values (so the latest is always current).
 */
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const entityId = searchParams.get('entityId')
    const entityType = searchParams.get('entityType') || 'resident'
    if (!entityId) return NextResponse.json([])

    const versions = await db.customFieldValueVersion.findMany({
      where: { entityId, entityType },
      orderBy: { recordedAt: 'desc' },
    })

    return NextResponse.json(versions)
  } catch (e: any) {
    console.error('[custom-field-versions GET] error:', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { entityId, entityType, label, values } = body
    if (!entityId) return NextResponse.json({ error: 'entityId required' }, { status: 400 })
    if (!values || typeof values !== 'object') return NextResponse.json({ error: 'values object required' }, { status: 400 })

    const finalEntityType = entityType || 'resident'

    // 1. Create the version snapshot
    const version = await db.customFieldValueVersion.create({
      data: {
        entityId,
        entityType: finalEntityType,
        values: JSON.stringify(values),
        label: label || null,
        recordedAt: new Date(),
        recordedBy: user.id,
        recordedByName: user.name,
      },
    })

    // 2. Update CustomFieldValue to the new values (latest = current)
    for (const [fieldId, value] of Object.entries(values)) {
      if (value === '' || value == null) continue
      const existing = await db.customFieldValue.findUnique({
        where: { entityId_fieldId: { entityId, fieldId } },
      })
      if (existing) {
        await db.customFieldValue.update({
          where: { id: existing.id },
          data: { value: String(value) },
        })
      } else {
        await db.customFieldValue.create({
          data: { entityId, entityType: finalEntityType, fieldId, value: String(value), residentId: finalEntityType === 'resident' ? entityId : null },
        })
      }
    }

    return NextResponse.json(version)
  } catch (e: any) {
    console.error('[custom-field-versions POST] error:', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}

/**
 * DELETE /api/custom-field-versions?id=xxx — delete a specific version.
 */
export async function DELETE(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

    await db.customFieldValueVersion.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[custom-field-versions DELETE] error:', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
