import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db, resetPrismaClient } from '@/lib/db'
import { logAudit, AUDIT_ACTIONS, getFacilityName } from '@/lib/audit'
import AdmZip from 'adm-zip'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

// POST /api/restore — restores database from a backup file
// Developer: FULL restore (replaces ALL data)
// Owner: ORG-SCOPED restore (only their org's data is replaced) — not yet supported
//
// Accepts TWO file formats:
//   1. JSON  — single .json file with { _meta, data: { table: rows[] } }
//              (created by GET /api/backup?format=json)
//   2. CSV ZIP — .zip file containing one CSV per table
//              (created by GET /api/backup?format=csv)
//
// The format is auto-detected from the file extension + content.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Developer or Owner only' }, { status: 403 })
  }

  const isDeveloper = user.role === 'APP_DEVELOPER'

  try {
    const formData = await req.formData()
    const file = formData.get('file')
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const fileName = file.name.toLowerCase()
    const isJson = fileName.endsWith('.json') || file.type === 'application/json'
    const isZip = fileName.endsWith('.zip') || file.type === 'application/zip'

    if (!isJson && !isZip) {
      return NextResponse.json({
        error: 'Unsupported file type. Please upload a .json backup file or a .zip CSV backup file exported from this system.',
      }, { status: 400 })
    }

    // ===== Parse the backup file into a unified `data` object: { tableName: rows[] } =====
    let data: Record<string, any[]>
    let meta: any = {}

    if (isJson) {
      // === JSON format ===
      const text = await file.text()
      let backup: any
      try {
        backup = JSON.parse(text)
      } catch {
        return NextResponse.json({ error: 'Invalid JSON file. Please use a backup file exported from this system.' }, { status: 400 })
      }
      if (!backup.data) {
        return NextResponse.json({ error: 'Invalid backup format — missing "data" key' }, { status: 400 })
      }
      data = backup.data
      meta = backup._meta || {}
    } else {
      // === CSV ZIP format ===
      // Parse the ZIP buffer into individual CSV files, then parse each CSV into rows.
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const data2: Record<string, any[]> = {}
      try {
        const zip = new AdmZip(buffer)
        const zipEntries = zip.getEntries()
        for (const entry of zipEntries) {
          const csvName = entry.entryName
          if (!csvName.endsWith('.csv')) continue
          const tableName = csvName.replace(/\.csv$/, '')
          const csvText = entry.getData().toString('utf8')
          const rows = parseCsv(csvText)
          if (rows.length > 0) data2[tableName] = rows
        }
      } catch (e: any) {
        return NextResponse.json({ error: `Failed to parse ZIP file: ${e.message}` }, { status: 400 })
      }
      data = data2
      meta = { format: 'csv-zip', tableCount: Object.keys(data).length }
    }

    let importedCount = 0
    let errorCount = 0
    let firstError: string | null = null

    // === For Owner-scoped restore, determine their facility IDs ===
    let ownerFacilityIds: string[] = []
    if (!isDeveloper && user.organizationId) {
      const orgFacilities = data.facilities?.filter((f: any) => f.organizationId === user.organizationId) || []
      ownerFacilityIds = orgFacilities.map((f: any) => f.id)
    }

    // Helper: should a row be imported for this user?
    const shouldImport = (row: any, facilityIdField = 'facilityId') => {
      if (isDeveloper) return true
      if (!row[facilityIdField]) return false
      return ownerFacilityIds.includes(row[facilityIdField])
    }

    // === FULL RESTORE (Developer) ===
    // Delete all existing data, then insert from backup
    if (isDeveloper) {
      // Delete in dependency order (children first, parents last).
      const tables = [
        // clinical / operational records (children of resident)
        'journalLines', 'journalEntries',
        'paymentApplications', 'payments',
        'invoiceItems', 'invoices', 'expenses',
        'medAdministrations', 'medications',
        'vitalSigns', 'visits', 'incidentReports', 'careLogs', 'familyMessages',
        'residentStatusLogs',
        'shifts', 'staffLeaves', 'staffAttendances',
        'payrolls', 'payrollLineItems',
        'inventoryTransactions',
        'purchaseOrderLines', 'purchaseOrders', 'stockTransfers', 'stockTransferLines',
        'deposits', 'bankAccounts', 'accounts', 'vendors', 'products', 'inventoryItems',
        'customFieldValues', 'customFieldValueVersions', 'orgCustomFields', 'orgCustomTabs',
        'productVendorPrices',
        'aITokenUsage',
        // parents
        'residents',
        'beds',
        'rooms',
        'staff',
        'auditLogs', 'settings',
        'globalCustomFields', 'globalCustomTabs',
        'users',
        'facilities',
        'organizations',
      ]

      const modelMap: Record<string, any> = {
        journalLines: db.journalLine, journalEntries: db.journalEntry,
        paymentApplications: db.paymentApplication, payments: db.payment,
        invoiceItems: db.invoiceItem, invoices: db.invoice, expenses: db.expense,
        medAdministrations: db.medAdministration, medications: db.medication,
        vitalSigns: db.vitalSign, visits: db.visit, incidentReports: db.incidentReport,
        careLogs: db.careLog, familyMessages: db.familyMessage,
        residentStatusLogs: db.residentStatusLog, shifts: db.shift, staffLeaves: db.staffLeave,
        staffAttendances: db.staffAttendance, payrolls: db.payroll, payrollLineItems: db.payrollLineItem,
        inventoryTransactions: db.inventoryTransaction,
        purchaseOrderLines: db.purchaseOrderLine, purchaseOrders: db.purchaseOrder,
        stockTransfers: db.stockTransfer, stockTransferLines: db.stockTransferLine,
        deposits: db.deposit, bankAccounts: db.bankAccount, accounts: db.account,
        vendors: db.vendor, products: db.product, inventoryItems: db.inventoryItem,
        customFieldValues: db.customFieldValue, customFieldValueVersions: db.customFieldValueVersion,
        orgCustomFields: db.orgCustomField, orgCustomTabs: db.orgCustomTab,
        productVendorPrices: db.productVendorPrice,
        aITokenUsage: db.aITokenUsage,
        rooms: db.room, beds: db.bed, staff: db.staff, residents: db.resident,
        auditLogs: db.auditLog, settings: db.setting,
        globalCustomFields: db.globalCustomField, globalCustomTabs: db.globalCustomTab,
        users: db.user, facilities: db.facility, organizations: db.organization,
      }

      // Delete all existing data — use deleteMany in order (children first)
      for (const table of tables) {
        const model = modelMap[table]
        if (model) {
          try { await model.deleteMany({}) } catch (e: any) {
            console.log(`[Restore] Delete ${table}:`, e.message?.slice(0, 100))
          }
        }
      }

      // Insert from backup in REVERSE order (parents first, children last)
      // so that FK targets exist before child rows are inserted.
      // Use createMany for bulk insert (much faster than individual create calls
      // — critical on Vercel serverless where each DB round-trip adds latency).
      const insertOrder = tables.slice().reverse()
      for (const table of insertOrder) {
        const rows = data[table]
        const model = modelMap[table]
        if (!rows || !model) continue

        // Process in batches of 100 to avoid sending too many rows in one query
        const BATCH_SIZE = 100
        for (let i = 0; i < rows.length; i += BATCH_SIZE) {
          const batch = rows.slice(i, i + BATCH_SIZE)
          // Sanitize EVERY row (both JSON and CSV) — PostgreSQL is strict about
          // types: empty strings in DateTime/Int/Boolean fields cause insert
          // failures. SQLite was lenient, so JSON backups from SQLite may contain
          // empty strings where PostgreSQL expects null.
          const cleanedBatch = batch.map(row => sanitizeRow(table, row))
          try {
            const result = await model.createMany({ data: cleanedBatch, skipDuplicates: true })
            importedCount += result.count || cleanedBatch.length
          } catch (e: any) {
            // createMany failed (possibly due to constraint violations or unsupported on this DB)
            // Fall back to individual creates for this batch
            errorCount++
            if (!firstError) firstError = `[${table}] createMany: ${e.message?.slice(0, 200)}`
            if (errorCount < 5) console.log(`[Restore] createMany ${table} failed, trying individual:`, e.message?.slice(0, 200))
            for (const row of batch) {
              try {
                const cleanedRow = sanitizeRow(table, row)
                await model.create({ data: cleanedRow })
                importedCount++
              } catch (e2: any) {
                errorCount++
                if (!firstError) firstError = `[${table}] row: ${e2.message?.slice(0, 200)}`
                if (errorCount < 5) console.log(`[Restore] Insert ${table}:`, e2.message?.slice(0, 200))
              }
            }
          }
        }
      }
    } else {
      // === ORG-SCOPED RESTORE (Owner) ===
      return NextResponse.json({
        error: 'Org-scoped restore is not yet supported. Please ask the App Developer to perform a full restore.',
      }, { status: 400 })
    }

    // Reset Prisma client
    await resetPrismaClient()

    await logAudit({
      userId: user.id, userName: user.name, userCode: user.code, userRole: user.role,
      action: AUDIT_ACTIONS.DATABASE_RESTORED, entityType: 'SYSTEM', entityId: '',
      description: `${user.name} performed a ${isDeveloper ? 'FULL' : 'ORG-SCOPED'} restore from ${isJson ? 'JSON' : 'CSV ZIP'} backup (${importedCount} records imported, ${errorCount} errors)`,
      metadata: { importedCount, errorCount, scope: isDeveloper ? 'full' : 'org', format: isJson ? 'json' : 'csv-zip', source: file.name },
      facilityId: null, facilityName: null,
    }).catch(() => {})

    return NextResponse.json({
      success: true,
      imported: importedCount,
      errors: errorCount,
      format: isJson ? 'json' : 'csv-zip',
      firstError: firstError,
      message: `Restore complete: ${importedCount} records imported, ${errorCount} errors.${firstError ? ` First error: ${firstError}` : ''} The page will reload to apply changes.`,
    })
  } catch (e: any) {
    console.error('Restore error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// ============================================================================
// CSV parsing helpers
// ============================================================================

/**
 * Parses a CSV string into an array of row objects.
 * Handles quoted values, escaped quotes, + commas inside quotes.
 * The first row is treated as the header row.
 */
function parseCsv(csvText: string): any[] {
  const rows: any[] = []
  const lines: string[][] = []
  let current: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < csvText.length; i++) {
    const c = csvText[i]
    const next = csvText[i + 1]

    if (inQuotes) {
      if (c === '"' && next === '"') {
        field += '"'
        i++  // skip the escaped quote
      } else if (c === '"') {
        inQuotes = false
      } else {
        field += c
      }
    } else {
      if (c === '"') {
        inQuotes = true
      } else if (c === ',') {
        current.push(field)
        field = ''
      } else if (c === '\n' || c === '\r') {
        // Handle \r\n (Windows) + \n (Unix) + \r (old Mac)
        if (c === '\r' && next === '\n') i++
        current.push(field)
        lines.push(current)
        current = []
        field = ''
      } else {
        field += c
      }
    }
  }
  // Last field
  if (field || current.length > 0) {
    current.push(field)
    lines.push(current)
  }

  if (lines.length === 0) return []

  // First row = headers
  const headers = lines[0]
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    // Skip empty lines
    if (line.length === 1 && line[0] === '') continue
    const row: any = {}
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j]?.trim()
      if (!key) continue
      row[key] = line[j] !== undefined ? line[j] : ''
    }
    rows.push(row)
  }
  return rows
}

/**
 * Coerces CSV string values back to their proper Prisma types.
 * - Date fields (createdAt, updatedAt, dateOfBirth, etc.) → ISO DateTime string
 *   (Prisma accepts ISO strings for DateTime fields)
 * - Boolean fields (active, isGroup, etc.) → true/false
 * - Number fields (amount, quantity, unitPrice, etc.) → Number
 * - JSON fields (options, scheduleTimes, etc.) → parsed object/array
 * - null / empty string → null (for optional fields)
 *
 * This is critical for CSV restores — CSV stores everything as text, but
 * Prisma's create() expects proper types.
 */
function coerceRowTypes(table: string, row: any): any {
  const coerced: any = {}
  for (const [key, value] of Object.entries(row)) {
    // Skip empty strings for optional fields (convert to null so Prisma doesn't
    // try to insert '' into a DateTime/Int field)
    if (value === '' || value === null || value === undefined) {
      // For required fields with empty values, skip entirely so Prisma uses the default
      if (['id', 'name', 'code', 'firstName', 'lastName'].includes(key)) {
        // don't include — let Prisma generate
        continue
      }
      coerced[key] = null
      continue
    }

    // Try to detect + coerce the value type
    const strVal = String(value)

    // Boolean fields
    if (key === 'active' || key === 'isGroup' || key === 'enableVersioning' || key === 'required' || key === 'blocked' || key === 'aiEnabled' || key === 'demoMode' || key === 'halfDay' || key === 'reimbursed') {
      coerced[key] = strVal === 'true' || strVal === '1' || strVal === 'TRUE'
      continue
    }

    // DateTime fields — CSV might have:
    //   - ISO string: "2026-08-13T10:30:00.000Z"
    //   - Date only: "2026-08-13"
    //   - Prisma's raw format with quotes: "\"2026-08-13T10:30:00.000Z\""
    if (isDateField(key)) {
      // Strip surrounding quotes (CSV export wraps ISO strings in quotes)
      let dateStr = strVal
      if (dateStr.startsWith('"') && dateStr.endsWith('"')) {
        dateStr = dateStr.slice(1, -1).replace(/""/g, '"')
      }
      // Convert date-only to full ISO
      if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        dateStr = dateStr + 'T00:00:00.000Z'
      }
      // Validate it's a real date
      const d = new Date(dateStr)
      if (!isNaN(d.getTime())) {
        coerced[key] = d.toISOString()
        continue
      }
      // If not a valid date, skip (don't pass invalid value to Prisma)
      continue
    }

    // Number fields — detect by common naming patterns
    if (isNumberField(key)) {
      const n = parseFloat(strVal.replace(/[,$\s]/g, ''))
      if (!isNaN(n)) {
        coerced[key] = n
        continue
      }
      // If not parseable as number, skip
      continue
    }

    // JSON fields — try to parse
    if (key === 'options' || key === 'scheduleTimes' || key === 'fields' || key === 'enabledFeatures' || key === 'metadata' || key === 'businessTypes') {
      try {
        // CSV export wraps JSON in quotes + escapes inner quotes
        let jsonStr = strVal
        if (jsonStr.startsWith('"') && jsonStr.endsWith('"')) {
          jsonStr = jsonStr.slice(1, -1).replace(/""/g, '"')
        }
        coerced[key] = JSON.parse(jsonStr)
        continue
      } catch {
        // If not valid JSON, keep as string
      }
    }

    // Default: keep as string
    coerced[key] = strVal
  }
  return coerced
}

function isDateField(key: string): boolean {
  const dateFields = [
    'createdAt', 'updatedAt', 'dateOfBirth', 'admissionDate', 'dischargeDate',
    'hireDate', 'startDate', 'endDate', 'date', 'paymentDate', 'entryDate',
    'orderDate', 'expectedDate', 'scheduledAt', 'completedAt', 'administeredAt',
    'occurredAt', 'recordedAt', 'sentAt', 'lastCountDate', 'effectiveFrom',
    'effectiveTo', 'reviewedAt', 'approvedAt', 'reimbursementDate', 'paidAt',
    'nextPaymentDate', 'subscriptionStart', 'blockedAt', 'checkIn', 'checkOut',
    'requestedAt', 'changedAt', 'reviewedAt', 'occurredAt',
  ]
  return dateFields.includes(key)
}

function isNumberField(key: string): boolean {
  const numberFields = [
    'amount', 'quantity', 'unitPrice', 'total', 'subtotal', 'tax', 'paidAmount',
    'amountPaid', 'totalAmount', 'balance', 'openingBalance', 'currentStock',
    'reorderLevel', 'reorderQty', 'unitCost', 'minOrderQty', 'leadTimeDays',
    'capacity', 'level', 'duration', 'overtimeHours', 'workedHours',
    'lateMinutes', 'earlyLeaveMins', 'basicSalary', 'overtimePay', 'allowances',
    'bonus', 'commission', 'grossPay', 'epfEmployee', 'epfEmployer',
    'socsoEmployee', 'socsoEmployer', 'eisEmployee', 'eisEmployer', 'pcbtax',
    'zakat', 'loanDeduction', 'unpaidLeaveDeduction', 'totalDeductions',
    'netPay', 'workingDays', 'unpaidLeaveDays', 'promptTokens', 'completionTokens',
    'totalTokens', 'estimatedCost', 'durationMs', 'tokenCap', 'maxTokens',
    'temperature', 'bpSys', 'bpDia', 'hr', 'rr', 'o2', 'bs', 'wt',
    'bloodPressureSystolic', 'bloodPressureDiastolic', 'heartRate',
    'respiratoryRate', 'oxygenSaturation', 'bloodSugar', 'temperature',
    'weight', 'sortOrder', 'sortOrderOverride',
  ]
  return numberFields.includes(key)
}

// ============================================================================
// JSON row sanitizer (applied to ALL imports — both JSON and CSV)
// ============================================================================
//
// PostgreSQL is STRICT about types — it will reject:
//   - Empty string "" in a DateTime field
//   - Empty string "" in an Int field
//   - Empty string "" in a Boolean field
//   - Empty string "" in a Json field
//   - Empty string "" in a unique String field (causes "duplicate key" on 2nd row)
//
// SQLite was LENIENT — it would silently store "" in any column. So JSON
// backups created on SQLite (or backups re-uploaded after a partial restore)
// frequently contain empty strings where PostgreSQL expects null.
//
// This function:
//   1. Detects whether a row came from CSV (all string values) or JSON (typed)
//   2. For CSV rows: delegates to coerceRowTypes() (existing behavior)
//   3. For JSON rows: walks each field and converts "" → undefined for non-string
//      fields, and "null"/"undefined" string literals → undefined for all fields
//
function sanitizeRow(table: string, row: any): any {
  if (!row || typeof row !== 'object') return row

  // Detect CSV import: if EVERY non-null value is a string, treat as CSV.
  // JSON backups have typed values (numbers, booleans, nested objects).
  const values = Object.values(row).filter(v => v !== null && v !== undefined)
  const isCsv = values.length > 0 && values.every(v => typeof v === 'string')

  if (isCsv) {
    return coerceRowTypes(table, row)
  }

  // JSON row — sanitize empty strings + invalid values for PostgreSQL
  const cleaned: any = {}
  for (const [key, value] of Object.entries(row)) {
    // Skip Prisma relation fields (objects/arrays that aren't actual columns)
    // These would cause "Unknown argument" errors on createMany/create.
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      // Could be a nested object from a Prisma include — skip it
      continue
    }
    if (Array.isArray(value)) {
      // Could be a relation array — skip it
      continue
    }

    // Empty string handling:
    // - For DateTime/Int/Boolean/Json fields → drop entirely (let Prisma use default/null)
    // - For String fields → keep as-is (legitimate empty string is OK)
    if (value === '') {
      if (isDateField(key) || isNumberField(key) || isBooleanField(key) || isJsonField(key)) {
        // Skip — Prisma will use default/null
        continue
      }
      // For String fields with unique constraint, empty string causes duplicate
      // key errors on the 2nd row. Treat as null instead.
      if (isUniqueStringField(key)) {
        continue  // skip — let Prisma use null
      }
      // Regular String field — keep empty string
      cleaned[key] = value
      continue
    }

    // String literal "null" / "undefined" → real null/undefined
    if (value === 'null' || value === 'undefined') {
      continue  // skip — let Prisma use null
    }

    // For DateTime fields, validate the value is a real date
    if (isDateField(key) && typeof value === 'string') {
      // Already an ISO string from JSON — validate it parses
      const d = new Date(value)
      if (isNaN(d.getTime())) {
        // Invalid date string — skip
        continue
      }
      cleaned[key] = value
      continue
    }

    cleaned[key] = value
  }
  return cleaned
}

function isBooleanField(key: string): boolean {
  const booleanFields = [
    'active', 'isGroup', 'enableVersioning', 'required', 'blocked', 'aiEnabled',
    'demoMode', 'halfDay', 'reimbursed', 'isRead', 'isPinned', 'isDeleted',
    'isDraft', 'isPaid', 'isApproved', 'isCompleted', 'isCancelled',
  ]
  return booleanFields.includes(key)
}

function isJsonField(key: string): boolean {
  const jsonFields = [
    'options', 'scheduleTimes', 'fields', 'enabledFeatures', 'metadata',
    'businessTypes', 'lineItems', 'items', 'lines', 'address', 'contact',
    'preferences', 'settings', 'payload',
  ]
  return jsonFields.includes(key)
}

function isUniqueStringField(key: string): boolean {
  // These String fields have @unique constraints in the Prisma schema.
  // Inserting "" twice causes "duplicate key value violates unique constraint".
  const uniqueFields = [
    'email', 'code', 'username', 'slug', 'apiKey', 'stripeCustomerId',
    'invoiceNumber', 'poNumber', 'accountNumber', 'bankAccountNumber',
    'icNumber', 'passportNumber', 'staffCode',
  ]
  return uniqueFields.includes(key)
}
