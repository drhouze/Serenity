import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { PRESET_CUSTOM_FIELDS, BusinessType } from '@/lib/business-types'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function deriveKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

/**
 * POST /api/custom-fields/seed-defaults
 * Body: { orgId?: string }
 *
 * Seeds default custom fields for the given org based on its businessType.
 * If orgId is omitted, uses the user's organizationId.
 * Only fields whose key doesn't already exist for that org are inserted —
 * existing fields are never overwritten or duplicated.
 *
 * Permission: APP_DEVELOPER (any org) or OWNER (their own org only).
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({}))
  const orgId = body.orgId || user.organizationId
  if (!orgId) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })

  // Owners can only seed their own org
  if (user.role === 'OWNER' && user.organizationId !== orgId) {
    return NextResponse.json({ error: 'You can only manage your own organization' }, { status: 403 })
  }

  const org = await db.organization.findUnique({ where: { id: orgId }, select: { businessType: true, name: true } })
  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const businessType = (org.businessType || 'nursing_home') as BusinessType
  const preset = PRESET_CUSTOM_FIELDS[businessType] || []
  if (preset.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: 0, message: `No preset fields defined for business type "${businessType}"` })
  }

  let inserted = 0
  let skipped = 0
  let sortOrder = await db.customField.count({ where: { orgId } })

  for (const f of preset) {
    const key = deriveKey(f.label)
    const existing = await db.customField.findUnique({ where: { orgId_key: { orgId, key } } }).catch(() => null)
    if (existing) {
      skipped++
      continue
    }
    await db.customField.create({
      data: {
        orgId,
        label: f.label,
        key,
        type: f.type,
        options: f.options ? JSON.stringify(f.options) : null,
        unit: f.unit || null,
        required: f.required || false,
        sortOrder,
        active: true,
        targetEntity: f.targetEntity || 'resident',
        referenceEntity: f.referenceEntity || null,
      },
    })
    inserted++
    sortOrder++
  }

  try {
    await logAudit({
      userId: user.id, userName: user.name, userCode: user.code, userRole: user.role,
      action: 'CUSTOM_FIELD_CREATED', entityType: 'CUSTOM_FIELD', entityId: orgId,
      description: `${user.name} loaded ${inserted} default custom field(s) for org "${org.name}" (businessType=${businessType})`,
      metadata: { orgId, businessType, inserted, skipped },
      facilityId: null, facilityName: null,
    })
  } catch {}

  return NextResponse.json({ inserted, skipped, total: inserted + skipped })
}
