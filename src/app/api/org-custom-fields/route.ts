import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/org-custom-fields?orgId=xxx — list all custom fields available to an org.
 *
 * Returns the merged view: for each GlobalCustomField, checks if the org has an
 * OrgCustomField selection. If enabled (or no selection exists but the field is
 * in the legacy CustomField table for this org), includes it with the org's
 * label override if present.
 *
 * This endpoint is what the frontend (CustomFieldsSection, forms) should call
 * to get the list of fields to render for a given org + entity type.
 *
 * Query params:
 *   - orgId: required (the org to get fields for)
 *   - targetEntity: optional filter ('resident', 'invoice', 'product', 'staff')
 *   - enabledOnly: if 'true', only returns enabled fields (default: true)
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId') || user.organizationId
  if (!orgId) return NextResponse.json([])

  const targetEntity = searchParams.get('targetEntity')
  const enabledOnly = searchParams.get('enabledOnly') !== 'false' // default true

  // Fetch the org's business type for filtering
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { businessType: true } })
  const orgBusinessType = org?.businessType || 'nursing_home'

  // Fetch all active global fields
  const globalWhere: any = { active: true }
  if (targetEntity) globalWhere.targetEntity = targetEntity

  const globalFields = await db.globalCustomField.findMany({
    where: globalWhere,
    orderBy: { sortOrder: 'asc' },
    include: {
      orgSelections: {
        where: { orgId },
      },
    },
  })

  // Filter: include fields where businessTypes is null (all types) or includes the org's business type
  const filteredFields = globalFields.filter(gf => {
    if (!gf.businessTypes) return true // null = all business types
    try {
      const types = JSON.parse(gf.businessTypes)
      return Array.isArray(types) && types.includes(orgBusinessType)
    } catch {
      return true // parse error = show it
    }
  })

  // Build the merged result — includes ALL filtered global fields, with their selection
  // status for this org. Fields without a selection are included with
  // active=false so the org owner can enable them.
  const result = filteredFields
    .filter(gf => {
      const selection = gf.orgSelections[0]
      // If enabledOnly=true, only show fields that are explicitly enabled
      if (enabledOnly) {
        return selection && selection.enabled
      }
      // If enabledOnly=false, show ALL global fields (so the org can enable/disable)
      return true
    })
    .map(gf => {
      const selection = gf.orgSelections[0]
      return {
        id: gf.id, // use the global field ID as the field ID
        globalFieldId: gf.id,
        orgSelectionId: selection?.id,
        label: selection?.labelOverride || gf.label, // org-specific name override
        globalLabel: gf.label,
        labelOverride: selection?.labelOverride,
        key: gf.key,
        type: gf.type,
        options: gf.options,
        unit: gf.unit,
        required: gf.required,
        targetEntity: gf.targetEntity,
        referenceEntity: gf.referenceEntity,
        businessTypes: gf.businessTypes,
        sortOrder: selection?.sortOrderOverride ?? gf.sortOrder,
        // active = true only if the org has explicitly enabled this field.
        // No selection = not active (the org owner can enable it via the UI).
        active: selection ? selection.enabled : false,
        description: gf.description,
      }
    })

  return NextResponse.json(result)
}

/**
 * POST /api/org-custom-fields — enable a global field for an org.
 * Body: { orgId, globalFieldId, labelOverride?, sortOrderOverride? }
 *
 * Permission: APP_DEVELOPER (any org) or OWNER (their own org only).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { orgId: bodyOrgId, globalFieldId, labelOverride, sortOrderOverride, enabled } = body
  const orgId = bodyOrgId || user.organizationId
  if (!orgId || !globalFieldId) {
    return NextResponse.json({ error: 'orgId and globalFieldId required' }, { status: 400 })
  }

  // Owners can only manage their own org
  if (user.role === 'OWNER' && user.organizationId !== orgId) {
    return NextResponse.json({ error: 'You can only manage your own organization' }, { status: 403 })
  }

  const selection = await db.orgCustomField.upsert({
    where: { orgId_globalFieldId: { orgId, globalFieldId } },
    create: {
      orgId,
      globalFieldId,
      labelOverride: labelOverride || null,
      sortOrderOverride: sortOrderOverride ?? null,
      enabled: enabled ?? true,
    },
    update: {
      labelOverride: labelOverride !== undefined ? (labelOverride || null) : undefined,
      sortOrderOverride: sortOrderOverride !== undefined ? sortOrderOverride : undefined,
      enabled: enabled !== undefined ? enabled : undefined,
    },
  })

  return NextResponse.json(selection)
}

/**
 * PATCH /api/org-custom-fields?id=xxx — update an org's selection
 * (rename, reorder, enable/disable).
 * Body: { labelOverride?, sortOrderOverride?, enabled? }
 */
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  // Verify ownership for non-Developer
  const existing = await db.orgCustomField.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (user.role === 'OWNER' && user.organizationId !== existing.orgId) {
    return NextResponse.json({ error: 'You can only manage your own organization' }, { status: 403 })
  }

  const body = await req.json()
  const data: any = {}
  if (body.labelOverride !== undefined) data.labelOverride = body.labelOverride || null
  if (body.sortOrderOverride !== undefined) data.sortOrderOverride = body.sortOrderOverride
  if (body.enabled !== undefined) data.enabled = body.enabled

  const updated = await db.orgCustomField.update({ where: { id }, data })
  return NextResponse.json(updated)
}

/**
 * DELETE /api/org-custom-fields?id=xxx — remove a field from an org's selection
 * (disables the field for that org; the global field definition is not affected).
 */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const existing = await db.orgCustomField.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (user.role === 'OWNER' && user.organizationId !== existing.orgId) {
    return NextResponse.json({ error: 'You can only manage your own organization' }, { status: 403 })
  }

  await db.orgCustomField.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
