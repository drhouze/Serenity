const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const apiKeySetting = await db.setting.findFirst({ where: { key: { contains: 'externalApiKey' } } })
  let parsed = JSON.parse(apiKeySetting.value)
  if (typeof parsed === 'string') parsed = JSON.parse(parsed)
  const apiKey = parsed.key
  const facilityId = parsed.facilityId
  const appName = parsed.appName
  console.log('API Key:', apiKey)
  console.log('Facility ID:', facilityId, '| App Name:', appName)

  const facility = await db.facility.findUnique({ where: { id: facilityId }, select: { name: true } })
  console.log('Facility:', facility?.name)

  const residents = await db.resident.findMany({ where: { facilityId, status: { in: ['ACTIVE', 'HOSPITALIZED', 'OUT_WITH_FAMILY'] } }, take: 3, select: { id: true, code: true, firstName: true, lastName: true } })
  console.log('Residents:', JSON.stringify(residents, null, 2))

  const staff = await db.staff.findMany({ where: { facilityId, active: true }, take: 5, select: { id: true, firstName: true, lastName: true, role: true } })
  console.log('Staff:', JSON.stringify(staff, null, 2))

  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
