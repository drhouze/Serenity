const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const u = await db.user.findUnique({ where: { email: 'manager@home.com' }, select: { name: true, passwordHash: true } })
  if (!u) { console.log('not found'); process.exit(1) }
  console.log('user:', u.name)
  // Try common candidates
  const candidates = ['manager123', 'password', 'manager', 'demo123', 'managerpass', 'manager1234', 'demo', 'robert', 'Robert123', 'hayes', 'Hayes123', 'Serenity123', 'serenity', 'manager2026', 'Manager123', 'manager@123', 'manager@home', 'managerhome', 'Manager@123']
  for (const c of candidates) {
    const [salt, hash] = u.passwordHash.split(':')
    const computed = crypto.scryptSync(c, salt, 64).toString('hex')
    if (computed === hash) { console.log(`  ✓ MATCH: ${c}`); break }
  }
  await db.$disconnect()
})()
