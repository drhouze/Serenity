import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/global-custom-tabs — list all global custom tab definitions
// Developer only.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'App Developer only' }, { status: 403 })
  }

  const tabs = await db.globalCustomTab.findMany({
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
  })
  return NextResponse.json(tabs)
}

// POST /api/global-custom-tabs — create a new global custom tab
// Body: { label, description?, fields: [fieldId|builtinKey], module? }
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'App Developer only' }, { status: 403 })
  }

  const body = await req.json()
  const { label, description, fields, module, enableVersioning, businessTypes } = body
  if (!label) return NextResponse.json({ error: 'Label required' }, { status: 400 })

  const key = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')

  const existing = await db.globalCustomTab.findUnique({ where: { key } })
  if (existing) return NextResponse.json({ error: `A tab with key "${key}" already exists` }, { status: 400 })

  const count = await db.globalCustomTab.count()

  const tab = await db.globalCustomTab.create({
    data: {
      label,
      key,
      description: description || null,
      fields: JSON.stringify(fields || []),
      module: module || 'resident',
      enableVersioning: enableVersioning || false,
      businessTypes: businessTypes ? JSON.stringify(businessTypes) : null,
      sortOrder: count,
      active: true,
    },
  })

  // Auto-enable for all orgs
  const allOrgs = await db.organization.findMany({ select: { id: true } })
  for (const org of allOrgs) {
    await db.orgCustomTab.upsert({
      where: { orgId_globalTabId: { orgId: org.id, globalTabId: tab.id } },
      create: { orgId: org.id, globalTabId: tab.id, enabled: true },
      update: {},
    })
  }

  try {
    await logAudit({
      userId: user.id, userName: user.name, userCode: user.code, userRole: user.role,
      action: 'CUSTOM_TAB_CREATED', entityType: 'GLOBAL_CUSTOM_TAB', entityId: tab.id,
      description: `${user.name} created custom tab "${label}" with ${fields?.length || 0} fields`,
      metadata: { tabId: tab.id, label, key, fieldCount: fields?.length || 0 },
      facilityId: null, facilityName: null,
    })
  } catch {}

  return NextResponse.json(tab)
}

// PATCH /api/global-custom-tabs?id=xxx — update a global custom tab
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
    // Don't update key on rename (same fix as global-custom-fields)
  }
  if (body.description !== undefined) data.description = body.description || null
  if (body.fields !== undefined) data.fields = JSON.stringify(body.fields)
  if (body.module !== undefined) data.module = body.module
  if (body.enableVersioning !== undefined) data.enableVersioning = body.enableVersioning
  if (body.businessTypes !== undefined) data.businessTypes = body.businessTypes ? JSON.stringify(body.businessTypes) : null
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder
  if (body.active !== undefined) data.active = body.active

  const tab = await db.globalCustomTab.update({ where: { id }, data })
  return NextResponse.json(tab)
}

// DELETE /api/global-custom-tabs?id=xxx — delete a global custom tab
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'App Developer only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'ID required' }, { status: 400 })

  await db.globalCustomTab.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
