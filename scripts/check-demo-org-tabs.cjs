const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const orgTabs = await db.orgCustomTab.findMany({
    where: { orgId: 'demo-org' },
    include: { globalTab: { select: { label: true, module: true } } },
  })
  console.log('demo-org custom tabs:', orgTabs.length)
  for (const t of orgTabs) console.log(`  • ${t.globalTab.label}  enabled=${t.enabled}  moduleOverride=${t.moduleOverride || '—'}`)
  // also default-org
  const dTabs = await db.orgCustomTab.findMany({
    where: { orgId: 'default-org' },
    include: { globalTab: { select: { label: true, module: true } } },
  })
  console.log('\ndefault-org custom tabs:', dTabs.length)
  await db.$disconnect()
})()
