/**
 * Backfill organizationId for users who have facilityIds but no organizationId.
 * Derives the org from the first facility in their facilityIds list.
 *
 * Run with:  npx tsx scripts/backfill-user-org-ids.ts
 */
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

async function main() {
  console.log('Finding users with null organizationId but non-empty facilityIds...')

  // Get all users with null org but assigned facilities
  const users = await db.user.findMany({
    where: {
      organizationId: null,
      facilityIds: { not: null },
    },
    select: { id: true, name: true, email: true, facilityIds: true, organizationId: true },
  })

  console.log(`Found ${users.length} users to backfill.`)

  // Get all facilities with their org IDs for lookup
  const facilities = await db.facility.findMany({
    select: { id: true, organizationId: true, name: true },
  })
  const facByOrg: Record<string, string> = {}  // facilityId → organizationId
  for (const f of facilities) {
    facByOrg[f.id] = f.organizationId
  }

  let updated = 0
  let skipped = 0
  for (const u of users) {
    const fids = (u.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
    if (fids.length === 0) {
      console.log(`  [SKIP] ${u.email} — no facilityIds after parsing`)
      skipped++
      continue
    }
    // Find the org of the first facility
    const firstFacId = fids[0]
    const orgId = facByOrg[firstFacId]
    if (!orgId) {
      console.log(`  [SKIP] ${u.email} — facility ${firstFacId} has no organizationId`)
      skipped++
      continue
    }
    await db.user.update({
      where: { id: u.id },
      data: { organizationId: orgId },
    })
    console.log(`  [OK]   ${u.email} → org ${orgId}`)
    updated++
  }

  console.log(`\nDone. Updated: ${updated}, Skipped: ${skipped}`)

  // Show final state
  const nullOrgCount = await db.user.count({ where: { organizationId: null, level: { gt: 0 } } })
  console.log(`Users with level > 0 and null organizationId remaining: ${nullOrgCount}`)

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
