import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser, resolveAccessibleFacilityIds, canAccessFacility } from '@/lib/auth'
import { logAudit, AUDIT_ACTIONS, getFacilityFromResident, getFacilityFromStaff, getFacilityFromRoom, getFacilityName } from '@/lib/audit'
import { generateResidentCode, generateProductCode, generateStaffCode, generateRoomCode, generateInventoryCode, generatePaymentCode, generateInvoiceNumber } from '@/lib/codes'
import { autoPostInvoice, autoPostExpense, autoPostPayment, autoPostDeposit, autoPostPurchaseOrder, autoPostPayroll, seedChartOfAccounts, generateVendorCode, generateBankAccountCode, generateDepositCode, generatePurchaseOrderCode, generateStockTransferCode, postJournalEntry, generateJournalEntryNumber } from '@/lib/accounting'

// Helper: marks a stock transfer as RECEIVED. For each line:
//   1. Find (or auto-create) a matching destination InventoryItem by name + unit
//      within the destination facility.
//   2. Create a TRANSFER_IN InventoryTransaction on the destination item.
//   3. Increment destination item's currentStock + update unitCost (to source's cost).
//   4. Stamp the line's receivedQty + destinationItemId.
//   5. Update transfer.status = 'RECEIVED', receivedDate = now.
//
// Source stock was already decremented when the transfer moved to IN_TRANSIT
// (or when RECEIVED was set at creation — see POST handler). This helper only
// handles the "receive" half of the move.
async function receiveStockTransfer(transfer: any, currentUser: any) {
  const toFacility = await db.facility.findUnique({ where: { id: transfer.toFacilityId }, select: { name: true } })
  const fromFacility = await db.facility.findUnique({ where: { id: transfer.fromFacilityId }, select: { name: true } })
  for (const line of transfer.lines) {
    // Match destination InventoryItem by (in priority order):
    //   1. line.itemId — if the source item exists in the destination facility (cross-facility item ID link)
    //   2. line.itemSku — same SKU within the destination facility (most reliable for shared catalogues)
    //   3. line.itemName + unit — last-resort name match (case-insensitive)
    // Previously this matched ONLY by name, which created duplicates when names differed by case or when
    // multiple items shared a name. SKU is the canonical product identifier.
    let destItem: any = null
    // 1. Try by source itemId (only useful if the destination facility happens to share the same item ID — rare)
    if (line.itemId) {
      destItem = await db.inventoryItem.findFirst({
        where: { id: line.itemId, facilityId: transfer.toFacilityId },
      })
    }
    // 2. Try by SKU within the destination facility
    if (!destItem && line.itemSku) {
      destItem = await db.inventoryItem.findFirst({
        where: { sku: line.itemSku, facilityId: transfer.toFacilityId },
      })
    }
    // 3. Last resort: match by name (case-insensitive) within the destination facility
    if (!destItem && line.itemName) {
      destItem = await db.inventoryItem.findFirst({
        where: {
          facilityId: transfer.toFacilityId,
          name: { equals: line.itemName, mode: 'insensitive' },
        },
      })
    }
    // If still not found, auto-create it using the snapshot data from the transfer line
    if (!destItem) {
      const destCode = await generateInventoryCode(transfer.toFacilityId)
      destItem = await db.inventoryItem.create({
        data: {
          code: destCode,
          facilityId: transfer.toFacilityId,
          name: line.itemName,
          sku: line.itemSku || null,
          category: line.itemCategory || 'OTHER',
          unit: line.itemUnit || 'each',
          currentStock: 0,  // will be incremented below
          reorderLevel: 10,
          reorderQty: 50,
          unitCost: line.itemUnitCost || 0,
          supplier: `Transferred from ${fromFacility?.name || 'another facility'}`,
          active: true,
          lastCountDate: new Date(),
        },
      })
    }
    // TRANSFER_IN transaction on destination item
    await db.inventoryTransaction.create({
      data: {
        itemId: destItem.id,
        type: 'TRANSFER_IN',
        quantity: line.quantity,  // positive for in
        reason: `Transfer ${transfer.transferNumber} ← ${fromFacility?.name || 'source facility'}`,
        date: new Date(),
        recordedBy: currentUser.name,
        recordedById: currentUser.id,
        stockTransferId: transfer.id,
      },
    })
    // Increment destination stock + update unitCost
    await db.inventoryItem.update({
      where: { id: destItem.id },
      data: {
        currentStock: { increment: line.quantity },
        lastCountDate: new Date(),
        unitCost: line.itemUnitCost > 0 ? line.itemUnitCost : undefined,
      },
    })
    // Stamp the line
    await db.stockTransferLine.update({
      where: { id: line.id },
      data: { receivedQty: line.quantity, destinationItemId: destItem.id },
    })
  }
  await db.stockTransfer.update({
    where: { id: transfer.id },
    data: { status: 'RECEIVED', receivedDate: new Date() },
  })
}

// Helper: looks up the facilityId for a record by type + id.
// Used by PATCH/DELETE handlers to enforce facility-level data isolation.
//
// Returns:
//   - The facilityId string if found
//   - null if the record exists but has no facilityId (e.g., global records)
//   - undefined if the record doesn't exist or the type is unknown
//
// Pattern: for child tables (e.g., medications), look up via the parent
// relation (resident.facilityId). For facility-direct tables (invoices,
// expenses), read facilityId directly.
async function getRecordFacilityId(type: string, id: string): Promise<string | null | undefined> {
  try {
    switch (type) {
      // Direct facilityId fields
      case 'residents':
        return (await db.resident.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'rooms':
        return (await db.room.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'staff':
        return (await db.staff.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'invoices':
        return (await db.invoice.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'expenses':
        return (await db.expense.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'payments':
        return (await db.payment.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'products':
        return (await db.product.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'inventory':
        return (await db.inventoryItem.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'vendors':
        return (await db.vendor.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'bankAccounts':
        return (await db.bankAccount.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'deposits':
        return (await db.deposit.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'accounts':
        return (await db.account.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'journalEntries':
        return (await db.journalEntry.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      case 'purchaseOrders':
        return (await db.purchaseOrder.findUnique({ where: { id }, select: { facilityId: true } }))?.facilityId
      // Indirect via resident
      case 'medications':
        return (await db.medication.findUnique({ where: { id }, select: { resident: { select: { facilityId: true } } } }))?.resident?.facilityId
      case 'medAdmins':
        return (await db.medAdministration.findUnique({ where: { id }, select: { resident: { select: { facilityId: true } } } }))?.resident?.facilityId
      case 'vitals':
        return (await db.vitalSign.findUnique({ where: { id }, select: { resident: { select: { facilityId: true } } } }))?.resident?.facilityId
      case 'visits':
        return (await db.visit.findUnique({ where: { id }, select: { resident: { select: { facilityId: true } } } }))?.resident?.facilityId
      case 'incidents':
        return (await db.incidentReport.findUnique({ where: { id }, select: { resident: { select: { facilityId: true } } } }))?.resident?.facilityId
      case 'invoiceItems':
        return (await db.invoiceItem.findUnique({ where: { id }, select: { resident: { select: { facilityId: true } } } }))?.resident?.facilityId
      case 'messages':
        return (await db.familyMessage.findUnique({ where: { id }, select: { resident: { select: { facilityId: true } } } }))?.resident?.facilityId
      // Indirect via staff
      case 'shifts':
        return (await db.shift.findUnique({ where: { id }, select: { staff: { select: { facilityId: true } } } }))?.staff?.facilityId
      case 'leaves':
        return (await db.staffLeave.findUnique({ where: { id }, select: { staff: { select: { facilityId: true } } } }))?.staff?.facilityId
      // Indirect via item
      case 'inventoryTransactions':
        return (await db.inventoryTransaction.findUnique({ where: { id }, select: { item: { select: { facilityId: true } } } }))?.item?.facilityId
      // Stock transfers — use fromFacilityId (the source)
      case 'stockTransfers':
        return (await db.stockTransfer.findUnique({ where: { id }, select: { fromFacilityId: true } }))?.fromFacilityId
      default:
        return undefined
    }
  } catch {
    return undefined
  }
}

// GET /api/data?type=residents
// GET /api/data?type=residents&id=xxx  (single resident with all related)
// GET /api/data?type=rooms
// GET /api/data?type=staff
// GET /api/data?type=medications&residentId=xxx
// GET /api/data?type=vitals&residentId=xxx
// GET /api/data?type=visits&residentId=xxx&upcoming=true
// GET /api/data?type=incidents&residentId=xxx
// GET /api/data?type=careLogs&residentId=xxx
// GET /api/data?type=messages&residentId=xxx
// GET /api/data?type=invoiceItems&unbilled=true
// GET /api/data?type=shifts&date=YYYY-MM-DD

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || ''
  const id = searchParams.get('id')
  const residentId = searchParams.get('residentId')
  const upcoming = searchParams.get('upcoming') === 'true'
  const unbilled = searchParams.get('unbilled') === 'true'
  const date = searchParams.get('date')
  const facilityId = searchParams.get('facilityId') // selected facility from frontend

  // Auth check — all data access requires login
  const currentUser = await getSessionUser(req)
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Determine which facility IDs the user can access.
  // Hierarchy:
  //   - APP_DEVELOPER (L0): sees ALL facilities across ALL organizations (no scope)
  //   - OWNER (L1): sees only facilities in their OWN organization
  //   - MANAGER (L2) and below: sees only their assigned facilities
  let accessibleFacilityIds: string[] = []
  if (currentUser.role === 'APP_DEVELOPER') {
    // Developer: no scope — sees everything
    if (facilityId) accessibleFacilityIds = [facilityId]
  } else if (currentUser.level === 1) {
    // Owner: scoped to their organization's facilities
    if (!currentUser.organizationId) {
      // Owner without org → sees nothing (data isolation safeguard)
      accessibleFacilityIds = ['__NO_ORG__'] // impossible ID → returns no rows
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
    // Non-owner: only their assigned facilities
    const userFacilityIds = (currentUser.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
    if (facilityId && userFacilityIds.includes(facilityId)) {
      accessibleFacilityIds = [facilityId]
    } else {
      accessibleFacilityIds = userFacilityIds
    }
  }

  // Helper: build facility filters for queries
  // Different models need different filter strategies based on how they relate to Facility:
  //   - Direct facilityId          → residents, rooms, staff, expenses, products, inventory, invoices
  //   - Via resident.facilityId    → medications, medAdmins, vitals, visits, incidents, careLogs, messages, invoiceItems
  //   - Via staff.facilityId       → shifts
  //   - Via item.facilityId        → inventoryTransactions
  //   - No facility link           → auditLogs (now facility-scoped, see auditLogs case below)
  //
  const hasFacilityScope = accessibleFacilityIds.length > 0
  const facilityFilter = hasFacilityScope ? { facilityId: { in: accessibleFacilityIds } } : {}
  const residentFacilityFilter = hasFacilityScope ? { resident: { facilityId: { in: accessibleFacilityIds } } } : {}
  const staffFacilityFilter = hasFacilityScope ? { staff: { facilityId: { in: accessibleFacilityIds } } } : {}
  const itemFacilityFilter = hasFacilityScope ? { item: { facilityId: { in: accessibleFacilityIds } } } : {}
  // For users: facilityIds is a comma-separated string. Filter where the comma-separated list contains any of the accessible facility IDs.
  // SQLite doesn't have native array operations, so we use contains for each ID. This is approximate but works for Owner's single-facility view.
  const userFacilityFilter = hasFacilityScope
    ? { OR: accessibleFacilityIds.flatMap(fid => [
        { facilityIds: { contains: fid } },
        { level: 1, role: 'OWNER' as any }, // Owner always visible (Owner sees all facilities)
      ]) }
    : {}

  // For FAMILY role, restrict to linked residents only
  const linkedResidentIds: string[] = currentUser.role === 'FAMILY'
    ? (currentUser.linkedResidentIds || '').split(',').map(s => s.trim()).filter(Boolean)
    : []

  try {
    // FAMILY role: block access to sensitive data types that they should never see directly.
    // NOTE: incidents, careLogs, and visits are ALLOWED for family users — they are scoped
    // to their linked residents via the `linkedResidentIds` filter in each case handler.
    if (currentUser.role === 'FAMILY') {
      const blockedTypes = ['rooms', 'staff', 'medications', 'medAdmins', 'invoices', 'invoiceItems', 'expenses', 'payments', 'paymentApplications', 'deposits', 'accounts', 'journalEntries', 'vendors', 'bankAccounts', 'shifts', 'users', 'products', 'inventory', 'inventoryTransactions', 'finance']
      if (blockedTypes.includes(type)) {
        return NextResponse.json({ error: 'Access denied for your role' }, { status: 403 })
      }
      // incidents, careLogs, visits, messages are allowed — each handler restricts to linkedResidentIds
    }

    switch (type) {
      case 'residents': {
        // FAMILY users can only see their linked residents
        if (currentUser.role === 'FAMILY') {
          if (id) {
            // Verify this resident is linked to this family user
            if (!linkedResidentIds.includes(id)) {
              return NextResponse.json({ error: 'Access denied' }, { status: 403 })
            }
          }
          // Include the same relations as the staff query so the family user sees
          // incidents, care logs, visits, vitals, and med administrations in the resident detail view.
          // (Billing/financial relations like invoiceItems are intentionally excluded for family.)
          const list = await db.resident.findMany({
            where: { id: { in: linkedResidentIds }, status: 'ACTIVE' },
            include: {
              room: true,
              medications: { where: { active: true }, orderBy: { name: 'asc' } },
              vitals: { orderBy: { recordedAt: 'desc' }, take: 30 },
              careLogs: { orderBy: { recordedAt: 'desc' }, take: 30, include: { staff: true } },
              visits: { orderBy: { scheduledAt: 'desc' }, take: 20, include: { staff: true } },
              incidents: { orderBy: { occurredAt: 'desc' }, take: 10, include: { reportedBy: true } },
              medAdmins: { orderBy: { scheduledAt: 'desc' }, take: 30, include: { medication: true, staff: true } },
            },
            orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
          })
          if (id) {
            const r = list.find(x => x.id === id)
            if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
            return NextResponse.json(r)
          }
          return NextResponse.json(list)
        }

        if (id) {
          const r = await db.resident.findUnique({
            where: { id },
            include: {
              room: true,
              medications: { where: { active: true }, orderBy: { name: 'asc' } },
              vitals: { orderBy: { recordedAt: 'desc' }, take: 30 },
              careLogs: { orderBy: { recordedAt: 'desc' }, take: 30, include: { staff: true } },
              visits: { orderBy: { scheduledAt: 'desc' }, take: 20, include: { staff: true } },
              incidents: { orderBy: { occurredAt: 'desc' }, take: 10, include: { reportedBy: true } },
              medAdmins: { orderBy: { scheduledAt: 'desc' }, take: 30, include: { medication: true, staff: true } },
              invoiceItems: { where: { billed: false }, orderBy: { createdAt: 'desc' } },
            },
          })
          if (!r) return NextResponse.json({ error: 'Not found' }, { status: 404 })
          return NextResponse.json(r)
        }
        const includeArchived = searchParams.get('includeArchived') === 'true'
        const statusFilter = searchParams.get('status') // ACTIVE, DISCHARGED, etc.
        const where: any = { ...facilityFilter }
        if (statusFilter) {
          where.status = statusFilter
        } else if (!includeArchived) {
          where.status = 'ACTIVE'
        }
        const list = await db.resident.findMany({
          where,
          include: { room: true },
          orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
        })
        return NextResponse.json(list)
      }

      case 'rooms': {
        // Apply facility filter — previously this returned ALL rooms across ALL orgs
        const rooms = await db.room.findMany({
          where: facilityFilter,
          include: {
            residents: { where: { status: 'ACTIVE' } },
            beds: { orderBy: { code: 'asc' } },
          },
          orderBy: { roomNumber: 'asc' },
        })
        return NextResponse.json(rooms)
      }

      case 'staff': {
        const includeArchived = searchParams.get('includeArchived') === 'true'
        // Multi-facility match: staff may be assigned via facilityId (primary) OR via the
        // comma-separated facilityIds field (multi-facility assignment).
        const where: any = hasFacilityScope
          ? { OR: [
              { facilityId: { in: accessibleFacilityIds } },
              ...accessibleFacilityIds.flatMap(fid => [{ facilityIds: { contains: fid } }]),
            ] }
          : {}
        if (!includeArchived) where.active = true
        const staff = await db.staff.findMany({
          where,
          include: { _count: { select: { shifts: true, visits: true } } },
          orderBy: [{ role: 'asc' }, { lastName: 'asc' }],
        })
        return NextResponse.json(staff)
      }

      case 'medications': {
        const where: any = { ...residentFacilityFilter }
        if (residentId) where.residentId = residentId
        if (searchParams.get('active') !== 'false') where.active = true
        const meds = await db.medication.findMany({
          where,
          include: { resident: { include: { room: true } } },
          orderBy: { name: 'asc' },
        })
        return NextResponse.json(meds)
      }

      case 'medAdmins': {
        const where: any = { ...residentFacilityFilter }
        if (residentId) where.residentId = residentId
        if (searchParams.get('today') === 'true') {
          const start = new Date(); start.setHours(0, 0, 0, 0)
          const end = new Date(); end.setHours(23, 59, 59, 999)
          where.scheduledAt = { gte: start, lte: end }
        } else {
          // Generic date-range filter (yyyy-MM-dd, inclusive on both ends).
          // Server-side; reduces payload when users pick a preset like Last 7 / This month.
          const startDate = searchParams.get('startDate')
          const endDate = searchParams.get('endDate')
          if (startDate || endDate) {
            where.scheduledAt = {}
            if (startDate) {
              const s = new Date(startDate); s.setHours(0, 0, 0, 0)
              where.scheduledAt.gte = s
            }
            if (endDate) {
              const e = new Date(endDate); e.setHours(23, 59, 59, 999)
              where.scheduledAt.lte = e
            }
          }
        }
        const status = searchParams.get('status')
        if (status) where.status = status
        const admins = await db.medAdministration.findMany({
          where,
          include: { medication: true, resident: { include: { room: true } }, staff: true },
          orderBy: { scheduledAt: 'desc' },
          take: 500,
        })
        return NextResponse.json(admins)
      }

      case 'vitals': {
        const where: any = { ...residentFacilityFilter }
        if (residentId) where.residentId = residentId
        // FAMILY users: restrict to their linked residents only
        if (currentUser.role === 'FAMILY') {
          if (linkedResidentIds.length === 0) return NextResponse.json([])
          where.residentId = { in: linkedResidentIds }
        }
        // Date-range filter (yyyy-MM-dd, inclusive on both ends)
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')
        if (startDate || endDate) {
          where.recordedAt = {}
          if (startDate) {
            const s = new Date(startDate); s.setHours(0, 0, 0, 0)
            where.recordedAt.gte = s
          }
          if (endDate) {
            const e = new Date(endDate); e.setHours(23, 59, 59, 999)
            where.recordedAt.lte = e
          }
        }
        const vitals = await db.vitalSign.findMany({
          where,
          include: { resident: { include: { room: true } } },
          orderBy: { recordedAt: 'desc' },
          take: residentId ? 200 : 500,
        })
        return NextResponse.json(vitals)
      }

      case 'visits': {
        const where: any = { ...residentFacilityFilter }
        if (residentId) where.residentId = residentId
        // FAMILY users can only see visits for their linked residents
        if (currentUser.role === 'FAMILY') {
          if (linkedResidentIds.length === 0) return NextResponse.json([])
          where.residentId = { in: linkedResidentIds }
        }
        if (upcoming) {
          where.scheduledAt = { gte: new Date() }
          where.status = 'SCHEDULED'
        } else {
          // Past visits: exclude SCHEDULED (only show COMPLETED, CANCELLED, NO_SHOW)
          where.status = { not: 'SCHEDULED' }
        }
        const visits = await db.visit.findMany({
          where,
          include: { resident: { include: { room: true } }, staff: true },
          orderBy: { scheduledAt: upcoming ? 'asc' : 'desc' },
          take: 100,
        })
        return NextResponse.json(visits)
      }

      case 'incidents': {
        const where: any = { ...residentFacilityFilter }
        if (residentId) where.residentId = residentId
        // FAMILY users: restrict to their linked residents only
        if (currentUser.role === 'FAMILY') {
          if (linkedResidentIds.length === 0) return NextResponse.json([])
          where.residentId = { in: linkedResidentIds }
        }
        const incidents = await db.incidentReport.findMany({
          where,
          include: { resident: { include: { room: true } }, reportedBy: true },
          orderBy: { occurredAt: 'desc' },
          take: 100,
        })
        return NextResponse.json(incidents)
      }

      case 'careLogs': {
        const where: any = { ...residentFacilityFilter }
        if (residentId) where.residentId = residentId
        // FAMILY users: restrict to their linked residents only
        if (currentUser.role === 'FAMILY') {
          if (linkedResidentIds.length === 0) return NextResponse.json([])
          where.residentId = { in: linkedResidentIds }
        }
        const logs = await db.careLog.findMany({
          where,
          include: { resident: { include: { room: true } }, staff: true },
          orderBy: { recordedAt: 'desc' },
          take: 100,
        })
        return NextResponse.json(logs)
      }

      case 'messages': {
        const where: any = { ...residentFacilityFilter }
        if (residentId) where.residentId = residentId
        // FAMILY users can only see messages for their linked residents
        if (currentUser.role === 'FAMILY') {
          if (linkedResidentIds.length === 0) {
            return NextResponse.json([])
          }
          where.residentId = { in: linkedResidentIds }
        }
        const msgs = await db.familyMessage.findMany({
          where,
          include: { resident: { include: { room: true } }, sender: true },
          orderBy: { sentAt: 'desc' },
          take: 100,
        })
        return NextResponse.json(msgs)
      }

      case 'invoices': {
        // Single-invoice fetch: ?id=xxx returns one invoice with items + resident + room
        if (id) {
          const invoice = await db.invoice.findUnique({
            where: { id },
            include: {
              resident: { include: { room: true } },
              items: true,
              payments: { select: { id: true, paymentCode: true, amount: true, paymentDate: true, method: true, status: true } },
            },
          })
          if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
          // Facility ownership check — verify the invoice belongs to an accessible facility
          if (hasFacilityScope && invoice.facilityId && !accessibleFacilityIds.includes(invoice.facilityId)) {
            return NextResponse.json({ error: 'You do not have access to this invoice' }, { status: 403 })
          }
          return NextResponse.json(invoice)
        }
        const where: any = { ...facilityFilter }
        if (residentId) where.residentId = residentId
        const status = searchParams.get('status')
        if (status) where.status = status
        const invoices = await db.invoice.findMany({
          where,
          include: { resident: { include: { room: true } }, items: true },
          orderBy: { issueDate: 'desc' },
          take: 200,
        })
        return NextResponse.json(invoices)
      }

      case 'invoiceItems': {
        // InvoiceItems are tied to resident (which has facilityId) — filter via resident relation
        const where: any = { ...residentFacilityFilter }
        if (unbilled) where.billed = false
        if (residentId) where.residentId = residentId
        const items = await db.invoiceItem.findMany({
          where,
          include: { resident: { include: { room: true } }, invoice: true },
          orderBy: { serviceDate: 'desc' },
          take: 200,
        })
        return NextResponse.json(items)
      }

      case 'expenses': {
        const where: any = { ...facilityFilter }
        const category = searchParams.get('category')
        if (category) where.category = category
        const paidByStaffId = searchParams.get('paidByStaffId')
        if (paidByStaffId) where.paidByStaffId = paidByStaffId
        const vendorId = searchParams.get('vendorId')
        if (vendorId) where.vendorId = vendorId
        const reimbursementStatus = searchParams.get('reimbursementStatus')
        if (reimbursementStatus) where.reimbursementStatus = reimbursementStatus
        const expenses = await db.expense.findMany({
          where,
          orderBy: { date: 'desc' },
          take: 200,
          include: {
            vendor: { select: { id: true, code: true, name: true } },
            paidByStaff: { select: { id: true, code: true, firstName: true, lastName: true, role: true } },
          },
        })
        return NextResponse.json(expenses)
      }

      case 'shifts': {
        // Shifts are tied to staff (which has facilityId) — filter via staff relation
        const where: any = { ...staffFacilityFilter }
        if (date) {
          // When a date is passed, return shifts for the entire WEEK containing that date
          const d = new Date(date)
          const dayOfWeek = d.getDay()
          const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek // Monday as start of week
          const weekStart = new Date(d)
          weekStart.setDate(d.getDate() + diff)
          weekStart.setHours(0, 0, 0, 0)
          const weekEnd = new Date(weekStart)
          weekEnd.setDate(weekEnd.getDate() + 7)
          where.date = { gte: weekStart, lt: weekEnd }
        } else {
          // Default: today onwards (for next 14 days)
          const start = new Date(); start.setHours(0, 0, 0, 0)
          const end = new Date(); end.setDate(end.getDate() + 14)
          where.date = { gte: start, lt: end }
        }
        const staffId = searchParams.get('staffId')
        if (staffId) where.staffId = staffId
        const shifts = await db.shift.findMany({
          where,
          include: { staff: true },
          orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
          take: 500,
        })
        return NextResponse.json(shifts)
      }

      case 'users': {
        // Users have facilityIds (comma-separated string). Filter where their assigned facilities include any accessible facility.
        // Owner (level 1) is always visible regardless of facilityIds.
        const users = await db.user.findMany({
          where: { active: true, ...userFacilityFilter },
          orderBy: { name: 'asc' },
        })
        return NextResponse.json(users)
      }

      case 'products': {
        const includeInactive = searchParams.get('includeInactive') === 'true'
        const where: any = { ...facilityFilter }
        if (!includeInactive) where.active = true
        const category = searchParams.get('category')
        if (category) where.category = category
        const products = await db.product.findMany({
          where,
          include: {
            revenueAccount: { select: { id: true, code: true, name: true } },
            expenseAccount: { select: { id: true, code: true, name: true } },
          },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        })
        return NextResponse.json(products)
      }

      case 'inventory': {
        const includeInactive = searchParams.get('includeInactive') === 'true'
        const where: any = { ...facilityFilter }
        if (!includeInactive) where.active = true
        const category = searchParams.get('category')
        if (category) where.category = category
        const lowStock = searchParams.get('lowStock') === 'true'
        const items = await db.inventoryItem.findMany({
          where,
          include: { _count: { select: { transactions: true } } },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
        })
        if (lowStock) {
          return NextResponse.json(items.filter(i => i.currentStock <= i.reorderLevel))
        }
        return NextResponse.json(items)
      }

      case 'inventoryTransactions': {
        // Transactions are tied to item (which has facilityId) — filter via item relation
        const where: any = { ...itemFacilityFilter }
        const itemId = searchParams.get('itemId')
        if (itemId) where.itemId = itemId
        const txns = await db.inventoryTransaction.findMany({
          where,
          include: { item: true },
          orderBy: { date: 'desc' },
          take: 200,
        })
        return NextResponse.json(txns)
      }

      case 'auditLogs': {
        // Only Developer/Owner/Manager can view audit logs
        if (currentUser.role !== 'APP_DEVELOPER' && currentUser.role !== 'OWNER' && currentUser.role !== 'MANAGER') {
          return NextResponse.json({ error: 'Access denied' }, { status: 403 })
        }
        const where: any = {}
        const action = searchParams.get('action')
        if (action) where.action = action
        const userId = searchParams.get('userId')
        if (userId) where.userId = userId
        // Date-range filter (yyyy-MM-dd, inclusive on both ends)
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')
        if (startDate || endDate) {
          where.createdAt = {}
          if (startDate) {
            const s = new Date(startDate); s.setHours(0, 0, 0, 0)
            where.createdAt.gte = s
          }
          if (endDate) {
            const e = new Date(endDate); e.setHours(23, 59, 59, 999)
            where.createdAt.lte = e
          }
        }

        // Apply facility scope:
        // - Developer: sees all (unless specific facilityId passed)
        // - Owner: sees only their org's facilities' logs
        // - Manager: sees only their assigned facilities' logs
        //
        // NOTE: we used to include `{ facilityId: null }` in the OR so that
        // login/logout events (which had no facilityId) would still show.
        // That was a data-isolation bug — a Manager at Org A could see
        // login events from Org B's users. Login/logout routes now stamp
        // a real facilityId on every event, so the null clause is no longer
        // needed. Old null-facility logs (from before the fix) will simply
        // not appear for non-developers — that's the correct behavior.
        if (currentUser.role === 'APP_DEVELOPER') {
          if (facilityId) where.facilityId = facilityId
          // Developer with no facilityId → sees everything (including old null-facility logs)
        } else if (hasFacilityScope) {
          // Non-developer with facility access — show ONLY their facilities' logs.
          // No null-facility clause (prevents cross-org data leakage).
          if (facilityId && accessibleFacilityIds.includes(facilityId)) {
            where.facilityId = facilityId
          } else {
            where.facilityId = { in: accessibleFacilityIds }
          }
        } else {
          // No facility access → show nothing
          where.id = '__NO_ACCESS__'
        }

        const logs = await db.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: 500,
        })
        return NextResponse.json(logs)
      }

      case 'statusLogs': {
        // ResidentStatusLog doesn't have a direct facilityId — filter via resident relation
        const where: any = { ...residentFacilityFilter }
        if (residentId) where.residentId = residentId
        const logs = await db.residentStatusLog.findMany({
          where,
          orderBy: { changedAt: 'desc' },
          take: 100,
        })
        return NextResponse.json(logs)
      }

      case 'leaves': {
        // StaffLeave is tied to staff (which has facilityId) — filter via staff relation
        const where: any = { ...staffFacilityFilter }
        const staffId = searchParams.get('staffId')
        if (staffId) where.staffId = staffId
        const leaveStatus = searchParams.get('status')
        if (leaveStatus) where.status = leaveStatus
        const leaves = await db.staffLeave.findMany({
          where,
          include: { staff: true },
          orderBy: { startDate: 'desc' },
          take: 200,
        })
        return NextResponse.json(leaves)
      }

      case 'attendance': {
        const where: any = { ...staffFacilityFilter }
        const staffId = searchParams.get('staffId')
        if (staffId) where.staffId = staffId
        const date = searchParams.get('date')
        if (date) {
          // Parse date as local-time midnight (not UTC) to match user's calendar view.
          // `new Date('2026-07-15')` parses as UTC midnight — which causes attendance records
          // created in local evening to appear on the wrong day. Append 'T00:00:00' to parse
          // as local time, then build the range as [localMidnight, localNextMidnight).
          const [y, m, d] = date.split('-').map(Number)
          const start = new Date(y, m - 1, d, 0, 0, 0, 0)
          const next = new Date(y, m - 1, d + 1, 0, 0, 0, 0)
          where.date = { gte: start, lt: next }
        }
        const records = await db.staffAttendance.findMany({
          where,
          include: { staff: { select: { id: true, firstName: true, lastName: true, code: true, role: true } } },
          orderBy: { date: 'desc' },
          take: 500,
        })
        return NextResponse.json(records)
      }

      case 'payroll': {
        const where: any = { ...facilityFilter }
        const staffId = searchParams.get('staffId')
        if (staffId) where.staffId = staffId
        const month = searchParams.get('month')
        if (month) where.payrollMonth = month
        const status = searchParams.get('status')
        if (status) where.status = status
        const payrolls = await db.payroll.findMany({
          where,
          include: { staff: { select: { id: true, firstName: true, lastName: true, code: true, role: true } }, lineItems: true },
          orderBy: { payrollMonth: 'desc' },
          take: 200,
        })
        return NextResponse.json(payrolls)
      }

      case 'payments': {
        // Payments have direct facilityId
        const where: any = { ...facilityFilter }
        const invoiceId = searchParams.get('invoiceId')
        if (invoiceId) where.invoiceId = invoiceId
        const residentIdFilter = searchParams.get('residentId')
        if (residentIdFilter) where.residentId = residentIdFilter
        const status = searchParams.get('status')
        if (status) where.status = status
        const method = searchParams.get('method')
        if (method) where.method = method
        const payments = await db.payment.findMany({
          where,
          include: {
            resident: { include: { room: true } },
            invoice: { select: { id: true, invoiceNumber: true, total: true, amountPaid: true, status: true, issueDate: true, dueDate: true, recipient: true } },
            applications: {
              include: {
                invoice: { select: { id: true, invoiceNumber: true, total: true, amountPaid: true, status: true, issueDate: true, dueDate: true, recipient: true, resident: { select: { id: true, code: true, firstName: true, lastName: true } } } },
              },
            },
            journalEntries: {
              include: {
                lines: {
                  include: {
                    account: { select: { id: true, code: true, name: true, type: true } },
                  },
                },
              },
            },
          },
          orderBy: { paymentDate: 'desc' },
          take: 500,
        })
        return NextResponse.json(payments)
      }

      case 'paymentApplications': {
        // Filter by facility via the payment or invoice relation (both have facilityId).
        // Previously this returned ALL payment applications across ALL orgs.
        const where: any = {}
        const paymentId = searchParams.get('paymentId')
        if (paymentId) where.paymentId = paymentId
        const invoiceId = searchParams.get('invoiceId')
        if (invoiceId) where.invoiceId = invoiceId
        // Apply facility scope: payment OR invoice must belong to an accessible facility
        if (hasFacilityScope) {
          where.OR = [
            { payment: { facilityId: { in: accessibleFacilityIds } } },
            { invoice: { facilityId: { in: accessibleFacilityIds } } },
          ]
        }
        const apps = await db.paymentApplication.findMany({
          where,
          include: { payment: true, invoice: { select: { id: true, invoiceNumber: true, total: true, amountPaid: true, status: true } } },
          orderBy: { appliedAt: 'desc' },
        })
        return NextResponse.json(apps)
      }

      case 'accounts': {
        // Chart of accounts — facility-scoped (each facility has its own COA)
        const where: any = { ...facilityFilter }
        const typeFilter = searchParams.get('accountType')
        if (typeFilter) where.type = typeFilter
        const includeInactive = searchParams.get('includeInactive') === 'true'
        if (!includeInactive) where.active = true
        const accounts = await db.account.findMany({
          where,
          orderBy: [{ type: 'asc' }, { code: 'asc' }],
        })
        return NextResponse.json(accounts)
      }

      case 'journalEntries': {
        // Journal entries — facility-scoped
        const where: any = { ...facilityFilter }
        const startDate = searchParams.get('startDate')
        const endDate = searchParams.get('endDate')
        if (startDate || endDate) {
          where.entryDate = {}
          if (startDate) where.entryDate.gte = new Date(startDate)
          if (endDate) where.entryDate.lte = new Date(endDate)
        }
        const source = searchParams.get('source')
        if (source) where.source = source
        // Filter by GL account ID (for bank account transaction view)
        const accountId = searchParams.get('accountId')
        if (accountId) {
          where.lines = { some: { accountId } }
        }
        const entries = await db.journalEntry.findMany({
          where,
          include: {
            lines: { include: { account: true } },
            invoice: { select: { id: true, invoiceNumber: true } },
            expense: { select: { id: true, description: true } },
            payment: { select: { id: true, paymentCode: true } },
          },
          orderBy: { entryDate: 'desc' },
          take: 500,
        })
        return NextResponse.json(entries)
      }

      case 'vendors': {
        const where: any = { ...facilityFilter }
        const includeInactive = searchParams.get('includeInactive') === 'true'
        if (!includeInactive) where.active = true
        const vendors = await db.vendor.findMany({
          where,
          orderBy: { name: 'asc' },
        })
        return NextResponse.json(vendors)
      }

      case 'purchaseOrders': {
        const where: any = { ...facilityFilter }
        const status = searchParams.get('status')
        if (status) where.status = status
        const vendorId = searchParams.get('vendorId')
        if (vendorId) where.vendorId = vendorId
        const id = searchParams.get('id')
        if (id) where.id = id
        const pos = await db.purchaseOrder.findMany({
          where,
          include: {
            vendor: { select: { id: true, code: true, name: true } },
            lines: {
              include: {
                item: { select: { id: true, name: true, code: true, category: true, unit: true } },
                product: { select: { id: true, name: true, code: true, category: true, unit: true } },
              },
            },
          },
          orderBy: { orderDate: 'desc' },
          take: 500,
        })
        // For single-PO fetch, also include the journal entry
        if (id && pos.length === 1) {
          const je = pos[0].journalEntryId ? await db.journalEntry.findUnique({
            where: { id: pos[0].journalEntryId },
            include: { lines: { include: { account: true } } },
          }) : null
          return NextResponse.json({ ...pos[0], journalEntry: je })
        }
        return NextResponse.json(pos)
      }

      case 'productVendorPrices': {
        const where: any = { ...facilityFilter }
        const productId = searchParams.get('productId')
        if (productId) where.productId = productId
        const vendorId = searchParams.get('vendorId')
        if (vendorId) where.vendorId = vendorId
        const prices = await db.productVendorPrice.findMany({
          where,
          include: {
            vendor: { select: { id: true, code: true, name: true } },
            product: { select: { id: true, code: true, name: true, unit: true } },
          },
          orderBy: { unitCost: 'asc' },
        })
        return NextResponse.json(prices)
      }

      case 'stockTransfers': {
        // A transfer is visible to both the source and destination facility
        // (so the receiver can mark it received). Filter by OR on fromFacilityId/toFacilityId.
        const where: any = hasFacilityScope
          ? { OR: [{ fromFacilityId: { in: accessibleFacilityIds } }, { toFacilityId: { in: accessibleFacilityIds } }] }
          : {}
        const status = searchParams.get('status')
        if (status) where.status = status
        const id = searchParams.get('id')
        if (id) where.id = id
        const transfers = await db.stockTransfer.findMany({
          where,
          include: {
            fromFacility: { select: { id: true, name: true } },
            toFacility: { select: { id: true, name: true } },
            lines: {
              include: {
                item: { select: { id: true, name: true, code: true, unit: true, currentStock: true } },
                destinationItem: { select: { id: true, name: true, code: true, currentStock: true } },
              },
            },
          },
          orderBy: { transferDate: 'desc' },
          take: 500,
        })
        return NextResponse.json(transfers)
      }

      case 'bankAccounts': {
        const where: any = { ...facilityFilter }
        const includeInactive = searchParams.get('includeInactive') === 'true'
        if (!includeInactive) where.active = true
        const banks = await db.bankAccount.findMany({
          where,
          include: {
            account: {
              include: {
                journalLines: {
                  where: { journalEntry: { posted: true } },
                  select: { debit: true, credit: true },
                },
              },
            },
          },
          orderBy: { code: 'asc' },
        })
        // Compute real current balance = openingBalance + sum(debits) - sum(credits)
        const banksWithBalance = banks.map(b => {
          const totalDebit = b.account?.journalLines?.reduce((s: number, l: any) => s + l.debit, 0) || 0
          const totalCredit = b.account?.journalLines?.reduce((s: number, l: any) => s + l.credit, 0) || 0
          const computedBalance = (b.openingBalance || 0) + totalDebit - totalCredit
          return {
            ...b,
            account: b.account ? { id: b.account.id, code: b.account.code, name: b.account.name } : null,
            totalDebit,
            totalCredit,
            currentBalance: Math.round(computedBalance * 100) / 100,
            transactionCount: b.account?.journalLines?.length || 0,
          }
        })
        return NextResponse.json(banksWithBalance)
      }

      case 'deposits': {
        const where: any = { ...facilityFilter }
        const depResidentId = searchParams.get('residentId')
        if (depResidentId) where.residentId = depResidentId
        const depStatus = searchParams.get('status')
        if (depStatus) where.status = depStatus
        const deposits = await db.deposit.findMany({
          where,
          include: { resident: { select: { id: true, code: true, firstName: true, lastName: true } } },
          orderBy: { paymentDate: 'desc' },
          take: 500,
        })
        return NextResponse.json(deposits)
      }

      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
    }
  } catch (e: any) {
    console.error('API /data error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST /api/data?type=... — create record
export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || ''

  // Auth check
  const currentUser = await getSessionUser(req)
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()

  // Parse facilityId from query param — used to auto-assign facilityId to new records
  const requestFacilityId = searchParams.get('facilityId') || ''

  // === Facility ownership check ===
  // Resolve the user's accessible facility IDs ONCE for this request. Individual
  // handlers below use `canWriteFacility(facilityId)` to verify that the user is
  // allowed to write to the facility they're stamping on a new record.
  const { accessibleFacilityIds: postAccessibleFacilityIds, isScoped: postIsScoped } = await resolveAccessibleFacilityIds(currentUser, requestFacilityId || null)
  const canWriteFacility = (fid: string | null | undefined): boolean => {
    if (!fid) return false
    if (!postIsScoped) return true  // Developer with no scope = all facilities
    return postAccessibleFacilityIds.includes(fid)
  }
  // For handlers that need the full list (e.g. to verify body.facilityId):
  // use `postAccessibleFacilityIds` directly.

  // Child-record facility check — for types whose parent is a resident/staff/invoice/etc.,
  // we need to verify that the parent record belongs to a facility the user can write to.
  // Otherwise a NURSE from facility A could create a vital sign for a resident in facility B
  // just by passing that resident's ID in the body.
  //
  // Mapping: type → { parentModel, parentIdField, parentFacilityField (on the parent) }
  // The lookup is skipped if `postIsScoped` is false (Developer with no facility scope).
  if (postIsScoped) {
    const childParentMap: Record<string, { model: any; idField: string; facilityField: string }> = {
      medications: { model: db.resident, idField: 'residentId', facilityField: 'facilityId' },
      medAdmins: { model: db.resident, idField: 'residentId', facilityField: 'facilityId' },
      vitals: { model: db.resident, idField: 'residentId', facilityField: 'facilityId' },
      careLogs: { model: db.resident, idField: 'residentId', facilityField: 'facilityId' },
      visits: { model: db.resident, idField: 'residentId', facilityField: 'facilityId' },
      incidents: { model: db.resident, idField: 'residentId', facilityField: 'facilityId' },
      messages: { model: db.resident, idField: 'residentId', facilityField: 'facilityId' },
      invoiceItems: { model: db.resident, idField: 'residentId', facilityField: 'facilityId' },
      shifts: { model: db.staff, idField: 'staffId', facilityField: 'facilityId' },
      leaves: { model: db.staff, idField: 'staffId', facilityField: 'facilityId' },
      attendance: { model: db.staff, idField: 'staffId', facilityField: 'facilityId' },
    }
    const mapping = childParentMap[type]
    if (mapping) {
      const parentId = body[mapping.idField]
      if (parentId) {
        const parent = await mapping.model.findUnique({
          where: { id: parentId },
          select: { [mapping.facilityField]: true } as any,
        })
        const parentFacilityId = parent?.[mapping.facilityField]
        if (parentFacilityId && !canWriteFacility(parentFacilityId)) {
          return NextResponse.json(
            { error: `You do not have access to the ${type === 'leaves' ? 'staff' : 'resident'}'s facility` },
            { status: 403 },
          )
        }
      }
    }
  }

  try {
    // === Generic date normalization for CSV imports ===
    // CSV imports often send date-only strings like '2026-08-13' which Prisma
    // rejects (expects full ISO DateTime). Convert any date-only string found
    // in known date fields to a full ISO DateTime (midnight UTC).
    // This runs for ALL entity types, so we cover residents, staff, expenses,
    // payments, visits, incidents, etc. without needing per-entity code.
    const normalizeDate = (v: any): any => {
      if (!v || typeof v !== 'string') return v
      const s = v.trim()
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + 'T00:00:00.000Z').toISOString()
      return v
    }
    const DATE_FIELDS = [
      'dateOfBirth', 'admissionDate', 'dischargeDate', 'hireDate', 'endDate', 'startDate',
      'date', 'paymentDate', 'entryDate', 'orderDate', 'expectedDate', 'scheduledAt',
      'completedAt', 'occurredAt', 'recordedAt', 'sentAt', 'lastCountDate',
      'effectiveFrom', 'effectiveTo', 'reviewedAt', 'approvedAt', 'reimbursementDate',
      'paidAt', 'nextPaymentDate', 'subscriptionStart', 'blockedAt',
      'checkIn', 'checkOut',
    ]
    for (const field of DATE_FIELDS) {
      if (body[field] !== undefined) body[field] = normalizeDate(body[field])
    }
    // Also normalize any nested date fields inside `lines` arrays (for PO + JE imports)
    if (Array.isArray(body.lines)) {
      for (const line of body.lines) {
        if (line && typeof line === 'object') {
          for (const field of ['expectedDate', 'receivedDate', 'entryDate']) {
            if (line[field] !== undefined) line[field] = normalizeDate(line[field])
          }
        }
      }
    }

    switch (type) {
      case 'residents': {
        if (!body.firstName || !body.lastName) return NextResponse.json({ error: 'First name and last name are required' }, { status: 400 })
        // Auto-assign facilityId from the request if not already in body
        const facilityId = body.facilityId || requestFacilityId || null
        // Facility-ownership check
        if (facilityId && !canWriteFacility(facilityId)) {
          return NextResponse.json({ error: 'You do not have access to this facility' }, { status: 403 })
        }
        // Date fields (dateOfBirth, admissionDate, dischargeDate) are normalized
        // by the generic DATE_FIELDS loop above — no per-field handling needed here.
        // Resolve roomNumber → roomId (for CSV imports + convenience).
        // The room must exist in the same facility.
        if (body.roomNumber && !body.roomId) {
          const room = await db.room.findFirst({
            where: { roomNumber: String(body.roomNumber), facilityId },
            select: { id: true },
          })
          if (room) {
            body.roomId = room.id
          } else {
            return NextResponse.json({ error: `Room number "${body.roomNumber}" not found in this facility. Please create the room first or check the number.` }, { status: 400 })
          }
        }
        delete body.roomNumber  // not a real field on Resident — strip it
        // Resolve bedCode → bedId (for CSV imports + convenience).
        // The bed must exist in a room within the same facility.
        if (body.bedCode && !body.bedId) {
          const bed = await db.bed.findFirst({
            where: { code: String(body.bedCode), room: { facilityId } },
            select: { id: true, status: true },
          })
          if (bed) {
            body.bedId = bed.id
            if (!body.roomId) {
              const bedRoom = await db.bed.findUnique({ where: { id: bed.id }, select: { roomId: true } })
              if (bedRoom) body.roomId = bedRoom.roomId
            }
          } else {
            return NextResponse.json({ error: `Bed code "${body.bedCode}" not found in this facility.` }, { status: 400 })
          }
        }
        delete body.bedCode  // not a real field on Resident — strip it
        const residentCode = await generateResidentCode(facilityId)
        const resident = await db.resident.create({ data: { ...body, code: residentCode, facilityId } })
        // Auto-set bed status to OCCUPIED when a resident is assigned
        if (resident.bedId) {
          await db.bed.update({ where: { id: resident.bedId }, data: { status: 'OCCUPIED' } })
        }
        const resFacilityName = await getFacilityName(facilityId)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: AUDIT_ACTIONS.RESIDENT_CREATED, entityType: 'RESIDENT', entityId: resident.id,
          description: `${currentUser.name} created resident ${residentCode} ${resident.firstName} ${resident.lastName}`,
          metadata: { residentCode, firstName: resident.firstName, lastName: resident.lastName },
          facilityId, facilityName: resFacilityName,
        })
        return NextResponse.json(resident)
      }

      case 'rooms': {
        if (!body.roomNumber) return NextResponse.json({ error: 'Room number is required' }, { status: 400 })
        const facilityId = body.facilityId || requestFacilityId || null
        // Check for duplicate room number (scoped to facility)
        const existing = await db.room.findFirst({
          where: { roomNumber: body.roomNumber, facilityId },
        })
        if (existing) return NextResponse.json({ error: `Room number "${body.roomNumber}" already exists` }, { status: 400 })
        const capacity = Math.max(1, parseInt(String(body.capacity ?? 1)) || 1)
        if (capacity < 1) return NextResponse.json({ error: 'Capacity must be at least 1' }, { status: 400 })
        const roomCode = await generateRoomCode(facilityId)
        const room = await db.room.create({
          data: {
            code: roomCode, roomNumber: body.roomNumber, floor: parseInt(String(body.floor ?? 1)) || 1,
            capacity, type: body.type || 'PRIVATE', status: body.status || 'AVAILABLE',
            notes: body.notes || null, facilityId,
            // Bulk import tracking (null for manually-created rooms)
            importBatchId: body.importBatchId || null,
          },
        })
        const roomFacilityName = await getFacilityName(facilityId)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'ROOM_CREATED', entityType: 'ROOM', entityId: room.id,
          description: `${currentUser.name} created room ${roomCode} (${body.roomNumber}, ${body.type || 'PRIVATE'})`,
          metadata: { roomCode, roomNumber: body.roomNumber, type: body.type, capacity },
          facilityId, facilityName: roomFacilityName,
        })
        // Auto-create beds based on capacity. Each bed gets a letter suffix:
        // capacity 1 → [101-A], capacity 2 → [101-A, 101-B], capacity 4 → [101-A, 101-B, 101-C, 101-D]
        // For capacity > 26 (ward), switch to numeric: 101-Bed1, 101-Bed2, ...
        const bedLabels = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
        for (let i = 0; i < capacity; i++) {
          const suffix = i < 26 ? bedLabels[i] : `${i + 1}`
          const bedCode = `${body.roomNumber}-${suffix}`
          const bedLabel = i < 26 ? `Bed ${bedLabels[i]}` : `Bed ${i + 1}`
          await db.bed.create({
            data: {
              code: bedCode,
              label: bedLabel,
              roomId: room.id,
              status: 'AVAILABLE',
            },
          }).catch(() => {}) // non-fatal — duplicate bed codes shouldn't happen but just in case
        }
        return NextResponse.json(room)
      }

      case 'staff': {
        const facilityId = body.facilityId || requestFacilityId || null
        const staffCode = await generateStaffCode(facilityId)
        const staffMember = await db.staff.create({ data: { ...body, code: staffCode, facilityId } })
        const staffFacilityName = await getFacilityName(facilityId)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'STAFF_CREATED', entityType: 'STAFF', entityId: staffMember.id,
          description: `${currentUser.name} created staff ${staffCode} ${body.firstName} ${body.lastName} (${body.role || ''})`,
          metadata: { staffCode, firstName: body.firstName, lastName: body.lastName, role: body.role },
          facilityId, facilityName: staffFacilityName,
        })
        return NextResponse.json(staffMember)
      }

      case 'medications': {
        const med = await db.medication.create({ data: body })
        // Look up resident's facility for audit context
        const medResident = body.residentId ? await db.resident.findUnique({ where: { id: body.residentId }, select: { firstName: true, lastName: true, code: true, facilityId: true } }) : null
        const medFacilityName = await getFacilityName(medResident?.facilityId || body.facilityId || requestFacilityId || null)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'MEDICATION_CREATED', entityType: 'MEDICATION', entityId: med.id,
          description: `${currentUser.name} added medication ${body.name} ${body.dosage || ''} for ${medResident ? `${medResident.code || ''} ${medResident.firstName} ${medResident.lastName}`.trim() : 'resident'}`,
          metadata: { medicationId: med.id, name: body.name, dosage: body.dosage, residentCode: medResident?.code },
          facilityId: medResident?.facilityId || body.facilityId || requestFacilityId || null,
          facilityName: medFacilityName,
        })
        return NextResponse.json(med)
      }

      case 'medAdmins': {
        const updated = await db.medAdministration.create({ data: body })
        // Fetch resident + medication names (with codes + facility) for audit
        const r = await db.resident.findUnique({ where: { id: body.residentId }, select: { firstName: true, lastName: true, code: true, facilityId: true } })
        const med = await db.medication.findUnique({ where: { id: body.medicationId }, select: { name: true, dosage: true } })
        const residentLabel = r ? `${r.code ? r.code + ' ' : ''}${r.firstName} ${r.lastName}`.trim() : 'unknown resident'
        const facility = await getFacilityName(r?.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: body.status === 'GIVEN' ? AUDIT_ACTIONS.MED_ADMINISTERED : AUDIT_ACTIONS.MED_REFUSED,
          entityType: 'MEDICATION',
          entityId: body.medicationId,
          description: `${currentUser.name} ${body.status === 'GIVEN' ? 'administered' : 'recorded refusal of'} ${med?.name || 'medication'} ${med?.dosage || ''} to ${residentLabel}`.trim(),
          metadata: { residentId: body.residentId, residentCode: r?.code, medicationId: body.medicationId, status: body.status },
          facilityId: r?.facilityId || null,
          facilityName: facility,
        })
        return NextResponse.json(updated)
      }

      case 'vitals': {
        const v = await db.vitalSign.create({ data: body })
        const r = await db.resident.findUnique({ where: { id: body.residentId }, select: { firstName: true, lastName: true, code: true, facilityId: true } })
        const residentLabel = r ? `${r.code ? r.code + ' ' : ''}${r.firstName} ${r.lastName}`.trim() : 'unknown resident'
        const facility = await getFacilityName(r?.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.VITAL_RECORDED,
          entityType: 'RESIDENT',
          entityId: body.residentId,
          description: `${currentUser.name} recorded vitals for ${residentLabel} (BP: ${body.bloodPressureSystolic || '?'}/${body.bloodPressureDiastolic || '?'}, HR: ${body.heartRate || '?'}, O₂: ${body.oxygenSaturation || '?'}%)`,
          metadata: { residentId: body.residentId, residentCode: r?.code },
          facilityId: r?.facilityId || null,
          facilityName: facility,
        })
        return NextResponse.json(v)
      }

      case 'careLogs': {
        // Map notes → description (the model uses "description" but callers
        // sometimes send "notes" — accept both for convenience).
        if (body.notes && !body.description) {
          body.description = body.notes
        }
        delete body.notes
        // Set default description if still missing (required field, no default)
        if (!body.description) body.description = 'Care log entry'
        const log = await db.careLog.create({ data: body })
        const r = await db.resident.findUnique({ where: { id: body.residentId }, select: { firstName: true, lastName: true, code: true, facilityId: true } })
        const residentLabel = r ? `${r.code ? r.code + ' ' : ''}${r.firstName} ${r.lastName}`.trim() : 'unknown resident'
        const facility = await getFacilityName(r?.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.CARE_LOG_ADDED,
          entityType: 'RESIDENT',
          entityId: body.residentId,
          description: `${currentUser.name} added care log for ${residentLabel}: ${body.description || ''}`.trim(),
          metadata: { residentId: body.residentId, residentCode: r?.code, category: body.category },
          facilityId: r?.facilityId || null,
          facilityName: facility,
        })
        return NextResponse.json(log)
      }

      case 'visits': {
        const visit = await db.visit.create({ data: body })
        const r = await db.resident.findUnique({ where: { id: body.residentId }, select: { firstName: true, lastName: true, code: true, facilityId: true } })
        const residentLabel = r ? `${r.code ? r.code + ' ' : ''}${r.firstName} ${r.lastName}`.trim() : 'unknown resident'
        const facility = await getFacilityName(r?.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.VISIT_SCHEDULED,
          entityType: 'VISIT',
          entityId: visit.id,
          description: `${currentUser.name} scheduled ${body.visitType?.replace(/_/g, ' ') || 'visit'} for ${residentLabel}`,
          metadata: { residentId: body.residentId, residentCode: r?.code, visitType: body.visitType },
          facilityId: r?.facilityId || null,
          facilityName: facility,
        })
        return NextResponse.json(visit)
      }

      case 'incidents': {
        const incident = await db.incidentReport.create({ data: body })
        const r = await db.resident.findUnique({ where: { id: body.residentId }, select: { firstName: true, lastName: true, code: true, facilityId: true } })
        const residentLabel = r ? `${r.code ? r.code + ' ' : ''}${r.firstName} ${r.lastName}`.trim() : 'unknown resident'
        const facility = await getFacilityName(r?.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.INCIDENT_REPORTED,
          entityType: 'RESIDENT',
          entityId: body.residentId,
          description: `${currentUser.name} reported ${body.incidentType?.replace(/_/g, ' ') || 'incident'} (${body.severity || ''}) for ${residentLabel}`,
          metadata: { residentId: body.residentId, residentCode: r?.code, incidentType: body.incidentType, severity: body.severity },
          facilityId: r?.facilityId || null,
          facilityName: facility,
        })
        // Send email notification for incidents (if enabled)
        try {
          const { sendNotificationEmail } = await import('@/lib/email')
          const org = facility ? await db.organization.findFirst({ where: { facilities: { some: { id: r?.facilityId } } }, select: { email: true } }) : null
          if (org?.email) {
            await sendNotificationEmail(
              'INCIDENT_REPORTED',
              org.email,
              `Incident reported — ${body.incidentType?.replace(/_/g, ' ') || 'incident'} (${body.severity || ''}) for ${residentLabel}`,
              `<h3>Incident Reported</h3><p><strong>Resident:</strong> ${residentLabel}</p><p><strong>Type:</strong> ${body.incidentType?.replace(/_/g, ' ') || '—'}</p><p><strong>Severity:</strong> ${body.severity || '—'}</p><p><strong>Description:</strong> ${body.description || '—'}</p><p><strong>Reported by:</strong> ${currentUser.name}</p>`,
            )
          }
        } catch { /* non-blocking */ }
        return NextResponse.json(incident)
      }

      case 'messages': {
        // Map content → body (the model uses "body" but callers sometimes
        // send "content" — accept both for convenience).
        if (body.content && !body.body) {
          body.body = body.content
        }
        delete body.content
        // Strip UI-only helper fields that aren't columns on FamilyMessage.
        // `direction` ('INCOMING'/'OUTGOING') is a UI concept — the direction
        // is determined by who the sender is (staff = outgoing, family = incoming).
        delete body.direction
        // Set default body if still missing (required field, no default)
        if (!body.body) body.body = ''
        // Set senderId from the current session user if not provided
        // (required field — the message must be attributed to someone)
        if (!body.senderId) body.senderId = currentUser.id
        const msg = await db.familyMessage.create({ data: body })
        const r = await db.resident.findUnique({ where: { id: body.residentId }, select: { firstName: true, lastName: true, code: true, facilityId: true } })
        const residentLabel = r ? `${r.code ? r.code + ' ' : ''}${r.firstName} ${r.lastName}`.trim() : 'unknown resident'
        const facility = await getFacilityName(r?.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.MESSAGE_SENT,
          entityType: 'RESIDENT',
          entityId: body.residentId,
          description: `${currentUser.name} sent a message about ${residentLabel}: ${body.subject || body.body?.substring(0, 50) || ''}`.trim(),
          metadata: { residentId: body.residentId, residentCode: r?.code },
          facilityId: r?.facilityId || null,
          facilityName: facility,
        })
        return NextResponse.json(msg)
      }

      case 'invoices': {
        const { items, ...invData } = body
        // Auto-assign facilityId: from body, request param, or resident's facility
        let facilityId = invData.facilityId || requestFacilityId || null
        if (!facilityId && invData.residentId) {
          const r = await db.resident.findUnique({ where: { id: invData.residentId }, select: { facilityId: true } })
          facilityId = r?.facilityId || null
        }
        // Auto-generate invoice number if not provided (uses prefix + date settings)
        if (!invData.invoiceNumber) {
          invData.invoiceNumber = await generateInvoiceNumber(facilityId)
        }
        // Map invoiceDate → issueDate (the model uses "issueDate", but callers
        // sometimes send "invoiceDate" — accept both for convenience).
        if (invData.invoiceDate && !invData.issueDate) {
          invData.issueDate = invData.invoiceDate
        }
        delete invData.invoiceDate
        // Set defaults for required date fields:
        //   issueDate defaults to now
        //   dueDate defaults to 30 days from issueDate
        if (!invData.issueDate) invData.issueDate = new Date().toISOString()
        if (!invData.dueDate) {
          const issueDate = new Date(invData.issueDate)
          issueDate.setDate(issueDate.getDate() + 30)
          invData.dueDate = issueDate.toISOString()
        }
        // Compute subtotal + total from line items if not already set in the body.
        // This mirrors the Purchase Orders handler which computes totals from lines.
        // Without this, invoices created via API/bulk-import would have $0 totals,
        // causing payment applications to fail ("Amount exceeds invoice balance 0.00").
        if (items?.length > 0) {
          const round2 = (n: number) => Math.round(n * 100) / 100
          const computedSubtotal = round2(items.reduce((s: number, l: any) => s + (Number(l.total) || (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)), 0))
          if (invData.subtotal == null) invData.subtotal = computedSubtotal
          if (invData.tax == null) invData.tax = 0
          if (invData.total == null) invData.total = round2(computedSubtotal + (invData.tax || 0))
        }
        const invoice = await db.invoice.create({
          data: {
            ...invData,
            facilityId,
            items: items?.length ? { create: items } : undefined,
          },
          include: { items: true },
        })
        const facility = await getFacilityName(facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.INVOICE_CREATED,
          entityType: 'INVOICE',
          entityId: invoice.id,
          description: `${currentUser.name} created invoice ${invoice.invoiceNumber} for ${invoice.total} (resident: ${invData.recipient || '—'})`,
          metadata: { invoiceNumber: invoice.invoiceNumber, total: invoice.total },
          facilityId,
          facilityName: facility,
        })
        // Auto-post journal entry for this invoice (double-entry bookkeeping)
        try { await autoPostInvoice(invoice, invoice.facilityId || null) } catch (e: any) { console.log('[AutoPost] Invoice JE warning:', e.message?.slice(0, 80)) }
        // Send email notification (if enabled in Settings → Email Notifications)
        try {
          const { sendNotificationEmail } = await import('@/lib/email')
          const resident = invData.residentId ? await db.resident.findUnique({ where: { id: invData.residentId }, select: { firstName: true, lastName: true, code: true } }) : null
          const residentLabel = resident ? `${resident.firstName} ${resident.lastName}` : '—'
          // Send to org owner's email (best-effort — non-blocking)
          const org = facility ? await db.organization.findFirst({ where: { facilities: { some: { id: facility } } }, select: { email: true } }) : null
          if (org?.email) {
            await sendNotificationEmail(
              'INVOICE_CREATED',
              org.email,
              `Invoice ${invoice.invoiceNumber} created — RM ${invoice.total}`,
              `<h3>New Invoice Created</h3><p><strong>Invoice:</strong> ${invoice.invoiceNumber}</p><p><strong>Resident:</strong> ${residentLabel}</p><p><strong>Total:</strong> RM ${invoice.total.toFixed(2)}</p><p><strong>Status:</strong> ${invoice.status}</p>`,
            )
          }
        } catch { /* non-blocking */ }
        return NextResponse.json(invoice)
      }

      case 'invoiceItems': {
        if (!body.description) return NextResponse.json({ error: 'Description required' }, { status: 400 })
        if (!body.residentId) return NextResponse.json({ error: 'Resident required' }, { status: 400 })
        if (body.quantity == null || body.quantity <= 0) return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
        if (body.unitPrice == null || body.unitPrice < 0) return NextResponse.json({ error: 'Unit price cannot be negative' }, { status: 400 })
        const item = await db.invoiceItem.create({ data: body })
        const r = body.residentId ? await db.resident.findUnique({ where: { id: body.residentId }, select: { firstName: true, lastName: true, code: true, facilityId: true } }) : null
        const residentLabel = r ? `${r.code ? r.code + ' ' : ''}${r.firstName} ${r.lastName}`.trim() : 'unknown resident'
        const facility = await getFacilityName(r?.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.UNBILLED_ITEM_ADDED,
          entityType: 'RESIDENT',
          entityId: body.residentId,
          description: `${currentUser.name} added unbilled item "${body.description}" for ${residentLabel} (${body.total})`,
          metadata: { residentId: body.residentId, residentCode: r?.code, description: body.description, total: body.total },
          facilityId: r?.facilityId || null,
          facilityName: facility,
        })
        return NextResponse.json(item)
      }

      case 'expenses': {
        if (!body.description) return NextResponse.json({ error: 'Description required' }, { status: 400 })
        if (body.amount == null || body.amount < 0) return NextResponse.json({ error: 'Amount must be a positive number' }, { status: 400 })
        const facilityId = body.facilityId || requestFacilityId || null

        // Resolve vendorCode → vendorId (for CSV imports where the user provides
        // VEN-0001 instead of a UUID). Also auto-populate vendorName from the vendor.
        if (body.vendorCode && !body.vendorId) {
          const vWhere: any = { code: String(body.vendorCode) }
          if (facilityId) vWhere.facilityId = facilityId
          const v = await db.vendor.findFirst({ where: vWhere, select: { id: true, name: true } })
          if (v) {
            body.vendorId = v.id
            body.vendorName = v.name  // auto-populate denormalized name
          }
        }
        // Resolve paidByStaffCode → paidByStaffId (similar pattern)
        if (body.paidByStaffCode && !body.paidByStaffId) {
          const sWhere: any = { code: String(body.paidByStaffCode) }
          if (facilityId) sWhere.facilityId = facilityId
          const s = await db.staff.findFirst({ where: sWhere, select: { id: true, firstName: true, lastName: true } })
          if (s) {
            body.paidByStaffId = s.id
            body.paidBy = `${s.firstName} ${s.lastName}`.trim()
          }
        }

        // If vendorId is provided but vendorName isn't, auto-populate vendorName
        // from the linked vendor (for backwards-compat display + audit text).
        if (body.vendorId && !body.vendorName) {
          const v = await db.vendor.findUnique({ where: { id: body.vendorId }, select: { name: true } })
          if (v) body.vendorName = v.name
        }
        // If paidByStaffId is provided but paidBy isn't, auto-populate paidBy
        // from the linked staff (denormalized for quick display).
        if (body.paidByStaffId && !body.paidBy) {
          const s = await db.staff.findUnique({ where: { id: body.paidByStaffId }, select: { firstName: true, lastName: true } })
          if (s) body.paidBy = `${s.firstName} ${s.lastName}`.trim()
        }

        // Strip helper fields that were used for resolution but aren't real columns
        // on the Expense model (vendorCode, paidByStaffCode, paymentMethod).
        // These are accepted in the request body for CSV imports but would cause
        // a Prisma validation error if passed to db.expense.create().
        // (paymentMethod appears on Payment/Invoice/Deposit models but NOT on Expense —
        // users sometimes include it in expense CSVs from old export templates.)
        const { vendorCode: _ignoredVC, paidByStaffCode: _ignoredSC, paymentMethod: _ignoredPM, ...expenseData } = body

        const exp = await db.expense.create({ data: { ...expenseData, facilityId } })
        const facility = await getFacilityName(facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.EXPENSE_ADDED,
          entityType: 'EXPENSE',
          entityId: exp.id,
          description: `${currentUser.name} recorded expense "${body.description}" (${body.amount}, ${body.category})${body.vendorName ? ` — vendor: ${body.vendorName}` : ''}${body.paidBy ? ` — paid by: ${body.paidBy}` : ''}`,
          metadata: { amount: body.amount, category: body.category, vendorId: body.vendorId, vendorName: body.vendorName, paidByStaffId: body.paidByStaffId, paidBy: body.paidBy },
          facilityId,
          facilityName: facility,
        })
        // Auto-post journal entry for this expense (double-entry bookkeeping)
        try { await autoPostExpense(exp, exp.facilityId || null) } catch (e: any) { console.log('[AutoPost] Expense JE warning:', e.message?.slice(0, 200), e.code || '', e.meta ? JSON.stringify(e.meta).slice(0, 200) : '') }
        return NextResponse.json(exp)
      }

      case 'payments': {
        // Validate required fields
        if (body.amount == null || body.amount <= 0) return NextResponse.json({ error: 'Payment amount must be greater than 0' }, { status: 400 })

        // Resolve facilityId: body → request param → resident's facility (BEFORE generating code)
        let paymentFacilityId = body.facilityId || requestFacilityId || null

        // Generate next payment code using the shared helper (supports optional YYMMDD date segment)
        const paymentCode = await generatePaymentCode(paymentFacilityId)

        // Resolve residentCode → residentId (for CSV imports where the user provides RES-0001 instead of a UUID)
        if (body.residentCode && !body.residentId) {
          const rWhere: any = { code: String(body.residentCode) }
          if (paymentFacilityId) rWhere.facilityId = paymentFacilityId
          const r = await db.resident.findFirst({ where: rWhere, select: { id: true, facilityId: true } })
          if (!r) return NextResponse.json({ error: `Resident with code "${body.residentCode}" not found` }, { status: 404 })
          body.residentId = r.id
          if (!paymentFacilityId) paymentFacilityId = r.facilityId
        }

        if (!paymentFacilityId && body.residentId) {
          const r = await db.resident.findUnique({ where: { id: body.residentId }, select: { facilityId: true, firstName: true, lastName: true, code: true } })
          paymentFacilityId = r?.facilityId || null
        }

        // Validate the invoice (if provided) belongs to the same facility / resident
        // Supports both `invoiceId` (UUID) and `invoiceNumber` (e.g. INV-000123) —
        // the latter is useful for CSV imports where the user only knows the invoice number.
        let invoiceRecord: any = null
        if (body.invoiceId) {
          invoiceRecord = await db.invoice.findUnique({
            where: { id: body.invoiceId },
            select: { id: true, invoiceNumber: true, total: true, amountPaid: true, status: true, facilityId: true, residentId: true, recipient: true },
          })
          if (!invoiceRecord) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
        } else if (body.invoiceNumber) {
          // Look up by invoice number — scope to facility if specified
          const invWhere: any = { invoiceNumber: body.invoiceNumber }
          if (paymentFacilityId) invWhere.facilityId = paymentFacilityId
          invoiceRecord = await db.invoice.findFirst({
            where: invWhere,
            select: { id: true, invoiceNumber: true, total: true, amountPaid: true, status: true, facilityId: true, residentId: true, recipient: true },
          })
          if (!invoiceRecord) return NextResponse.json({ error: `Invoice "${body.invoiceNumber}" not found` }, { status: 404 })
        }

        const amount = parseFloat(body.amount)
        const applyAmount = body.applyToInvoice !== false && invoiceRecord
          ? Math.min(amount, Math.max(0, invoiceRecord.total - invoiceRecord.amountPaid))
          : 0

        // Create the payment in a transaction so we can also create the PaymentApplication
        // and update the linked invoice's amountPaid + status atomically.
        const created = await db.$transaction(async (tx) => {
          const payment = await tx.payment.create({
            data: {
              paymentCode,
              facilityId: paymentFacilityId,
              residentId: body.residentId || invoiceRecord?.residentId || null,
              invoiceId: invoiceRecord?.id || null,
              payerName: body.payerName || null,
              paymentDate: body.paymentDate ? new Date(body.paymentDate) : new Date(),
              amount,
              appliedAmount: applyAmount,
              method: body.method || 'CASH',
              reference: body.reference || null,
              bankAccount: body.bankAccount || null,
              status: body.status || 'CLEARED',
              notes: body.notes || null,
              receivedBy: body.receivedBy || currentUser.name,
              receivedById: currentUser.id,
              // Bulk import tracking (null for manually-created payments)
              importBatchId: body.importBatchId || null,
            },
          })

          if (applyAmount > 0 && invoiceRecord) {
            await tx.paymentApplication.create({
              data: {
                paymentId: payment.id,
                invoiceId: invoiceRecord.id,
                amount: applyAmount,
              },
            })

            const newPaid = invoiceRecord.amountPaid + applyAmount
            const newStatus = newPaid >= invoiceRecord.total ? 'PAID' : newPaid > 0 ? 'PARTIAL' : invoiceRecord.status
            await tx.invoice.update({
              where: { id: invoiceRecord.id },
              data: { amountPaid: newPaid, status: newStatus },
            })
          }

          return payment
        })

        const payFacilityName = await getFacilityName(paymentFacilityId)
        const residentInfo = body.residentId
          ? await db.resident.findUnique({ where: { id: body.residentId }, select: { firstName: true, lastName: true, code: true } })
          : null
        const residentLabel = residentInfo ? `${residentInfo.code ? residentInfo.code + ' ' : ''}${residentInfo.firstName} ${residentInfo.lastName}`.trim() : '—'
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.PAYMENT_RECEIVED,
          entityType: 'PAYMENT',
          entityId: created.id,
          description: `${currentUser.name} received payment ${paymentCode} of ${amount} from ${body.payerName || residentLabel}${invoiceRecord ? ` (applied to ${invoiceRecord.invoiceNumber})` : ''}`,
          metadata: {
            paymentCode,
            amount,
            method: body.method || 'CASH',
            invoiceNumber: invoiceRecord?.invoiceNumber,
            appliedAmount: applyAmount,
            residentCode: residentInfo?.code,
          },
          facilityId: paymentFacilityId || null,
          facilityName: payFacilityName,
        })

        const fullPayment = await db.payment.findUnique({
          where: { id: created.id },
          include: {
            resident: { include: { room: true } },
            invoice: { select: { id: true, invoiceNumber: true, total: true, amountPaid: true, status: true } },
            applications: { include: { invoice: { select: { id: true, invoiceNumber: true, total: true, amountPaid: true, status: true } } } },
          },
        })
        // Auto-post journal entry for this payment (double-entry bookkeeping)
        try { await autoPostPayment(fullPayment, paymentFacilityId || null) } catch (e: any) { console.log('[AutoPost] Payment JE warning:', e.message?.slice(0, 80)) }
        // Send email notification (if enabled in Settings → Email Notifications)
        try {
          const { sendNotificationEmail } = await import('@/lib/email')
          const org = payFacilityName ? await db.organization.findFirst({ where: { facilities: { some: { id: paymentFacilityId } } }, select: { email: true } }) : null
          if (org?.email) {
            await sendNotificationEmail(
              'PAYMENT_RECEIVED',
              org.email,
              `Payment received — RM ${amount} from ${body.payerName || residentLabel}`,
              `<h3>Payment Received</h3><p><strong>Amount:</strong> RM ${amount.toFixed(2)}</p><p><strong>From:</strong> ${body.payerName || residentLabel}</p><p><strong>Method:</strong> ${body.method || 'CASH'}</p>${invoiceRecord ? `<p><strong>Applied to:</strong> ${invoiceRecord.invoiceNumber}</p>` : ''}`,
            )
          }
        } catch { /* non-blocking */ }
        return NextResponse.json(fullPayment)
      }

      case 'paymentApplications': {
        // Manually apply part of an existing payment to an invoice
        if (!body.paymentId) return NextResponse.json({ error: 'paymentId required' }, { status: 400 })
        if (!body.invoiceId) return NextResponse.json({ error: 'invoiceId required' }, { status: 400 })
        if (body.amount == null || body.amount <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })

        const applyAmt = parseFloat(body.amount)
        const payment = await db.payment.findUnique({ where: { id: body.paymentId } })
        if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
        const remainingOnPayment = payment.amount - payment.appliedAmount
        if (applyAmt > remainingOnPayment + 0.01) {
          return NextResponse.json({ error: `Amount exceeds unapplied balance on payment (${remainingOnPayment.toFixed(2)})` }, { status: 400 })
        }

        const inv = await db.invoice.findUnique({ where: { id: body.invoiceId } })
        if (!inv) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
        const invBalance = inv.total - inv.amountPaid
        if (applyAmt > invBalance + 0.01) {
          return NextResponse.json({ error: `Amount exceeds invoice balance (${invBalance.toFixed(2)})` }, { status: 400 })
        }

        const result = await db.$transaction(async (tx) => {
          const app = await tx.paymentApplication.create({
            data: { paymentId: payment.id, invoiceId: inv.id, amount: applyAmt },
          })
          await tx.payment.update({
            where: { id: payment.id },
            data: { appliedAmount: payment.appliedAmount + applyAmt },
          })
          const newPaid = inv.amountPaid + applyAmt
          const newStatus = newPaid >= inv.total ? 'PAID' : newPaid > 0 ? 'PARTIAL' : inv.status
          await tx.invoice.update({
            where: { id: inv.id },
            data: { amountPaid: newPaid, status: newStatus },
          })
          return app
        })

        const payFac = await getFacilityName(payment.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.PAYMENT_APPLIED,
          entityType: 'PAYMENT',
          entityId: payment.id,
          description: `${currentUser.name} applied ${applyAmt} from payment ${payment.paymentCode} to invoice ${inv.invoiceNumber}`,
          metadata: { paymentCode: payment.paymentCode, invoiceNumber: inv.invoiceNumber, amount: applyAmt },
          facilityId: payment.facilityId || null,
          facilityName: payFac,
        })

        return NextResponse.json(result)
      }

      case 'accounts': {
        // Create a new account in the chart of accounts
        if (!body.code || !body.name || !body.type) return NextResponse.json({ error: 'code, name, and type required' }, { status: 400 })
        const facilityId = body.facilityId || requestFacilityId || null
        const account = await db.account.create({
          data: {
            code: body.code,
            name: body.name,
            type: body.type,
            subtype: body.subtype || null,
            normalBalance: body.normalBalance || (body.type === 'ASSET' || body.type === 'EXPENSE' ? 'DEBIT' : 'CREDIT'),
            facilityId,
            isGroup: body.isGroup || false,
            active: body.active !== false,
            description: body.description || null,
            // Bulk import tracking (null for manually-created accounts)
            importBatchId: body.importBatchId || null,
          },
        })
        const acctFacilityName = await getFacilityName(facilityId)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'ACCOUNT_CREATED', entityType: 'ACCOUNT', entityId: account.id,
          description: `${currentUser.name} created GL account ${body.code} ${body.name} (${body.type})`,
          metadata: { code: body.code, name: body.name, type: body.type },
          facilityId, facilityName: acctFacilityName,
        })
        return NextResponse.json(account)
      }

      case 'journalEntries': {
        // Create a manual journal entry — body must include `lines` array
        if (!body.memo) return NextResponse.json({ error: 'memo required' }, { status: 400 })
        if (!body.lines || !Array.isArray(body.lines) || body.lines.length < 2) return NextResponse.json({ error: 'At least 2 lines required' }, { status: 400 })
        const facilityId = body.facilityId || requestFacilityId || null
        // Allow callers to specify a source (e.g. 'AUTO_VENDOR_PAYMENT' for AP payments
        // recorded via the PayVendorDialog). Default to MANUAL. Whitelist the allowed values.
        const allowedSources = ['MANUAL', 'AUTO_VENDOR_PAYMENT', 'AUTO_STOCK_TRANSFER']
        const source = body.source && allowedSources.includes(body.source) ? body.source : 'MANUAL'
        const entry = await postJournalEntry({
          facilityId,
          entryDate: body.entryDate ? new Date(body.entryDate) : new Date(),
          memo: body.memo,
          source,
          reference: body.reference || null,
          lines: body.lines,
          createdById: currentUser.id,
          createdByName: currentUser.name,
        })
        const jeFacilityName = await getFacilityName(facilityId)
        const jeTotal = body.lines.reduce((s: number, l: any) => s + (l.debit || 0), 0)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'JOURNAL_ENTRY_CREATED', entityType: 'JOURNAL_ENTRY', entityId: entry.id,
          description: `${currentUser.name} posted ${source === 'MANUAL' ? 'manual ' : ''}journal entry ${entry.entryNumber} — ${body.memo} (${jeTotal})`,
          metadata: { entryNumber: entry.entryNumber, memo: body.memo, source, lineCount: body.lines.length, total: jeTotal },
          facilityId, facilityName: jeFacilityName,
        })
        return NextResponse.json(entry)
      }

      case 'vendors': {
        if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
        const facilityId = body.facilityId || requestFacilityId || null
        const code = body.code && body.code.startsWith('VEN-') ? body.code : await generateVendorCode(facilityId)
        const vendor = await db.vendor.create({
          data: {
            code,
            name: body.name,
            email: body.email || null,
            phone: body.phone || null,
            address: body.address || null,
            contactPerson: body.contactPerson || null,
            paymentTerms: body.paymentTerms || null,
            taxId: body.taxId || null,
            notes: body.notes || null,
            facilityId,
            // Bulk import tracking (null for manually-created vendors)
            importBatchId: body.importBatchId || null,
          },
        })
        const vendorFacilityName = await getFacilityName(facilityId)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'VENDOR_CREATED', entityType: 'VENDOR', entityId: vendor.id,
          description: `${currentUser.name} created vendor ${code} ${body.name}`,
          metadata: { code, name: body.name, paymentTerms: body.paymentTerms },
          facilityId, facilityName: vendorFacilityName,
        })
        return NextResponse.json(vendor)
      }

      case 'purchaseOrders': {
        const facilityId = body.facilityId || requestFacilityId || null
        // Facility-ownership check — POs are bound to a facility
        if (facilityId && !canWriteFacility(facilityId)) {
          return NextResponse.json({ error: 'You do not have access to this facility' }, { status: 403 })
        }
        if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
          return NextResponse.json({ error: 'At least 1 line item required' }, { status: 400 })
        }
        const poNumber = body.poNumber && body.poNumber.startsWith('PO-') ? body.poNumber : await generatePurchaseOrderCode(facilityId)
        // Compute totals from lines
        const round2 = (n: number) => Math.round(n * 100) / 100
        const subtotal = round2(body.lines.reduce((s: number, l: any) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0))
        const tax = round2(Number(body.tax) || 0)
        const total = round2(subtotal + tax)
        const status = body.status || 'DRAFT'
        const paymentMethod = body.paymentMethod || null
        const paidAmount = round2(Number(body.paidAmount) || 0)

        // Create PO + lines in a transaction
        const po = await db.purchaseOrder.create({
          data: {
            poNumber,
            facilityId,
            vendorId: body.vendorId || null,
            orderDate: body.orderDate ? new Date(body.orderDate) : new Date(),
            expectedDate: body.expectedDate ? new Date(body.expectedDate) : null,
            status,
            paymentStatus: paidAmount >= total && total > 0 ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'UNPAID'),
            paymentMethod,
            subtotal,
            tax,
            total,
            paidAmount,
            notes: body.notes || null,
            createdById: currentUser.id,
            createdByName: currentUser.name,
            lines: {
              create: body.lines.map((l: any) => ({
                itemId: l.itemId || null,
                productId: l.productId || null,
                description: l.description || '',
                quantity: Number(l.quantity) || 0,
                unitPrice: Number(l.unitPrice) || 0,
                total: round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)),
              })),
            },
          },
          include: {
            lines: {
              include: {
                item: { select: { id: true, name: true, category: true } },
                product: { select: { id: true, name: true, category: true, expenseAccountId: true, expenseAccount: { select: { id: true } } } },
              },
            },
          },
        })

        // If PO is created directly in RECEIVED status, also create inventory transactions
        // and post the JE (mirrors the PATCH handler's receive logic)
        if (status === 'RECEIVED') {
          for (const line of po.lines) {
            if (line.itemId && line.quantity > 0) {
              await db.inventoryTransaction.create({
                data: {
                  itemId: line.itemId,
                  type: 'STOCK_IN',
                  quantity: line.quantity,
                  reason: `PO ${po.poNumber} received`,
                  date: new Date(),
                  recordedBy: currentUser.name,
                  recordedById: currentUser.id,
                  purchaseOrderId: po.id,
                },
              })
              await db.inventoryItem.update({
                where: { id: line.itemId },
                data: {
                  currentStock: { increment: line.quantity },
                  lastCountDate: new Date(),
                  unitCost: line.unitPrice > 0 ? line.unitPrice : undefined,
                },
              })
              await db.purchaseOrderLine.update({
                where: { id: line.id },
                data: { receivedQty: line.quantity },
              })
            }
          }
          await db.purchaseOrder.update({
            where: { id: po.id },
            data: { receivedDate: new Date() },
          })
          // Re-fetch with the receivedDate and post the JE
          const poForJe = await db.purchaseOrder.findUnique({
            where: { id: po.id },
            include: {
              lines: {
                include: {
                  item: { select: { id: true, name: true, category: true } },
                  product: { select: { id: true, name: true, category: true, expenseAccountId: true, expenseAccount: { select: { id: true } } } },
                },
              },
            },
          })
          try {
            const je = await autoPostPurchaseOrder(poForJe, facilityId)
            if (je) {
              await db.purchaseOrder.update({ where: { id: po.id }, data: { journalEntryId: je.id } })
            }
          } catch (e: any) {
            console.error('[PO create] autoPostPurchaseOrder failed:', e.message)
          }
        }

        const poFacilityName = await getFacilityName(facilityId)
        const vendor = body.vendorId ? await db.vendor.findUnique({ where: { id: body.vendorId }, select: { name: true } }) : null
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'PURCHASE_ORDER_CREATED', entityType: 'PURCHASE_ORDER', entityId: po.id,
          description: `${currentUser.name} created ${status === 'RECEIVED' ? 'and received ' : ''}PO ${poNumber} (${total})${vendor ? ` — ${vendor.name}` : ''}`,
          metadata: { poNumber, vendorId: body.vendorId, vendorName: vendor?.name, total, status, lineCount: body.lines.length },
          facilityId, facilityName: poFacilityName,
        })
        return NextResponse.json(po)
      }

      case 'productVendorPrices': {
        if (!body.productId || !body.vendorId) {
          return NextResponse.json({ error: 'productId and vendorId required' }, { status: 400 })
        }
        const facilityId = body.facilityId || requestFacilityId || null
        // Upsert — one active price per product+vendor pair (per @@unique constraint)
        const existing = await db.productVendorPrice.findUnique({
          where: { productId_vendorId: { productId: body.productId, vendorId: body.vendorId } },
        })
        const data = {
          productId: body.productId,
          vendorId: body.vendorId,
          unitCost: Number(body.unitCost) || 0,
          minOrderQty: body.minOrderQty != null ? Number(body.minOrderQty) : null,
          leadTimeDays: body.leadTimeDays != null ? Number(body.leadTimeDays) : null,
          effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : new Date(),
          effectiveTo: body.effectiveTo ? new Date(body.effectiveTo) : null,
          notes: body.notes || null,
          facilityId,
          importBatchId: body.importBatchId || null,
        }
        let result
        if (existing) {
          result = await db.productVendorPrice.update({ where: { id: existing.id }, data })
        } else {
          result = await db.productVendorPrice.create({ data })
        }
        return NextResponse.json(result)
      }

      case 'stockTransfers': {
        // Body: { fromFacilityId, toFacilityId, transferDate?, notes?, status?: 'DRAFT'|'IN_TRANSIT'|'RECEIVED', lines: [{ itemId, quantity }] }
        if (!body.fromFacilityId || !body.toFacilityId) {
          return NextResponse.json({ error: 'fromFacilityId and toFacilityId required' }, { status: 400 })
        }
        if (body.fromFacilityId === body.toFacilityId) {
          return NextResponse.json({ error: 'Source and destination facility must be different' }, { status: 400 })
        }
        if (!body.lines || !Array.isArray(body.lines) || body.lines.length === 0) {
          return NextResponse.json({ error: 'At least 1 line item required' }, { status: 400 })
        }
        // Facility-ownership: user must have access to BOTH facilities (so a user
        // can't transfer stock out of a facility they don't own)
        if (!canWriteFacility(body.fromFacilityId)) {
          return NextResponse.json({ error: 'You do not have access to the source facility' }, { status: 403 })
        }
        if (!canWriteFacility(body.toFacilityId)) {
          return NextResponse.json({ error: 'You do not have access to the destination facility' }, { status: 403 })
        }
        // Verify both facilities belong to the same organization (no cross-org transfers)
        const [fromFac, toFac] = await Promise.all([
          db.facility.findUnique({ where: { id: body.fromFacilityId }, select: { id: true, organizationId: true, name: true } }),
          db.facility.findUnique({ where: { id: body.toFacilityId }, select: { id: true, organizationId: true, name: true } }),
        ])
        if (!fromFac || !toFac) {
          return NextResponse.json({ error: 'Source or destination facility not found' }, { status: 404 })
        }
        if (fromFac.organizationId !== toFac.organizationId) {
          return NextResponse.json({ error: 'Cannot transfer stock between facilities in different organizations' }, { status: 400 })
        }

        const transferNumber = await generateStockTransferCode(body.fromFacilityId)
        const status = body.status || 'DRAFT'

        // Fetch source items + verify stock availability + snapshot at transfer time
        const lineItems = await Promise.all(
          (body.lines as any[]).filter(l => l.itemId && Number(l.quantity) > 0).map(l =>
            db.inventoryItem.findUnique({
              where: { id: l.itemId },
              select: { id: true, name: true, sku: true, category: true, unit: true, unitCost: true, currentStock: true, facilityId: true },
            }).then(item => ({ ...item, requestedQty: Number(l.quantity) }))
          )
        )
        if (lineItems.some(it => !it || !it.id)) {
          return NextResponse.json({ error: 'One or more source items not found' }, { status: 404 })
        }
        // Verify source items belong to the source facility
        for (const it of lineItems) {
          if (it.facilityId !== body.fromFacilityId) {
            return NextResponse.json({ error: `Item "${it.name}" does not belong to the source facility` }, { status: 400 })
          }
          if (status === 'IN_TRANSIT' || status === 'RECEIVED') {
            // For non-draft transfers, verify sufficient stock
            if (it.currentStock < it.requestedQty) {
              return NextResponse.json({ error: `Insufficient stock for "${it.name}". Has ${it.currentStock}, needs ${it.requestedQty}.` }, { status: 400 })
            }
          }
        }

        const transfer = await db.stockTransfer.create({
          data: {
            transferNumber,
            fromFacilityId: body.fromFacilityId,
            toFacilityId: body.toFacilityId,
            status,
            transferDate: body.transferDate ? new Date(body.transferDate) : new Date(),
            notes: body.notes || null,
            createdById: currentUser.id,
            createdByName: currentUser.name,
            lines: {
              create: lineItems.map(it => ({
                itemId: it.id,
                quantity: it.requestedQty,
                itemName: it.name,
                itemSku: it.sku,
                itemCategory: it.category,
                itemUnit: it.unit,
                itemUnitCost: it.unitCost,
              })),
            },
          },
          include: {
            lines: true,
            fromFacility: { select: { id: true, name: true } },
            toFacility: { select: { id: true, name: true } },
          },
        })

        // If created directly in IN_TRANSIT status, decrement source stock now
        // (so it's "in transit" — no longer at source, not yet at destination)
        if (status === 'IN_TRANSIT' || status === 'RECEIVED') {
          for (const line of transfer.lines) {
            // TRANSFER_OUT transaction on the source item
            await db.inventoryTransaction.create({
              data: {
                itemId: line.itemId,
                type: 'TRANSFER_OUT',
                quantity: -line.quantity,  // negative for out
                reason: `Transfer ${transferNumber} → ${toFac.name}`,
                date: new Date(),
                recordedBy: currentUser.name,
                stockTransferId: transfer.id,
              },
            })
            await db.inventoryItem.update({
              where: { id: line.itemId },
              data: { currentStock: { decrement: line.quantity }, lastCountDate: new Date() },
            })
          }
        }

        // If RECEIVED at creation (rare — usually a separate step), also create
        // destination items + TRANSFER_IN transactions
        if (status === 'RECEIVED') {
          await receiveStockTransfer(transfer, currentUser)
        }

        const txFacilityName = await getFacilityName(body.fromFacilityId)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'STOCK_TRANSFER_CREATED', entityType: 'STOCK_TRANSFER', entityId: transfer.id,
          description: `${currentUser.name} created stock transfer ${transferNumber}: ${fromFac.name} → ${toFac.name} (${transfer.lines.length} item(s), ${status})`,
          metadata: { transferNumber, fromFacilityId: body.fromFacilityId, toFacilityId: body.toFacilityId, status, lineCount: transfer.lines.length },
          facilityId: body.fromFacilityId, facilityName: txFacilityName,
        })
        return NextResponse.json(transfer)
      }

      case 'bankAccounts': {
        if (!body.name) return NextResponse.json({ error: 'name required' }, { status: 400 })
        const facilityId = body.facilityId || requestFacilityId || null

        // Resolve GL account: accept either glAccountId (UUID) or glAccountCode (e.g. "1010")
        let glAccountId = body.glAccountId
        if (!glAccountId && body.glAccountCode) {
          const acctWhere: any = { code: String(body.glAccountCode) }
          // When a facility is selected, include both facility-specific and global accounts
          if (facilityId) {
            const acct = await db.account.findFirst({
              where: { OR: [{ facilityId }, { facilityId: null }], code: String(body.glAccountCode) },
            })
            if (!acct) return NextResponse.json({ error: `GL account with code "${body.glAccountCode}" not found. Make sure the Chart of Accounts is set up first (Settings > Bulk Imports).` }, { status: 400 })
            glAccountId = acct.id
          } else {
            const acct = await db.account.findFirst({ where: acctWhere })
            if (!acct) return NextResponse.json({ error: `GL account with code "${body.glAccountCode}" not found` }, { status: 400 })
            glAccountId = acct.id
          }
        }
        if (!glAccountId) return NextResponse.json({ error: 'glAccountId or glAccountCode is required' }, { status: 400 })

        const code = await generateBankAccountCode(facilityId)
        const bank = await db.bankAccount.create({
          data: {
            code,
            name: body.name,
            type: body.type || 'BANK',
            accountNumber: body.accountNumber || null,
            bankName: body.bankName || null,
            branch: body.branch || null,
            glAccountId,
            openingBalance: body.openingBalance || 0,
            currentBalance: body.openingBalance || 0,
            facilityId,
            // Bulk import tracking
            importBatchId: body.importBatchId || null,
          },
        })
        const bankFacilityName = await getFacilityName(facilityId)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'BANK_ACCOUNT_CREATED', entityType: 'BANK_ACCOUNT', entityId: bank.id,
          description: `${currentUser.name} created bank account ${code} ${body.name} (${body.type || 'BANK'}, opening: ${body.openingBalance || 0})`,
          metadata: { code, name: body.name, type: body.type, openingBalance: body.openingBalance },
          facilityId, facilityName: bankFacilityName,
        })
        return NextResponse.json(bank)
      }

      case 'deposits': {
        if (!body.amount || body.amount <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
        if (!body.residentId) return NextResponse.json({ error: 'Resident required' }, { status: 400 })
        let depositFacilityId = body.facilityId || requestFacilityId || null
        if (!depositFacilityId && body.residentId) {
          const r = await db.resident.findUnique({ where: { id: body.residentId }, select: { facilityId: true, firstName: true, lastName: true, code: true } })
          depositFacilityId = r?.facilityId || null
        }
        const depositCode = await generateDepositCode(depositFacilityId)
        const deposit = await db.deposit.create({
          data: {
            depositCode,
            facilityId: depositFacilityId,
            residentId: body.residentId,
            type: body.type || 'ADMISSION',
            amount: parseFloat(body.amount),
            paymentDate: body.paymentDate ? new Date(body.paymentDate) : new Date(),
            paymentMethod: body.paymentMethod || 'BANK_TRANSFER',
            reference: body.reference || null,
            payerName: body.payerName || null,
            bankAccount: body.bankAccount || null,
            status: 'HELD',
            notes: body.notes || null,
            receivedBy: currentUser.name,
            receivedById: currentUser.id,
          },
        })
        // Auto-post JE: Dr. Bank / Cr. Resident Deposits Held (2300)
        try {
          const je = await autoPostDeposit(deposit, depositFacilityId)
          if (je) await db.deposit.update({ where: { id: deposit.id }, data: { journalEntryId: je.id } })
        } catch (e: any) { console.log('[AutoPost] Deposit JE warning:', e.message?.slice(0, 80)) }
        const depFacilityName = await getFacilityName(depositFacilityId)
        const depResident = await db.resident.findUnique({ where: { id: body.residentId }, select: { firstName: true, lastName: true, code: true } })
        const depResidentLabel = depResident ? `${depResident.code ? depResident.code + ' ' : ''}${depResident.firstName} ${depResident.lastName}`.trim() : '—'
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'DEPOSIT_RECEIVED', entityType: 'DEPOSIT', entityId: deposit.id,
          description: `${currentUser.name} received ${body.type || 'admission'} deposit ${depositCode} of ${body.amount} from ${depResidentLabel}`,
          metadata: { depositCode, amount: body.amount, type: body.type || 'ADMISSION', method: body.paymentMethod, residentCode: depResident?.code },
          facilityId: depositFacilityId, facilityName: depFacilityName,
        })
        return NextResponse.json(deposit)
      }

      case 'shifts': {
        // Conflict check: does this staff already have a shift on this date?
        if (body.staffId && body.date) {
          const shiftDate = new Date(body.date)
          const dayStart = new Date(shiftDate); dayStart.setHours(0, 0, 0, 0)
          const dayEnd = new Date(shiftDate); dayEnd.setHours(23, 59, 59, 999)
          const existing = await db.shift.findFirst({
            where: { staffId: body.staffId, date: { gte: dayStart, lte: dayEnd } },
          })
          if (existing) {
            return NextResponse.json({ error: `Conflict: ${existing.shiftType} shift already exists for this staff on this day (${existing.startTime}–${existing.endTime})` }, { status: 409 })
          }

          // Leave conflict check: is this staff on approved leave that day?
          const leaveConflict = await db.staffLeave.findFirst({
            where: {
              staffId: body.staffId,
              status: 'APPROVED',
              startDate: { lte: shiftDate },
              endDate: { gte: shiftDate },
            },
            include: { staff: { select: { firstName: true, lastName: true } } },
          })
          if (leaveConflict) {
            return NextResponse.json({
              error: `Leave conflict: ${leaveConflict.staff?.firstName} ${leaveConflict.staff?.lastName} is on ${leaveConflict.type.toLowerCase()} leave from ${new Date(leaveConflict.startDate).toDateString()} to ${new Date(leaveConflict.endDate).toDateString()}. Cannot schedule a shift during approved leave.`,
              conflict: true,
              leaveConflict: true,
            }, { status: 409 })
          }
        }
        const shift = await db.shift.create({ data: body })
        const s = await db.staff.findUnique({ where: { id: body.staffId }, select: { firstName: true, lastName: true, code: true, facilityId: true } })
        const staffLabel = s ? `${s.code ? s.code + ' ' : ''}${s.firstName} ${s.lastName}`.trim() : 'unknown staff'
        const facility = await getFacilityName(s?.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.SHIFT_ADDED,
          entityType: 'STAFF',
          entityId: body.staffId,
          description: `${currentUser.name} added ${body.shiftType} shift for ${staffLabel} (${body.startTime}–${body.endTime})`,
          metadata: { staffId: body.staffId, staffCode: s?.code, shiftType: body.shiftType },
          facilityId: s?.facilityId || null,
          facilityName: facility,
        })
        return NextResponse.json(shift)
      }

      case 'products': {
        const facilityId = body.facilityId || requestFacilityId || null
        const productCode = await generateProductCode(facilityId)
        const product = await db.product.create({ data: { ...body, code: productCode, facilityId } })
        const prodFacilityName = await getFacilityName(facilityId)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'PRODUCT_CREATED', entityType: 'PRODUCT', entityId: product.id,
          description: `${currentUser.name} created product ${productCode} ${body.name} (${body.category || ''}, ${body.unitPrice || 0})`,
          metadata: { productCode, name: body.name, category: body.category, unitPrice: body.unitPrice },
          facilityId, facilityName: prodFacilityName,
        })
        return NextResponse.json(product)
      }

      case 'leaves': {
        const leave = await db.staffLeave.create({ data: body })
        const leaveStaff = body.staffId ? await db.staff.findUnique({ where: { id: body.staffId }, select: { firstName: true, lastName: true, code: true, facilityId: true } }) : null
        const leaveFacilityName = await getFacilityName(leaveStaff?.facilityId || null)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'LEAVE_CREATED', entityType: 'STAFF', entityId: leave.id,
          description: `${currentUser.name} created leave for ${leaveStaff ? `${leaveStaff.code || ''} ${leaveStaff.firstName} ${leaveStaff.lastName}`.trim() : 'staff'} (${body.type || ''}, ${body.startDate || ''} to ${body.endDate || ''})`,
          metadata: { staffId: body.staffId, staffCode: leaveStaff?.code, leaveType: body.type, startDate: body.startDate, endDate: body.endDate },
          facilityId: leaveStaff?.facilityId || null, facilityName: leaveFacilityName,
        })
        return NextResponse.json(leave)
      }

      case 'attendance': {
        // Upsert: one attendance record per staff per day
        const existing = await db.staffAttendance.findUnique({
          where: { staffId_date: { staffId: body.staffId, date: new Date(body.date) } },
        })
        if (existing) {
          const updated = await db.staffAttendance.update({ where: { id: existing.id }, data: body })
          return NextResponse.json(updated)
        }
        const att = await db.staffAttendance.create({ data: body })
        return NextResponse.json(att)
      }

      case 'payroll': {
        // Default facilityId: prefer body.facilityId, then requestFacilityId, then staff's primary facilityId.
        // Without this fallback, payrolls created without an explicit facility filter
        // would have facilityId=null and be invisible in the list (GET filters by facilityId).
        let payrollFacilityId = body.facilityId || requestFacilityId || null
        if (!payrollFacilityId && body.staffId) {
          const staff = await db.staff.findUnique({ where: { id: body.staffId }, select: { facilityId: true } })
          payrollFacilityId = staff?.facilityId || null
        }
        const facilityId = payrollFacilityId
        // Compute Malaysian statutory deductions
        const grossPay = body.grossPay || (body.basicSalary || 0) + (body.overtimePay || 0) + (body.allowances || 0) + (body.bonus || 0) + (body.commission || 0)
        const epfWage = Math.min(grossPay, 4000) // EPF wage ceiling
        const socsoWage = Math.min(grossPay, 4000) // SOCSO wage ceiling
        const eisWage = Math.min(grossPay, 4000) // EIS wage ceiling

        const epfEmployee = Math.round(epfWage * 0.11 * 100) / 100
        const epfEmployer = Math.round(epfWage * 0.12 * 100) / 100 // 12% (non-foreigner, <RM5000)
        const socsoEmployee = Math.round(socsoWage * 0.005 * 100) / 100
        const socsoEmployer = Math.round(socsoWage * 0.0175 * 100) / 100
        const eisEmployee = Math.round(eisWage * 0.002 * 100) / 100
        const eisEmployer = Math.round(eisWage * 0.002 * 100) / 100
        const totalDeductions = epfEmployee + socsoEmployee + eisEmployee + (body.pcbTax || 0) + (body.zakat || 0) + (body.loanDeduction || 0) + (body.unpaidLeaveDeduction || 0)
        const netPay = Math.round((grossPay - totalDeductions) * 100) / 100

        const payroll = await db.payroll.create({
          data: {
            staffId: body.staffId,
            facilityId,
            payrollMonth: body.payrollMonth,
            periodStart: body.periodStart ? new Date(body.periodStart) : new Date(),
            periodEnd: body.periodEnd ? new Date(body.periodEnd) : new Date(),
            status: body.status || 'DRAFT',
            basicSalary: body.basicSalary || 0,
            overtimePay: body.overtimePay || 0,
            allowances: body.allowances || 0,
            bonus: body.bonus || 0,
            commission: body.commission || 0,
            grossPay,
            epfEmployee, epfEmployer,
            socsoEmployee, socsoEmployer,
            eisEmployee, eisEmployer,
            pcbTax: body.pcbTax || 0,
            zakat: body.zakat || 0,
            loanDeduction: body.loanDeduction || 0,
            unpaidLeaveDeduction: body.unpaidLeaveDeduction || 0,
            totalDeductions: Math.round(totalDeductions * 100) / 100,
            netPay,
            workingDays: body.workingDays || 0,
            overtimeHours: body.overtimeHours || 0,
            unpaidLeaveDays: body.unpaidLeaveDays || 0,
            notes: body.notes || null,
          },
        })
        return NextResponse.json(payroll)
      }

      case 'payrollLineItems': {
        const item = await db.payrollLineItem.create({ data: body })
        return NextResponse.json(item)
      }

      case 'inventory': {
        const facilityId = body.facilityId || requestFacilityId || null
        // Facility-ownership check — inventory items are bound to a facility
        if (facilityId && !canWriteFacility(facilityId)) {
          return NextResponse.json({ error: 'You do not have access to this facility' }, { status: 403 })
        }
        const invCode = await generateInventoryCode(facilityId)
        const invItem = await db.inventoryItem.create({ data: { ...body, code: invCode, facilityId } })
        const invFacilityName = await getFacilityName(facilityId)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: 'INVENTORY_CREATED', entityType: 'INVENTORY', entityId: invItem.id,
          description: `${currentUser.name} created inventory item ${invCode} ${body.name} (${body.category || ''}, stock: ${body.currentStock || 0})`,
          metadata: { invCode, name: body.name, category: body.category, currentStock: body.currentStock },
          facilityId, facilityName: invFacilityName,
        })
        return NextResponse.json(invItem)
      }

      case 'inventoryTransactions': {
        if (!body.itemId) return NextResponse.json({ error: 'Item ID required' }, { status: 400 })
        if (body.quantity == null) return NextResponse.json({ error: 'Quantity required' }, { status: 400 })
        // Facility-ownership check — verify the item belongs to an accessible facility
        const txnItem = await db.inventoryItem.findUnique({ where: { id: body.itemId }, select: { id: true, facilityId: true, currentStock: true, name: true } })
        if (!txnItem) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
        if (txnItem.facilityId && !canWriteFacility(txnItem.facilityId)) {
          return NextResponse.json({ error: 'You do not have access to this facility' }, { status: 403 })
        }
        // Check if stock would go negative for STOCK_OUT
        if (body.type === 'STOCK_OUT' || (body.type === 'ADJUSTMENT' && body.quantity < 0)) {
          if (txnItem.currentStock + body.quantity < 0) {
            return NextResponse.json({ error: `Insufficient stock. ${txnItem.name} has ${txnItem.currentStock} units, cannot remove ${Math.abs(body.quantity)}.` }, { status: 400 })
          }
        }
        // When a transaction is created, also update the item's currentStock
        // Populate recordedById from the authenticated user (canonical link).
        const txn = await db.inventoryTransaction.create({
          data: {
            ...body,
            recordedById: body.recordedById || currentUser.id,
          },
        })
        await db.inventoryItem.update({
          where: { id: body.itemId },
          data: { currentStock: { increment: body.quantity || 0 }, lastCountDate: new Date() },
        })
        return NextResponse.json(txn)
      }

      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
    }
  } catch (e: any) {
    console.error('API POST error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH /api/data?type=...&id=... — update record
export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || ''
  const id = searchParams.get('id') || ''
  const body = await req.json()

  // Auth check
  const currentUser = await getSessionUser(req)
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Resolve accessible facility IDs for ownership checks in PATCH handlers.
  // For PATCH, we don't always have a facilityId query param — pass null and let
  // each handler that needs to check ownership call canAccessFacility() directly.
  const { accessibleFacilityIds: patchAccessibleFacilityIds, isScoped: patchIsScoped } = await resolveAccessibleFacilityIds(currentUser, null)
  const canWriteFacilityPatch = (fid: string | null | undefined): boolean => {
    if (!fid) return false
    if (!patchIsScoped) return true  // Developer with no scope
    return patchAccessibleFacilityIds.includes(fid)
  }

  // Facility ownership check — verify the record being patched belongs to a
  // facility the user can write to. Skip for Developer (already covered above)
  // and for unknown types (they'll fall through to the default case).
  // We look up the record's facilityId via getRecordFacilityId, which knows
  // how to resolve it for each type (direct or via parent relation).
  if (patchIsScoped && id && type) {
    const recordFacilityId = await getRecordFacilityId(type, id)
    if (recordFacilityId !== undefined && recordFacilityId !== null) {
      if (!canWriteFacilityPatch(recordFacilityId)) {
        return NextResponse.json(
          { error: 'You do not have access to this record (facility mismatch)' },
          { status: 403 },
        )
      }
    }
    // If recordFacilityId is null/undefined, skip the check — the record may be
    // global (e.g., a global custom field) or the type is unknown.
  }

  try {
    switch (type) {
      case 'residents': {
        // Fetch the current resident to capture the previous status and name
        const prevResident = await db.resident.findUnique({ where: { id }, select: { status: true, firstName: true, lastName: true, code: true, facilityId: true, bedId: true } })

        // If bedId is changing, manage bed statuses:
        //   - Old bed → AVAILABLE
        //   - New bed → OCCUPIED
        if (body.bedId !== undefined && prevResident) {
          if (prevResident.bedId && prevResident.bedId !== body.bedId) {
            // Free the old bed
            await db.bed.update({ where: { id: prevResident.bedId }, data: { status: 'AVAILABLE' } }).catch(() => {})
          }
          if (body.bedId) {
            // Occupy the new bed
            await db.bed.update({ where: { id: body.bedId }, data: { status: 'OCCUPIED' } }).catch(() => {})
            // Also set roomId from the bed's room (keep them in sync)
            const bed = await db.bed.findUnique({ where: { id: body.bedId }, select: { roomId: true } })
            if (bed) body.roomId = bed.roomId
          }
        }

        // Extract statusReason (not a DB field — used only for logging)
        const { statusReason, ...updateData } = body
        const updated = await db.resident.update({ where: { id }, data: updateData })

        // If resident status changed, handle medication effects + log the change
        if (body.status && prevResident && prevResident.status !== body.status) {
          const fromStatus = prevResident.status
          const residentName = `${prevResident.firstName} ${prevResident.lastName}`
          const residentCode = prevResident.code || ''

          // Record the status change in the log
          await db.residentStatusLog.create({
            data: {
              residentId: id,
              fromStatus,
              toStatus: body.status,
              changedById: currentUser.id,
              changedByName: currentUser.name,
              reason: statusReason || null,
            },
          })

          // Also log to audit trail — include resident name and code
          const facility = await getFacilityName(prevResident.facilityId)
          await logAudit({
            userId: currentUser.id,
            userName: currentUser.name,
            userCode: currentUser.code,
            userRole: currentUser.role,
            action: 'RESIDENT_STATUS_CHANGED',
            entityType: 'RESIDENT',
            entityId: id,
            description: `${currentUser.name} changed ${residentCode ? residentCode + ' ' : ''}${residentName}'s status from ${fromStatus.replace(/_/g, ' ')} to ${body.status.replace(/_/g, ' ')}${statusReason ? ' — ' + statusReason : ''}`,
            metadata: { fromStatus, toStatus: body.status, reason: statusReason, residentName, residentCode },
            facilityId: prevResident.facilityId || null,
            facilityName: facility,
          })

          if (body.status === 'HOSPITALIZED' || body.status === 'OUT_WITH_FAMILY') {
            // Auto-mark all PENDING meds as RESIDENT_OUT
            await db.medAdministration.updateMany({
              where: { residentId: id, status: 'PENDING' },
              data: { status: 'RESIDENT_OUT', notes: `Auto-marked: resident ${body.status.toLowerCase().replace(/_/g, ' ')}` },
            })
            // Auto-free the bed (bed becomes AVAILABLE while resident is away)
            // Resident keeps their roomId + bedId so they can be re-assigned on return
            if (updated.bedId) {
              await db.bed.update({ where: { id: updated.bedId }, data: { status: 'AVAILABLE' } })
            }
          } else if (body.status === 'DISCHARGED' || body.status === 'DECEASED') {
            // Deactivate all medications and mark pending meds as RESIDENT_OUT
            await db.medication.updateMany({
              where: { residentId: id, active: true },
              data: { active: false },
            })
            await db.medAdministration.updateMany({
              where: { residentId: id, status: 'PENDING' },
              data: { status: 'RESIDENT_OUT', notes: `Auto-marked: resident ${body.status.toLowerCase()}` },
            })
            // Fully release the bed + room assignment (resident is gone permanently)
            if (updated.bedId) {
              await db.bed.update({ where: { id: updated.bedId }, data: { status: 'AVAILABLE' } })
            }
            // Clear bedId + roomId on the resident record
            await db.resident.update({ where: { id }, data: { bedId: null, roomId: null } })
          } else if (body.status === 'ACTIVE') {
            // Resident returning — re-occupy their bed if they still have one assigned
            if (updated.bedId) {
              await db.bed.update({ where: { id: updated.bedId }, data: { status: 'OCCUPIED' } })
            }
          }
        }

        return NextResponse.json(updated)
      }

      case 'rooms': {
        // If updating roomNumber, check for duplicates (scoped to facility)
        if (body.roomNumber) {
          // Fetch the room's facilityId for scoping the duplicate check
          const existingRoom = await db.room.findUnique({ where: { id }, select: { facilityId: true } })
          const conflict = await db.room.findFirst({
            where: { roomNumber: body.roomNumber, facilityId: existingRoom?.facilityId, NOT: { id } },
          })
          if (conflict) return NextResponse.json({ error: `Room number "${body.roomNumber}" already exists in this facility` }, { status: 400 })
        }
        // Don't reduce capacity below current occupancy
        if (body.capacity !== undefined) {
          const newCap = Math.max(1, parseInt(String(body.capacity)) || 1)
          const currentOccupancy = await db.resident.count({
            where: { roomId: id, status: 'ACTIVE' },
          })
          if (currentOccupancy > newCap) {
            return NextResponse.json({ error: `Cannot reduce capacity below current occupancy (${currentOccupancy} residents)` }, { status: 400 })
          }
          body.capacity = newCap
        }
        // Don't allow setting an occupied room to "AVAILABLE" — it's logically inconsistent.
        // (Occupied rooms can be marked MAINTENANCE for planned work, but not AVAILABLE.)
        if (body.status === 'AVAILABLE') {
          const currentOccupancy = await db.resident.count({
            where: { roomId: id, status: 'ACTIVE' },
          })
          if (currentOccupancy > 0) {
            return NextResponse.json({
              error: `Cannot mark room as "Available" — it has ${currentOccupancy} active resident(s). Discharge or reassign them first, or use "Maintenance" status.`,
            }, { status: 400 })
          }
        }
        return NextResponse.json(await db.room.update({ where: { id }, data: body }))
      }

      case 'staff':
        return NextResponse.json(await db.staff.update({ where: { id }, data: body }))

      case 'payroll': {
        // PATCH payroll — typically used for status changes (DRAFT → APPROVED → PAID)
        // and to set paidAt/paidByName/paymentMethod/paymentReference when marking as PAID.
        const updated = await db.payroll.update({ where: { id }, data: body })

        // When status changes to PAID, auto-post the payroll journal entry:
        //   Dr. Salaries + Overtime + Employer EPF + Employer SOCSO
        //   Cr. EPF Payable + SOCSO Payable + Tax Payable + Bank (net pay)
        if (body.status === 'PAID') {
          // Re-fetch the full payroll with staff relation for the JE memo
          const fullPayroll = await db.payroll.findUnique({
            where: { id },
            include: { staff: { select: { firstName: true, lastName: true, code: true } } },
          })
          if (fullPayroll) {
            try {
              await autoPostPayroll(fullPayroll, fullPayroll.facilityId || null)
            } catch (e: any) {
              console.log('[AutoPost Payroll] JE warning:', e.message?.slice(0, 200))
            }
          }
          // Log the disbursement
          await logAudit({
            userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
            action: 'PAYMENT_PAID', entityType: 'PAYROLL', entityId: id,
            description: `${currentUser.name} disbursed payroll for ${updated.payrollMonth} (${updated.paymentMethod || '—'} ref: ${updated.paymentReference || '—'}) — net ${updated.netPay}`,
            metadata: { payrollMonth: updated.payrollMonth, netPay: updated.netPay, paymentMethod: updated.paymentMethod, paymentReference: updated.paymentReference },
            facilityId: updated.facilityId || null, facilityName: await getFacilityName(updated.facilityId || null),
          }).catch(() => {})
        }

        return NextResponse.json(updated)
      }

      case 'attendance': {
        // PATCH attendance — used for check-out (set checkOut, workedHours, overtimeHours)
        // and for manual status edits.
        const updated = await db.staffAttendance.update({ where: { id }, data: body })
        return NextResponse.json(updated)
      }

      case 'medications':
        return NextResponse.json(await db.medication.update({ where: { id }, data: body }))

      case 'medAdmins': {
        const updated = await db.medAdministration.update({ where: { id }, data: body })
        if (body.status) {
          const full = await db.medAdministration.findUnique({ where: { id }, include: { medication: true, resident: true } })
          const residentLabel = full?.resident ? `${full.resident.code ? full.resident.code + ' ' : ''}${full.resident.firstName} ${full.resident.lastName}`.trim() : 'unknown resident'
          const facility = await getFacilityName(full?.resident?.facilityId)
          await logAudit({
            userId: currentUser.id,
            userName: currentUser.name,
            userCode: currentUser.code,
            userRole: currentUser.role,
            action: body.status === 'GIVEN' ? AUDIT_ACTIONS.MED_ADMINISTERED : AUDIT_ACTIONS.MED_REFUSED,
            entityType: 'MEDICATION',
            entityId: full?.medicationId,
            description: `${currentUser.name} ${body.status === 'GIVEN' ? 'administered' : 'recorded refusal of'} ${full?.medication?.name || 'medication'} ${full?.medication?.dosage || ''} to ${residentLabel}`.trim(),
            metadata: { residentId: full?.residentId, residentCode: full?.resident?.code, medicationId: full?.medicationId, status: body.status },
            facilityId: full?.resident?.facilityId || null,
            facilityName: facility,
          })
        }
        return NextResponse.json(updated)
      }

      case 'visits': {
        const updated = await db.visit.update({ where: { id }, data: body })
        if (body.status === 'COMPLETED') {
          const full = await db.visit.findUnique({ where: { id }, include: { resident: { include: { room: true } } } })
          const residentLabel = full?.resident ? `${full.resident.code ? full.resident.code + ' ' : ''}${full.resident.firstName} ${full.resident.lastName}`.trim() : 'unknown resident'
          const facility = await getFacilityName(full?.resident?.facilityId)
          await logAudit({
            userId: currentUser.id,
            userName: currentUser.name,
            userCode: currentUser.code,
            userRole: currentUser.role,
            action: AUDIT_ACTIONS.VISIT_COMPLETED,
            entityType: 'VISIT',
            entityId: id,
            description: `${currentUser.name} marked ${full?.visitType?.replace(/_/g, ' ') || 'visit'} as completed for ${residentLabel}`,
            metadata: { visitId: id, residentCode: full?.resident?.code },
            facilityId: full?.resident?.facilityId || null,
            facilityName: facility,
          })
        }
        return NextResponse.json(updated)
      }

      case 'invoices': {
        // Prevent changes to auto-generated fields + relation fields
        // (items is a relation — can't be updated via a simple PATCH.
        // Use the dedicated invoice items endpoints for that.)
        const { invoiceNumber: _ignoredInvNum, items: _ignoredItems, ...invoiceBody } = body
        const updated = await db.invoice.update({ where: { id }, data: invoiceBody, include: { items: true } })
        if (body.amountPaid !== undefined) {
          const facility = await getFacilityName(updated.facilityId)
          await logAudit({
            userId: currentUser.id,
            userName: currentUser.name,
            userCode: currentUser.code,
            userRole: currentUser.role,
            action: AUDIT_ACTIONS.INVOICE_PAID,
            entityType: 'INVOICE',
            entityId: id,
            description: `${currentUser.name} recorded payment for invoice ${updated.invoiceNumber} (status: ${body.status || updated.status})`,
            metadata: { invoiceNumber: updated.invoiceNumber, amountPaid: body.amountPaid, status: body.status },
            facilityId: updated.facilityId || null,
            facilityName: facility,
          })
        }
        return NextResponse.json(updated)
      }

      case 'invoiceItems': {
        const updated = await db.invoiceItem.update({ where: { id }, data: body })
        // Look up resident for facility context
        const itemWithResident = await db.invoiceItem.findUnique({ where: { id }, select: { residentId: true, resident: { select: { facilityId: true } } } })
        const facility = await getFacilityName(itemWithResident?.resident?.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.UNBILLED_ITEM_EDITED,
          entityType: 'INVOICE_ITEM',
          entityId: id,
          description: `${currentUser.name} edited unbilled item "${body.description || ''}" (qty: ${body.quantity}, price: ${body.unitPrice})`,
          metadata: { quantity: body.quantity, unitPrice: body.unitPrice, total: body.total },
          facilityId: itemWithResident?.resident?.facilityId || null,
          facilityName: facility,
        })
        return NextResponse.json(updated)
      }

      case 'vitals':
        return NextResponse.json(await db.vitalSign.update({ where: { id }, data: body }))

      case 'incidents':
        return NextResponse.json(await db.incidentReport.update({ where: { id }, data: body }))

      case 'shifts':
        return NextResponse.json(await db.shift.update({ where: { id }, data: body }))

      case 'messages':
        return NextResponse.json(await db.familyMessage.update({ where: { id }, data: body }))

      case 'products':
        return NextResponse.json(await db.product.update({ where: { id }, data: body }))

      case 'leaves': {
        // When a leave is being APPROVED, automatically delete any existing shifts
        // for that staff within the leave date range — shifts must not clash with approved leave.
        let autoDeletedShifts = 0
        if (body.status === 'APPROVED') {
          const leave = await db.staffLeave.findUnique({ where: { id }, include: { staff: { select: { firstName: true, lastName: true, code: true, facilityId: true } } } })
          if (leave) {
            const leaveStart = new Date(leave.startDate); leaveStart.setHours(0, 0, 0, 0)
            const leaveEnd = new Date(leave.endDate); leaveEnd.setHours(23, 59, 59, 999)
            const conflictingShifts = await db.shift.findMany({
              where: {
                staffId: leave.staffId,
                date: { gte: leaveStart, lte: leaveEnd },
              },
              include: { staff: { select: { firstName: true, lastName: true, code: true } } },
            })
            if (conflictingShifts.length > 0) {
              // Delete all conflicting shifts
              await db.shift.deleteMany({
                where: {
                  staffId: leave.staffId,
                  date: { gte: leaveStart, lte: leaveEnd },
                },
              })
              // Log the auto-cleanup so there's an audit trail
              const staffLabel = leave.staff ? `${leave.staff.code ? leave.staff.code + ' ' : ''}${leave.staff.firstName} ${leave.staff.lastName}`.trim() : 'unknown staff'
              const facility = await getFacilityName(leave.staff?.facilityId)
              await logAudit({
                userId: currentUser.id,
                userName: currentUser.name,
                userCode: currentUser.code,
                userRole: currentUser.role,
                action: 'SHIFT_DELETED',
                entityType: 'STAFF',
                entityId: leave.staffId,
                description: `${currentUser.name} approved leave for ${staffLabel} (${leaveStart.toDateString()} → ${leaveEnd.toDateString()}); auto-deleted ${conflictingShifts.length} conflicting shift(s)`,
                metadata: {
                  leaveId: id,
                  staffId: leave.staffId,
                  deletedShiftIds: conflictingShifts.map(s => s.id),
                  leaveRange: { start: leaveStart.toISOString(), end: leaveEnd.toISOString() },
                },
                facilityId: leave.staff?.facilityId || null,
                facilityName: facility,
              })
              autoDeletedShifts = conflictingShifts.length
            }
          }
        }
        const updated = await db.staffLeave.update({ where: { id }, data: body })
        return NextResponse.json({ ...updated, autoDeletedShifts })
      }

      case 'inventory': {
        // Facility-ownership check — verify the item belongs to an accessible facility
        const invExisting = await db.inventoryItem.findUnique({ where: { id }, select: { facilityId: true, name: true } })
        if (!invExisting) return NextResponse.json({ error: 'Item not found' }, { status: 404 })
        if (invExisting.facilityId && !canWriteFacilityPatch(invExisting.facilityId)) {
          return NextResponse.json({ error: 'You do not have access to this facility' }, { status: 403 })
        }
        // If body.facilityId is being changed, also check the target facility
        if (body.facilityId && body.facilityId !== invExisting.facilityId && !canWriteFacilityPatch(body.facilityId)) {
          return NextResponse.json({ error: 'You do not have access to the target facility' }, { status: 403 })
        }
        return NextResponse.json(await db.inventoryItem.update({ where: { id }, data: body }))
      }

      case 'expenses': {
        // If vendorId is provided in the body, auto-populate vendorName from the linked vendor
        // (keeps the denormalized field in sync for backwards-compat display).
        if (body.vendorId) {
          const v = await db.vendor.findUnique({ where: { id: body.vendorId }, select: { name: true } })
          if (v) body.vendorName = v.name
        } else if (body.vendorId === null || body.vendorId === '') {
          // Vendor was cleared — also clear the denormalized name
          body.vendorName = null
        }
        // Same for paidByStaffId → paidBy
        if (body.paidByStaffId) {
          const s = await db.staff.findUnique({ where: { id: body.paidByStaffId }, select: { firstName: true, lastName: true } })
          if (s) body.paidBy = `${s.firstName} ${s.lastName}`.trim()
        } else if (body.paidByStaffId === null || body.paidByStaffId === '') {
          body.paidBy = null
        }
        return NextResponse.json(await db.expense.update({ where: { id }, data: body }))
      }

      case 'payments': {
        // Update an existing payment. If `amount` changes we must recompute the
        // appliedAmount on each linked invoice. The simplest safe behaviour:
        //   - Recompute total appliedAmount from existing applications
        //   - If new amount < appliedAmount, we cap appliedAmount at the new amount
        //     (and the user must manually unapply applications to fix invoice balances).
        const existing = await db.payment.findUnique({
          where: { id },
          include: { applications: true },
        })
        if (!existing) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

        const newAmount = body.amount != null ? parseFloat(body.amount) : existing.amount
        const cappedApplied = Math.min(existing.appliedAmount, newAmount)

        // Prevent changes to auto-generated fields
        const { paymentCode: _ignoredPayCode, appliedAmount: _ignoredApplied, ...paymentBody } = body
        const updated = await db.payment.update({
          where: { id },
          data: { ...paymentBody, amount: newAmount, appliedAmount: cappedApplied },
          include: { applications: true },
        })

        const payFacName = await getFacilityName(updated.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.PAYMENT_UPDATED,
          entityType: 'PAYMENT',
          entityId: id,
          description: `${currentUser.name} updated payment ${updated.paymentCode} (amount: ${updated.amount}, method: ${updated.method}, status: ${updated.status})`,
          metadata: { paymentCode: updated.paymentCode, amount: updated.amount, method: updated.method, status: updated.status },
          facilityId: updated.facilityId || null,
          facilityName: payFacName,
        })

        return NextResponse.json(updated)
      }

      case 'purchaseOrders': {
        // PATCH handler for purchase orders
        // Supports:
        //   - Update header fields (vendorId, orderDate, expectedDate, notes, etc.)
        //   - Replace lines (if body.lines is provided)
        //   - Status transitions: DRAFT -> SUBMITTED -> RECEIVED -> CANCELLED
        //   - On RECEIVED: create InventoryTransactions, update stock, post JE
        const existing = await db.purchaseOrder.findUnique({
          where: { id },
          include: {
            lines: {
              include: {
                item: { select: { id: true, name: true, category: true } },
                product: { select: { id: true, name: true, category: true, expenseAccountId: true, expenseAccount: { select: { id: true } } } },
              },
            },
          },
        })
        if (!existing) return NextResponse.json({ error: 'PO not found' }, { status: 404 })

        // Facility-ownership check — POs are bound to a facility
        if (existing.facilityId && !canWriteFacilityPatch(existing.facilityId)) {
          return NextResponse.json({ error: 'You do not have access to this facility' }, { status: 403 })
        }

        const round2 = (n: number) => Math.round(n * 100) / 100
        const newStatus = body.status || existing.status
        const wasReceived = existing.status === 'RECEIVED'
        const willReceive = newStatus === 'RECEIVED' && !wasReceived

        // Separate line-level updates from header-level updates
        const { lines: bodyLines, ...headerBody } = body

        // Recompute totals if lines are being replaced
        let subtotal = existing.subtotal
        let total = existing.total
        let tax = existing.tax
        if (bodyLines && Array.isArray(bodyLines)) {
          subtotal = round2(bodyLines.reduce((s: number, l: any) => s + (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0), 0))
          tax = round2(Number(body.tax) || 0)
          total = round2(subtotal + tax)
        } else if (body.tax != null) {
          tax = round2(Number(body.tax) || 0)
          total = round2(subtotal + tax)
        }

        const paidAmount = body.paidAmount != null ? round2(Number(body.paidAmount)) : existing.paidAmount
        const paymentMethod = body.paymentMethod !== undefined ? body.paymentMethod : existing.paymentMethod
        const paymentStatus = paidAmount >= total && total > 0 ? 'PAID' : (paidAmount > 0 ? 'PARTIAL' : 'UNPAID')

        // Update header
        const updated = await db.purchaseOrder.update({
          where: { id },
          data: {
            ...headerBody,
            status: newStatus,
            vendorId: body.vendorId !== undefined ? (body.vendorId || null) : existing.vendorId,
            orderDate: body.orderDate ? new Date(body.orderDate) : existing.orderDate,
            expectedDate: body.expectedDate ? new Date(body.expectedDate) : (body.expectedDate === null ? null : existing.expectedDate),
            paymentMethod,
            paymentStatus,
            subtotal,
            tax,
            total,
            paidAmount,
            receivedDate: willReceive ? new Date() : (body.receivedDate !== undefined ? (body.receivedDate ? new Date(body.receivedDate) : null) : existing.receivedDate),
          },
        })

        // Replace lines if provided
        if (bodyLines && Array.isArray(bodyLines)) {
          // Delete existing lines, then create new ones
          await db.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } })
          for (const l of bodyLines) {
            await db.purchaseOrderLine.create({
              data: {
                purchaseOrderId: id,
                itemId: l.itemId || null,
                productId: l.productId || null,
                description: l.description || '',
                quantity: Number(l.quantity) || 0,
                unitPrice: Number(l.unitPrice) || 0,
                total: round2((Number(l.quantity) || 0) * (Number(l.unitPrice) || 0)),
                receivedQty: willReceive ? (Number(l.quantity) || 0) : (l.receivedQty || 0),
              },
            })
          }
        }

        // Handle RECEIVED transition: create InventoryTransactions + post JE
        if (willReceive) {
          const freshLines = await db.purchaseOrderLine.findMany({
            where: { purchaseOrderId: id },
            include: {
              item: { select: { id: true, name: true, category: true } },
              product: { select: { id: true, name: true, category: true, expenseAccountId: true, expenseAccount: { select: { id: true } } } },
            },
          })
          for (const line of freshLines) {
            const qtyToReceive = line.quantity - (line.receivedQty || 0)
            if (line.itemId && qtyToReceive > 0) {
              await db.inventoryTransaction.create({
                data: {
                  itemId: line.itemId,
                  type: 'STOCK_IN',
                  quantity: qtyToReceive,
                  reason: `PO ${existing.poNumber} received`,
                  date: new Date(),
                  recordedBy: currentUser.name,
                  purchaseOrderId: id,
                },
              })
              await db.inventoryItem.update({
                where: { id: line.itemId },
                data: {
                  currentStock: { increment: qtyToReceive },
                  lastCountDate: new Date(),
                  unitCost: line.unitPrice > 0 ? line.unitPrice : undefined,
                },
              })
            }
            // Mark line as fully received
            await db.purchaseOrderLine.update({
              where: { id: line.id },
              data: { receivedQty: line.quantity },
            })
          }

          // Post the JE
          const poForJe = { ...updated, lines: freshLines }
          try {
            const je = await autoPostPurchaseOrder(poForJe, updated.facilityId)
            if (je) {
              await db.purchaseOrder.update({ where: { id }, data: { journalEntryId: je.id } })
            }
          } catch (e: any) {
            console.error('[PO PATCH] autoPostPurchaseOrder failed:', e.message)
          }

          const poFacilityName = await getFacilityName(updated.facilityId)
          await logAudit({
            userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
            action: 'PURCHASE_ORDER_RECEIVED', entityType: 'PURCHASE_ORDER', entityId: id,
            description: `${currentUser.name} received PO ${existing.poNumber} (${total})`,
            metadata: { poNumber: existing.poNumber, total, lineCount: freshLines.length },
            facilityId: updated.facilityId || null, facilityName: poFacilityName,
          })
        } else if (newStatus === 'CANCELLED' && wasReceived && existing.journalEntryId) {
          // Optional: if a received PO is cancelled, leave the JE in place
          // (reversing it requires a separate reversing JE — too complex for now)
          // Just log the cancellation
          const poFacilityName = await getFacilityName(updated.facilityId)
          await logAudit({
            userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
            action: 'PURCHASE_ORDER_CANCELLED', entityType: 'PURCHASE_ORDER', entityId: id,
            description: `${currentUser.name} cancelled PO ${existing.poNumber} (was already received — JE not reversed)`,
            metadata: { poNumber: existing.poNumber, total, priorStatus: existing.status },
            facilityId: updated.facilityId || null, facilityName: poFacilityName,
          })
        } else if (newStatus === 'CANCELLED') {
          const poFacilityName = await getFacilityName(updated.facilityId)
          await logAudit({
            userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
            action: 'PURCHASE_ORDER_CANCELLED', entityType: 'PURCHASE_ORDER', entityId: id,
            description: `${currentUser.name} cancelled PO ${existing.poNumber}`,
            metadata: { poNumber: existing.poNumber, total, priorStatus: existing.status },
            facilityId: updated.facilityId || null, facilityName: poFacilityName,
          })
        }

        // Re-fetch with relations for the response
        const result = await db.purchaseOrder.findUnique({
          where: { id },
          include: {
            vendor: { select: { id: true, code: true, name: true } },
            lines: {
              include: {
                item: { select: { id: true, name: true, code: true, category: true, unit: true } },
                product: { select: { id: true, name: true, code: true, category: true, unit: true } },
              },
            },
          },
        })
        return NextResponse.json(result)
      }

      case 'stockTransfers': {
        // PATCH handler — supports status transitions:
        //   DRAFT → IN_TRANSIT  (decrements source stock)
        //   IN_TRANSIT → RECEIVED  (creates destination items + increments dest stock)
        //   any → CANCELLED  (if IN_TRANSIT, restores source stock)
        const existing = await db.stockTransfer.findUnique({
          where: { id },
          include: { lines: true, fromFacility: { select: { name: true } }, toFacility: { select: { name: true } } },
        })
        if (!existing) return NextResponse.json({ error: 'Stock transfer not found' }, { status: 404 })

        // Facility-ownership: user must have access to BOTH facilities
        if (!canWriteFacilityPatch(existing.fromFacilityId)) {
          return NextResponse.json({ error: 'You do not have access to the source facility' }, { status: 403 })
        }
        if (!canWriteFacilityPatch(existing.toFacilityId)) {
          return NextResponse.json({ error: 'You do not have access to the destination facility' }, { status: 403 })
        }

        const newStatus = body.status || existing.status
        const wasReceived = existing.status === 'RECEIVED'
        const wasInTransit = existing.status === 'IN_TRANSIT'

        // === Transition: DRAFT → IN_TRANSIT ===
        // Decrement source stock for each line + create TRANSFER_OUT transactions
        if (newStatus === 'IN_TRANSIT' && existing.status === 'DRAFT') {
          // Verify sufficient stock on all source items
          for (const line of existing.lines) {
            const item = await db.inventoryItem.findUnique({ where: { id: line.itemId }, select: { currentStock: true, name: true } })
            if (!item) return NextResponse.json({ error: `Source item not found for line ${line.id}` }, { status: 404 })
            if (item.currentStock < line.quantity) {
              return NextResponse.json({ error: `Insufficient stock for "${item.name}". Has ${item.currentStock}, needs ${line.quantity}.` }, { status: 400 })
            }
          }
          for (const line of existing.lines) {
            await db.inventoryTransaction.create({
              data: {
                itemId: line.itemId,
                type: 'TRANSFER_OUT',
                quantity: -line.quantity,
                reason: `Transfer ${existing.transferNumber} → ${existing.toFacility.name}`,
                date: new Date(),
                recordedBy: currentUser.name,
                stockTransferId: existing.id,
              },
            })
            await db.inventoryItem.update({
              where: { id: line.itemId },
              data: { currentStock: { decrement: line.quantity }, lastCountDate: new Date() },
            })
          }
        }

        // === Transition: IN_TRANSIT → RECEIVED ===
        // Create destination items (if missing) + TRANSFER_IN transactions + increment dest stock
        if (newStatus === 'RECEIVED' && !wasReceived) {
          await receiveStockTransfer(existing, currentUser)
        }

        // === Transition: any → CANCELLED ===
        // If the transfer was already IN_TRANSIT (source stock was decremented),
        // we need to RESTORE source stock before cancelling
        if (newStatus === 'CANCELLED' && wasInTransit && !wasReceived) {
          for (const line of existing.lines) {
            // Reverse the TRANSFER_OUT: create a TRANSFER_IN back to source
            await db.inventoryTransaction.create({
              data: {
                itemId: line.itemId,
                type: 'TRANSFER_IN',
                quantity: line.quantity,  // positive — restoring
                reason: `Transfer ${existing.transferNumber} CANCELLED — stock returned`,
                date: new Date(),
                recordedBy: currentUser.name,
                stockTransferId: existing.id,
              },
            })
            await db.inventoryItem.update({
              where: { id: line.itemId },
              data: { currentStock: { increment: line.quantity }, lastCountDate: new Date() },
            })
          }
        }

        // Update the transfer record (status, notes, etc.)
        const updated = await db.stockTransfer.update({
          where: { id },
          data: {
            status: newStatus,
            notes: body.notes !== undefined ? (body.notes || null) : existing.notes,
            receivedDate: newStatus === 'RECEIVED' && !wasReceived ? new Date() : existing.receivedDate,
          },
          include: {
            fromFacility: { select: { id: true, name: true } },
            toFacility: { select: { id: true, name: true } },
            lines: {
              include: {
                item: { select: { id: true, name: true, code: true, unit: true, currentStock: true } },
                destinationItem: { select: { id: true, name: true, code: true, currentStock: true } },
              },
            },
          },
        })

        const txFacilityName = await getFacilityName(existing.fromFacilityId)
        await logAudit({
          userId: currentUser.id, userName: currentUser.name, userCode: currentUser.code, userRole: currentUser.role,
          action: newStatus === 'RECEIVED' ? 'STOCK_TRANSFER_RECEIVED' : (newStatus === 'CANCELLED' ? 'STOCK_TRANSFER_CANCELLED' : 'STOCK_TRANSFER_UPDATED'),
          entityType: 'STOCK_TRANSFER', entityId: id,
          description: `${currentUser.name} updated stock transfer ${existing.transferNumber} → ${newStatus} (${existing.fromFacility.name} → ${existing.toFacility.name})`,
          metadata: { transferNumber: existing.transferNumber, newStatus, priorStatus: existing.status },
          facilityId: existing.fromFacilityId, facilityName: txFacilityName,
        })
        return NextResponse.json(updated)
      }

      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
    }
  } catch (e: any) {
    console.error('API PATCH error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE /api/data?type=...&id=...
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || ''
  const id = searchParams.get('id') || ''

  // Auth check
  const currentUser = await getSessionUser(req)
  if (!currentUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Facility ownership check — same pattern as PATCH.
  // Verifies the record being deleted belongs to a facility the user can write to.
  const { accessibleFacilityIds: deleteAccessibleFacilityIds, isScoped: deleteIsScoped } = await resolveAccessibleFacilityIds(currentUser, null)
  if (deleteIsScoped && id && type) {
    const recordFacilityId = await getRecordFacilityId(type, id)
    if (recordFacilityId !== undefined && recordFacilityId !== null) {
      const canWrite = deleteAccessibleFacilityIds.includes(recordFacilityId)
      if (!canWrite) {
        return NextResponse.json(
          { error: 'You do not have access to this record (facility mismatch)' },
          { status: 403 },
        )
      }
    }
  }

  try {
    switch (type) {
      case 'residents':
        // Soft delete: mark as DISCHARGED
        return NextResponse.json(await db.resident.update({ where: { id }, data: { status: 'DISCHARGED', dischargeDate: new Date() } }))

      case 'rooms': {
        // Don't allow deleting rooms with active residents
        const activeResidents = await db.resident.count({
          where: { roomId: id, status: 'ACTIVE' },
        })
        if (activeResidents > 0) {
          return NextResponse.json({ error: `Cannot delete: room has ${activeResidents} active resident(s). Reassign them first.` }, { status: 400 })
        }
        return NextResponse.json(await db.room.delete({ where: { id } }))
      }
      case 'staff':
      case 'medications':
      case 'medAdmins':
      case 'vitals':
      case 'invoiceItems':
      case 'expenses':
      case 'shifts':
      case 'messages':
      case 'products':
      case 'inventory':
      case 'inventoryTransactions':
      case 'leaves':
      case 'attendance':
      case 'payroll':
      case 'payrollLineItems':
      case 'purchaseOrders':
      case 'purchaseOrderLines':
      case 'productVendorPrices':
      case 'stockTransfers':
      case 'stockTransferLines': {
        // Map URL type names to Prisma model names (URL uses plural, Prisma uses singular)
        const modelMap: Record<string, string> = {
          expenses: 'expense',
          shifts: 'shift',
          messages: 'familyMessage',
          products: 'product',
          inventory: 'inventoryItem',
          inventoryTransactions: 'inventoryTransaction',
          invoiceItems: 'invoiceItem',
          leaves: 'staffLeave',
          attendance: 'staffAttendance',
          payroll: 'payroll',
          payrollLineItems: 'payrollLineItem',
          purchaseOrders: 'purchaseOrder',
          purchaseOrderLines: 'purchaseOrderLine',
          productVendorPrices: 'productVendorPrice',
          stockTransfers: 'stockTransfer',
          stockTransferLines: 'stockTransferLine',
        }
        const modelName = modelMap[type] || type
        const model = (db as any)[modelName]
        if (!model) return NextResponse.json({ error: `Unknown type: ${type}` }, { status: 400 })
        // For POs, cascade-delete lines first (the relation has onDelete: Cascade,
        // but doing it explicitly avoids any FK surprises on older SQLite builds)
        if (type === 'purchaseOrders') {
          await db.purchaseOrderLine.deleteMany({ where: { purchaseOrderId: id } })
        }
        // For stock transfers, cascade-delete lines + null-out any linked InventoryTransactions
        if (type === 'stockTransfers') {
          await db.inventoryTransaction.updateMany({ where: { stockTransferId: id }, data: { stockTransferId: null } })
          await db.stockTransferLine.deleteMany({ where: { stockTransferId: id } })
        }
        return NextResponse.json(await model.delete({ where: { id } }))
      }

      case 'visits': {
        // Visit deletion has its own handler so we can audit the deletion with full context
        // (resident, visit type, scheduled date, who did it) — clinical records are sensitive
        // and we want a clear paper trail when they're removed.
        const visit = await db.visit.findUnique({
          where: { id },
          include: { resident: { select: { code: true, firstName: true, lastName: true, facilityId: true } } },
        })
        if (!visit) return NextResponse.json({ error: 'Visit not found' }, { status: 404 })
        const residentLabel = visit.resident
          ? `${visit.resident.code ? visit.resident.code + ' ' : ''}${visit.resident.firstName} ${visit.resident.lastName}`.trim()
          : 'unknown resident'
        const facility = await getFacilityName(visit.resident?.facilityId || null)
        await db.visit.delete({ where: { id } })
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.VISIT_DELETED,
          entityType: 'VISIT',
          entityId: id,
          description: `${currentUser.name} deleted ${visit.visitType?.replace(/_/g, ' ') || 'visit'} for ${residentLabel} (scheduled ${visit.scheduledAt?.toISOString?.() || '—'})`,
          metadata: {
            visitId: id,
            residentId: visit.residentId,
            residentCode: visit.resident?.code,
            visitType: visit.visitType,
            status: visit.status,
            scheduledAt: visit.scheduledAt,
            completedAt: visit.completedAt,
            completedByName: visit.completedByName,
            externalSource: visit.externalSource,
            hadClinicalNotes: !!(visit.chiefComplaint || visit.diagnosis || visit.prescription || visit.findings || visit.treatmentPlan),
          },
          facilityId: visit.resident?.facilityId || null,
          facilityName: facility,
        })
        return NextResponse.json({ success: true, id })
      }

      case 'incidents': {
        return NextResponse.json(await db.incidentReport.delete({ where: { id } }))
      }

      case 'invoices':
        // Delete invoice and its items
        await db.invoiceItem.deleteMany({ where: { invoiceId: id } })
        return NextResponse.json(await db.invoice.delete({ where: { id } }))

      case 'payments': {
        // Delete a payment. We must:
        //   1. Reverse all applications on linked invoices (decrement their amountPaid)
        //   2. Recompute invoice status
        //   3. Delete all PaymentApplication rows for this payment
        //   4. Delete the payment itself
        const payment = await db.payment.findUnique({
          where: { id },
          include: { applications: true },
        })
        if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

        await db.$transaction(async (tx) => {
          // Reverse each application on its invoice
          for (const app of payment.applications) {
            const inv = await tx.invoice.findUnique({ where: { id: app.invoiceId } })
            if (inv) {
              const newPaid = Math.max(0, inv.amountPaid - app.amount)
              const newStatus = newPaid >= inv.total ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID'
              await tx.invoice.update({
                where: { id: inv.id },
                data: { amountPaid: newPaid, status: newStatus },
              })
            }
          }
          await tx.paymentApplication.deleteMany({ where: { paymentId: id } })
          await tx.payment.delete({ where: { id } })
        })

        const payDelFacName = await getFacilityName(payment.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.PAYMENT_DELETED,
          entityType: 'PAYMENT',
          entityId: id,
          description: `${currentUser.name} deleted payment ${payment.paymentCode} (amount: ${payment.amount}) and reversed ${payment.applications.length} application(s)`,
          metadata: { paymentCode: payment.paymentCode, amount: payment.amount, applicationCount: payment.applications.length },
          facilityId: payment.facilityId || null,
          facilityName: payDelFacName,
        })

        return NextResponse.json({ success: true, id, paymentCode: payment.paymentCode })
      }

      case 'paymentApplications': {
        // Unapply a single PaymentApplication (reverse the invoice effect, then delete the row)
        const app = await db.paymentApplication.findUnique({
          where: { id },
          include: { payment: true, invoice: true },
        })
        if (!app) return NextResponse.json({ error: 'Application not found' }, { status: 404 })

        await db.$transaction(async (tx) => {
          if (app.invoice) {
            const newPaid = Math.max(0, app.invoice.amountPaid - app.amount)
            const newStatus = newPaid >= app.invoice.total ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID'
            await tx.invoice.update({
              where: { id: app.invoiceId },
              data: { amountPaid: newPaid, status: newStatus },
            })
          }
          await tx.payment.update({
            where: { id: app.paymentId },
            data: { appliedAmount: Math.max(0, app.payment.appliedAmount - app.amount) },
          })
          await tx.paymentApplication.delete({ where: { id } })
        })

        const unappFacName = await getFacilityName(app.payment.facilityId)
        await logAudit({
          userId: currentUser.id,
          userName: currentUser.name,
          userCode: currentUser.code,
          userRole: currentUser.role,
          action: AUDIT_ACTIONS.PAYMENT_UNAPPLIED,
          entityType: 'PAYMENT',
          entityId: app.paymentId,
          description: `${currentUser.name} unapplied ${app.amount} from payment ${app.payment.paymentCode} on invoice ${app.invoice?.invoiceNumber || '—'}`,
          metadata: { paymentCode: app.payment.paymentCode, invoiceNumber: app.invoice?.invoiceNumber, amount: app.amount },
          facilityId: app.payment.facilityId || null,
          facilityName: unappFacName,
        })

        return NextResponse.json({ success: true, id })
      }

      default:
        return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
    }
  } catch (e: any) {
    console.error('API DELETE error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
