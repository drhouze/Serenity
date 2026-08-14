/**
 * Backfill: converts existing per-org CustomField records into the new
 * two-tier structure:
 *   1. Creates GlobalCustomField records (one per unique field definition,
 *      deduplicated by key across all orgs)
 *   2. Creates OrgCustomField records linking each org to the global field,
 *      with the org's label as labelOverride if it differs from the global label
 *
 * After backfill, the existing CustomField records remain (for backward
 * compatibility with CustomFieldValue records that reference them by ID),
 * but the /api/custom-fields GET endpoint will merge both sources.
 *
 * Run with:  npx tsx scripts/backfill-global-custom-fields.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

function deriveKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

async function main() {
  console.log('Backfilling CustomField → GlobalCustomField + OrgCustomField...\n')

  // Fetch all existing CustomField records
  const existingFields = await db.customField.findMany()
  console.log(`Found ${existingFields.length} existing CustomField records.`)

  if (existingFields.length === 0) {
    console.log('Nothing to backfill.')
    await db.$disconnect()
    return
  }

  // Group by key (deduplicate across orgs — same key = same global field)
  const byKey: Record<string, typeof existingFields> = {}
  for (const f of existingFields) {
    if (!byKey[f.key]) byKey[f.key] = []
    byKey[f.key].push(f)
  }

  console.log(`Deduplicated to ${Object.keys(byKey).length} unique field definitions.`)

  let globalCreated = 0
  let globalSkipped = 0
  let orgCreated = 0
  let orgSkipped = 0

  for (const [key, fields] of Object.entries(byKey)) {
    // Use the first field as the template for the global definition
    const template = fields[0]

    // Check if a GlobalCustomField with this key already exists
    let globalField = await db.globalCustomField.findUnique({ where: { key } })
    if (globalField) {
      globalSkipped++
    } else {
      globalField = await db.globalCustomField.create({
        data: {
          label: template.label,
          key,
          type: template.type,
          options: template.options,
          unit: template.unit,
          required: template.required,
          targetEntity: template.targetEntity || 'resident',
          referenceEntity: template.referenceEntity,
          description: null,
          sortOrder: template.sortOrder,
          active: true,
        },
      })
      globalCreated++
    }

    // Create OrgCustomField records for each org that had this field
    for (const f of fields) {
      const existing = await db.orgCustomField.findUnique({
        where: { orgId_globalFieldId: { orgId: f.orgId, globalFieldId: globalField.id } },
      })
      if (existing) {
        orgSkipped++
        continue
      }
      // Use the org's label as an override only if it differs from the global label
      const labelOverride = f.label !== globalField.label ? f.label : null
      await db.orgCustomField.create({
        data: {
          orgId: f.orgId,
          globalFieldId: globalField.id,
          labelOverride,
          sortOrderOverride: f.sortOrder !== globalField.sortOrder ? f.sortOrder : null,
          enabled: f.active,
        },
      })
      orgCreated++
    }
  }

  console.log(`\nBackfill complete:`)
  console.log(`  GlobalCustomField: ${globalCreated} created, ${globalSkipped} already existed`)
  console.log(`  OrgCustomField: ${orgCreated} created, ${orgSkipped} already existed`)

  // Verify
  const globalCount = await db.globalCustomField.count()
  const orgCount = await db.orgCustomField.count()
  console.log(`\nFinal counts:`)
  console.log(`  GlobalCustomField: ${globalCount}`)
  console.log(`  OrgCustomField: ${orgCount}`)
  console.log(`  Legacy CustomField: ${existingFields.length} (kept for backward compat)`)

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
