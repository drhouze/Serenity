/**
 * Seed default custom fields for all existing organizations based on their
 * businessType. Idempotent: only inserts fields whose key doesn't already
 * exist for that org.
 *
 * Run with:  npx tsx scripts/seed-default-custom-fields.ts
 */
import { PrismaClient } from '@prisma/client'
import { PRESET_CUSTOM_FIELDS, getBusinessTypePreset, BusinessType } from '../src/lib/business-types'

const db = new PrismaClient()

function deriveKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
}

async function seedOrg(orgId: string, businessType: string) {
  const preset = PRESET_CUSTOM_FIELDS[businessType as BusinessType] || []
  if (preset.length === 0) {
    console.log(`  [${orgId}] businessType="${businessType}" has no preset fields — skipping`)
    return
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
      },
    })
    inserted++
    sortOrder++
  }
  console.log(`  [${orgId}] businessType="${businessType}" — inserted: ${inserted}, skipped (already existed): ${skipped}`)
}

async function main() {
  console.log('Seeding default custom fields per business type...\n')
  const orgs = await db.organization.findMany({ select: { id: true, name: true, businessType: true } })
  if (orgs.length === 0) {
    console.log('No organizations found.')
    return
  }
  for (const org of orgs) {
    console.log(`Org: ${org.name} (id=${org.id}, businessType=${org.businessType})`)
    await seedOrg(org.id, org.businessType || 'nursing_home')
  }

  console.log('\nFinal state:')
  const allFields = await db.customField.findMany({ select: { id: true, label: true, orgId: true, type: true, active: true } })
  console.log(`Total custom fields in DB: ${allFields.length}`)
  const byOrg: Record<string, number> = {}
  for (const f of allFields) byOrg[f.orgId] = (byOrg[f.orgId] || 0) + 1
  for (const [oid, count] of Object.entries(byOrg)) {
    console.log(`  org ${oid}: ${count} field(s)`)
  }

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
