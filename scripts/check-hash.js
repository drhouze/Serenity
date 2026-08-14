const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient()

async function main() {
  const u = await db.user.findUnique({ where: { email: 'owner@home.com' } })
  const [salt, hash] = u.passwordHash.split(':')
  console.log('Salt length:', salt.length, 'bytes:', Buffer.from(salt, 'hex').length)
  console.log('Hash length:', hash.length, 'bytes:', Buffer.from(hash, 'hex').length)
  
  // Recompute
  const computed = crypto.scryptSync('owner123', salt, 64).toString('hex')
  console.log('Computed hash length:', computed.length, 'bytes:', Buffer.from(computed, 'hex').length)
  console.log('Match:', computed === hash)
  
  // Test timingSafeEqual
  try {
    const buf1 = Buffer.from(computed, 'hex')
    const buf2 = Buffer.from(hash, 'hex')
    console.log('Buffer lengths:', buf1.length, buf2.length)
    console.log('timingSafeEqual:', crypto.timingSafeEqual(buf1, buf2))
  } catch (e) {
    console.log('timingSafeEqual error:', e.message)
  }
}
main().catch(console.error).finally(() => db.$disconnect())
