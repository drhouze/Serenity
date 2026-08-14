const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const user = await db.user.findUnique({ where: { email: 'nurse@home.com' }, select: { id: true, name: true, email: true } })
  const staff = await db.staff.findUnique({ where: { code: 'STF-0001' }, select: { id: true, firstName: true, lastName: true, code: true } })
  if (!user || !staff) { console.log('user or staff missing'); process.exit(1) }
  console.log(`Linking user ${user.email} (id=${user.id}) → staff ${staff.code} ${staff.firstName} ${staff.lastName} (id=${staff.id})`)
  await db.user.update({ where: { id: user.id }, data: { staffId: staff.id } })
  console.log('Linked.')
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
