/* eslint-disable @typescript-eslint/no-var-requires */
// One-time migration: seed the `demoAccounts` Setting from the existing
// demo users in the DB. Run this on a deployment that was created BEFORE
// the demoAccounts-sync feature was added — it scans the User table for
// the known demo email patterns and writes the initial demoAccounts Setting.
//
// Usage:
//   node scripts/seed-demo-accounts-setting.cjs
//
// After running this once, the /api/users PATCH endpoint will keep the
// Setting in sync automatically when credentials change.

const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const KNOWN_DEMO = [
  { email: 'owner@home.com',     password: 'owner123',     label: 'Org Owner',  desc: 'Full access' },
  { email: 'manager@home.com',   password: 'manager123',   label: 'Manager',    desc: 'Operations + finance' },
  { email: 'nurse@home.com',     password: 'nurse123',     label: 'Nurse',      desc: 'Clinical care' },
  { email: 'care@home.com',      password: 'care123',      label: 'Care Staff', desc: 'Daily care' },
  { email: 'reception@home.com', password: 'reception123', label: 'Reception',  desc: 'Front desk' },
  { email: 'family@home.com',    password: 'family123',    label: 'Family',     desc: 'Loved one updates' },
]

async function main() {
  console.log('Seeding demoAccounts Setting...')

  // Check which demo users actually exist in the DB (some deployments may
  // have changed emails — for those, we still write the default list so
  // the Login page has a starting point. The /api/users PATCH will sync
  // any subsequent credential changes.)
  const existingDemoUsers = await db.user.findMany({
    where: { email: { in: KNOWN_DEMO.map(d => d.email) } },
    select: { email: true },
  })
  console.log(`Found ${existingDemoUsers.length} known demo users in DB:`)
  for (const u of existingDemoUsers) console.log(`  - ${u.email}`)

  // Always write the full default list — even if some demo users are missing.
  // The Login page will show all 6 quick-pick buttons; clicking one that
  // doesn't exist in the DB will fail login with the normal "invalid
  // credentials" error, which is the correct behavior.
  const value = JSON.stringify(KNOWN_DEMO)
  await db.setting.upsert({
    where: { key: 'demoAccounts' },
    update: { value },
    create: { key: 'demoAccounts', value },
  })

  console.log('✓ demoAccounts Setting written.')
  console.log('  The Login page quick-pick buttons will now show the current demo credentials.')
  console.log('  Future credential changes via User Management will automatically sync this Setting.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
