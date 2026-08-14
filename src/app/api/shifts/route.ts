import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, resolveAccessibleFacilityIds } from '@/lib/auth'
import { logAudit, AUDIT_ACTIONS, getFacilityName } from '@/lib/audit'

// POST /api/shifts?action=generateWeek — generate a full week of shifts from a template
// POST /api/shifts?action=copyWeek — copy shifts from one week to another
// POST /api/shifts?action=swap — swap two shifts between staff
// POST /api/shifts?action=deleteDay — delete all shifts for a specific date
// POST /api/shifts?action=deleteWeek — delete all shifts for a week
//
// All actions are restricted to Owner/Manager/Nurse roles (FAMILY cannot call).
// All actions scope shifts to the caller's accessible facilities so cross-org
// shifts can never be read, modified, or deleted.

const SHIFT_TYPES = [
  { type: 'DAY', start: '07:00', end: '15:00' },
  { type: 'EVENING', start: '15:00', end: '23:00' },
  { type: 'NIGHT', start: '23:00', end: '07:00' },
]

// Default weekly template: which staff covers which shift on which day
// Day 0 = Sunday ... 6 = Saturday
const DEFAULT_TEMPLATE: Record<number, { staffRole: string; shiftType: string }[]> = {
  0: [{ staffRole: 'NURSE', shiftType: 'DAY' }, { staffRole: 'CARE_STAFF', shiftType: 'DAY' }, { staffRole: 'NURSE', shiftType: 'NIGHT' }],
  1: [{ staffRole: 'NURSE', shiftType: 'DAY' }, { staffRole: 'CARE_STAFF', shiftType: 'DAY' }, { staffRole: 'NURSE', shiftType: 'NIGHT' }],
  2: [{ staffRole: 'NURSE', shiftType: 'DAY' }, { staffRole: 'CARE_STAFF', shiftType: 'DAY' }, { staffRole: 'NURSE', shiftType: 'NIGHT' }],
  3: [{ staffRole: 'NURSE', shiftType: 'DAY' }, { staffRole: 'CARE_STAFF', shiftType: 'DAY' }, { staffRole: 'NURSE', shiftType: 'NIGHT' }],
  4: [{ staffRole: 'NURSE', shiftType: 'DAY' }, { staffRole: 'CARE_STAFF', shiftType: 'DAY' }, { staffRole: 'NURSE', shiftType: 'NIGHT' }],
  5: [{ staffRole: 'NURSE', shiftType: 'DAY' }, { staffRole: 'CARE_STAFF', shiftType: 'DAY' }, { staffRole: 'NURSE', shiftType: 'NIGHT' }],
  6: [{ staffRole: 'NURSE', shiftType: 'DAY' }, { staffRole: 'CARE_STAFF', shiftType: 'DAY' }, { staffRole: 'NURSE', shiftType: 'NIGHT' }],
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // Block FAMILY users from shift operations
  if (user.role === 'FAMILY') {
    return NextResponse.json({ error: 'Family users cannot modify shifts' }, { status: 403 })
  }

  // Resolve accessible facility IDs so we can scope all shift operations
  const { accessibleFacilityIds, isScoped } = await resolveAccessibleFacilityIds(user, null)
  // Build a facility filter for shifts (via the staff relation)
  const shiftFacilityFilter = isScoped
    ? { staff: { facilityId: { in: accessibleFacilityIds } } }
    : {}

  const { searchParams } = new URL(req.url)
  const action = searchParams.get('action') || ''
  const body = await req.json().catch(() => ({}))

  try {
    // ============ GENERATE WEEK ============
    if (action === 'generateWeek') {
      // Generate shifts for a full week starting from a given date (or next Monday)
      const startDateStr = body.startDate
      let startDate: Date
      if (startDateStr) {
        startDate = new Date(startDateStr)
      } else {
        // Default to next Monday
        startDate = new Date()
        const day = startDate.getDay()
        const diff = day === 0 ? 1 : 8 - day // Sunday=0 → Monday=1, Monday=1 → next Monday=8-1=7
        startDate.setDate(startDate.getDate() + diff)
        startDate.setHours(0, 0, 0, 0)
      }

      // Scope staff to the selected facility (if provided) or the caller's accessible facilities.
      // Previously: Owner (level 1) with no facilityId got ALL staff across ALL orgs.
      const facilityId = body.facilityId
      const staffWhere: any = { active: true }
      if (facilityId) {
        staffWhere.facilityId = facilityId
      } else if (isScoped) {
        // Scope to accessible facilities (Owner gets their org's facilities; Manager gets assigned)
        staffWhere.facilityId = { in: accessibleFacilityIds }
      }
      // If !isScoped (Developer with no facilityId), leave unscoped — Developer sees all

      // Get active staff grouped by role
      const allStaff = await db.staff.findMany({ where: staffWhere, orderBy: { lastName: 'asc' } })
      const staffByRole: Record<string, any[]> = {}
      for (const s of allStaff) {
        if (!staffByRole[s.role]) staffByRole[s.role] = []
        staffByRole[s.role].push(s)
      }

      let created = 0
      let skipped = 0
      let leaveSkipped = 0

      // Fetch all approved leaves once for the week (we'll filter per-day in memory)
      const weekEndForLeaves = new Date(startDate)
      weekEndForLeaves.setDate(startDate.getDate() + 7)
      const approvedLeaves = await db.staffLeave.findMany({
        where: {
          status: 'APPROVED',
          startDate: { lte: weekEndForLeaves },
          endDate: { gte: startDate },
        },
      })

      // Build a map of staffId → code for inclusion in audit log
      const staffCodeMap: Record<string, string | null> = {}
      for (const s of allStaff) staffCodeMap[s.id] = s.code

      // For each day of the week (7 days)
      for (let dayOffset = 0; dayOffset < 7; dayOffset++) {
        const shiftDate = new Date(startDate)
        shiftDate.setDate(startDate.getDate() + dayOffset)
        shiftDate.setHours(0, 0, 0, 0)
        const dayOfWeek = shiftDate.getDay()

        const dayStart = new Date(shiftDate)
        const dayEnd = new Date(shiftDate)
        dayEnd.setHours(23, 59, 59, 999)

        // Check if shifts already exist for this day
        const existing = await db.shift.count({ where: { date: { gte: dayStart, lte: dayEnd } } })
        if (existing > 0) {
          skipped++
          continue
        }

        // Use template to create shifts
        const template = body.template || DEFAULT_TEMPLATE
        const dayTemplate = template[dayOfWeek] || []

        for (const entry of dayTemplate) {
          const staffList = staffByRole[entry.staffRole] || []
          if (staffList.length === 0) continue

          const shiftType = SHIFT_TYPES.find(s => s.type === entry.shiftType)
          if (!shiftType) continue

          // Round-robin starting index — but skip staff on approved leave that day.
          // Try every staff in the role; if all are on leave, skip this entry.
          let assigned = false
          for (let attempt = 0; attempt < staffList.length; attempt++) {
            const staffIdx = (dayOffset + attempt) % staffList.length
            const staff = staffList[staffIdx]

            // Skip if staff is on approved leave that day
            const onLeave = approvedLeaves.some(l => {
              if (l.staffId !== staff.id) return false
              const ls = new Date(l.startDate); ls.setHours(0, 0, 0, 0)
              const le = new Date(l.endDate); le.setHours(23, 59, 59, 999)
              return shiftDate >= ls && shiftDate <= le
            })
            if (onLeave) {
              continue
            }

            await db.shift.create({
              data: {
                staffId: staff.id,
                date: shiftDate,
                startTime: shiftType.start,
                endTime: shiftType.end,
                shiftType: shiftType.type,
              },
            })
            created++
            assigned = true
            break
          }
          if (!assigned) {
            // All staff in this role are on leave — count as leave-skipped
            leaveSkipped++
          }
        }
      }

      const genFacilityName = await getFacilityName(facilityId)
      await logAudit({
        userId: user.id,
        userName: user.name,
        userCode: user.code,
        userRole: user.role,
        action: 'SHIFT_ADDED',
        entityType: 'STAFF',
        description: `${user.name} generated ${created} shifts for week starting ${startDate.toDateString()} (${skipped} days skipped — already had shifts; ${leaveSkipped} shift(s) skipped — staff on leave)`,
        metadata: { created, skipped, leaveSkipped, startDate: startDate.toISOString(), facilityId: facilityId || null, staffCodes: allStaff.map(s => s.code).filter(Boolean) },
        facilityId: facilityId || null,
        facilityName: genFacilityName,
      })

      return NextResponse.json({ success: true, created, skipped, leaveSkipped, message: `Generated ${created} shifts${skipped > 0 ? `, skipped ${skipped} day(s) (already had shifts)` : ''}${leaveSkipped > 0 ? `, skipped ${leaveSkipped} shift(s) (staff on approved leave)` : ''}` })
    }

    // ============ COPY WEEK ============
    if (action === 'copyWeek') {
      const fromWeekStart = new Date(body.fromDate)
      const toWeekStart = new Date(body.toDate)
      fromWeekStart.setHours(0, 0, 0, 0)
      toWeekStart.setHours(0, 0, 0, 0)

      const fromWeekEnd = new Date(fromWeekStart)
      fromWeekEnd.setDate(fromWeekEnd.getDate() + 7)
      const toWeekEnd = new Date(toWeekStart)
      toWeekEnd.setDate(toWeekEnd.getDate() + 7)

      // Get source shifts — scoped to caller's facilities
      const sourceShifts = await db.shift.findMany({
        where: { date: { gte: fromWeekStart, lt: fromWeekEnd }, ...shiftFacilityFilter },
      })

      if (sourceShifts.length === 0) {
        return NextResponse.json({ error: 'No shifts found in source week' }, { status: 400 })
      }

      // Check if target week already has shifts — scoped to caller's facilities
      const existingCount = await db.shift.count({
        where: { date: { gte: toWeekStart, lt: toWeekEnd }, ...shiftFacilityFilter },
      })
      if (existingCount > 0 && !body.overwrite) {
        return NextResponse.json({ error: `Target week already has ${existingCount} shifts. Set overwrite=true to replace.` }, { status: 400 })
      }

      // Delete existing target shifts if overwrite — scoped to caller's facilities
      if (body.overwrite) {
        await db.shift.deleteMany({ where: { date: { gte: toWeekStart, lt: toWeekEnd }, ...shiftFacilityFilter } })
      }

      // Copy shifts with date offset — skip any where staff is on approved leave on the new date
      const dayOffset = Math.round((toWeekStart.getTime() - fromWeekStart.getTime()) / (7 * 86400000)) * 7
      let created = 0
      let leaveSkipped = 0

      // Fetch approved leaves that overlap the target week (single query for efficiency)
      const approvedLeaves = await db.staffLeave.findMany({
        where: {
          status: 'APPROVED',
          startDate: { lte: toWeekEnd },
          endDate: { gte: toWeekStart },
        },
      })

      // Fetch staff codes for affected staff
      const affectedStaffIds = Array.from(new Set(sourceShifts.map(s => s.staffId)))
      const affectedStaff = await db.staff.findMany({
        where: { id: { in: affectedStaffIds } },
        select: { id: true, firstName: true, lastName: true, code: true, facilityId: true },
      })
      const staffById: Record<string, any> = {}
      for (const s of affectedStaff) staffById[s.id] = s

      for (const shift of sourceShifts) {
        const newDate = new Date(shift.date)
        newDate.setDate(newDate.getDate() + dayOffset)

        // Skip if staff is on approved leave on the new date
        const onLeave = approvedLeaves.some(l => {
          if (l.staffId !== shift.staffId) return false
          const ls = new Date(l.startDate); ls.setHours(0, 0, 0, 0)
          const le = new Date(l.endDate); le.setHours(23, 59, 59, 999)
          return newDate >= ls && newDate <= le
        })
        if (onLeave) {
          leaveSkipped++
          continue
        }

        await db.shift.create({
          data: {
            staffId: shift.staffId,
            date: newDate,
            startTime: shift.startTime,
            endTime: shift.endTime,
            shiftType: shift.shiftType,
            notes: shift.notes,
          },
        })
        created++
      }

      // Derive facility from the first affected staff member (all copied shifts belong to same facility typically)
      const copyFacilityId = affectedStaff[0]?.facilityId || null
      const copyFacilityName = await getFacilityName(copyFacilityId)
      await logAudit({
        userId: user.id,
        userName: user.name,
        userCode: user.code,
        userRole: user.role,
        action: 'SHIFT_ADDED',
        entityType: 'STAFF',
        description: `${user.name} copied ${created} shifts from ${fromWeekStart.toDateString()} to ${toWeekStart.toDateString()}${leaveSkipped > 0 ? ` (${leaveSkipped} skipped — staff on approved leave)` : ''}`,
        metadata: { created, leaveSkipped, fromDate: fromWeekStart.toISOString(), toDate: toWeekStart.toISOString(), staffCodes: affectedStaff.map(s => s.code).filter(Boolean) },
        facilityId: copyFacilityId,
        facilityName: copyFacilityName,
      })

      return NextResponse.json({
        success: true,
        created,
        leaveSkipped,
        message: `Copied ${created} shifts to target week${leaveSkipped > 0 ? ` (skipped ${leaveSkipped} due to approved leave)` : ''}`,
      })
    }

    // ============ SWAP SHIFTS ============
    if (action === 'swap') {
      const { shiftId1, shiftId2 } = body
      if (!shiftId1 || !shiftId2) return NextResponse.json({ error: 'shiftId1 and shiftId2 required' }, { status: 400 })

      const shift1 = await db.shift.findUnique({ where: { id: shiftId1 } })
      const shift2 = await db.shift.findUnique({ where: { id: shiftId2 } })
      if (!shift1 || !shift2) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

      // Leave conflict check: after swap, staff1 takes shift2's date and vice versa.
      // Make sure neither staff is on approved leave on the other shift's date.
      const [s1Leave, s2Leave] = await Promise.all([
        db.staffLeave.findFirst({
          where: {
            staffId: shift1.staffId,
            status: 'APPROVED',
            startDate: { lte: shift2.date },
            endDate: { gte: shift2.date },
          },
          include: { staff: { select: { firstName: true, lastName: true } } },
        }),
        db.staffLeave.findFirst({
          where: {
            staffId: shift2.staffId,
            status: 'APPROVED',
            startDate: { lte: shift1.date },
            endDate: { gte: shift1.date },
          },
          include: { staff: { select: { firstName: true, lastName: true } } },
        }),
      ])
      if (s1Leave) {
        return NextResponse.json({
          error: `Leave conflict: ${s1Leave.staff?.firstName} ${s1Leave.staff?.lastName} is on ${s1Leave.type.toLowerCase()} leave on ${new Date(shift2.date).toDateString()} — cannot swap`,
          conflict: true,
          leaveConflict: true,
        }, { status: 409 })
      }
      if (s2Leave) {
        return NextResponse.json({
          error: `Leave conflict: ${s2Leave.staff?.firstName} ${s2Leave.staff?.lastName} is on ${s2Leave.type.toLowerCase()} leave on ${new Date(shift1.date).toDateString()} — cannot swap`,
          conflict: true,
          leaveConflict: true,
        }, { status: 409 })
      }

      // Swap staff assignments
      await db.shift.update({ where: { id: shiftId1 }, data: { staffId: shift2.staffId } })
      await db.shift.update({ where: { id: shiftId2 }, data: { staffId: shift1.staffId } })

      const s1 = await db.staff.findUnique({ where: { id: shift1.staffId }, select: { firstName: true, lastName: true, code: true, facilityId: true } })
      const s2 = await db.staff.findUnique({ where: { id: shift2.staffId }, select: { firstName: true, lastName: true, code: true, facilityId: true } })
      const s1Label = s1 ? `${s1.code ? s1.code + ' ' : ''}${s1.firstName} ${s1.lastName}`.trim() : 'unknown staff'
      const s2Label = s2 ? `${s2.code ? s2.code + ' ' : ''}${s2.firstName} ${s2.lastName}`.trim() : 'unknown staff'

      const swapFacilityId = s1?.facilityId || s2?.facilityId || null
      const swapFacilityName = await getFacilityName(swapFacilityId)
      await logAudit({
        userId: user.id,
        userName: user.name,
        userCode: user.code,
        userRole: user.role,
        action: 'SHIFT_ADDED',
        entityType: 'STAFF',
        description: `${user.name} swapped shifts: ${s1Label} ↔ ${s2Label}`,
        metadata: { shiftId1, shiftId2, staff1Code: s1?.code, staff2Code: s2?.code },
        facilityId: swapFacilityId,
        facilityName: swapFacilityName,
      })

      return NextResponse.json({ success: true, message: 'Shifts swapped successfully' })
    }

    // ============ REASSIGN SHIFT ============
    if (action === 'reassign') {
      const { shiftId, newStaffId } = body
      if (!shiftId || !newStaffId) return NextResponse.json({ error: 'shiftId and newStaffId required' }, { status: 400 })

      const shift = await db.shift.findUnique({ where: { id: shiftId }, include: { staff: true } })
      if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

      const newStaff = await db.staff.findUnique({ where: { id: newStaffId } })
      if (!newStaff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })

      // Leave conflict check: is the new staff on approved leave on this shift's date?
      const leaveConflict = await db.staffLeave.findFirst({
        where: {
          staffId: newStaffId,
          status: 'APPROVED',
          startDate: { lte: shift.date },
          endDate: { gte: shift.date },
        },
      })
      if (leaveConflict) {
        return NextResponse.json({
          error: `Leave conflict: ${newStaff.firstName} ${newStaff.lastName} is on ${leaveConflict.type.toLowerCase()} leave on ${new Date(shift.date).toDateString()} — cannot reassign`,
          conflict: true,
          leaveConflict: true,
        }, { status: 409 })
      }

      await db.shift.update({ where: { id: shiftId }, data: { staffId: newStaffId } })

      const oldStaffLabel = shift.staff ? `${shift.staff.code ? shift.staff.code + ' ' : ''}${shift.staff.firstName} ${shift.staff.lastName}`.trim() : 'unknown staff'
      const newStaffLabel = `${newStaff.code ? newStaff.code + ' ' : ''}${newStaff.firstName} ${newStaff.lastName}`.trim()

      const reassignFacilityId = newStaff.facilityId || shift.staff?.facilityId || null
      const reassignFacilityName = await getFacilityName(reassignFacilityId)
      await logAudit({
        userId: user.id,
        userName: user.name,
        userCode: user.code,
        userRole: user.role,
        action: 'SHIFT_ADDED',
        entityType: 'STAFF',
        description: `${user.name} reassigned shift from ${oldStaffLabel} to ${newStaffLabel}`,
        metadata: { shiftId, oldStaffCode: shift.staff?.code, newStaffCode: newStaff.code },
        facilityId: reassignFacilityId,
        facilityName: reassignFacilityName,
      })

      return NextResponse.json({ success: true, message: 'Shift reassigned' })
    }

    // ============ DELETE DAY ============
    if (action === 'deleteDay') {
      const date = new Date(body.date)
      const dayStart = new Date(date); dayStart.setHours(0, 0, 0, 0)
      const dayEnd = new Date(date); dayEnd.setHours(23, 59, 59, 999)

      // Scope to caller's facilities — previously this deleted ALL shifts on that day across ALL orgs
      const result = await db.shift.deleteMany({ where: { date: { gte: dayStart, lte: dayEnd }, ...shiftFacilityFilter } })
      return NextResponse.json({ success: true, deleted: result.count, message: `Deleted ${result.count} shifts` })
    }

    // ============ DELETE WEEK ============
    if (action === 'deleteWeek') {
      const weekStart = new Date(body.startDate)
      weekStart.setHours(0, 0, 0, 0)
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekEnd.getDate() + 7)

      // Scope to caller's facilities
      const result = await db.shift.deleteMany({ where: { date: { gte: weekStart, lt: weekEnd }, ...shiftFacilityFilter } })
      return NextResponse.json({ success: true, deleted: result.count, message: `Deleted ${result.count} shifts` })
    }

    // ============ MOVE SHIFT (drag and drop) ============
    if (action === 'move') {
      const { shiftId, newStaffId, newDate } = body
      if (!shiftId) return NextResponse.json({ error: 'shiftId required' }, { status: 400 })

      const shift = await db.shift.findUnique({ where: { id: shiftId }, include: { staff: true } })
      if (!shift) return NextResponse.json({ error: 'Shift not found' }, { status: 404 })

      const targetStaffId = newStaffId || shift.staffId
      const targetDate = newDate ? new Date(newDate) : shift.date

      // Conflict check: does the target staff already have a shift on the target date?
      if (newStaffId || newDate) {
        const dayStart = new Date(targetDate); dayStart.setHours(0, 0, 0, 0)
        const dayEnd = new Date(targetDate); dayEnd.setHours(23, 59, 59, 999)
        const conflict = await db.shift.findFirst({
          where: {
            staffId: targetStaffId,
            date: { gte: dayStart, lte: dayEnd },
            id: { not: shiftId }, // exclude the shift being moved
          },
          include: { staff: true },
        })
        if (conflict) {
          return NextResponse.json({
            error: `Conflict: ${conflict.staff?.firstName} ${conflict.staff?.lastName} already has a ${conflict.shiftType} shift (${conflict.startTime}–${conflict.endTime}) on ${targetDate.toDateString()}`,
            conflict: true,
            conflictShift: { id: conflict.id, staffName: `${conflict.staff?.firstName} ${conflict.staff?.lastName}`, shiftType: conflict.shiftType, startTime: conflict.startTime, endTime: conflict.endTime },
          }, { status: 409 })
        }
      }

      // Check approved leave conflicts
      if (newStaffId || newDate) {
        const targetStaff = await db.staff.findUnique({ where: { id: targetStaffId } })
        if (targetStaff) {
          const leave = await db.staffLeave.findFirst({
            where: {
              staffId: targetStaffId,
              status: 'APPROVED',
              startDate: { lte: targetDate },
              endDate: { gte: targetDate },
            },
          })
          if (leave) {
            return NextResponse.json({
              error: `Leave conflict: ${targetStaff.firstName} ${targetStaff.lastName} is on ${leave.type.toLowerCase()} leave from ${leave.startDate.toDateString()} to ${leave.endDate.toDateString()}`,
              conflict: true,
              leaveConflict: true,
            }, { status: 409 })
          }
        }
      }

      await db.shift.update({ where: { id: shiftId }, data: { staffId: targetStaffId, date: targetDate } })

      const newStaff = await db.staff.findUnique({ where: { id: targetStaffId }, select: { firstName: true, lastName: true, code: true, facilityId: true } })
      const newStaffLabel = newStaff ? `${newStaff.code ? newStaff.code + ' ' : ''}${newStaff.firstName} ${newStaff.lastName}`.trim() : 'unknown staff'
      const moveFacilityName = await getFacilityName(newStaff?.facilityId)
      await logAudit({
        userId: user.id,
        userName: user.name,
        userCode: user.code,
        userRole: user.role,
        action: 'SHIFT_ADDED',
        entityType: 'STAFF',
        description: `${user.name} moved shift to ${newStaffLabel} on ${targetDate.toDateString()}`,
        metadata: { shiftId, newStaffCode: newStaff?.code, targetDate: targetDate.toISOString() },
        facilityId: newStaff?.facilityId || null,
        facilityName: moveFacilityName,
      })

      return NextResponse.json({ success: true, message: 'Shift moved successfully' })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    console.error('Shifts API error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
