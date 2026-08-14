import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/settings/public — returns ONLY public, non-sensitive settings
// needed before login (on the Login page). No authentication required.
//
// Returns: { demoMode, appName, appTagline, appLogoUrl, organizationLogoUrl, dbProvider }
export async function GET() {
  // Keys that are safe to expose publicly (no credentials, no secrets)
  const PUBLIC_KEYS = ['demoMode', 'appName', 'appTagline', 'appLogoUrl', 'organizationLogoUrl']

  const result: Record<string, any> = {
    demoMode: false,
    appName: 'Serenity Care Home',
    appTagline: 'Resident & Operations Management',
    appLogoUrl: '',
    organizationLogoUrl: '',
    // Expose which DB provider is in use so the frontend can hide SQLite-only
    // features (like the raw .db backup button) when running on PostgreSQL.
    dbProvider: (process.env.DATABASE_URL || '').startsWith('file:') ? 'sqlite' : 'postgresql',
  }

  try {
    const rows = await db.setting.findMany({
      where: { key: { in: PUBLIC_KEYS } },
    })
    for (const row of rows) {
      try {
        result[row.key] = JSON.parse(row.value)
      } catch {
        result[row.key] = row.value
      }
    }
  } catch (e: any) {
    console.error('Public settings error:', e.message)
  }

  return NextResponse.json(result)
}
