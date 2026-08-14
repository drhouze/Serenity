const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  // Check if C-0001 exists at all
  const c1 = await db.resident.findFirst({ where: { OR: [{ code: { equals: 'C-0001' } }, { code: { contains: 'C-0001' } }] }, select: { code: true, firstName: true, lastName: true, facilityId: true, status: true } })
  console.log('C-0001:', c1 || 'NOT FOUND')
  
  // Check if C-0002 exists
  const c2 = await db.resident.findFirst({ where: { OR: [{ code: { equals: 'C-0002' } }, { code: { contains: 'C-0002' } }] }, select: { code: true, firstName: true, lastName: true, facilityId: true, status: true } })
  console.log('C-0002:', c2 || 'NOT FOUND')
  
  // Check Hannah
  const hannah = await db.resident.findFirst({ where: { firstName: { contains: 'Hannah' } }, select: { code: true, firstName: true, lastName: true, facilityId: true, status: true } })
  console.log('Hannah:', hannah || 'NOT FOUND')
  
  // C-0085
  const c85 = await db.resident.findFirst({ where: { OR: [{ code: { equals: 'C-0085' } }, { code: { contains: 'C-0085' } }] }, select: { code: true, firstName: true, facilityId: true, status: true } })
  console.log('C-0085:', c85 || 'NOT FOUND')
  
  // List some actual resident codes in owner's facilities
  const residents = await db.resident.findMany({ where: { facilityId: { in: ['cmr7osxis0000reviu9fp9etu', 'cmr7ow90a000rrehqfqnyzazz'] } }, select: { code: true, firstName: true, lastName: true }, take: 10 })
  console.log('\nResidents in owner facilities:', residents.map(r => `${r.code} ${r.firstName} ${r.lastName}`))
  
  await db.$disconnect()
})()
