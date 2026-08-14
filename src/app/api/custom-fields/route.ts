import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/custom-fields?orgId=xxx&targetEntity=resident — list custom fields for an org
// Merges two sources:
//   1. GlobalCustomField + OrgCustomField (new two-tier system — org selects from global library)
//   2. Legacy CustomField (per-org definitions, for backward compatibility)
//
// The merged result uses the same shape as the legacy CustomField so existing
// UI code (CustomFieldsSection, forms) continues to work without changes.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId') || user.organizationId
  if (!orgId) return NextResponse.json([])

  const targetEntity = searchParams.get('targetEntity')

  // --- Source 1: New two-tier system ---
  // Fetch global fields enabled for this org
  const globalWhere: any = { active: true }
  if (targetEntity) globalWhere.targetEntity = targetEntity

  const globalFields = await db.globalCustomField.findMany({
    where: globalWhere,
    orderBy: { sortOrder: 'asc' },
    include: {
      orgSelections: { where: { orgId } },
    },
  })

  const mergedFromGlobal = globalFields
    .filter(gf => {
      const selection = gf.orgSelections[0]
      if (!selection) return false // not enabled for this org
      if (!selection.enabled) return false
      return true
    })
    .map(gf => {
      const selection = gf.orgSelections[0]
      return {
        id: gf.id,
        orgId,
        label: selection?.labelOverride || gf.label, // org-specific name override
        key: gf.key,
        type: gf.type,
        options: gf.options,
        unit: gf.unit,
        required: gf.required,
        sortOrder: selection?.sortOrderOverride ?? gf.sortOrder,
        active: true,
        targetEntity: gf.targetEntity,
        referenceEntity: gf.referenceEntity,
        // Extra fields for the UI to know this is from the global library
        _source: 'global',
        _globalLabel: gf.label,
        _labelOverride: selection?.labelOverride,
      }
    })

  // --- Source 2: Legacy CustomField (only include keys not already in global) ---
  const globalKeys = new Set(mergedFromGlobal.map(f => f.key))
  const legacyWhere: any = { orgId, active: true }
  if (targetEntity) legacyWhere.targetEntity = targetEntity
  const legacyFields = await db.customField.findMany({
    where: legacyWhere,
    orderBy: { sortOrder: 'asc' },
  })
  const mergedFromLegacy = legacyFields
    .filter(f => !globalKeys.has(f.key))
    .map(f => ({ ...f, _source: 'legacy' }))

  // Merge: global fields first, then legacy fields not already covered
  const merged = [...mergedFromGlobal, ...mergedFromLegacy]
  return NextResponse.json(merged)
}

// POST /api/custom-fields — create a custom field definition
// Body: { label, type, options?, unit?, required?, orgId?, targetEntity?, referenceEntity? }
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { label, type, options, unit, required, orgId: bodyOrgId, targetEntity, referenceEntity } = body
  if (!label) return NextResponse.json({ error: 'Label required' }, { status: 400 })

  // Validate REFERENCE type: referenceEntity is required
  if (type === 'REFERENCE' && !referenceEntity) {
    return NextResponse.json({ error: 'referenceEntity is required for REFERENCE type fields' }, { status: 400 })
  }

  const orgId = bodyOrgId || user.organizationId
  if (!orgId) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })

  // Auto-derive key from label (lowercase, replace spaces with underscores)
  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  // Check for duplicate key within this org
  const existing = await db.customField.findUnique({ where: { orgId_key: { orgId, key } } })
  if (existing) return NextResponse.json({ error: `A field with key "${key}" already exists` }, { status: 400 })

  // Get the next sort order
  const count = await db.customField.count({ where: { orgId } })

  const field = await db.customField.create({
    data: {
      orgId,
      label,
      key,
      type: type || 'TEXT',
      options: options ? JSON.stringify(options) : null,
      unit: unit || null,
      required: required || false,
      sortOrder: count,
      targetEntity: targetEntity || 'resident',
      referenceEntity: type === 'REFERENCE' ? referenceEntity : null,
    },
  })

  try {
    await logAudit({
      userId: user.id, userName: user.name, userCode: user.code, userRole: user.role,
      action: 'CUSTOM_FIELD_CREATED', entityType: 'CUSTOM_FIELD', entityId: field.id,
      description: `${user.name} created custom field "${label}" (${type}) for ${targetEntity || 'resident'}`,
      metadata: { fieldId: field.id, label, type, key, targetEntity: targetEntity || 'resident', referenceEntity },
      facilityId: null, facilityName: null,
    })
  } catch {}

  return NextResponse.json(field)
}

// PATCH /api/custom-fields?id=xxx — update a custom field definition
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const body = await req.json()
  const data: any = {}
  if (body.label !== undefined) {
    data.label = body.label
    data.key = body.label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
  }
  if (body.type !== undefined) data.type = body.type
  if (body.options !== undefined) data.options = body.options ? JSON.stringify(body.options) : null
  if (body.unit !== undefined) data.unit = body.unit || null
  if (body.required !== undefined) data.required = body.required
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
  if (body.active !== undefined) data.active = body.active
  if (body.targetEntity !== undefined) data.targetEntity = body.targetEntity
  if (body.referenceEntity !== undefined) data.referenceEntity = body.referenceEntity || null

  const field = await db.customField.update({ where: { id }, data })
  return NextResponse.json(field)
}

// DELETE /api/custom-fields?id=xxx — delete (deactivate) a custom field
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Delete the field + all its values (cascade)
  await db.customFieldValue.deleteMany({ where: { fieldId: id } })
  await db.customField.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
