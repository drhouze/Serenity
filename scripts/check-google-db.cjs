const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const settings = await db.setting.findMany({ where: { key: { contains: 'google' } } })
  console.log(`Google-related settings in DB: ${settings.length}`)
  for (const s of settings) console.log(`  • ${s.key} = ${s.value.slice(0, 60)}...`)
  
  const orgs = await db.organization.findMany({ select: { id: true, name: true } })
  // Check if driveFolderId column still exists
  try {
    const orgsWithDrive = await db.organization.findMany({ where: { driveFolderId: { not: null } }, select: { name: true, driveFolderId: true } })
    console.log(`Organizations with driveFolderId: ${orgsWithDrive.length}`)
    for (const o of orgsWithDrive) console.log(`  • ${o.name}: ${o.driveFolderId}`)
  } catch (e) {
    console.log(`driveFolderId column: removed (expected after schema change)`)
  }
  
  if (settings.length === 0) {
    console.log('✓ CLEAN — no Google OAuth secrets in DB')
  } else {
    console.log('✗ FOUND — Google data still present in DB!')
  }
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
