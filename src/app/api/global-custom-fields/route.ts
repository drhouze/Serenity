import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/global-custom-fields — list all global custom field definitions.
 * Developer only (the global library is managed by the Developer).
 *
 * Optional query params:
 *   - targetEntity: filter by entity type ('resident', 'invoice', 'product', 'staff')
 *   - includeOrgCount: if 'true', includes the count of orgs that have enabled each field
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'App Developer only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const targetEntity = searchParams.get('targetEntity')
  const includeOrgCount = searchParams.get('includeOrgCount') === 'true'

  const where: any = { active: true }
  if (targetEntity) where.targetEntity = targetEntity

  const fields = await db.globalCustomField.findMany({
    where,
    orderBy: { sortOrder: 'asc' },
    include: includeOrgCount ? { _count: { select: { orgSelections: { where: { enabled: true } } } } } : false,
  })

  const result = fields.map(f => includeOrgCount
    ? { ...f, orgCount: (f as any)._count?.orgSelections || 0, _count: undefined }
    : f
  )
  return NextResponse.json(result)
}

/**
 * POST /api/global-custom-fields — create a new global custom field.
 * Developer only.
 *
 * Body: { label, type, options?, unit?, required?, targetEntity?, referenceEntity?, description? }
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'App Developer only' }, { status: 403 })
  }

  const body = await req.json()
  const { label, type, options, unit, required, targetEntity, referenceEntity, description, businessTypes } = body
  if (!label) return NextResponse.json({ error: 'Label required' }, { status: 400 })

  if (type === 'REFERENCE' && !referenceEntity) {
    return NextResponse.json({ error: 'referenceEntity is required for REFERENCE type' }, { status: 400 })
  }

  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  // Check for duplicate key
  const existing = await db.globalCustomField.findUnique({ where: { key } })
  if (existing) return NextResponse.json({ error: `A global field with key "${key}" already exists` }, { status: 400 })

  const count = await db.globalCustomField.count()

  const field = await db.globalCustomField.create({
    data: {
      label,
      key,
      type: type || 'TEXT',
      options: options ? JSON.stringify(options) : null,
      unit: unit || null,
      required: required || false,
      targetEntity: targetEntity || 'resident',
      referenceEntity: type === 'REFERENCE' ? referenceEntity : null,
      description: description || null,
      businessTypes: businessTypes ? JSON.stringify(businessTypes) : null,
      sortOrder: count,
      active: true,
    },
  })

  // Auto-enable the new field for ALL organizations so it appears in each
  // org's Field Library. Org owners can disable it per-org if they don't
  // want it. Without this, the field would exist in the global library but
  // be invisible to all orgs until manually enabled.
  const allOrgs = await db.organization.findMany({ select: { id: true } })
  for (const org of allOrgs) {
    await db.orgCustomField.upsert({
      where: { orgId_globalFieldId: { orgId: org.id, globalFieldId: field.id } },
      create: { orgId: org.id, globalFieldId: field.id, enabled: true },
      update: {}, // don't overwrite if already exists
    })
  }
  if (allOrgs.length > 0) {
    console.log(`[GlobalCustomField] Auto-enabled "${label}" for ${allOrgs.length} org(s)`)
  }

  try {
    await logAudit({
      userId: user.id, userName: user.name, userCode: user.code, userRole: user.role,
      action: 'CUSTOM_FIELD_CREATED', entityType: 'GLOBAL_CUSTOM_FIELD', entityId: field.id,
      description: `${user.name} created global custom field "${label}" (${type})`,
      metadata: { fieldId: field.id, label, type, key, targetEntity: targetEntity || 'resident' },
      facilityId: null, facilityName: null,
    })
  } catch {}

  return NextResponse.json(field)
}

/**
 * PATCH /api/global-custom-fields?id=xxx — update a global custom field.
 * Developer only.
 */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'App Developer only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const body = await req.json()
  const data: any = {}
  if (body.label !== undefined) {
    data.label = body.label
    // Note: do NOT update the key when renaming — key is @unique and immutable.
    // Changing it could cause unique constraint violations and break references
    // in GlobalCustomTab.fields, OrgCustomField, etc.
  }
  if (body.type !== undefined) data.type = body.type
  if (body.options !== undefined) data.options = body.options ? JSON.stringify(body.options) : null
  if (body.unit !== undefined) data.unit = body.unit || null
  if (body.required !== undefined) data.required = body.required
  if (body.targetEntity !== undefined) data.targetEntity = body.targetEntity
  if (body.referenceEntity !== undefined) data.referenceEntity = body.referenceEntity || null
  if (body.description !== undefined) data.description = body.description || null
  if (body.businessTypes !== undefined) data.businessTypes = body.businessTypes ? JSON.stringify(body.businessTypes) : null
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
  if (body.active !== undefined) data.active = body.active

  try {
    const field = await db.globalCustomField.update({ where: { id }, data })
    return NextResponse.json(field)
  } catch (e: any) {
    console.error('[GlobalCustomField] PATCH error:', e.message)
    return NextResponse.json({ error: e.message || 'Failed to update field' }, { status: 500 })
  }
}

/**
 * DELETE /api/global-custom-fields?id=xxx — delete a global custom field.
 * Also cascades to delete all OrgCustomField selections (via onDelete: Cascade).
 * Developer only.
 */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'App Developer only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  await db.globalCustomField.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
