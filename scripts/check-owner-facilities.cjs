const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const owner = await db.user.findUnique({ where: { email: 'owner@home.com' }, select: { facilityIds: true, organizationId: true, role: true, level: true } })
  console.log('Owner:', JSON.stringify(owner, null, 2))
  
  // Owner is level 1 — they see all facilities in their org
  const orgFacilities = await db.facility.findMany({ where: { organizationId: owner.organizationId }, select: { id: true, name: true } })
  console.log('Org facilities:', orgFacilities.map(f => `${f.name} (${f.id})`))
  
  // Check residents in those facilities
  const residents = await db.resident.findMany({ where: { facilityId: { in: orgFacilities.map(f => f.id) }, status: 'ACTIVE' }, select: { code: true, firstName: true, lastName: true, facilityId: true }, take: 5 })
  console.log('Residents:', residents.map(r => `${r.code} ${r.firstName} ${r.lastName}`))
  
  await db.$disconnect()
})()
