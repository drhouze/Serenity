import { db } from '@/lib/db'

// ============================================================
// Code generation library
// ============================================================
// Generates unique codes for residents, staff, invoices, payments, etc.
//
// Format options (per-prefix):
//   Without date:  PREFIX-0001        (e.g. RES-0001, INV-0001)
//   With date:     PREFIX-YYMMDD-0001 (e.g. RES-250708-0001, INV-250708-0001)
//
// Each prefix has its own "include date" toggle, stored as:
//   <prefixKey>Date — e.g. prefixResidentDate, prefixInvoiceDate
//
// All codes use 4-digit zero-padded sequential numbers (0001-9999).
// When date is included, the number resets daily.
//
// Settings can be global (Developer) or facility-scoped (Owner override).
// ============================================================

async function getSetting(key: string): Promise<string | undefined> {
  const s = await db.setting.findUnique({ where: { key } })
  if (!s) return undefined
  try { return JSON.parse(s.value) } catch { return undefined }
}

async function getPrefix(key: string, fallback: string, facilityId?: string | null): Promise<string> {
  if (facilityId) {
    const facVal = await getSetting(`facility:${facilityId}:${key}`)
    if (facVal) return facVal
  }
  return (await getSetting(key)) || fallback
}

/**
 * Check if date should be included for a specific prefix key.
 * Each prefix has its own toggle: <prefixKey>Date (e.g. prefixResidentDate).
 * Falls back to the global `codeIncludeDate` if the per-prefix toggle isn't set.
 */
async function shouldIncludeDateForPrefix(prefixKey: string, facilityId?: string | null): Promise<boolean> {
  const dateKey = `${prefixKey}Date`
  // Check facility-scoped per-prefix toggle first
  if (facilityId) {
    const facVal = await getSetting(`facility:${facilityId}:${dateKey}`)
    if (facVal !== undefined) return facVal === true || facVal === 'true'
  }
  // Check global per-prefix toggle
  const perPrefixVal = await getSetting(dateKey)
  if (perPrefixVal !== undefined) return perPrefixVal === true || perPrefixVal === 'true'
  // Fall back to the global "all codes" default
  const globalVal = await getSetting('codeIncludeDate')
  return globalVal === true || globalVal === 'true'
}

/**
 * Format today's date as YYMMDD (e.g. "250708" for July 8, 2025).
 */
function formatYYMMDD(date: Date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

function extractTrailingNumber(code: string): number {
  const m = code.match(/(\d+)$/)
  return m ? parseInt(m[1], 10) : 0
}

/**
 * Generate a unique code with prefix and sequential number.
 * All codes use 4-digit padding (0001-9999).
 *
 * @param prefixKey  - setting key for the prefix (e.g. 'prefixResident')
 * @param fallback   - default prefix if not configured (e.g. 'RES')
 * @param model      - Prisma model to check for uniqueness
 * @param field      - field name to check (default: 'code')
 * @param facilityId - optional facility ID for facility-scoped settings
 */
async function generateCode(
  prefixKey: string,
  fallback: string,
  model: any,
  field: string = 'code',
  facilityId?: string | null,
): Promise<string> {
  const prefix = await getPrefix(prefixKey, fallback, facilityId)
  const includeDate = await shouldIncludeDateForPrefix(prefixKey, facilityId)
  const dateStr = includeDate ? formatYYMMDD() : ''

  // Build the code prefix portion: "RES-" or "RES-250708-"
  const codePrefix = includeDate ? `${prefix}-${dateStr}-` : `${prefix}-`

  // Find the max existing number among codes that start with this prefix portion.
  const existing = await model.findMany({
    where: { [field]: { startsWith: codePrefix } },
    select: { [field]: true },
  })

  let maxNum = 0
  for (const row of existing) {
    const num = extractTrailingNumber(row[field])
    if (num > maxNum) maxNum = num
  }

  let num = maxNum + 1
  let code = `${codePrefix}${String(num).padStart(4, '0')}`

  // Ensure uniqueness (safety net — handles race conditions)
  while (await model.findUnique({ where: { [field]: code } })) {
    num++
    code = `${codePrefix}${String(num).padStart(4, '0')}`
  }

  return code
}

// ============== ENTITY-SPECIFIC GENERATORS ==============
// All generators accept an optional facilityId for facility-scoped settings.
// Each has its own per-prefix date toggle (e.g. prefixResidentDate).

export async function generateResidentCode(facilityId?: string | null): Promise<string> {
  return generateCode('prefixResident', 'RES', db.resident, 'code', facilityId)
}

export async function generateUserCode(facilityId?: string | null): Promise<string> {
  return generateCode('prefixUser', 'USR', db.user, 'code', facilityId)
}

export async function generateProductCode(facilityId?: string | null): Promise<string> {
  return generateCode('prefixProduct', 'PRD', db.product, 'code', facilityId)
}

export async function generateStaffCode(facilityId?: string | null): Promise<string> {
  return generateCode('prefixStaff', 'STF', db.staff, 'code', facilityId)
}

export async function generateRoomCode(facilityId?: string | null): Promise<string> {
  return generateCode('prefixRoom', 'ROM', db.room, 'code', facilityId)
}

export async function generateInventoryCode(facilityId?: string | null): Promise<string> {
  return generateCode('prefixInventory', 'ITM', db.inventoryItem, 'code', facilityId)
}

export async function generateInvoiceNumber(facilityId?: string | null): Promise<string> {
  return generateCode('prefixInvoice', 'INV', db.invoice, 'invoiceNumber', facilityId)
}

export async function generatePaymentCode(facilityId?: string | null): Promise<string> {
  return generateCode('prefixPayment', 'PMT', db.payment, 'paymentCode', facilityId)
}
