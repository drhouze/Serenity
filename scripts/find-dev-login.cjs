const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const devs = await db.user.findMany({
    where: { role: 'APP_DEVELOPER', active: true },
    select: { id: true, name: true, email: true, code: true, phone: true, level: true, organizationId: true, staffId: true },
  })
  console.log('Active App Developer accounts:')
  for (const u of devs) {
    console.log(`  • ${u.name} <${u.email}>`)
    console.log(`    code=${u.code || '—'} | level=${u.level} | phone=${u.phone || '—'} | orgId=${u.organizationId || '—'} | staffId=${u.staffId || '—'}`)
  }
  if (devs.length === 0) {
    console.log('  (none — checking inactive too)')
    const inactive = await db.user.findMany({ where: { role: 'APP_DEVELOPER' }, select: { email: true, name: true, active: true } })
    for (const u of inactive) console.log(`  • ${u.name} <${u.email}> (active=${u.active})`)
  }
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
