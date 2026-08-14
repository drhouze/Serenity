import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/profile/me/full
 *
 * Returns the logged-in user's complete self-service profile data in a single
 * round-trip, so the "My Profile" module can render everything at once:
 *
 *   - user           (login account: name, email, phone, role, level, code, createdAt)
 *   - staff          (linked Staff record: role, hireDate, basicSalary, bank info, etc.)
 *   - leaveBalance   ({ annualEntitlement, annualUsed, annualRemaining, sickEntitlement, sickUsed, sickRemaining, tenureYears })
 *   - leaves         ([StaffLeave] — all leave requests, newest first)
 *   - shifts         ([Shift] — upcoming shifts for the next 14 days, then past 30 days)
 *   - payrolls       ([Payroll + lineItems] — all payrolls for this staff, newest first)
 *   - attendances    (recent 14 days — for attendance summary)
 *
 * If the user has no linked staffId (e.g. Owner, App Developer, or Family), the
 * staff/leave/shift/payroll sections are returned as null/empty arrays.
 */
export async function GET(req: Request) {
  const user = await getSessionUser(req)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Default empty response shape (used when no linked Staff)
  const empty = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      level: user.level,
      code: user.code,
      organizationId: user.organizationId,
      facilityIds: user.facilityIds,
    },
    staff: null,
    leaveBalance: null,
    leaves: [],
    shifts: { upcoming: [], past: [] },
    payrolls: { pending: [], paid: [] },
    attendances: [],
  }

  if (!user.staffId) {
    return NextResponse.json(empty)
  }

  // Fetch the linked Staff record + all related data in parallel
  const [staff, leaves, upcomingShifts, pastShifts, payrolls, attendances] = await Promise.all([
    db.staff.findUnique({
      where: { id: user.staffId },
      select: {
        id: true,
        code: true,
        firstName: true,
        lastName: true,
        role: true,
        email: true,
        phone: true,
        hireDate: true,
        active: true,
        facilityId: true,
        basicSalary: true,
        icNumber: true,
        epfNumber: true,
        socsoNumber: true,
        taxNumber: true,
        bankAccount: true,
        bankName: true,
        defaultZakat: true,
        defaultLoanDeduction: true,
        defaultAllowances: true,
        employmentType: true,
        facility: { select: { id: true, name: true } },
      },
    }),
    db.staffLeave.findMany({
      where: { staffId: user.staffId },
      orderBy: { startDate: 'desc' },
      take: 100,
    }),
    db.shift.findMany({
      where: {
        staffId: user.staffId,
        date: { gte: new Date() },
      },
      include: { staff: { select: { firstName: true, lastName: true, code: true } } },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
      take: 30,
    }),
    db.shift.findMany({
      where: {
        staffId: user.staffId,
        date: {
          gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          lt: new Date(),
        },
      },
      include: { staff: { select: { firstName: true, lastName: true, code: true } } },
      orderBy: [{ date: 'desc' }, { startTime: 'desc' }],
      take: 30,
    }),
    db.payroll.findMany({
      where: { staffId: user.staffId },
      include: { lineItems: true, facility: { select: { name: true } } },
      orderBy: { payrollMonth: 'desc' },
      take: 50,
    }),
    db.staffAttendance.findMany({
      where: {
        staffId: user.staffId,
        date: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
      },
      orderBy: { date: 'desc' },
      take: 14,
    }),
  ])

  if (!staff) {
    // Staff was deleted but User.staffId still points to it — return empty
    return NextResponse.json(empty)
  }

  // ---------- Compute leave balance ----------
  const currentYear = new Date().getFullYear()
  const tenureYears = staff.hireDate
    ? (Date.now() - new Date(staff.hireDate).getTime()) / (365.25 * 86400000)
    : 0
  const annualEntitlement = tenureYears < 1 ? 8 : tenureYears < 2 ? 12 : 16
  const sickEntitlement = tenureYears < 2 ? 14 : 18

  const approvedLeavesThisYear = leaves.filter(l =>
    l.status === 'APPROVED' &&
    new Date(l.startDate).getFullYear() === currentYear
  )
  const countDays = (type: string) =>
    approvedLeavesThisYear
      .filter(l => l.type === type)
      .reduce((sum, l) => {
        const start = new Date(l.startDate)
        const end = new Date(l.endDate)
        return sum + Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1
      }, 0)

  const annualUsed = countDays('ANNUAL')
  const sickUsed = countDays('SICK')
  const leaveBalance = {
    annualEntitlement,
    annualUsed,
    annualRemaining: annualEntitlement - annualUsed,
    sickEntitlement,
    sickUsed,
    sickRemaining: sickEntitlement - sickUsed,
    tenureYears: Math.floor(tenureYears * 10) / 10,
    currentYear,
  }

  // ---------- Split payrolls into pending vs paid ----------
  const pendingPayrolls = payrolls.filter(p => p.status === 'DRAFT' || p.status === 'APPROVED')
  const paidPayrolls = payrolls.filter(p => p.status === 'PAID')

  return NextResponse.json({
    user: empty.user,
    staff,
    leaveBalance,
    leaves,
    shifts: { upcoming: upcomingShifts, past: pastShifts },
    payrolls: { pending: pendingPayrolls, paid: paidPayrolls },
    attendances,
  })
}
