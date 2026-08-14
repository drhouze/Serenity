/* eslint-disable */
// Set password hashes for existing users, then we can push schema
const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient()

function hashPassword(password) {
  // Use scrypt for secure password hashing
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  // Temporary: add passwordHash column with raw SQL since Prisma can't push yet
  // First, add the column as nullable
  await db.$executeRawUnsafe(`ALTER TABLE "User" ADD COLUMN "passwordHash" TEXT;`)
  console.log('Column added')

  // Set passwords for all users
  const passwords = {
    'owner@home.com': 'owner123',
    'manager@home.com': 'manager123',
    'nurse@home.com': 'nurse123',
    'care@home.com': 'care123',
    'reception@home.com': 'reception123',
    'doctor@home.com': 'doctor123',
    'physio@home.com': 'physio123',
    'dietitian@home.com': 'dietitian123',
  }

  for (const [email, pwd] of Object.entries(passwords)) {
    const hash = hashPassword(pwd)
    await db.$executeRawUnsafe(`UPDATE "User" SET "passwordHash" = ? WHERE "email" = ?;`, hash, email)
    console.log(`  ✓ Set password for ${email}`)
  }
  console.log('Done. Now run db:push.')
}

main().catch(console.error).finally(() => db.$disconnect())
