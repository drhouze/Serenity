/* eslint-disable */
// Set default levels for existing users based on their role
const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const ROLE_LEVELS = {
  OWNER: 1,
  MANAGER: 2,
  DOCTOR: 3,
  NURSE: 3,
  PHYSIO: 3,
  DIETITIAN: 3,
  CARE_STAFF: 4,
  RECEPTION: 4,
  FAMILY: 5,
}

async function main() {
  const users = await db.user.findMany({ select: { id: true, name: true, email: true, role: true, level: true } })
  console.log('Setting levels for', users.length, 'users:')
  for (const u of users) {
    const targetLevel = ROLE_LEVELS[u.role] || 5
    if (u.level !== targetLevel) {
      await db.user.update({ where: { id: u.id }, data: { level: targetLevel } })
      console.log(`  ✓ ${u.name} (${u.role}) → Level ${targetLevel}`)
    } else {
      console.log(`  - ${u.name} (${u.role}) already Level ${u.level}`)
    }
  }
  console.log('Done')
}

main().catch(console.error).finally(() => db.$disconnect())
