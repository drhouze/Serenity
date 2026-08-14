/* eslint-disable */
// Add family user to existing DB
const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient()

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  const familyUser = {
    name: 'Family Member',
    email: 'family@home.com',
    role: 'FAMILY',
    phone: '+1-555-0108',
    passwordHash: hashPassword('family123'),
    active: true,
  }
  await db.user.upsert({
    where: { email: familyUser.email },
    update: familyUser,
    create: familyUser,
  })
  console.log('✓ Family user created/updated')
  console.log('  Email: family@home.com')
  console.log('  Password: family123')

  const count = await db.user.count()
  console.log(`Total users: ${count}`)
}

main().catch(console.error).finally(() => db.$disconnect())
