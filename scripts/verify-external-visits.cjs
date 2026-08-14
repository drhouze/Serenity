const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
;(async () => {
  const visits = await db.visit.findMany({
    where: { residentId: 'cmsqkcs3l0001vmuy40r5ftvr' },
    orderBy: { createdAt: 'desc' },
    take: 4,
    include: { resident: { select: { code: true, firstName: true, lastName: true, facility: { select: { name: true } } } }, staff: true },
  })
  for (const v of visits) {
    console.log('─────────────────────────────────────────────────────────')
    console.log(`Visit ${v.id}  (${v.visitType})  [${v.status}]`)
    console.log(`  Resident : ${v.resident.code} — ${v.resident.firstName} ${v.resident.lastName}  @ ${v.resident.facility?.name}`)
    console.log(`  When     : scheduledAt=${v.scheduledAt?.toISOString()}  completedAt=${v.completedAt?.toISOString()}  duration=${v.duration ?? '—'} min`)
    console.log(`  Doctor   : completedByName="${v.completedByName}"  staffLinked=${!!v.staff}${v.staff ? ` (${v.staff.firstName} ${v.staff.lastName}, ${v.staff.role})` : ''}`)
    console.log(`  Source   : externalSource="${v.externalSource ?? '— (internal)'}"`)
    console.log(`  -- Clinical note fields --`)
    console.log(`  chiefComplaint : ${v.chiefComplaint ?? '—'}`)
    console.log(`  vitalsNote     : ${v.vitalsNote ?? '—'}`)
    console.log(`  findings       : ${v.findings ?? '—'}`)
    console.log(`  diagnosis      : ${v.diagnosis ?? '—'}`)
    console.log(`  treatmentPlan  : ${v.treatmentPlan ?? '—'}`)
    console.log(`  prescription   : ${v.prescription ?? '—'}`)
    console.log(`  followUpNote   : ${v.followUpNote ?? '—'}`)
  }
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
