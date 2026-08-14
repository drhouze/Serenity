const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const candidates = ['manager@demo.com', 'demo.manager@democare.com']
  for (const email of candidates) {
    const u = await db.user.findUnique({ where: { email }, select: { email: true, name: true, passwordHash: true, organizationId: true } })
    if (!u) continue
    console.log(`\n${u.email} (org=${u.organizationId})`)
    for (const c of ['demo123', 'demo', 'password', 'manager123', 'manager', 'demo2026', 'demopass']) {
      const [salt, hash] = u.passwordHash.split(':')
      const computed = crypto.scryptSync(c, salt, 64).toString('hex')
      if (computed === hash) { console.log(`  ✓ MATCH: ${c}`); break }
    }
  }
  await db.$disconnect()
})()
