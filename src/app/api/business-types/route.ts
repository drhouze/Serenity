import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { BUSINESS_TYPE_PRESETS, getBusinessTypePreset } from '@/lib/business-types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/business-types — returns all business types (built-in presets + custom).
 *
 * Resolution order for each type:
 *   1. Custom definition stored in settings (key: businessTypeDefinition:<type>)
 *      — these are types created by the Developer or built-in types that have
 *      been edited. The definition includes label, description, modules,
 *      customer features, module labels, and hidden customer fields.
 *   2. Built-in preset from BUSINESS_TYPE_PRESETS (code defaults)
 *
 * The response is an array of { type, label, description, visibleModules,
 * visibleCustomerFeatures, labels, hiddenCustomerFields, isCustom }.
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // All authenticated users can read business types (needed for sidebar module filtering)

  // Fetch all custom definitions from settings
  const customDefs = await db.setting.findMany({
    where: { key: { startsWith: 'businessTypeDefinition:' } },
  })
  const customByType: Record<string, any> = {}
  for (const row of customDefs) {
    try {
      const parsed = JSON.parse(row.value)
      const type = row.key.replace('businessTypeDefinition:', '')
      customByType[type] = { ...parsed, isCustom: true }
    } catch {}
  }

  // Build the full list: built-in presets (possibly overridden) + custom types
  const types: any[] = []
  for (const [type, preset] of Object.entries(BUSINESS_TYPE_PRESETS)) {
    const custom = customByType[type]
    if (custom) {
      // Built-in type that has been edited — use the custom definition
      types.push({
        type,
        label: custom.label || preset.label,
        description: custom.description || preset.description,
        visibleModules: custom.visibleModules || preset.visibleModules,
        visibleCustomerFeatures: custom.visibleCustomerFeatures || preset.visibleCustomerFeatures,
        labels: custom.labels || preset.labels,
        hiddenCustomerFields: custom.hiddenCustomerFields || preset.hiddenCustomerFields,
        isCustom: true,
        isBuiltin: true,
      })
    } else {
      types.push({
        type,
        label: preset.label,
        description: preset.description,
        visibleModules: preset.visibleModules,
        visibleCustomerFeatures: preset.visibleCustomerFeatures,
        labels: preset.labels,
        hiddenCustomerFields: preset.hiddenCustomerFields,
        isCustom: false,
        isBuiltin: true,
      })
    }
    delete customByType[type]
  }
  // Add any remaining custom types (not in built-in presets)
  for (const [type, custom] of Object.entries(customByType)) {
    types.push({
      type,
      label: (custom as any).label || type,
      description: (custom as any).description || '',
      visibleModules: (custom as any).visibleModules || [],
      visibleCustomerFeatures: (custom as any).visibleCustomerFeatures || [],
      labels: (custom as any).labels || {},
      hiddenCustomerFields: (custom as any).hiddenCustomerFields || [],
      isCustom: true,
      isBuiltin: false,
    })
  }

  return NextResponse.json(types)
}

/**
 * POST /api/business-types — create a new custom business type, OR save edits
 * to an existing type (built-in or custom).
 *
 * Body: {
 *   type: string,           — the type ID (e.g. "nursing_home" or "my_custom_type")
 *   label: string,          — display name
 *   description: string,    — short description
 *   visibleModules: string[],    — module IDs visible for this type
 *   visibleCustomerFeatures: string[],  — customer detail tab IDs
 *   labels?: Record<string,string>,     — module label overrides
 *   hiddenCustomerFields?: string[],    — customer fields to hide
 * }
 *
 * Permission: APP_DEVELOPER only.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'App Developer only' }, { status: 403 })
  }

  const body = await req.json()
  const { type, label, description, visibleModules, visibleCustomerFeatures, labels, hiddenCustomerFields } = body

  if (!type || typeof type !== 'string') {
    return NextResponse.json({ error: 'Type ID is required' }, { status: 400 })
  }
  if (!label || typeof label !== 'string') {
    return NextResponse.json({ error: 'Label is required' }, { status: 400 })
  }

  // Sanitize the type ID — lowercase, alphanumeric + underscore only
  const sanitizedType = type.toLowerCase().replace(/[^a-z0-9_]/g, '_').replace(/^_|_$/g, '')
  if (!sanitizedType) {
    return NextResponse.json({ error: 'Invalid type ID' }, { status: 400 })
  }

  // Build the definition object
  const definition = {
    label: label.trim(),
    description: (description || '').trim(),
    visibleModules: Array.isArray(visibleModules) ? visibleModules : [],
    visibleCustomerFeatures: Array.isArray(visibleCustomerFeatures) ? visibleCustomerFeatures : [],
    labels: (labels && typeof labels === 'object') ? labels : {},
    hiddenCustomerFields: Array.isArray(hiddenCustomerFields) ? hiddenCustomerFields : [],
  }

  // Save as a single setting — this is the source of truth for the type definition
  const defKey = `businessTypeDefinition:${sanitizedType}`
  await db.setting.upsert({
    where: { key: defKey },
    create: { key: defKey, value: JSON.stringify(definition) },
    update: { value: JSON.stringify(definition) },
  })

  // Also save the individual override keys for backward compatibility
  // (the page.tsx sidebar reads businessTypeModules:<type>, businessTypeFeatures:<type>,
  //  businessTypeModuleLabels:<type>)
  const modulesKey = `businessTypeModules:${sanitizedType}`
  await db.setting.upsert({
    where: { key: modulesKey },
    create: { key: modulesKey, value: JSON.stringify(definition.visibleModules) },
    update: { value: JSON.stringify(definition.visibleModules) },
  })

  const featuresKey = `businessTypeFeatures:${sanitizedType}`
  await db.setting.upsert({
    where: { key: featuresKey },
    create: { key: featuresKey, value: JSON.stringify(definition.visibleCustomerFeatures) },
    update: { value: JSON.stringify(definition.visibleCustomerFeatures) },
  })

  const moduleLabelsKey = `businessTypeModuleLabels:${sanitizedType}`
  await db.setting.upsert({
    where: { key: moduleLabelsKey },
    create: { key: moduleLabelsKey, value: JSON.stringify(definition.labels) },
    update: { value: JSON.stringify(definition.labels) },
  })

  return NextResponse.json({ success: true, type: sanitizedType, definition })
}

/**
 * DELETE /api/business-types?type=xxx — delete a custom business type.
 * Built-in types cannot be deleted (only reset to default by overwriting the
 * definition). Custom types can be fully removed.
 *
 * Permission: APP_DEVELOPER only.
 */
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'App Developer only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type')
  if (!type) return NextResponse.json({ error: 'Type is required' }, { status: 400 })

  // Check if it's a built-in type
  if (BUSINESS_TYPE_PRESETS[type as keyof typeof BUSINESS_TYPE_PRESETS]) {
    return NextResponse.json({
      error: 'Cannot delete a built-in business type. Use "Reset to Default" to restore the original definition.',
    }, { status: 400 })
  }

  // Delete the definition + all related override keys
  const keysToDelete = [
    `businessTypeDefinition:${type}`,
    `businessTypeModules:${type}`,
    `businessTypeFeatures:${type}`,
    `businessTypeModuleLabels:${type}`,
  ]
  for (const key of keysToDelete) {
    await db.setting.deleteMany({ where: { key } }).catch(() => {})
  }

  return NextResponse.json({ success: true })
}
