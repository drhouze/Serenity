const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const u = await db.user.findUnique({ where: { email: 'manager@home.com' }, select: { name: true, passwordHash: true } })
  // The hash format length 161 means it's NOT 32 (salt 16 bytes hex = 32 chars) + ':' + 128 (hash 64 bytes hex) = 161 chars total
  // That matches! Let me try the same verifyPassword logic
  const [salt, hash] = u.passwordHash.split(':')
  console.log('salt:', salt, 'saltLen:', salt.length)
  console.log('hash:', hash, 'hashLen:', hash.length)
  const c = 'manager123'
  const computed = crypto.scryptSync(c, salt, 64).toString('hex')
  console.log('computed (first 30):', computed.slice(0, 30))
  console.log('stored   (first 30):', hash.slice(0, 30))
  console.log('match:', computed === hash)
})()
