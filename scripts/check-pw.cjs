const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const u = await db.user.findUnique({ where: { email: 'manager@home.com' }, select: { name: true, passwordHash: true } })
  if (!u) { console.log('not found'); process.exit(1) }
  const candidates = ['manager123', 'password', 'manager', 'demo', 'managerpass', 'demo123']
  for (const c of candidates) {
    if (!u.passwordHash) continue
    const [salt, hash] = u.passwordHash.split(':')
    const testHash = crypto.scryptSync(c, salt, 64).toString('hex')
    if (testHash === hash) { console.log(`✓ MATCH: ${c}`); process.exit(0) }
  }
  console.log('No candidate matched. Try checking seed-demo-org.js or test-login.js')
})()
