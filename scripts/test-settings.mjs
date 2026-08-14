// Quick test: verify per-facility settings storage logic
// Run with: node scripts/test-settings.mjs
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function test() {
  console.log('=== Testing per-facility settings storage ===\n')

  // 1. List existing facilities
  const facilities = await db.facility.findMany()
  console.log(`Found ${facilities.length} facilities:`)
  facilities.forEach(f => console.log(`  - ${f.id} → ${f.name}`))

  if (facilities.length === 0) {
    console.log('\n⚠ No facilities found — skipping facility-specific test')
  } else {
    const facilityId = facilities[0].id
    const facilityKey = `facility:${facilityId}:medRoutes`

    // 2. Save a facility-specific route list
    await db.setting.upsert({
      where: { key: facilityKey },
      update: { value: JSON.stringify(['Oral Tablet', 'Oral Syrup', 'Crushed Tablet', 'IV']) },
      create: { key: facilityKey, value: JSON.stringify(['Oral Tablet', 'Oral Syrup', 'Crushed Tablet', 'IV']) },
    })
    console.log(`\n✓ Saved facility-specific routes for ${facilities[0].name}`)

    // 3. Save a global route list
    await db.setting.upsert({
      where: { key: 'medRoutes' },
      update: { value: JSON.stringify(['Oral Tablet', 'Oral Syrup', 'Crushed Tablet', 'Subcutaneous', 'IV', 'Topical', 'Inhalation', 'Rectal', 'Other']) },
      create: { key: 'medRoutes', value: JSON.stringify(['Oral Tablet', 'Oral Syrup', 'Crushed Tablet', 'Subcutaneous', 'IV', 'Topical', 'Inhalation', 'Rectal', 'Other']) },
    })
    console.log('✓ Saved global routes')

    // 4. Read both back
    const facilityRoutes = await db.setting.findUnique({ where: { key: facilityKey } })
    const globalRoutes = await db.setting.findUnique({ where: { key: 'medRoutes' } })
    console.log('\nFacility-specific routes:', JSON.parse(facilityRoutes.value))
    console.log('Global routes:', JSON.parse(globalRoutes.value))
  }

  // 5. List all settings to confirm the storage format
  const allSettings = await db.setting.findMany({ orderBy: { key: 'asc' } })
  console.log(`\n=== All ${allSettings.length} settings in DB ===`)
  allSettings.forEach(s => {
    const preview = s.value.length > 80 ? s.value.slice(0, 77) + '...' : s.value
    console.log(`  ${s.key.padEnd(60)} = ${preview}`)
  })

  await db.$disconnect()
}

test().catch(e => { console.error(e); process.exit(1) })
