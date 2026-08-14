import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/org-custom-tabs?orgId=xxx — list all custom tabs available to an org
// Returns ALL global tabs with their org selection status (enabled/disabled).
// Query params: orgId (required), enabledOnly (default false), module (optional filter)
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const orgId = searchParams.get('orgId') || user.organizationId
  if (!orgId) return NextResponse.json([])

  const enabledOnly = searchParams.get('enabledOnly') === 'true'
  const moduleFilter = searchParams.get('module')

  // Fetch the org's business type for filtering
  const org = await db.organization.findUnique({ where: { id: orgId }, select: { businessType: true } })
  const orgBusinessType = org?.businessType || 'nursing_home'

  // NOTE: we deliberately DO NOT filter by module at the DB level — the org may
  // have overridden the developer's module choice via `moduleOverride`, so we
  // need to fetch all tabs and then filter by the *effective* module below.
  const globalTabs = await db.globalCustomTab.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      orgSelections: { where: { orgId } },
    },
  })

  // Filter: include tabs where businessTypes is null (all types) or includes the org's business type
  const filteredTabs = globalTabs.filter(gt => {
    if (!gt.businessTypes) return true
    try {
      const types = JSON.parse(gt.businessTypes)
      return Array.isArray(types) && types.includes(orgBusinessType)
    } catch {
      return true
    }
  })

  // Helper: normalise module names — 'resident' and 'residents' are treated
  // as equivalent (the codebase uses both; this guards against typos).
  const norm = (m: string | null | undefined) => (m ? m.replace(/s$/, '') : '')

  const result = filteredTabs
    .filter(gt => {
      if (enabledOnly) {
        const sel = gt.orgSelections[0]
        return sel && sel.enabled
      }
      return true
    })
    .map(gt => {
      const selection = gt.orgSelections[0]
      // Effective module: org-level override wins; otherwise the developer's default.
      const effectiveModule = selection?.moduleOverride || gt.module
      return {
        id: gt.id,
        globalTabId: gt.id,
        orgSelectionId: selection?.id,
        label: selection?.labelOverride || gt.label,
        globalLabel: gt.label,
        labelOverride: selection?.labelOverride,
        key: gt.key,
        description: gt.description,
        fields: gt.fields,
        module: gt.module,                    // developer's original choice (read-only for reference)
        moduleOverride: selection?.moduleOverride || null,  // org's override (null = use default)
        effectiveModule,                      // what consumers should actually use for routing
        enableVersioning: gt.enableVersioning,
        businessTypes: gt.businessTypes,
        sortOrder: selection?.sortOrderOverride ?? gt.sortOrder,
        active: selection ? selection.enabled : false,
      }
    })
    // Apply module filter on the EFFECTIVE module (post-override), with
    // plural/singular equivalency so 'resident' matches 'residents'.
    .filter(t => !moduleFilter || norm(t.effectiveModule) === norm(moduleFilter))

  return NextResponse.json(result)
}

// POST /api/org-custom-tabs — enable a tab for an org
// Body: { orgId, globalTabId, labelOverride?, enabled?, moduleOverride? }
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { orgId: bodyOrgId, globalTabId, labelOverride, enabled, moduleOverride } = body
  const orgId = bodyOrgId || user.organizationId
  if (!orgId || !globalTabId) {
    return NextResponse.json({ error: 'orgId and globalTabId required' }, { status: 400 })
  }

  // OWNER + MANAGER can only manage their own org
  if ((user.role === 'OWNER' || user.role === 'MANAGER') && user.organizationId !== orgId) {
    return NextResponse.json({ error: 'You can only manage your own organization' }, { status: 403 })
  }

  const selection = await db.orgCustomTab.upsert({
    where: { orgId_globalTabId: { orgId, globalTabId } },
    create: {
      orgId, globalTabId,
      labelOverride: labelOverride || null,
      enabled: enabled ?? true,
      moduleOverride: moduleOverride || null,
    },
    update: {
      labelOverride: labelOverride !== undefined ? (labelOverride || null) : undefined,
      enabled: enabled !== undefined ? enabled : undefined,
      moduleOverride: moduleOverride !== undefined ? (moduleOverride || null) : undefined,
    },
  })

  return NextResponse.json(selection)
}

// PATCH /api/org-custom-tabs?id=xxx — update an org's tab selection
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const existing = await db.orgCustomTab.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if ((user.role === 'OWNER' || user.role === 'MANAGER') && user.organizationId !== existing.orgId) {
    return NextResponse.json({ error: 'You can only manage your own organization' }, { status: 403 })
  }

  const body = await req.json()
  const data: any = {}
  if (body.labelOverride !== undefined) data.labelOverride = body.labelOverride || null
  if (body.enabled !== undefined) data.enabled = body.enabled
  if (body.moduleOverride !== undefined) data.moduleOverride = body.moduleOverride || null

  const updated = await db.orgCustomTab.update({ where: { id }, data })
  return NextResponse.json(updated)
}

// DELETE /api/org-custom-tabs?id=xxx — remove a tab from an org's selection
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  const existing = await db.orgCustomTab.findUnique({ where: { id } })
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if ((user.role === 'OWNER' || user.role === 'MANAGER') && user.organizationId !== existing.orgId) {
    return NextResponse.json({ error: 'You can only manage your own organization' }, { status: 403 })
  }

  await db.orgCustomTab.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
