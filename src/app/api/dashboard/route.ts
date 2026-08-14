import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { generateTomorrowMeds } from '@/lib/med-scheduler'

// GET /api/dashboard — aggregated KPIs and today's overview (role-aware)
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Parse selected facility from query param
  const { searchParams } = new URL(req.url)
  const facilityId = searchParams.get('facilityId') || undefined

  // Determine accessible facilities
  // Hierarchy: Developer sees all; Owner scoped to their org; others scoped to assigned facilities
  let facilityFilter: any = {}
  let facilityIdList: string[] = []
  if (user.role === 'APP_DEVELOPER') {
    if (facilityId) {
      facilityIdList = [facilityId]
      facilityFilter = { facilityId }
    }
  } else if (user.level === 1) {
    // Owner: scoped to their organization's facilities
    if (!user.organizationId) {
      facilityIdList = ['__NO_ORG__']
      facilityFilter = { facilityId: '__NO_ORG__' }
    } else {
      const orgFacilities = await db.facility.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true },
      })
      const orgFidSet = orgFacilities.map(f => f.id)
      if (facilityId && orgFidSet.includes(facilityId)) {
        facilityIdList = [facilityId]
        facilityFilter = { facilityId }
      } else {
        facilityIdList = orgFidSet
        facilityFilter = { facilityId: { in: orgFidSet } }
      }
    }
  } else {
    const userFacilityIds = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
    if (facilityId && userFacilityIds.includes(facilityId)) {
      facilityIdList = [facilityId]
      facilityFilter = { facilityId }
    } else if (userFacilityIds.length > 0) {
      facilityIdList = userFacilityIds
      facilityFilter = { facilityId: { in: userFacilityIds } }
    }
  }

  // ============ AUTO-GENERATE TODAY + TOMORROW'S MEDS ============
  // Uses the shared med-scheduler helper. Runs every time the dashboard loads.
  // Idempotent — skips doses that already exist.
  // We generate BOTH today and tomorrow so that meds are always available
  // even if nobody loaded the dashboard yesterday.
  try {
    const { generateMedAdministrations, generateTomorrowMeds } = await import('@/lib/med-scheduler')
    await generateMedAdministrations(new Date())  // Today
    await generateTomorrowMeds()                  // Tomorrow
  } catch (e) {
    // Don't let med generation break the dashboard
    console.error('[Dashboard] Auto-generate meds error:', e)
  }

  // ============ FAMILY DASHBOARD (restricted) ============
  if (user.role === 'FAMILY') {
    // Parse linkedResidentIds (comma-separated)
    const linkedIds = (user.linkedResidentIds || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)

    if (linkedIds.length === 0) {
      return NextResponse.json({
        isFamily: true,
        linkedResidents: [],
        messages: [],
        recentVisits: [],
        recentCareLogs: [],
      })
    }

    const [linkedResidents, messages, recentVisits, recentCareLogs, recentIncidents] = await Promise.all([
      db.resident.findMany({
        where: { id: { in: linkedIds } },
        include: { room: true, medications: { where: { active: true } } },
      }),
      db.familyMessage.findMany({
        where: { residentId: { in: linkedIds } },
        include: { resident: true, sender: true },
        orderBy: { sentAt: 'desc' },
        take: 10,
      }),
      db.visit.findMany({
        where: { residentId: { in: linkedIds }, scheduledAt: { gte: new Date() }, status: 'SCHEDULED' },
        include: { resident: true, staff: true },
        orderBy: { scheduledAt: 'asc' },
        take: 5,
      }),
      db.careLog.findMany({
        where: { residentId: { in: linkedIds } },
        include: { resident: true, staff: true },
        orderBy: { recordedAt: 'desc' },
        take: 10,
      }),
      db.incidentReport.findMany({
        where: { residentId: { in: linkedIds } },
        include: { resident: true },
        orderBy: { occurredAt: 'desc' },
        take: 3,
      }),
    ])

    const unreadCount = messages.filter(m => !m.read).length

    return NextResponse.json({
      isFamily: true,
      linkedResidents,
      messages,
      recentVisits,
      recentCareLogs,
      recentIncidents,
      unreadCount,
    })
  }

  // ============ STAFF DASHBOARD (full) ============
  const now = new Date()
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
  const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999)
  const next7days = new Date(); next7days.setDate(next7days.getDate() + 7)

  // Relation-based facility filters
  const hasScope = facilityIdList.length > 0
  const residentFilter = facilityFilter
  const staffFilter = facilityFilter
  const visitFilter = hasScope ? { resident: { facilityId: { in: facilityIdList } } } : {}
  const shiftFilter = hasScope ? { staff: { facilityId: { in: facilityIdList } } } : {}
  const medAdminFilter = hasScope ? { resident: { facilityId: { in: facilityIdList } } } : {}
  const incidentFilter = hasScope ? { resident: { facilityId: { in: facilityIdList } } } : {}
  const messageFilter = hasScope ? { resident: { facilityId: { in: facilityIdList } } } : {}
  const invoiceItemFilter = hasScope ? { resident: { facilityId: { in: facilityIdList } } } : {}
  const inventoryFilter = facilityFilter

  const [
    totalResidents,
    activeResidents,
    totalStaff,
    totalRooms,
    occupiedRooms,
    todayShifts,
    todayVisits,
    upcomingVisits,
    todayMedAdmins,
    pendingMedAdmins,
    overdueInvoices,
    unpaidInvoices,
    unbilledItems,
    recentIncidents,
    criticalIncidents,
    unreadMessages,
    totalExpensesThisMonth,
    invoicesThisMonth,
    lowStockItems,
  ] = await Promise.all([
    db.resident.count({ where: residentFilter }),
    db.resident.count({ where: { status: 'ACTIVE', ...residentFilter } }),
    db.staff.count({ where: { active: true, ...staffFilter } }),
    db.room.count({ where: facilityFilter }),
    db.room.count({ where: { status: 'OCCUPIED', ...facilityFilter } }),
    db.shift.findMany({
      where: { date: { gte: todayStart, lte: todayEnd }, ...shiftFilter },
      include: { staff: true },
      orderBy: { startTime: 'asc' },
    }),
    db.visit.findMany({
      where: { scheduledAt: { gte: todayStart, lte: todayEnd }, ...visitFilter },
      include: { resident: true, staff: true },
      orderBy: { scheduledAt: 'asc' },
    }),
    db.visit.findMany({
      where: { scheduledAt: { gte: now, lte: next7days }, status: 'SCHEDULED', ...visitFilter },
      include: { resident: true, staff: true },
      orderBy: { scheduledAt: 'asc' },
      take: 10,
    }),
    db.medAdministration.count({
      where: { scheduledAt: { gte: todayStart, lte: todayEnd }, ...medAdminFilter },
    }),
    db.medAdministration.count({
      where: { scheduledAt: { gte: todayStart, lte: todayEnd }, status: 'PENDING', ...medAdminFilter },
    }),
    db.invoice.aggregate({ _sum: { total: true, amountPaid: true }, where: { status: 'OVERDUE', ...facilityFilter } }),
    db.invoice.aggregate({ _sum: { total: true, amountPaid: true }, where: { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] }, ...facilityFilter } }),
    db.invoiceItem.aggregate({ _sum: { total: true }, where: { billed: false, ...invoiceItemFilter } }),
    db.incidentReport.findMany({
      where: { occurredAt: { gte: new Date(Date.now() - 7 * 86400000) }, ...incidentFilter },
      include: { resident: { include: { room: true } } },
      orderBy: { occurredAt: 'desc' },
      take: 5,
    }),
    db.incidentReport.count({ where: { severity: { in: ['HIGH', 'CRITICAL'] }, occurredAt: { gte: new Date(Date.now() - 30 * 86400000) }, ...incidentFilter } }),
    db.familyMessage.count({ where: { read: false, ...messageFilter } }),
    db.expense.aggregate({ _sum: { amount: true }, _count: true, where: { date: { gte: new Date(now.getFullYear(), now.getMonth(), 1) }, ...facilityFilter } }),
    db.invoice.aggregate({ _sum: { total: true, amountPaid: true }, _count: true, where: { issueDate: { gte: new Date(now.getFullYear(), now.getMonth(), 1) }, ...facilityFilter } }),
    db.inventoryItem.findMany({ where: { active: true, ...inventoryFilter } }),
  ])

  // Bed occupancy calculation
  // "Occupied beds" = residents currently in the facility (assigned to a room)
  // Some rooms may have shared beds (ward type), so we count actual residents with rooms
  const totalBeds = await db.room.aggregate({ _sum: { capacity: true }, where: facilityFilter })
  const residentsWithRooms = await db.resident.count({ where: { ...residentFilter, status: 'ACTIVE', roomId: { not: null } } })
  const occupiedBeds = residentsWithRooms
  const occupancyRate = totalBeds._sum.capacity
    ? Math.min(Math.round((occupiedBeds / totalBeds._sum.capacity) * 100), 100)
    : 0

  // Outstanding amount = total - paid (for unpaid invoices)
  const outstandingAmount = (unpaidInvoices._sum.total || 0) - (unpaidInvoices._sum.amountPaid || 0)
  const overdueAmount = (overdueInvoices._sum.total || 0) - (overdueInvoices._sum.amountPaid || 0)
  const lowStockCount = lowStockItems.filter(i => i.currentStock <= i.reorderLevel).length

  return NextResponse.json({
    isFamily: false,
    kpis: {
      activeResidents,
      totalStaff,
      occupancyRate,
      occupiedBeds,
      totalBeds: totalBeds._sum.capacity || 0,
      totalRooms,
      occupiedRooms,
      todayShifts: todayShifts.length,
      todayVisits: todayVisits.length,
      todayMedAdmins,
      pendingMedAdmins,
      overdueInvoicesCount: await db.invoice.count({ where: { status: 'OVERDUE', ...facilityFilter } }),
      outstandingAmount,
      overdueAmount,
      unbilledAmount: unbilledItems._sum.total || 0,
      unreadMessages,
      criticalIncidents,
      monthlyExpenses: totalExpensesThisMonth._sum.amount || 0,
      monthlyExpenseCount: totalExpensesThisMonth._count || 0,
      monthlyRevenue: invoicesThisMonth._sum.total || 0,
      monthlyCollected: invoicesThisMonth._sum.amountPaid || 0,
      monthlyInvoiceCount: invoicesThisMonth._count || 0,
      monthStartDate: new Date(now.getFullYear(), now.getMonth(), 1).toISOString(),
      lowStockCount,
    },
    todayShifts,
    todayVisits,
    upcomingVisits,
    recentIncidents,
  })
}
