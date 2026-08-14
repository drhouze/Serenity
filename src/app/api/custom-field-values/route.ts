import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/custom-field-values?entityId=xxx&entityType=resident — get all custom field values for an entity
// Backward compat: if only residentId is provided, treats it as entityId with entityType='resident'
export async function GET(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const entityId = searchParams.get('entityId') || searchParams.get('residentId')
    const entityType = searchParams.get('entityType') || 'resident'
    if (!entityId) return NextResponse.json([])

    const values = await db.customFieldValue.findMany({
      where: { entityId, entityType },
    })
    return NextResponse.json(values)
  } catch (e: any) {
    console.error('[custom-field-values GET] error:', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}

// POST /api/custom-field-values — save (upsert) a custom field value for an entity
// Body: { entityId, entityType?, fieldId, value }
// Backward compat: { residentId, fieldId, value } still works
export async function POST(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { residentId, entityId: bodyEntityId, entityType, fieldId, value } = body
    const entityId = bodyEntityId || residentId
    if (!entityId || !fieldId) return NextResponse.json({ error: 'entityId and fieldId required' }, { status: 400 })

    const finalEntityType = entityType || 'resident'

    // Upsert: if the value exists for this entity+field, update it; otherwise create it
    const existing = await db.customFieldValue.findUnique({
      where: { entityId_fieldId: { entityId, fieldId } },
    })

    if (existing) {
      const updated = await db.customFieldValue.update({
        where: { id: existing.id },
        data: { value: value ?? null },
      })
      return NextResponse.json(updated)
    } else {
      const created = await db.customFieldValue.create({
        data: { entityId, entityType: finalEntityType, fieldId, value: value ?? null, residentId: finalEntityType === 'resident' ? entityId : null },
      })
      return NextResponse.json(created)
    }
  } catch (e: any) {
    console.error('[custom-field-values POST] error:', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}

// PUT /api/custom-field-values — bulk save multiple custom field values
// Body: { entityId, entityType?, values: [{ fieldId, value }, ...] }
// Backward compat: { residentId, values: [...] } still works
export async function PUT(req: NextRequest) {
  try {
    const user = await getSessionUser(req)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await req.json()
    const { residentId, entityId: bodyEntityId, entityType, values } = body
    const entityId = bodyEntityId || residentId
    if (!entityId || !Array.isArray(values)) return NextResponse.json({ error: 'entityId and values[] required' }, { status: 400 })

    const finalEntityType = entityType || 'resident'

    const results = []
    for (const v of values) {
      if (!v.fieldId) continue
      const existing = await db.customFieldValue.findUnique({
        where: { entityId_fieldId: { entityId, fieldId: v.fieldId } },
      })
      if (existing) {
        const updated = await db.customFieldValue.update({
          where: { id: existing.id },
          data: { value: v.value ?? null },
        })
        results.push(updated)
      } else {
        const created = await db.customFieldValue.create({
          data: { entityId, entityType: finalEntityType, fieldId: v.fieldId, value: v.value ?? null, residentId: finalEntityType === 'resident' ? entityId : null },
        })
        results.push(created)
      }
    }

    return NextResponse.json({ success: true, count: results.length })
  } catch (e: any) {
    console.error('[custom-field-values PUT] error:', e)
    return NextResponse.json({ error: e?.message || 'Internal Server Error' }, { status: 500 })
  }
}
