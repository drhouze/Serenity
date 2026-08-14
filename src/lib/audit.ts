import { db } from '@/lib/db'

export interface AuditEntry {
  userId?: string | null
  userName: string
  userCode?: string | null
  userRole?: string | null
  action: string           // e.g. LOGIN, LOGOUT, MED_ADMINISTERED, VITAL_RECORDED
  entityType?: string      // RESIDENT, MEDICATION, INVOICE, etc.
  entityId?: string | null
  description: string      // human-readable summary
  metadata?: any           // extra details (will be JSON-stringified)
  ipAddress?: string | null
  facilityId?: string | null      // which facility the action took place in
  facilityName?: string | null    // denormalized facility name for display
}

// Log an audit entry. Non-blocking — errors are swallowed so they never break the main operation.
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        userId: entry.userId || null,
        userName: entry.userCode ? `${entry.userCode} ${entry.userName}` : entry.userName,
        userRole: entry.userRole || null,
        action: entry.action,
        entityType: entry.entityType || null,
        entityId: entry.entityId || null,
        description: entry.description,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
        ipAddress: entry.ipAddress || null,
        facilityId: entry.facilityId || null,
        facilityName: entry.facilityName || null,
      },
    })
  } catch (e) {
    // Audit logging should never break the main operation
    console.error('Audit log error:', e)
  }
}

// Helper: look up facilityId + facilityName from a resident
export async function getFacilityFromResident(residentId: string | null | undefined): Promise<{ facilityId: string | null; facilityName: string | null }> {
  if (!residentId) return { facilityId: null, facilityName: null }
  try {
    const r = await db.resident.findUnique({
      where: { id: residentId },
      select: { facilityId: true, facility: { select: { name: true } } },
    })
    return { facilityId: r?.facilityId || null, facilityName: r?.facility?.name || null }
  } catch { return { facilityId: null, facilityName: null } }
}

// Helper: look up facilityId + facilityName from a staff member
export async function getFacilityFromStaff(staffId: string | null | undefined): Promise<{ facilityId: string | null; facilityName: string | null }> {
  if (!staffId) return { facilityId: null, facilityName: null }
  try {
    const s = await db.staff.findUnique({
      where: { id: staffId },
      select: { facilityId: true, facility: { select: { name: true } } },
    })
    return { facilityId: s?.facilityId || null, facilityName: s?.facility?.name || null }
  } catch { return { facilityId: null, facilityName: null } }
}

// Helper: look up facilityId + facilityName from a room
export async function getFacilityFromRoom(roomId: string | null | undefined): Promise<{ facilityId: string | null; facilityName: string | null }> {
  if (!roomId) return { facilityId: null, facilityName: null }
  try {
    const r = await db.room.findUnique({
      where: { id: roomId },
      select: { facilityId: true, facility: { select: { name: true } } },
    })
    return { facilityId: r?.facilityId || null, facilityName: r?.facility?.name || null }
  } catch { return { facilityId: null, facilityName: null } }
}

// Helper: look up facility directly by ID
export async function getFacilityName(facilityId: string | null | undefined): Promise<string | null> {
  if (!facilityId) return null
  try {
    const f = await db.facility.findUnique({ where: { id: facilityId }, select: { name: true } })
    return f?.name || null
  } catch { return null }
}

// Common action constants
export const AUDIT_ACTIONS = {
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  RESIDENT_CREATED: 'RESIDENT_CREATED',
  RESIDENT_UPDATED: 'RESIDENT_UPDATED',
  RESIDENT_ARCHIVED: 'RESIDENT_ARCHIVED',
  RESIDENT_RESTORED: 'RESIDENT_RESTORED',
  MED_ADMINISTERED: 'MED_ADMINISTERED',
  MED_REFUSED: 'MED_REFUSED',
  VITAL_RECORDED: 'VITAL_RECORDED',
  CARE_LOG_ADDED: 'CARE_LOG_ADDED',
  VISIT_SCHEDULED: 'VISIT_SCHEDULED',
  VISIT_COMPLETED: 'VISIT_COMPLETED',
  VISIT_UPDATED: 'VISIT_UPDATED',
  VISIT_DELETED: 'VISIT_DELETED',
  INCIDENT_REPORTED: 'INCIDENT_REPORTED',
  INVOICE_CREATED: 'INVOICE_CREATED',
  INVOICE_PAID: 'INVOICE_PAID',
  INVOICE_DELETED: 'INVOICE_DELETED',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  PAYMENT_UPDATED: 'PAYMENT_UPDATED',
  PAYMENT_DELETED: 'PAYMENT_DELETED',
  PAYMENT_APPLIED: 'PAYMENT_APPLIED',
  PAYMENT_UNAPPLIED: 'PAYMENT_UNAPPLIED',
  EXPENSE_ADDED: 'EXPENSE_ADDED',
  UNBILLED_ITEM_ADDED: 'UNBILLED_ITEM_ADDED',
  UNBILLED_ITEM_EDITED: 'UNBILLED_ITEM_EDITED',
  UNBILLED_ITEM_REPEATED: 'UNBILLED_ITEM_REPEATED',
  MONTHLY_CHARGES_GENERATED: 'MONTHLY_CHARGES_GENERATED',
  MESSAGE_SENT: 'MESSAGE_SENT',
  INVENTORY_ADJUSTED: 'INVENTORY_ADJUSTED',
  USER_CREATED: 'USER_CREATED',
  USER_UPDATED: 'USER_UPDATED',
  SHIFT_ADDED: 'SHIFT_ADDED',
  E_INVOICE_SUBMITTED: 'E_INVOICE_SUBMITTED',
  E_INVOICE_VALIDATED: 'E_INVOICE_VALIDATED',
  E_INVOICE_REJECTED: 'E_INVOICE_REJECTED',
  ORGANIZATION_BLOCKED: 'ORGANIZATION_BLOCKED',
  ORGANIZATION_UNBLOCKED: 'ORGANIZATION_UNBLOCKED',
  DATABASE_BACKUP: 'DATABASE_BACKUP',
  DATABASE_RESTORED: 'DATABASE_RESTORED',
  BULK_IMPORT_UNDONE: 'BULK_IMPORT_UNDONE',
  CUSTOM_FIELD_CREATED: 'CUSTOM_FIELD_CREATED',
  PURCHASE_ORDER_CREATED: 'PURCHASE_ORDER_CREATED',
  PURCHASE_ORDER_RECEIVED: 'PURCHASE_ORDER_RECEIVED',
  PURCHASE_ORDER_CANCELLED: 'PURCHASE_ORDER_CANCELLED',
  PURCHASE_ORDER_UPDATED: 'PURCHASE_ORDER_UPDATED',
  STOCK_TRANSFER_CREATED: 'STOCK_TRANSFER_CREATED',
  STOCK_TRANSFER_RECEIVED: 'STOCK_TRANSFER_RECEIVED',
  STOCK_TRANSFER_CANCELLED: 'STOCK_TRANSFER_CANCELLED',
  STOCK_TRANSFER_UPDATED: 'STOCK_TRANSFER_UPDATED',
} as const
