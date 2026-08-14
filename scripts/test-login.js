const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient()

function verifyPassword(password, stored) {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const computed = crypto.scryptSync(password, salt, 64).toString('hex')
    return computed === hash
  } catch (e) {
    return false
  }
}

async function main() {
  const u = await db.user.findUnique({ where: { email: 'owner@home.com' } })
  console.log('User found:', u?.email, 'role:', u?.role)
  console.log('Has hash:', !!u?.passwordHash)
  console.log('Hash preview:', u?.passwordHash?.slice(0, 30) + '...')
  console.log('Verify owner123:', verifyPassword('owner123', u.passwordHash))
}
main().catch(console.error).finally(() => db.$disconnect())
