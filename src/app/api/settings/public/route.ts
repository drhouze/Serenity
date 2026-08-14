import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/settings/public — returns ONLY public, non-sensitive settings
// needed before login (on the Login page). No authentication required.
//
// Returns: { demoMode, appName, appTagline, appLogoUrl, organizationLogoUrl, dbProvider, demoAccounts }
//
// `demoAccounts` is only returned when demoMode is ON. It contains the list
// of demo account credentials ({ email, password, label, desc }) so the
// Login page quick-pick buttons can auto-fill the CURRENT credentials
// (which may have been changed by the developer via User Management).
// When demoMode is OFF, `demoAccounts` is returned as an empty array —
// the Login page won't render the quick-pick buttons anyway.
export async function GET() {
  // Keys that are safe to expose publicly (no credentials, no secrets).
  // NOTE: 'demoAccounts' is intentionally NOT in this list — we only
  // return it when demoMode is ON (checked below).
  const PUBLIC_KEYS = ['demoMode', 'appName', 'appTagline', 'appLogoUrl', 'organizationLogoUrl']

  const result: Record<string, any> = {
    demoMode: false,
    appName: 'Serenity Care Home',
    appTagline: 'Resident & Operations Management',
    appLogoUrl: '',
    organizationLogoUrl: '',
    demoAccounts: [],
    // Expose which DB provider is in use so the frontend can hide SQLite-only
    // features (like the raw .db backup button) when running on PostgreSQL.
    dbProvider: (process.env.DATABASE_URL || '').startsWith('file:') ? 'sqlite' : 'postgresql',
  }

  try {
    const rows = await db.setting.findMany({
      where: { key: { in: [...PUBLIC_KEYS, 'demoAccounts'] } },
    })
    let demoMode = false
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value)
        result[row.key] = parsed
        if (row.key === 'demoMode') demoMode = parsed === true
      } catch {
        result[row.key] = row.value
        if (row.key === 'demoMode') demoMode = row.value === true
      }
    }

    // Only expose demo account credentials when demoMode is ON.
    // When OFF, scrub the list so even the existence of demo accounts
    // isn't leaked to attackers scanning the public endpoint.
    if (!demoMode) {
      result.demoAccounts = []
    } else if (!Array.isArray(result.demoAccounts)) {
      result.demoAccounts = []
    }
  } catch (e: any) {
    console.error('Public settings error:', e.message)
  }

  return NextResponse.json(result)
}
