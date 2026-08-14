const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const KEYS_TO_DELETE = [
    'googleClientId',
    'googleClientSecret',
    'googleDriveRedirectUri',
    'googleDriveFolderId',
    'googleDriveToken',
    'googleDriveRefreshToken',
    'googleDriveAccessToken',
    'googleDriveTokenExpiry',
  ]
  console.log('=== Purging Google-related settings from DB ===')
  for (const key of KEYS_TO_DELETE) {
    const existing = await db.setting.findUnique({ where: { key } })
    if (existing) {
      await db.setting.delete({ where: { key } })
      console.log(`  ✓ Deleted: ${key}`)
    } else {
      console.log(`  • Not present: ${key}`)
    }
  }

  // Also clear driveFolderId from all organizations (the column itself will be
  // dropped when prisma db push runs, but clear the values first for safety)
  const orgs = await db.organization.findMany({ select: { id: true, name: true, driveFolderId: true } })
  const withDrive = orgs.filter(o => o.driveFolderId)
  for (const o of withDrive) {
    await db.organization.update({ where: { id: o.id }, data: { driveFolderId: null } })
    console.log(`  ✓ Cleared driveFolderId for org: ${o.name}`)
  }

  console.log()
  console.log('=== Verification: no Google settings remain ===')
  const remaining = await db.setting.findMany({ where: { key: { contains: 'google' } } })
  if (remaining.length === 0) {
    console.log('✓ PASS: no Google-related settings in DB')
  } else {
    console.log(`✗ FAIL: ${remaining.length} Google settings still present:`)
    for (const s of remaining) console.log(`    • ${s.key}`)
  }
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
