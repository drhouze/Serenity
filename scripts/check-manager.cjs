const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const users = await db.user.findMany({ where: { role: 'MANAGER', active: true }, select: { email: true, name: true, code: true, organizationId: true } })
  console.log('Active managers:', JSON.stringify(users, null, 2))
  await db.$disconnect()
})()
