/**
 * Migrate old VitalSign records and Visit clinical fields into CustomFieldValue
 * records using the global custom field IDs.
 *
 * This makes the data accessible via the custom tabs system (Vital Signs tab,
 * Visit Notes tab) in the Clinical module.
 *
 * Run with:  npx tsx scripts/migrate-vitals-visits-to-custom-fields.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('Migrating VitalSigns + Visit clinical fields → CustomFieldValue...\n')

  // Map global field keys to IDs
  const gf = await db.globalCustomField.findMany({ select: { id: true, key: true, label: true } })
  const fieldBykey: Record<string, string> = {}
  for (const f of gf) fieldBykey[f.key] = f.id

  const VITALS_MAP = {
    bloodPressureSystolic: 'bp_systolic',
    bloodPressureDiastolic: 'bp_diastolic',
    heartRate: 'heart_rate',
    temperature: 'temperature',
    respiratoryRate: 'respiratory_rate',
    oxygenSaturation: 'oxygen_saturation',
    bloodSugar: 'blood_sugar',
    weight: 'weight',
  }

  const VISIT_MAP = {
    chiefComplaint: 'chief_complaint',
    findings: 'visit_findings',
    diagnosis: 'diagnosis',
    treatmentPlan: 'treatment_plan',
    prescription: 'prescription',
    followUpNote: 'follow_up_instructions',
    recommendations: 'visit_recommendations',
  }

  let vitalsMigrated = 0
  let visitsMigrated = 0
  let valuesCreated = 0
  let valuesSkipped = 0

  // === 1. Migrate VitalSign records ===
  console.log('=== Migrating VitalSign records ===')
  const vitalSigns = await db.vitalSign.findMany()
  console.log(`Found ${vitalSigns.length} VitalSign records.`)

  for (const vs of vitalSigns) {
    const entityId = vs.residentId
    const entityType = 'resident'

    for (const [vsField, gfKey] of Object.entries(VITALS_MAP)) {
      const value = (vs as any)[vsField]
      if (value === null || value === undefined) continue

      const fieldId = fieldBykey[gfKey]
      if (!fieldId) { console.log(`  SKIP: no global field for key ${gfKey}`); continue }

      const valStr = String(value)
      const existing = await db.customFieldValue.findUnique({
        where: { entityId_fieldId: { entityId, fieldId } },
      }).catch(() => null)

      if (existing) {
        valuesSkipped++
        continue
      }

      await db.customFieldValue.create({
        data: { entityId, entityType, fieldId, value: valStr, residentId: entityId },
      })
      valuesCreated++
    }
    vitalsMigrated++
  }
  console.log(`Migrated ${vitalsMigrated} VitalSign records → ${valuesCreated} CustomFieldValue records created.`)

  // === 2. Migrate Visit clinical fields ===
  console.log('\n=== Migrating Visit clinical fields ===')
  let visitValuesCreated = 0
  let visitValuesSkipped = 0

  const visits = await db.visit.findMany({
    where: {
      OR: [
        { chiefComplaint: { not: null } },
        { findings: { not: null } },
        { diagnosis: { not: null } },
        { treatmentPlan: { not: null } },
        { prescription: { not: null } },
        { followUpNote: { not: null } },
        { recommendations: { not: null } },
      ]
    }
  })
  console.log(`Found ${visits.length} Visit records with clinical data.`)

  for (const v of visits) {
    const entityId = v.residentId
    const entityType = 'resident'

    for (const [visitField, gfKey] of Object.entries(VISIT_MAP)) {
      const value = (v as any)[visitField]
      if (!value) continue

      const fieldId = fieldBykey[gfKey]
      if (!fieldId) { console.log(`  SKIP: no global field for key ${gfKey}`); continue }

      const valStr = String(value)
      const existing = await db.customFieldValue.findUnique({
        where: { entityId_fieldId: { entityId, fieldId } },
      }).catch(() => null)

      if (existing) {
        // Update with visit data if the existing value is empty
        if (!existing.value) {
          await db.customFieldValue.update({
            where: { id: existing.id },
            data: { value: valStr },
          })
          visitValuesCreated++
        } else {
          visitValuesSkipped++
        }
        continue
      }

      await db.customFieldValue.create({
        data: { entityId, entityType, fieldId, value: valStr, residentId: entityId },
      })
      visitValuesCreated++
    }
    visitsMigrated++
  }
  console.log(`Migrated ${visitsMigrated} Visit records → ${visitValuesCreated} CustomFieldValue records created, ${visitValuesSkipped} skipped.`)

  // === Summary ===
  console.log('\n=== Migration complete ===')
  console.log(`  VitalSign records processed: ${vitalsMigrated}`)
  console.log(`  Visit records processed: ${visitsMigrated}`)
  console.log(`  CustomFieldValue records created (vitals): ${valuesCreated}`)
  console.log(`  CustomFieldValue records created (visits): ${visitValuesCreated}`)
  console.log(`  CustomFieldValue records skipped (already existed): ${valuesSkipped + visitValuesSkipped}`)

  const totalCFV = await db.customFieldValue.count()
  console.log(`  Total CustomFieldValue records now: ${totalCFV}`)

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
