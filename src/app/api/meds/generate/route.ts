import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/meds/generate
// Auto-generates medication administrations for the next N days (default 1 = tomorrow)
// for all active medications. Uses the shared med-scheduler helper which:
//   - Respects staff-set scheduleTimes (JSON array of "HH:mm" on the Medication)
//   - Falls back to auto-deriving times from frequency (handles all frequencies)
//   - Skips weekly meds on non-scheduled weekdays
//   - Is idempotent (skips doses that already exist)
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const daysAhead = parseInt(searchParams.get('days') || '1', 10)
  const forToday = searchParams.get('forToday') === 'true' || daysAhead === 0

  try {
    if (forToday) {
      // Generate for today only
      const { generateMedAdministrations } = await import('@/lib/med-scheduler')
      const result = await generateMedAdministrations(new Date())
      return NextResponse.json({ success: true, ...result })
    } else if (daysAhead > 1) {
      const { generateMedsForDays } = await import('@/lib/med-scheduler')
      const result = await generateMedsForDays(daysAhead)
      return NextResponse.json({ success: true, ...result })
    } else {
      const { generateTomorrowMeds } = await import('@/lib/med-scheduler')
      const result = await generateTomorrowMeds()
      return NextResponse.json({ success: true, ...result })
    }
  } catch (e: any) {
    console.error('Med generation error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
