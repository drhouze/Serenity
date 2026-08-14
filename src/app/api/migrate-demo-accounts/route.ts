import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

// POST /api/migrate-demo-accounts — one-time migration that seeds the
// `demoAccounts` Setting from the existing demo users in the DB.
//
// This is for deployments that were created BEFORE the demoAccounts-sync
// feature was added. After running this once, the /api/users PATCH endpoint
// keeps the Setting in sync automatically when credentials change.
//
// Usage:
//   1. Log in as the App Developer (backdoor or normal)
//   2. Visit: https://your-app.vercel.app/api/migrate-demo-accounts
//      (or POST to it via curl/Postman — both work)
//   3. You'll see a JSON response confirming how many demo accounts were written
//   4. After confirming it worked, delete this file (src/app/api/migrate-demo-accounts/route.ts)
//
// Requires: APP_DEVELOPER role (security — don't let anyone else trigger it)
//
// Idempotent: safe to run multiple times. Each run overwrites the Setting
// with the default demo accounts list.

const DEFAULT_DEMO_ACCOUNTS = [
  { email: 'owner@home.com',     password: 'owner123',     label: 'Org Owner',  desc: 'Full access' },
  { email: 'manager@home.com',   password: 'manager123',   label: 'Manager',    desc: 'Operations + finance' },
  { email: 'nurse@home.com',     password: 'nurse123',     label: 'Nurse',      desc: 'Clinical care' },
  { email: 'care@home.com',      password: 'care123',      label: 'Care Staff', desc: 'Daily care' },
  { email: 'reception@home.com', password: 'reception123', label: 'Reception',  desc: 'Front desk' },
  { email: 'family@home.com',    password: 'family123',    label: 'Family',     desc: 'Loved one updates' },
]

export async function GET(req: NextRequest) {
  return runMigration(req)
}

export async function POST(req: NextRequest) {
  return runMigration(req)
}

async function runMigration(req: NextRequest) {
  // Auth check — only the App Developer can run this
  const user = await getSessionUser(req)
  if (!user) {
    return NextResponse.json(
      { error: 'Unauthorized — please log in as the App Developer first, then visit this URL again.' },
      { status: 401 }
    )
  }
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json(
      { error: 'Only the App Developer can run this migration.', yourRole: user.role },
      { status: 403 }
    )
  }

  try {
    // Check which demo users already exist in the DB
    const existingDemoUsers = await db.user.findMany({
      where: { email: { in: DEFAULT_DEMO_ACCOUNTS.map(d => d.email) } },
      select: { email: true, role: true },
    })

    // Always write the full default list — the /api/users PATCH endpoint will
    // keep it in sync going forward. Even if some demo users don't exist yet,
    // the Login page will still show all 6 quick-pick buttons (clicking a
    // non-existent one just fails login normally).
    const value = JSON.stringify(DEFAULT_DEMO_ACCOUNTS)
    await db.setting.upsert({
      where: { key: 'demoAccounts' },
      update: { value },
      create: { key: 'demoAccounts', value },
    })

    return NextResponse.json({
      success: true,
      message: 'demoAccounts Setting seeded successfully. The Login page quick-pick buttons will now show the current demo credentials. Future credential changes via User Management will automatically sync this Setting. You can safely delete this file: src/app/api/migrate-demo-accounts/route.ts',
      writtenAt: new Date().toISOString(),
      writtenBy: { id: user.id, name: user.name, email: user.email },
      demoAccountsWritten: DEFAULT_DEMO_ACCOUNTS.length,
      existingDemoUsersInDB: existingDemoUsers.map(u => ({ email: u.email, role: u.role })),
      note: 'If some demo users are missing from the DB (see existingDemoUsersInDB above), the Login page will still show their quick-pick buttons — but clicking them will fail login until those users are created via User Management.',
    })
  } catch (e: any) {
    console.error('Migration error:', e)
    return NextResponse.json(
      { error: 'Migration failed', details: e.message },
      { status: 500 }
    )
  }
}
