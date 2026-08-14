const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const u = await db.user.findUnique({ where: { email: 'dev@gmail.com' }, select: { id: true, name: true, email: true, code: true, role: true, passwordHash: true } })
  if (!u) { console.log('not found'); process.exit(1) }
  console.log(`Found: ${u.name} <${u.email}>  code=${u.code}  role=${u.role}`)
  // Try a list of candidate passwords
  const candidates = ['dev123356', 'dev123', 'developer123', 'dev', 'dev1234', 'devpass', 'password', 'admin', 'dev2026']
  for (const c of candidates) {
    if (!u.passwordHash) continue
    const [salt, hash] = u.passwordHash.split(':')
    const testHash = crypto.scryptSync(c, salt, 64).toString('hex')
    const ok = testHash === hash
    console.log(`  password="${c}" → ${ok ? '✓ MATCH' : '✗ no'}`)
  }
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
