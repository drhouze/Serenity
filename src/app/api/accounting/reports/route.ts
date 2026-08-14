import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { getTrialBalance, getIncomeStatement, getBalanceSheet, getARAging, seedChartOfAccounts } from '@/lib/accounting'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/accounting/reports?type=trial_balance&asOf=2026-07-06&facilityId=xxx
// GET /api/accounting/reports?type=income_statement&startDate=2026-01-01&endDate=2026-12-31
// GET /api/accounting/reports?type=balance_sheet&asOf=2026-07-06
// GET /api/accounting/reports?type=ar_aging&asOf=2026-07-06
// GET /api/accounting/reports?type=seed_coa  (seeds the default chart of accounts)
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role === 'FAMILY') return NextResponse.json({ error: 'Access denied' }, { status: 403 })

  const { searchParams } = new URL(req.url)
  const reportType = searchParams.get('type') || ''
  const facilityId = searchParams.get('facilityId') || null

  // Determine accessible facilities
  // Hierarchy:
  //   - APP_DEVELOPER: sees all (no scope) — null means "all"
  //   - OWNER: scoped to their organization's facilities
  //   - MANAGER and below: only their assigned facilities
  let accessibleFacilityIds: string[] = []
  if (user.role === 'APP_DEVELOPER') {
    if (facilityId) accessibleFacilityIds = [facilityId]
    // else: null = all (developer sees everything)
  } else if (user.level === 1) {
    if (!user.organizationId) {
      accessibleFacilityIds = ['__NO_ORG__']
    } else {
      const { db } = await import('@/lib/db')
      const orgFacilities = await db.facility.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true },
      })
      const orgFidSet = orgFacilities.map(f => f.id)
      if (facilityId && orgFidSet.includes(facilityId)) {
        accessibleFacilityIds = [facilityId]
      } else {
        accessibleFacilityIds = orgFidSet
      }
    }
  } else {
    const userFacilityIds = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
    if (facilityId && userFacilityIds.includes(facilityId)) {
      accessibleFacilityIds = [facilityId]
    } else {
      accessibleFacilityIds = userFacilityIds
    }
  }

  // For accounting, we use the first accessible facility (or null for all)
  // Only Developer gets null (all facilities). Owner/Manager always get a specific facility.
  // If Owner/Manager has multiple facilities and none selected, return empty (prevent cross-org leak).
  const scopeFacilityId = user.role === 'APP_DEVELOPER' && accessibleFacilityIds.length === 0
    ? null
    : accessibleFacilityIds.length === 1 ? accessibleFacilityIds[0] : null

  // Safety check: non-developer users MUST have a specific facility selected for reports
  // (prevents cross-organization data leakage when Owner has multiple facilities)
  if (user.role !== 'APP_DEVELOPER' && !scopeFacilityId) {
    return NextResponse.json({
      error: 'Please select a specific facility to view accounting reports.',
      data: [],
    }, { status: 400 })
  }

  try {
    // Special: seed the chart of accounts
    if (reportType === 'seed_coa') {
      const result = await seedChartOfAccounts(scopeFacilityId)
      return NextResponse.json(result)
    }

    switch (reportType) {
      case 'trial_balance': {
        const asOf = searchParams.get('asOf') ? new Date(searchParams.get('asOf')!) : undefined
        const report = await getTrialBalance(scopeFacilityId, asOf)
        return NextResponse.json(report)
      }

      case 'income_statement': {
        const now = new Date()
        const startDate = searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : new Date(now.getFullYear(), now.getMonth(), 1)
        const endDate = searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)
        const report = await getIncomeStatement(scopeFacilityId, startDate, endDate)
        return NextResponse.json(report)
      }

      case 'balance_sheet': {
        const asOf = searchParams.get('asOf') ? new Date(searchParams.get('asOf')!) : new Date()
        const report = await getBalanceSheet(scopeFacilityId, asOf)
        return NextResponse.json(report)
      }

      case 'ar_aging': {
        const asOf = searchParams.get('asOf') ? new Date(searchParams.get('asOf')!) : new Date()
        const report = await getARAging(scopeFacilityId, asOf)
        return NextResponse.json(report)
      }

      default:
        return NextResponse.json({ error: 'Unknown report type. Use: trial_balance, income_statement, balance_sheet, ar_aging, or seed_coa' }, { status: 400 })
    }
  } catch (e: any) {
    console.error('Accounting report error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
