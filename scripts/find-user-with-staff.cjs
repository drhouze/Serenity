const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const users = await db.user.findMany({
    where: { staffId: { not: null }, active: true },
    select: { id: true, name: true, email: true, role: true, staffId: true, facilityIds: true },
    take: 10,
  })
  console.log('Users with linked Staff:')
  for (const u of users) {
    const staff = await db.staff.findUnique({ where: { id: u.staffId }, select: { firstName: true, lastName: true, code: true, role: true, basicSalary: true, facility: { select: { name: true } } } })
    console.log(`  ${u.email} (${u.role}) → staff ${staff?.code} ${staff?.firstName} ${staff?.lastName} (${staff?.role}) @ ${staff?.facility?.name} | basicSalary=${staff?.basicSalary ?? 'null'}`)
  }
  if (users.length === 0) {
    console.log('  (none found) — looking for staff whose email matches a user email...')
    const staff = await db.staff.findMany({ where: { active: true, email: { not: null } }, take: 5, select: { id: true, firstName: true, lastName: true, email: true, code: true, role: true, facilityId: true } })
    for (const s of staff) {
      console.log(`  staff: ${s.code} ${s.firstName} ${s.lastName} (${s.role}) email=${s.email}`)
    }
  }
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
