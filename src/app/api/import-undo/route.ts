import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// DELETE /api/import-undo — undo a previous bulk import by batchId.
//
// Body: { batchId: string, entityType: 'resident' | 'staff' | 'room' | 'product' | 'vendor' }
//
// Deletes all rows with the given batchId. The caller must have permission
// to delete records of the given type in the facilities those records belong
// to (we filter by facilityIds accessible to the user).
//
// Returns: { success: boolean, deleted: number, error?: string }
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only Owner / Manager / Developer can undo imports
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  let body: any = {}
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { batchId, entityType } = body
  if (!batchId || typeof batchId !== 'string') {
    return NextResponse.json({ error: 'batchId is required' }, { status: 400 })
  }
  if (!entityType || typeof entityType !== 'string') {
    return NextResponse.json({ error: 'entityType is required' }, { status: 400 })
  }

  // Validate batchId format (IMP-xxxxx-yyyyy) to prevent SQL injection
  if (!/^IMP-[a-z0-9]+-[a-z0-9]+$/i.test(batchId)) {
    return NextResponse.json({ error: 'Invalid batchId format' }, { status: 400 })
  }

  // Determine the user's accessible facility IDs for scoping
  let userFacilityIds: string[] = []
  if (user.role === 'APP_DEVELOPER') {
    // Developer can undo any import across all facilities
    userFacilityIds = []  // empty = no facility filter
  } else if (user.role === 'OWNER') {
    // Owner is scoped to their organization's facilities
    if (!user.organizationId) {
      return NextResponse.json({ error: 'Your account is not linked to an organization' }, { status: 400 })
    }
    const facs = await db.facility.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
    })
    userFacilityIds = facs.map(f => f.id)
  } else {
    // Manager — scoped to their assigned facilities
    userFacilityIds = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
  }

  const facilityFilter = userFacilityIds.length > 0
    ? { facilityId: { in: userFacilityIds } }
    : {}

  try {
    let deleted = 0
    let entityLabel = entityType

    switch (entityType) {
      case 'resident':
      case 'residents': {
        // Before deleting residents, we must delete their child records
        // (medications, vitals, invoices, etc.) to avoid foreign-key errors.
        // For SQLite + Prisma, child cascades aren't always configured.
        const residents = await db.resident.findMany({
          where: { importBatchId: batchId, ...facilityFilter },
          select: { id: true },
        })
        const residentIds = residents.map(r => r.id)
        if (residentIds.length > 0) {
          // Delete child records in dependency order
          await db.residentStatusLog.deleteMany({ where: { residentId: { in: residentIds } } }).catch(() => {})
          await db.familyMessage.deleteMany({ where: { residentId: { in: residentIds } } }).catch(() => {})
          await db.incidentReport.deleteMany({ where: { residentId: { in: residentIds } } }).catch(() => {})
          await db.visit.deleteMany({ where: { residentId: { in: residentIds } } }).catch(() => {})
          await db.careLog.deleteMany({ where: { residentId: { in: residentIds } } }).catch(() => {})
          await db.vitalSign.deleteMany({ where: { residentId: { in: residentIds } } }).catch(() => {})
          await db.medAdministration.deleteMany({ where: { residentId: { in: residentIds } } }).catch(() => {})
          await db.medication.deleteMany({ where: { residentId: { in: residentIds } } }).catch(() => {})
          await db.invoiceItem.deleteMany({ where: { residentId: { in: residentIds } } }).catch(() => {})
          await db.deposit.deleteMany({ where: { residentId: { in: residentIds } } }).catch(() => {})
          // Delete the residents themselves
          const result = await db.resident.deleteMany({
            where: { id: { in: residentIds } },
          })
          deleted = result.count
        }
        entityLabel = 'residents'
        break
      }

      case 'staff':
      case 'staffs': {
        // Delete child records first (shifts, leaves, care logs, etc.)
        const staff = await db.staff.findMany({
          where: { importBatchId: batchId, ...facilityFilter },
          select: { id: true },
        })
        const staffIds = staff.map(s => s.id)
        if (staffIds.length > 0) {
          await db.staffLeave.deleteMany({ where: { staffId: { in: staffIds } } }).catch(() => {})
          await db.shift.deleteMany({ where: { staffId: { in: staffIds } } }).catch(() => {})
          await db.careLog.deleteMany({ where: { staffId: { in: staffIds } } }).catch(() => {})
          await db.medAdministration.deleteMany({ where: { staffId: { in: staffIds } } }).catch(() => {})
          await db.incidentReport.deleteMany({ where: { reportedById: { in: staffIds } } }).catch(() => {})
          const result = await db.staff.deleteMany({
            where: { id: { in: staffIds } },
          })
          deleted = result.count
        }
        entityLabel = 'staff'
        break
      }

      case 'room':
      case 'rooms': {
        // Note: rooms with residents assigned cannot be deleted (FK constraint)
        const result = await db.room.deleteMany({
          where: { importBatchId: batchId, ...facilityFilter },
        })
        deleted = result.count
        entityLabel = 'rooms'
        break
      }

      case 'product':
      case 'products': {
        const result = await db.product.deleteMany({
          where: { importBatchId: batchId, ...facilityFilter },
        })
        deleted = result.count
        entityLabel = 'products'
        break
      }

      case 'vendor':
      case 'vendors': {
        // Unlink vendors from expenses (set vendorId to null) before deleting
        const vendors = await db.vendor.findMany({
          where: { importBatchId: batchId, ...facilityFilter },
          select: { id: true },
        })
        if (vendors.length > 0) {
          const vendorIds = vendors.map(v => v.id)
          await db.expense.updateMany({
            where: { vendorId: { in: vendorIds } },
            data: { vendorId: null },
          }).catch(() => {})
          const result = await db.vendor.deleteMany({
            where: { id: { in: vendorIds } },
          })
          deleted = result.count
        }
        entityLabel = 'vendors'
        break
      }

      case 'account':
      case 'accounts': {
        // Note: GL accounts that are referenced by BankAccounts, JournalLines,
        // Budgets, or Products (revenueAccount/expenseAccount) cannot be deleted
        // due to FK constraints. The deleteMany will silently skip those.
        // We also don't auto-delete child journal entries — that would corrupt the GL.
        // The user should reverse/post correcting entries manually.
        const result = await db.account.deleteMany({
          where: { importBatchId: batchId, ...facilityFilter },
        })
        deleted = result.count
        entityLabel = 'accounts'
        break
      }

      case 'bankAccount':
      case 'bankAccounts': {
        // Unlink any expenses/payments that referenced this bank account (free-text field)
        // before deleting. BankAccounts referenced by JournalLines (rare) cannot be deleted.
        const banks = await db.bankAccount.findMany({
          where: { importBatchId: batchId, ...facilityFilter },
          select: { id: true, name: true },
        })
        if (banks.length > 0) {
          // Optional: clear the `bankAccount` free-text field on payments that match
          // by name (since BankAccount is linked to GL Account via glAccountId, not
          // directly to Payment). This is best-effort.
          const bankNames = banks.map(b => b.name)
          await db.payment.updateMany({
            where: { bankAccount: { in: bankNames } },
            data: { bankAccount: null },
          }).catch(() => {})
          const result = await db.bankAccount.deleteMany({
            where: { id: { in: banks.map(b => b.id) } },
          })
          deleted = result.count
        }
        entityLabel = 'bank accounts'
        break
      }

      case 'expense':
      case 'expenses': {
        // Expenses have an auto-posted JournalEntry linked via expenseId.
        // To undo cleanly: delete the JE (which cascades to JournalLines),
        // then delete the expense.
        const expenses = await db.expense.findMany({
          where: { importBatchId: batchId, ...facilityFilter },
          select: { id: true },
        })
        if (expenses.length > 0) {
          const expenseIds = expenses.map(e => e.id)
          // Delete linked journal entries (auto-posted)
          await db.journalEntry.deleteMany({
            where: { expenseId: { in: expenseIds } },
          }).catch(() => {})
          // Delete the expenses themselves
          const result = await db.expense.deleteMany({
            where: { id: { in: expenseIds } },
          })
          deleted = result.count
        }
        entityLabel = 'expenses'
        break
      }

      case 'payment':
      case 'payments': {
        // Payments have:
        //   - PaymentApplication records (linked via paymentId, onDelete: Cascade)
        //   - Auto-posted JournalEntry (linked via paymentId)
        //   - linked invoice.amountPaid (which was incremented when the payment was applied)
        // To undo cleanly:
        //   1. Reverse the invoice.amountPaid increments
        //   2. Delete the PaymentApplications (cascade handles this)
        //   3. Delete the JournalEntries
        //   4. Delete the payments
        const payments = await db.payment.findMany({
          where: { importBatchId: batchId, ...facilityFilter },
          include: {
            applications: { select: { id: true, invoiceId: true, amount: true } },
          },
        })
        if (payments.length > 0) {
          const paymentIds = payments.map(p => p.id)

          // 1. Reverse invoice.amountPaid for each PaymentApplication
          // Build a map of invoiceId → total amount to subtract
          const invoiceAdjustments: Record<string, number> = {}
          for (const p of payments) {
            for (const app of p.applications) {
              invoiceAdjustments[app.invoiceId] = (invoiceAdjustments[app.invoiceId] || 0) + app.amount
            }
          }
          for (const [invoiceId, subtractAmount] of Object.entries(invoiceAdjustments)) {
            const inv = await db.invoice.findUnique({
              where: { id: invoiceId },
              select: { id: true, amountPaid: true, total: true, status: true },
            })
            if (inv) {
              const newPaid = Math.max(0, inv.amountPaid - subtractAmount)
              // Recompute status
              let newStatus = inv.status
              if (newPaid <= 0) newStatus = 'UNPAID'
              else if (newPaid >= inv.total) newStatus = 'PAID'
              else newStatus = 'PARTIAL'
              // Don't overwrite CANCELLED status
              if (inv.status !== 'CANCELLED') {
                await db.invoice.update({
                  where: { id: invoiceId },
                  data: { amountPaid: newPaid, status: newStatus },
                })
              }
            }
          }

          // 2. Delete linked journal entries (auto-posted)
          await db.journalEntry.deleteMany({
            where: { paymentId: { in: paymentIds } },
          }).catch(() => {})

          // 3. Delete the payments (PaymentApplications cascade)
          const result = await db.payment.deleteMany({
            where: { id: { in: paymentIds } },
          })
          deleted = result.count
        }
        entityLabel = 'payments'
        break
      }

      default:
        return NextResponse.json({ error: `Unknown entityType: ${entityType}` }, { status: 400 })
    }

    // Audit log
    try {
      await logAudit({
        userId: user.id,
        userName: user.name,
        userCode: user.code,
        userRole: user.role,
        action: 'BULK_IMPORT_UNDONE',
        entityType: entityType.toUpperCase(),
        description: `${user.name} undid import batch ${batchId} — deleted ${deleted} ${entityLabel}`,
        metadata: { batchId, entityType, deleted },
        facilityId: null,
        facilityName: null,
      })
    } catch (e: any) {
      console.log('[Import-Undo] Audit log warning:', e.message)
    }

    return NextResponse.json({
      success: true,
      deleted,
      batchId,
      entityType,
    })
  } catch (e: any) {
    console.error('[Import-Undo] Error:', e)
    return NextResponse.json({
      success: false,
      deleted: 0,
      error: e.message || 'Failed to undo import',
    }, { status: 500 })
  }
}

// GET /api/import-undo?entityType=resident&batchId=IMP-xxx
// Returns the count of records that would be deleted if the undo is performed.
// Useful for a confirmation dialog: "You're about to delete N records..."
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const url = new URL(req.url)
  const batchId = url.searchParams.get('batchId')
  const entityType = url.searchParams.get('entityType')
  if (!batchId || !entityType) {
    return NextResponse.json({ error: 'batchId and entityType are required' }, { status: 400 })
  }

  let userFacilityIds: string[] = []
  if (user.role === 'OWNER') {
    if (!user.organizationId) return NextResponse.json({ error: 'Not linked to organization' }, { status: 400 })
    const facs = await db.facility.findMany({ where: { organizationId: user.organizationId }, select: { id: true } })
    userFacilityIds = facs.map(f => f.id)
  } else if (user.role === 'MANAGER') {
    userFacilityIds = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
  }

  const facilityFilter = userFacilityIds.length > 0 ? { facilityId: { in: userFacilityIds } } : {}

  try {
    let count = 0
    switch (entityType) {
      case 'resident':
      case 'residents':
        count = await db.resident.count({ where: { importBatchId: batchId, ...facilityFilter } })
        break
      case 'staff':
      case 'staffs':
        count = await db.staff.count({ where: { importBatchId: batchId, ...facilityFilter } })
        break
      case 'room':
      case 'rooms':
        count = await db.room.count({ where: { importBatchId: batchId, ...facilityFilter } })
        break
      case 'product':
      case 'products':
        count = await db.product.count({ where: { importBatchId: batchId, ...facilityFilter } })
        break
      case 'vendor':
      case 'vendors':
        count = await db.vendor.count({ where: { importBatchId: batchId, ...facilityFilter } })
        break
      case 'account':
      case 'accounts':
        count = await db.account.count({ where: { importBatchId: batchId, ...facilityFilter } })
        break
      case 'bankAccount':
      case 'bankAccounts':
        count = await db.bankAccount.count({ where: { importBatchId: batchId, ...facilityFilter } })
        break
      case 'expense':
      case 'expenses':
        count = await db.expense.count({ where: { importBatchId: batchId, ...facilityFilter } })
        break
      case 'payment':
      case 'payments':
        count = await db.payment.count({ where: { importBatchId: batchId, ...facilityFilter } })
        break
      default:
        return NextResponse.json({ error: `Unknown entityType: ${entityType}` }, { status: 400 })
    }

    return NextResponse.json({ count, batchId, entityType })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
