const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient({ datasources: { db: { url: 'file:/home/z/my-project/db/custom.db' } } })
const DEMO_EMAILS = [
  'owner@home.com', 'manager@home.com', 'nurse@home.com', 'care@home.com',
  'reception@home.com', 'doctor@home.com', 'physio@home.com', 'dietitian@home.com',
  'family@home.com',
]
const EXPECTED_PASSWORDS = {
  'owner@home.com': 'owner123',
  'manager@home.com': 'manager123',
  'nurse@home.com': 'nurse123',
  'care@home.com': 'care123',
  'reception@home.com': 'reception123',
  'doctor@home.com': 'doctor123',
  'physio@home.com': 'physio123',
  'dietitian@home.com': 'dietitian123',
  'family@home.com': 'family123',
}
;(async () => {
  console.log('=== Demo account login check ===')
  for (const email of DEMO_EMAILS) {
    const u = await db.user.findUnique({ where: { email }, select: { name: true, role: true, active: true, passwordHash: true, facilityIds: true, organizationId: true } })
    if (!u) { console.log(`  ✗ ${email}: NOT FOUND in DB`); continue }
    const expected = EXPECTED_PASSWORDS[email]
    let pwOk = false
    if (u.passwordHash) {
      const [salt, hash] = u.passwordHash.split(':')
      const computed = crypto.scryptSync(expected, salt, 64).toString('hex')
      pwOk = computed === hash
    }
    console.log(`  ${pwOk && u.active ? '✓' : '✗'} ${email} | role=${u.role} active=${u.active} pw=${pwOk ? 'OK' : 'WRONG'} facilityIds=${u.facilityIds || '—'}`)
  }
  // Check demoMode setting
  const demoMode = await db.setting.findUnique({ where: { key: 'demoMode' } })
  console.log()
  console.log('demoMode setting:', demoMode ? demoMode.value : 'NOT SET')
  await db.$disconnect()
})().catch(e => { console.error(e); process.exit(1) })
