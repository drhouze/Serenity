const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const u = await db.user.findUnique({ where: { email: 'manager@home.com' }, select: { name: true, passwordHash: true } })
  console.log('user:', u.name)
  console.log('hash format (first 30 chars):', u.passwordHash.slice(0, 30))
  console.log('hash format length:', u.passwordHash.length)
  // The seed.js uses a different scrypt hash; add-passwords uses scryptSync with N=16384
  // Check if the seed uses a different format
  const c = 'manager123'
  const [salt, hash] = u.passwordHash.split(':')
  // Try scryptSync with default N=16384
  const testHash1 = crypto.scryptSync(c, salt, 64).toString('hex')
  console.log('test hash 1 (scryptSync default):', testHash1 === hash ? '✓ MATCH' : '✗ no')
  // Maybe it's pbkdf2?
  const testHash2 = crypto.pbkdf2Sync(c, salt, 100000, 64, 'sha512').toString('hex')
  console.log('test hash 2 (pbkdf2 100k):', testHash2 === hash ? '✓ MATCH' : '✗ no')
  // Maybe it's scrypt with N=64?
  try {
    const testHash3 = crypto.scryptSync(c, salt, 64, { N: 1024 }).toString('hex')
    console.log('test hash 3 (scrypt N=1024):', testHash3 === hash ? '✓ MATCH' : '✗ no')
  } catch (e) {}
})()
