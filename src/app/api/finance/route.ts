import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// GET /api/finance?range=30 | 90 | 365 — financial reports (facility-scoped)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const range = parseInt(searchParams.get('range') || '90', 10)
  const facilityId = searchParams.get('facilityId') || undefined
  const since = new Date(); since.setDate(since.getDate() - range)

  // Auth + facility scoping (same logic as /api/data)
  // Hierarchy:
  //   - APP_DEVELOPER: sees all (no scope)
  //   - OWNER: scoped to their organization's facilities
  //   - MANAGER and below: only their assigned facilities
  const currentUser = await getSessionUser(req)
  if (!currentUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let accessibleFacilityIds: string[] = []
  if (currentUser.role === 'APP_DEVELOPER') {
    if (facilityId) accessibleFacilityIds = [facilityId]
  } else if (currentUser.level === 1) {
    if (!currentUser.organizationId) {
      accessibleFacilityIds = ['__NO_ORG__']
    } else {
      const orgFacilities = await db.facility.findMany({
        where: { organizationId: currentUser.organizationId },
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
    const userFacilityIds = (currentUser.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
    if (facilityId && userFacilityIds.includes(facilityId)) {
      accessibleFacilityIds = [facilityId]
    } else {
      accessibleFacilityIds = userFacilityIds
    }
  }
  const hasScope = accessibleFacilityIds.length > 0
  const facilityFilter = hasScope ? { facilityId: { in: accessibleFacilityIds } } : {}
  const residentFilter = hasScope ? { resident: { facilityId: { in: accessibleFacilityIds } } } : {}

  const [invoices, expenses, unbilledItems, payments] = await Promise.all([
    db.invoice.findMany({
      where: { issueDate: { gte: since }, ...facilityFilter },
      include: { resident: true, items: true },
      orderBy: { issueDate: 'asc' },
    }),
    db.expense.findMany({
      where: { date: { gte: since }, ...facilityFilter },
      orderBy: { date: 'asc' },
    }),
    db.invoiceItem.findMany({
      where: { billed: false, ...residentFilter },
      include: { resident: true },
    }),
    db.payment.findMany({
      where: { paymentDate: { gte: since }, ...facilityFilter },
      orderBy: { paymentDate: 'asc' },
    }),
  ])

  // Aggregate revenue by month
  const monthlyRevenue: Record<string, number> = {}
  const monthlyExpenses: Record<string, number> = {}
  for (const inv of invoices) {
    const k = inv.issueDate.toISOString().slice(0, 7)
    monthlyRevenue[k] = (monthlyRevenue[k] || 0) + inv.amountPaid
  }
  for (const e of expenses) {
    const k = e.date.toISOString().slice(0, 7)
    monthlyExpenses[k] = (monthlyExpenses[k] || 0) + e.amount
  }

  // Expense breakdown by category
  const expenseByCategory: Record<string, number> = {}
  for (const e of expenses) {
    expenseByCategory[e.category] = (expenseByCategory[e.category] || 0) + e.amount
  }

  // Revenue vs expenses timeline (sorted months)
  const allMonths = new Set([...Object.keys(monthlyRevenue), ...Object.keys(monthlyExpenses)])
  const timeline = Array.from(allMonths).sort().map(m => ({
    month: m,
    revenue: monthlyRevenue[m] || 0,
    expenses: monthlyExpenses[m] || 0,
  }))

  // Outstanding totals
  const totalOutstanding = invoices
    .filter(i => i.status !== 'PAID' && i.status !== 'CANCELLED')
    .reduce((s, i) => s + (i.total - i.amountPaid), 0)

  const totalUnbilled = unbilledItems.reduce((s, i) => s + i.total, 0)

  // Payment totals — only count cleared payments (exclude bounced/refunded)
  const validPayments = payments.filter(p => p.status !== 'BOUNCED' && p.status !== 'REFUNDED')
  const totalPaymentsReceived = validPayments.reduce((s, p) => s + p.amount, 0)
  const totalPaymentsApplied = validPayments.reduce((s, p) => s + (p.appliedAmount || 0), 0)
  const totalUnappliedCredit = totalPaymentsReceived - totalPaymentsApplied

  return NextResponse.json({
    range,
    summary: {
      totalBilled: invoices.reduce((s, i) => s + i.total, 0),
      totalCollected: invoices.reduce((s, i) => s + i.amountPaid, 0),
      totalOutstanding,
      totalUnbilled,
      totalExpenses: expenses.reduce((s, e) => s + e.amount, 0),
      netIncome: invoices.reduce((s, i) => s + i.amountPaid, 0) - expenses.reduce((s, e) => s + e.amount, 0),
      invoiceCount: invoices.length,
      expenseCount: expenses.length,
      // Payment-specific KPIs
      totalPaymentsReceived,
      totalPaymentsApplied,
      totalUnappliedCredit,
      paymentCount: validPayments.length,
    },
    timeline,
    expenseByCategory,
    unbilledItems,
  })
}
