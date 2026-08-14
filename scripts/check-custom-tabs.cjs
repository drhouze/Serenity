const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const tabs = await db.globalCustomTab.findMany({ select: { id: true, label: true, key: true, module: true, active: true, _count: { select: { orgSelections: true } } }, orderBy: { sortOrder: 'asc' } })
  console.log('Global custom tabs:')
  for (const t of tabs) console.log(`  • ${t.label} (key=${t.key}, module=${t.module}, active=${t.active}, orgSelections=${t._count.orgSelections})`)
  if (tabs.length === 0) console.log('  (none)')

  const orgTabs = await db.orgCustomTab.findMany({ take: 5, include: { globalTab: { select: { label: true, module: true } } } })
  console.log('\nSample OrgCustomTab selections:')
  for (const s of orgTabs) console.log(`  • orgId=${s.orgId.slice(-8)}  tab="${s.globalTab.label}" (dev module=${s.globalTab.module})  enabled=${s.enabled}  labelOverride=${s.labelOverride || '—'}`)
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
