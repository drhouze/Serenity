import { db } from './db'

// ============================================================
// Accounting library — chart of accounts, auto-posting, reports
// ============================================================

// Shared code-generation helpers (per-prefix date toggle + 4-digit padding)
// Settings can be global (Developer) or facility-scoped (Owner override).
async function getCodeSetting(key: string): Promise<string | undefined> {
  const s = await db.setting.findUnique({ where: { key } })
  if (!s) return undefined
  try { return JSON.parse(s.value) } catch { return undefined }
}

async function getPrefix(key: string, fallback: string, facilityId?: string | null): Promise<string> {
  if (facilityId) {
    const facVal = await getCodeSetting(`facility:${facilityId}:${key}`)
    if (facVal) return facVal
  }
  return (await getCodeSetting(key)) || fallback
}

/**
 * Check if date should be included for a specific prefix key.
 * Each prefix has its own toggle: <prefixKey>Date (e.g. prefixVendorDate).
 * Falls back to the global `codeIncludeDate` if the per-prefix toggle isn't set.
 */
async function shouldIncludeDateForPrefix(prefixKey: string, facilityId?: string | null): Promise<boolean> {
  const dateKey = `${prefixKey}Date`
  if (facilityId) {
    const facVal = await getCodeSetting(`facility:${facilityId}:${dateKey}`)
    if (facVal !== undefined) return facVal === true || facVal === 'true'
  }
  const perPrefixVal = await getCodeSetting(dateKey)
  if (perPrefixVal !== undefined) return perPrefixVal === true || perPrefixVal === 'true'
  const globalVal = await getCodeSetting('codeIncludeDate')
  return globalVal === true || globalVal === 'true'
}

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
 * Generate a unique code for an accounting entity (JE, vendor, bank, deposit).
 * Per-prefix date toggle + 4-digit padding + facility-scoped settings.
 */
async function generateAccountingCode(
  prefixKey: string,
  fallback: string,
  model: any,
  field: string,
  facilityId?: string | null,
): Promise<string> {
  const prefix = await getPrefix(prefixKey, fallback, facilityId)
  const includeDate = await shouldIncludeDateForPrefix(prefixKey, facilityId)
  const dateStr = includeDate ? formatYYMMDD() : ''
  const codePrefix = includeDate ? `${prefix}-${dateStr}-` : `${prefix}-`

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
  // Use findFirst instead of findUnique — some fields (e.g. vendor.code, bankAccount.code)
  // don't have a @unique constraint, so findUnique would throw.
  while (await model.findFirst({ where: { [field]: code } })) {
    num++
    code = `${codePrefix}${String(num).padStart(4, '0')}`
  }
  return code
}

// ============== DEFAULT CHART OF ACCOUNTS ==============
// Standard nursing home chart of accounts. Facility-agnostic — seeded
// once per facility (or globally if no facilityId).
export const DEFAULT_CHART_OF_ACCOUNTS = [
  // ASSETS (1000-1999)
  { code: '1000', name: 'Cash on Hand', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1010', name: 'Bank — Operating Account', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1020', name: 'Bank — Savings Account', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1030', name: 'Petty Cash', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1100', name: 'Accounts Receivable', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1200', name: 'Inventory — Medical Supplies', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1210', name: 'Inventory — Food & Beverages', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1300', name: 'Prepaid Expenses', type: 'ASSET', subtype: 'CURRENT_ASSET', normalBalance: 'DEBIT' },
  { code: '1500', name: 'Fixed Assets — Equipment', type: 'ASSET', subtype: 'FIXED_ASSET', normalBalance: 'DEBIT' },
  { code: '1501', name: 'Accumulated Depreciation — Equipment', type: 'ASSET', subtype: 'FIXED_ASSET', normalBalance: 'CREDIT' },
  { code: '1510', name: 'Fixed Assets — Building', type: 'ASSET', subtype: 'FIXED_ASSET', normalBalance: 'DEBIT' },
  { code: '1511', name: 'Accumulated Depreciation — Building', type: 'ASSET', subtype: 'FIXED_ASSET', normalBalance: 'CREDIT' },
  { code: '1600', name: 'Fixed Assets — Vehicles', type: 'ASSET', subtype: 'FIXED_ASSET', normalBalance: 'DEBIT' },
  { code: '1601', name: 'Accumulated Depreciation — Vehicles', type: 'ASSET', subtype: 'FIXED_ASSET', normalBalance: 'CREDIT' },

  // LIABILITIES (2000-2999)
  { code: '2000', name: 'Accounts Payable', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2100', name: 'GST / SST Payable', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2200', name: 'Payroll Liabilities', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2210', name: 'EPF Payable', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2220', name: 'SOCSO Payable', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2230', name: 'Tax Withheld — PCB', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2300', name: 'Resident Deposits Held', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2400', name: 'Unearned Revenue', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '2500', name: 'Accrued Expenses', type: 'LIABILITY', subtype: 'CURRENT_LIABILITY', normalBalance: 'CREDIT' },
  { code: '3000', name: 'Long-Term Loans', type: 'LIABILITY', subtype: 'LONG_TERM_LIABILITY', normalBalance: 'CREDIT' },

  // EQUITY (3000-3999)
  { code: '3100', name: "Owner's Capital", type: 'EQUITY', normalBalance: 'CREDIT' },
  { code: '3200', name: 'Retained Earnings', type: 'EQUITY', normalBalance: 'CREDIT' },
  { code: '3300', name: 'Current Year Earnings', type: 'EQUITY', normalBalance: 'CREDIT' },
  { code: '3400', name: "Owner's Drawings", type: 'EQUITY', normalBalance: 'DEBIT' },

  // REVENUE (4000-4999)
  { code: '4000', name: 'Room & Board Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
  { code: '4010', name: 'Care Services Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
  { code: '4020', name: 'Medical Services Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
  { code: '4030', name: 'Therapy Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
  { code: '4040', name: 'Medication Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
  { code: '4050', name: 'Other Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
  { code: '4060', name: 'Insurance Recoveries', type: 'REVENUE', normalBalance: 'CREDIT' },

  // EXPENSES (5000-5999)
  { code: '5000', name: 'Salaries & Wages', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5010', name: 'Overtime Pay', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5020', name: 'Staff Benefits', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5030', name: 'EPF Contribution', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5040', name: 'SOCSO Contribution', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5100', name: 'Medical Supplies', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5110', name: 'Wound Care Supplies', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5120', name: 'Medication Costs', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5200', name: 'Food & Beverages', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5210', name: 'Catering & Special Meals', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5300', name: 'Utilities', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5310', name: 'Water & Sewage', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5320', name: 'Electricity', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5330', name: 'Internet & Phone', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5400', name: 'Maintenance & Repairs', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5410', name: 'Garden Maintenance', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5420', name: 'Equipment Maintenance', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5500', name: 'Equipment Purchase', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5510', name: 'Furniture & Fixtures', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5600', name: 'Insurance', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5700', name: 'Professional Fees', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5710', name: 'Accounting & Audit', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5720', name: 'Legal Fees', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5800', name: 'Office Supplies', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5810', name: 'Cleaning Supplies', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5820', name: 'Gloves & PPE', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5900', name: 'Staff Training', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5990', name: 'Depreciation Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
  { code: '5999', name: 'Other Expenses', type: 'EXPENSE', normalBalance: 'DEBIT' },
] as const

// ============== SEED CHART OF ACCOUNTS ==============
// Seeds the default chart of accounts for a facility (or globally).
// Idempotent — skips accounts that already exist.
export async function seedChartOfAccounts(facilityId: string | null) {
  // Idempotent: only insert accounts that don't already exist for this facility.
  // Previously this returned early if ANY account existed, which meant partial
  // setups (e.g. only 4 accounts manually created) would never get the rest.
  // Now we check each account code individually and only insert the missing ones.
  const existing = await db.account.findMany({
    where: facilityId ? { facilityId } : {},
    select: { code: true },
  })
  const existingCodes = new Set(existing.map(a => a.code))

  const toInsert = DEFAULT_CHART_OF_ACCOUNTS
    .filter(a => !existingCodes.has(a.code))
    .map(a => ({
      code: a.code,
      name: a.name,
      type: a.type,
      subtype: a.subtype || null,
      normalBalance: a.normalBalance,
      facilityId,
      isGroup: false,
      active: true,
    }))

  if (toInsert.length === 0) return { seeded: false, count: existing.length }

  await db.account.createMany({ data: toInsert })
  return { seeded: true, count: toInsert.length, totalAccounts: existing.length + toInsert.length }
}

// ============== GET ACCOUNT BY CODE ==============
export async function getAccountByCode(code: string, facilityId: string | null) {
  return await db.account.findFirst({
    where: { code, ...(facilityId ? { facilityId } : {}) },
  })
}

// ============== GENERATE JOURNAL ENTRY NUMBER ==============
export async function generateJournalEntryNumber(facilityId?: string | null): Promise<string> {
  return generateAccountingCode('prefixJournalEntry', 'JE', db.journalEntry, 'entryNumber', facilityId)
}

// ============== GENERATE VENDOR CODE ==============
export async function generateVendorCode(facilityId?: string | null): Promise<string> {
  return generateAccountingCode('prefixVendor', 'VEN', db.vendor, 'code', facilityId)
}

// ============== GENERATE BANK ACCOUNT CODE ==============
export async function generateBankAccountCode(facilityId?: string | null): Promise<string> {
  return generateAccountingCode('prefixBankAccount', 'BNK', db.bankAccount, 'code', facilityId)
}

// ============== GENERATE DEPOSIT CODE ==============
export async function generateDepositCode(facilityId?: string | null): Promise<string> {
  return generateAccountingCode('prefixDeposit', 'DEP', db.deposit, 'depositCode', facilityId)
}

// ============== GENERATE PURCHASE ORDER CODE ==============
export async function generatePurchaseOrderCode(facilityId?: string | null): Promise<string> {
  return generateAccountingCode('prefixPurchaseOrder', 'PO', db.purchaseOrder, 'poNumber', facilityId)
}

// ============== GENERATE STOCK TRANSFER CODE ==============
export async function generateStockTransferCode(facilityId?: string | null): Promise<string> {
  return generateAccountingCode('prefixStockTransfer', 'ST', db.stockTransfer, 'transferNumber', facilityId)
}

// ============== AUTO-POST: DEPOSIT RECEIVED ==============
// When a deposit is received, post:
//   Dr. Cash/Bank (1010)  — deposit.amount
//   Cr. Resident Deposits Held (2300)  — deposit.amount
export async function autoPostDeposit(deposit: any, facilityId: string | null) {
  await seedChartOfAccounts(facilityId)

  const cashAccount = await getAccountByCode('1010', facilityId)
  const depositLiabilityAccount = await getAccountByCode('2300', facilityId)

  if (!cashAccount || !depositLiabilityAccount) {
    console.log('[AutoPost] Missing cash or deposit liability account — skipping')
    return null
  }

  return await postJournalEntry({
    facilityId,
    entryDate: deposit.paymentDate || new Date(),
    memo: `Deposit ${deposit.depositCode} — ${deposit.type}`,
    source: 'AUTO_DEPOSIT',
    reference: deposit.depositCode,
    lines: [
      { accountId: cashAccount.id, debit: deposit.amount, description: `Received — ${deposit.depositCode}` },
      { accountId: depositLiabilityAccount.id, credit: deposit.amount, description: `Deposit held — ${deposit.depositCode}` },
    ],
  })
}

// ============== POST JOURNAL ENTRY ==============
// Creates a journal entry with the given lines. Lines must balance
// (total debits = total credits). Returns the created JE.
export async function postJournalEntry(params: {
  facilityId: string | null
  entryDate?: Date
  memo: string
  source?: string              // MANUAL, AUTO_INVOICE, AUTO_EXPENSE, AUTO_PAYMENT, AUTO_RECURRING, AUTO_PURCHASE_ORDER
  reference?: string           // invoice number, expense description, payment code
  lines: Array<{
    accountId: string
    debit?: number
    credit?: number
    description?: string
    residentId?: string
  }>
  invoiceId?: string
  expenseId?: string
  paymentId?: string
  purchaseOrderId?: string
  createdById?: string
  createdByName?: string
}): Promise<any> {
  const totalDebit = params.lines.reduce((s, l) => s + (l.debit || 0), 0)
  const totalCredit = params.lines.reduce((s, l) => s + (l.credit || 0), 0)

  // Round to 2 decimal places to avoid floating point issues
  const round2 = (n: number) => Math.round(n * 100) / 100
  const td = round2(totalDebit)
  const tc = round2(totalCredit)

  if (Math.abs(td - tc) > 0.01) {
    throw new Error(`Journal entry does not balance — debits (${td}) ≠ credits (${tc}). Difference: ${round2(td - tc)}`)
  }
  if (td === 0 && tc === 0) {
    throw new Error('Journal entry has zero amount — nothing to post.')
  }

  const entryNumber = await generateJournalEntryNumber()

  const entry = await db.journalEntry.create({
    data: {
      entryNumber,
      facilityId: params.facilityId,
      entryDate: params.entryDate || new Date(),
      memo: params.memo,
      source: params.source || 'MANUAL',
      reference: params.reference || null,
      posted: true,
      invoiceId: params.invoiceId || null,
      expenseId: params.expenseId || null,
      paymentId: params.paymentId || null,
      purchaseOrderId: params.purchaseOrderId || null,
      createdById: params.createdById || null,
      createdByName: params.createdByName || null,
      lines: {
        create: params.lines.map(l => ({
          accountId: l.accountId,
          debit: l.debit || 0,
          credit: l.credit || 0,
          description: l.description || null,
          residentId: l.residentId || null,
        })),
      },
    },
    include: { lines: { include: { account: true } } },
  })

  return entry
}

// ============== AUTO-POST: INVOICE CREATED ==============
// When an invoice is created, post:
//   Dr. Accounts Receivable (1100)  — invoice.total
//   Cr. Revenue (4000)              — invoice.subtotal
//   Cr. GST/SST Payable (2100)      — invoice.tax
export async function autoPostInvoice(invoice: any, facilityId: string | null) {
  // Ensure chart of accounts is seeded
  await seedChartOfAccounts(facilityId)

  const arAccount = await getAccountByCode('1100', facilityId)
  const revenueAccount = await getAccountByCode('4000', facilityId)
  const taxAccount = await getAccountByCode('2100', facilityId)

  if (!arAccount || !revenueAccount) {
    console.log('[AutoPost] Missing AR or Revenue account — skipping')
    return null
  }

  const lines: any[] = [
    { accountId: arAccount.id, debit: invoice.total, description: `AR — ${invoice.invoiceNumber}` },
  ]
  if (invoice.subtotal > 0) {
    lines.push({ accountId: revenueAccount.id, credit: invoice.subtotal, description: `Revenue — ${invoice.invoiceNumber}` })
  }
  if (invoice.tax > 0 && taxAccount) {
    lines.push({ accountId: taxAccount.id, credit: invoice.tax, description: `Tax — ${invoice.invoiceNumber}` })
  }

  // If subtotal + tax don't add up to total, put the difference in revenue
  const linesTotal = lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)
  if (Math.abs(linesTotal) > 0.01) {
    // Adjust the revenue line to make it balance
    const revLine = lines.find(l => l.accountId === revenueAccount.id)
    if (revLine) {
      revLine.credit = (revLine.credit || 0) + linesTotal
    }
  }

  return await postJournalEntry({
    facilityId,
    entryDate: invoice.issueDate || new Date(),
    memo: `Invoice ${invoice.invoiceNumber}`,
    source: 'AUTO_INVOICE',
    reference: invoice.invoiceNumber,
    lines,
    invoiceId: invoice.id,
  })
}

// ============== AUTO-POST: EXPENSE RECORDED ==============
// When an expense is recorded, post:
//   Dr. Expense account (mapped by category)  — expense.amount
//   Cr. Cash/Bank (1010) or Accounts Payable (2000)
export async function autoPostExpense(expense: any, facilityId: string | null) {
  await seedChartOfAccounts(facilityId)

  // Map expense category to GL account code
  const categoryMap: Record<string, string> = {
    SALARY: '5000',
    SUPPLIES: '5100',
    FOOD: '5200',
    UTILITIES: '5300',
    MAINTENANCE: '5400',
    EQUIPMENT: '5500',
    OTHER: '5999',
  }
  const expenseAccountCode = categoryMap[expense.category] || '5999'
  const expenseAccount = await getAccountByCode(expenseAccountCode, facilityId)
  const cashAccount = await getAccountByCode('1010', facilityId)

  if (!expenseAccount || !cashAccount) {
    console.log('[AutoPost] Missing expense or cash account — skipping')
    return null
  }

  // Look up vendor + staff names for a richer JE memo (if linked)
  let vendorName: string | null = expense.vendorName || null
  if (!vendorName && expense.vendorId) {
    const vendor = await db.vendor.findUnique({ where: { id: expense.vendorId }, select: { name: true } })
    vendorName = vendor?.name || null
  }
  let paidByName: string | null = expense.paidBy || null
  if (!paidByName && expense.paidByStaffId) {
    const staff = await db.staff.findUnique({ where: { id: expense.paidByStaffId }, select: { firstName: true, lastName: true } })
    paidByName = staff ? `${staff.firstName} ${staff.lastName}`.trim() : null
  }

  // Build a descriptive memo: "Expense: <description> — <vendor> (paid by <staff>)"
  const parts = [expense.description]
  if (vendorName) parts.push(`— ${vendorName}`)
  if (paidByName) parts.push(`(paid by ${paidByName})`)
  const memo = `Expense: ${parts.join(' ')}`

  return await postJournalEntry({
    facilityId,
    entryDate: expense.date || new Date(),
    memo,
    source: 'AUTO_EXPENSE',
    reference: expense.description,
    lines: [
      { accountId: expenseAccount.id, debit: expense.amount, description: expense.description },
      { accountId: cashAccount.id, credit: expense.amount, description: `Paid — ${expense.description}${vendorName ? ` (${vendorName})` : ''}` },
    ],
    expenseId: expense.id,
  })
}

// ============== AUTO-POST: PAYMENT RECEIVED ==============
// When a payment is received, post:
//   Dr. Cash/Bank (1010)  — payment.amount
//   Cr. Accounts Receivable (1100)  — payment.amount
export async function autoPostPayment(payment: any, facilityId: string | null) {
  await seedChartOfAccounts(facilityId)

  const cashAccount = await getAccountByCode('1010', facilityId)
  const arAccount = await getAccountByCode('1100', facilityId)

  if (!cashAccount || !arAccount) {
    console.log('[AutoPost] Missing cash or AR account — skipping')
    return null
  }

  return await postJournalEntry({
    facilityId,
    entryDate: payment.paymentDate || new Date(),
    memo: `Payment ${payment.paymentCode}`,
    source: 'AUTO_PAYMENT',
    reference: payment.paymentCode,
    lines: [
      { accountId: cashAccount.id, debit: payment.amount, description: `Received — ${payment.paymentCode}` },
      { accountId: arAccount.id, credit: payment.amount, description: `AR cleared — ${payment.paymentCode}` },
    ],
    paymentId: payment.id,
  })
}

// ============== AUTO-POST: PURCHASE ORDER RECEIVED ==============
// When a purchase order is received, post:
//   Dr. Inventory (1200) — for stock items
//   Dr. Expense (5xxx)  — for non-stock items (mapped by product category or default 5100)
//   Cr. Cash/Bank (1010) — if paid in cash/cheque/online at receive time
//   Cr. Accounts Payable (2000) — if on credit
//
// The function reads the PO with its lines (and each line's productId for
// expense-account lookup). Lines without a productId fall back to a category
// map based on the InventoryItem.category.
export async function autoPostPurchaseOrder(po: any, facilityId: string | null) {
  await seedChartOfAccounts(facilityId)

  // Default inventory GL account (medical supplies category 1200)
  const inventoryAccount = await getAccountByCode('1200', facilityId)
  const cashAccount = await getAccountByCode('1010', facilityId)
  const apAccount = await getAccountByCode('2000', facilityId) // Accounts Payable

  if (!cashAccount && !apAccount) {
    console.log('[AutoPost PO] Missing both cash and AP accounts — skipping')
    return null
  }

  // Category → expense account code (for non-stock lines, no itemId)
  // Mirrors the ProductCatalog.tsx categoryMap so POs match the catalog logic.
  const categoryExpenseMap: Record<string, string> = {
    MEDICATION: '5120',
    SUPPLIES: '5100',
    FOOD: '5200',
    MEDICAL: '5100',
    CLEANING: '5100',
    OFFICE: '5999',
    OTHER: '5999',
    CARE: '5100',
    THERAPY: '5100',
    ROOM: '5999',
    EQUIPMENT: '5500',
  }

  // Build the debit side: group lines by GL account (so multiple lines on the
  // same account become one JournalLine with a sum)
  const debitByAccount: Record<string, number> = {}

  // Lines passed in should include `item` and `product` relations; if not, fetch them
  let lines: any[] = po.lines || []
  if (!lines.length && po.id) {
    const fresh = await db.purchaseOrder.findUnique({
      where: { id: po.id },
      include: {
        lines: {
          include: {
            item: { select: { id: true, name: true, category: true } },
            product: { select: { id: true, name: true, category: true, expenseAccountId: true, expenseAccount: { select: { id: true, code: true, name: true } } } },
          },
        },
      },
    })
    lines = fresh?.lines || []
  }

  for (const line of lines) {
    if (!line.total || line.total === 0) continue
    let accountId: string | null = null

    // 1. If line has a product with an expenseAccount, use that
    if (line.product?.expenseAccount?.id) {
      accountId = line.product.expenseAccount.id
    }
    // 2. Else if line has an itemId (stock item), debit Inventory (1200)
    else if (line.itemId && inventoryAccount) {
      accountId = inventoryAccount.id
    }
    // 3. Else look up by category
    else {
      const cat = line.product?.category || line.item?.category || 'SUPPLIES'
      const code = categoryExpenseMap[cat] || '5100'
      const acc = await getAccountByCode(code, facilityId)
      if (acc) accountId = acc.id
    }

    if (!accountId) {
      // Last-resort fallback: debit inventory if available, else skip this line
      if (inventoryAccount) accountId = inventoryAccount.id
      else continue
    }

    debitByAccount[accountId] = (debitByAccount[accountId] || 0) + line.total
  }

  const totalAmount = Object.values(debitByAccount).reduce((s, v) => s + v, 0)
  if (totalAmount === 0) {
    console.log('[AutoPost PO] PO has zero total — skipping')
    return null
  }

  // Build the credit side
  // - If paymentMethod is CREDIT (or null/empty) → credit AP for the full amount
  // - If paymentMethod is CASH/BANK_TRANSFER/CHEQUE/CARD/ONLINE → credit Cash for the full amount
  // - If paidAmount is between 0 and total → split: paidAmount to Cash, remainder to AP
  const isCredit = !po.paymentMethod || po.paymentMethod === 'CREDIT'
  const paidAmount = po.paidAmount || 0
  const creditAP = isCredit ? totalAmount : Math.max(0, totalAmount - paidAmount)
  const creditCash = isCredit ? 0 : Math.min(totalAmount, paidAmount || totalAmount)

  const creditLines: any[] = []
  if (creditAP > 0 && apAccount) {
    creditLines.push({ accountId: apAccount.id, credit: creditAP, description: `AP — ${po.poNumber}` })
  } else if (creditAP > 0 && !apAccount) {
    // No AP account — force everything to cash
    creditLines.push({ accountId: cashAccount!.id, credit: totalAmount, description: `Paid — ${po.poNumber}` })
  }
  if (creditCash > 0 && cashAccount) {
    creditLines.push({ accountId: cashAccount.id, credit: creditCash, description: `Paid — ${po.poNumber}` })
  }
  // Edge case: if neither creditAP nor creditCash (e.g. isCredit=true but no AP), default to cash
  if (creditLines.length === 0 && cashAccount) {
    creditLines.push({ accountId: cashAccount.id, credit: totalAmount, description: `Paid — ${po.poNumber}` })
  }

  const debitLines = Object.entries(debitByAccount).map(([accountId, amount]) => ({
    accountId,
    debit: amount,
    description: `PO ${po.poNumber} — received`,
  }))

  // Look up vendor name for richer memo
  let vendorName: string | null = null
  if (po.vendorId) {
    const v = await db.vendor.findUnique({ where: { id: po.vendorId }, select: { name: true } })
    vendorName = v?.name || null
  }

  const memo = `PO ${po.poNumber}${vendorName ? ` — ${vendorName}` : ''}`

  return await postJournalEntry({
    facilityId,
    entryDate: po.receivedDate || po.orderDate || new Date(),
    memo,
    source: 'AUTO_PURCHASE_ORDER',
    reference: po.poNumber,
    lines: [...debitLines, ...creditLines],
    purchaseOrderId: po.id,
  })
}

// ============== REPORTS ==============

// Trial Balance — all active accounts with their debit/credit balances
export async function getTrialBalance(facilityId: string | null, asOfDate?: Date) {
  const where: any = { facilityId }
  if (asOfDate) {
    where.journalEntry = { entryDate: { lte: asOfDate }, posted: true }
  } else {
    where.journalEntry = { posted: true }
  }

  const accounts = await db.account.findMany({
    where: { ...(facilityId ? { facilityId } : {}), active: true },
    include: {
      journalLines: {
        where: asOfDate
          ? { journalEntry: { entryDate: { lte: asOfDate }, posted: true } }
          : { journalEntry: { posted: true } },
        select: { debit: true, credit: true },
      },
    },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
  })

  const rows = accounts.map(a => {
    const totalDebit = a.journalLines.reduce((s: number, l: any) => s + l.debit, 0)
    const totalCredit = a.journalLines.reduce((s: number, l: any) => s + l.credit, 0)
    const balance = totalDebit - totalCredit
    return {
      code: a.code,
      name: a.name,
      type: a.type,
      normalBalance: a.normalBalance,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
      balance: Math.round(balance * 100) / 100,
      // Trial balance shows actual debit or credit balance regardless of
      // the account's normal balance side.
      debitBalance: balance > 0 ? Math.round(balance * 100) / 100 : 0,
      creditBalance: balance < 0 ? Math.round(-balance * 100) / 100 : 0,
    }
  })

  const totalDebits = rows.reduce((s, r) => s + r.debitBalance, 0)
  const totalCredits = rows.reduce((s, r) => s + r.creditBalance, 0)

  return {
    asOfDate: asOfDate || new Date(),
    rows: rows.filter(r => r.balance !== 0), // only show accounts with activity
    totalDebits: Math.round(totalDebits * 100) / 100,
    totalCredits: Math.round(totalCredits * 100) / 100,
    balanced: Math.abs(totalDebits - totalCredits) < 0.01,
  }
}

// Income Statement (P&L) — Revenue − Expenses for a period
export async function getIncomeStatement(facilityId: string | null, startDate: Date, endDate: Date) {
  const accounts = await db.account.findMany({
    where: { ...(facilityId ? { facilityId } : {}), active: true, type: { in: ['REVENUE', 'EXPENSE'] } },
    include: {
      journalLines: {
        where: {
          journalEntry: {
            entryDate: { gte: startDate, lte: endDate },
            posted: true,
          },
        },
        select: { debit: true, credit: true },
      },
    },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
  })

  const revenueRows: any[] = []
  const expenseRows: any[] = []
  let totalRevenue = 0
  let totalExpenses = 0

  for (const a of accounts) {
    const totalDebit = a.journalLines.reduce((s: number, l: any) => s + l.debit, 0)
    const totalCredit = a.journalLines.reduce((s: number, l: any) => s + l.credit, 0)
    const balance = a.normalBalance === 'CREDIT' ? totalCredit - totalDebit : totalDebit - totalCredit
    const rounded = Math.round(balance * 100) / 100
    if (Math.abs(rounded) < 0.01) continue

    const row = { code: a.code, name: a.name, balance: rounded }
    if (a.type === 'REVENUE') {
      revenueRows.push(row)
      totalRevenue += rounded
    } else {
      expenseRows.push(row)
      totalExpenses += rounded
    }
  }

  const netIncome = Math.round((totalRevenue - totalExpenses) * 100) / 100

  return {
    startDate,
    endDate,
    revenue: { rows: revenueRows, total: Math.round(totalRevenue * 100) / 100 },
    expenses: { rows: expenseRows, total: Math.round(totalExpenses * 100) / 100 },
    netIncome,
  }
}

// Balance Sheet — Assets = Liabilities + Equity as of a date
export async function getBalanceSheet(facilityId: string | null, asOfDate: Date) {
  const accounts = await db.account.findMany({
    where: { ...(facilityId ? { facilityId } : {}), active: true, type: { in: ['ASSET', 'LIABILITY', 'EQUITY'] } },
    include: {
      journalLines: {
        where: {
          journalEntry: {
            entryDate: { lte: asOfDate },
            posted: true,
          },
        },
        select: { debit: true, credit: true },
      },
    },
    orderBy: [{ type: 'asc' }, { code: 'asc' }],
  })

  const sections: Record<string, any[]> = { ASSET: [], LIABILITY: [], EQUITY: [] }
  const totals: Record<string, number> = { ASSET: 0, LIABILITY: 0, EQUITY: 0 }

  for (const a of accounts) {
    const totalDebit = a.journalLines.reduce((s: number, l: any) => s + l.debit, 0)
    const totalCredit = a.journalLines.reduce((s: number, l: any) => s + l.credit, 0)
    const balance = a.normalBalance === 'DEBIT' ? totalDebit - totalCredit : totalCredit - totalDebit
    const rounded = Math.round(balance * 100) / 100
    if (Math.abs(rounded) < 0.01) continue

    sections[a.type].push({ code: a.code, name: a.name, balance: rounded })
    totals[a.type] += rounded
  }

  // Add Current Year Earnings to equity
  const revenueAccounts = await db.account.findMany({
    where: { ...(facilityId ? { facilityId } : {}), active: true, type: 'REVENUE' },
    include: {
      journalLines: {
        where: { journalEntry: { entryDate: { lte: asOfDate }, posted: true } },
        select: { debit: true, credit: true },
      },
    },
  })
  const expenseAccounts = await db.account.findMany({
    where: { ...(facilityId ? { facilityId } : {}), active: true, type: 'EXPENSE' },
    include: {
      journalLines: {
        where: { journalEntry: { entryDate: { lte: asOfDate }, posted: true } },
        select: { debit: true, credit: true },
      },
    },
  })
  const totalRev = revenueAccounts.reduce((s, a) => {
    const d = a.journalLines.reduce((s: number, l: any) => s + l.debit, 0)
    const c = a.journalLines.reduce((s: number, l: any) => s + l.credit, 0)
    return s + (c - d)
  }, 0)
  const totalExp = expenseAccounts.reduce((s, a) => {
    const d = a.journalLines.reduce((s: number, l: any) => s + l.debit, 0)
    const c = a.journalLines.reduce((s: number, l: any) => s + l.credit, 0)
    return s + (d - c)
  }, 0)
  const currentYearEarnings = Math.round((totalRev - totalExp) * 100) / 100

  // Add to equity section
  sections.EQUITY.push({ code: '3300', name: 'Current Year Earnings (auto)', balance: currentYearEarnings })
  totals.EQUITY += currentYearEarnings

  return {
    asOfDate,
    assets: { rows: sections.ASSET, total: Math.round(totals.ASSET * 100) / 100 },
    liabilities: { rows: sections.LIABILITY, total: Math.round(totals.LIABILITY * 100) / 100 },
    equity: { rows: sections.EQUITY, total: Math.round(totals.EQUITY * 100) / 100 },
    totalLiabilitiesAndEquity: Math.round((totals.LIABILITY + totals.EQUITY) * 100) / 100,
    balanced: Math.abs(totals.ASSET - (totals.LIABILITY + totals.EQUITY)) < 0.01,
  }
}

// AR Aging — invoices grouped by how long unpaid
export async function getARAging(facilityId: string | null, asOfDate: Date) {
  const invoices = await db.invoice.findMany({
    where: {
      ...(facilityId ? { facilityId } : {}),
      status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] },
      issueDate: { lte: asOfDate },
    },
    include: { resident: true },
    orderBy: { issueDate: 'asc' },
  })

  const buckets = {
    current: [] as any[],      // 0-30 days
    days31_60: [] as any[],    // 31-60 days
    days61_90: [] as any[],    // 61-90 days
    days90plus: [] as any[],   // 90+ days
  }

  const now = asOfDate.getTime()
  for (const inv of invoices) {
    const balance = inv.total - inv.amountPaid
    if (balance < 0.01) continue
    const ageDays = Math.floor((now - inv.issueDate.getTime()) / (1000 * 60 * 60 * 24))
    const row = {
      invoiceNumber: inv.invoiceNumber,
      issueDate: inv.issueDate,
      dueDate: inv.dueDate,
      total: inv.total,
      paid: inv.amountPaid,
      balance: Math.round(balance * 100) / 100,
      ageDays,
      resident: inv.resident ? `${inv.resident.firstName} ${inv.resident.lastName}` : inv.recipient || '—',
    }
    if (ageDays <= 30) buckets.current.push(row)
    else if (ageDays <= 60) buckets.days31_60.push(row)
    else if (ageDays <= 90) buckets.days61_90.push(row)
    else buckets.days90plus.push(row)
  }

  const sum = (arr: any[]) => arr.reduce((s, r) => s + r.balance, 0)

  return {
    asOfDate,
    buckets,
    totals: {
      current: Math.round(sum(buckets.current) * 100) / 100,
      days31_60: Math.round(sum(buckets.days31_60) * 100) / 100,
      days61_90: Math.round(sum(buckets.days61_90) * 100) / 100,
      days90plus: Math.round(sum(buckets.days90plus) * 100) / 100,
      total: Math.round(sum([...buckets.current, ...buckets.days31_60, ...buckets.days61_90, ...buckets.days90plus]) * 100) / 100,
    },
  }
}

// ============== AUTO-POST: PAYROLL DISBURSEMENT ==============
// When a payroll is marked as PAID, post:
//   Dr. Salaries & Wages (5000)          — grossPay - overtimePay (basic + allowances)
//   Dr. Overtime Pay (5010)               — overtimePay
//   Dr. EPF Contribution (5030)           — epfEmployer (employer's EPF expense)
//   Dr. SOCSO Contribution (5040)         — socsoEmployer + eisEmployer (employer's SOCSO+EIS)
//   Cr. EPF Payable (2210)               — epfEmployee + epfEmployer (to remit to KWSP)
//   Cr. SOCSO Payable (2220)             — socsoEmployee + socsoEmployer + eisEmployee + eisEmployer (to remit to PERKESO)
//   Cr. Tax Withheld — PCB (2230)        — pcbTax (to remit to LHDN)
//   Cr. Bank — Operating (1010)          — netPay (the actual cash paid to staff)
//
// Note: zakat, loanDeduction, unpaidLeaveDeduction are net-pay deductions (reducing
// what's paid out to the staff), but they're not remitted to a government body.
// Zakat goes to the staff's chosen charity (credit zakat payable), loans are
// staff advances already received (credit loan receivable). For simplicity,
// we net them into the Salaries & Wages debit side (they reduce the expense).
export async function autoPostPayroll(payroll: any, facilityId: string | null) {
  await seedChartOfAccounts(facilityId)

  const salaryAccount = await getAccountByCode('5000', facilityId)
  const otAccount = await getAccountByCode('5010', facilityId)
  const epfExpenseAccount = await getAccountByCode('5030', facilityId)
  const socsoExpenseAccount = await getAccountByCode('5040', facilityId)
  const epfPayableAccount = await getAccountByCode('2210', facilityId)
  const socsoPayableAccount = await getAccountByCode('2220', facilityId)
  const taxPayableAccount = await getAccountByCode('2230', facilityId)
  const bankAccount = await getAccountByCode('1010', facilityId)

  if (!salaryAccount || !bankAccount) {
    console.log('[AutoPost Payroll] Missing salary or bank account — skipping')
    return null
  }

  // Staff name for memo
  const staff = payroll.staffId
    ? await db.staff.findUnique({ where: { id: payroll.staffId }, select: { firstName: true, lastName: true, code: true } })
    : null
  const staffLabel = staff ? `${staff.code ? staff.code + ' ' : ''}${staff.firstName} ${staff.lastName}`.trim() : 'staff'
  const memo = `Payroll: ${staffLabel} — ${payroll.payrollMonth} (${payroll.status})`

  const lines: any[] = []

  // Debit side — employer costs
  // Salaries (basic + allowances + bonus + commission, minus staff-paid deductions like zakat/loan/unpaid leave)
  const salaryPortion = (payroll.basicSalary || 0) + (payroll.allowances || 0) + (payroll.bonus || 0) + (payroll.commission || 0)
    - (payroll.zakat || 0) - (payroll.loanDeduction || 0) - (payroll.unpaidLeaveDeduction || 0)
  if (salaryPortion > 0) {
    lines.push({ accountId: salaryAccount.id, debit: salaryPortion, description: `Basic + allowances — ${staffLabel} (${payroll.payrollMonth})` })
  }
  if ((payroll.overtimePay || 0) > 0 && otAccount) {
    lines.push({ accountId: otAccount.id, debit: payroll.overtimePay, description: `Overtime — ${staffLabel} (${payroll.overtimeHours || 0}h)` })
  }
  if ((payroll.epfEmployer || 0) > 0 && epfExpenseAccount) {
    lines.push({ accountId: epfExpenseAccount.id, debit: payroll.epfEmployer, description: `Employer EPF (12%) — ${staffLabel}` })
  }
  if (((payroll.socsoEmployer || 0) + (payroll.eisEmployer || 0)) > 0 && socsoExpenseAccount) {
    lines.push({ accountId: socsoExpenseAccount.id, debit: (payroll.socsoEmployer || 0) + (payroll.eisEmployer || 0), description: `Employer SOCSO + EIS — ${staffLabel}` })
  }

  // Credit side — payables + net pay
  // EPF Payable (employee + employer)
  if (((payroll.epfEmployee || 0) + (payroll.epfEmployer || 0)) > 0 && epfPayableAccount) {
    lines.push({ accountId: epfPayableAccount.id, credit: (payroll.epfEmployee || 0) + (payroll.epfEmployer || 0), description: `EPF payable — ${staffLabel} (KWSP remittance)` })
  }
  // SOCSO + EIS Payable (employee + employer)
  const socsoTotal = (payroll.socsoEmployee || 0) + (payroll.socsoEmployer || 0) + (payroll.eisEmployee || 0) + (payroll.eisEmployer || 0)
  if (socsoTotal > 0 && socsoPayableAccount) {
    lines.push({ accountId: socsoPayableAccount.id, credit: socsoTotal, description: `SOCSO + EIS payable — ${staffLabel} (PERKESO remittance)` })
  }
  // PCB Tax Payable
  if ((payroll.pcbTax || 0) > 0 && taxPayableAccount) {
    lines.push({ accountId: taxPayableAccount.id, credit: payroll.pcbTax, description: `PCB tax withheld — ${staffLabel} (LHDN remittance)` })
  }
  // Net pay to bank
  if ((payroll.netPay || 0) > 0) {
    lines.push({ accountId: bankAccount.id, credit: payroll.netPay, description: `Net pay — ${staffLabel}${payroll.paymentMethod ? ` (${payroll.paymentMethod})` : ''}${payroll.paymentReference ? ` ref: ${payroll.paymentReference}` : ''}` })
  }

  if (lines.length < 2) {
    console.log('[AutoPost Payroll] Not enough lines — skipping')
    return null
  }

  return await postJournalEntry({
    facilityId,
    entryDate: payroll.paidAt || new Date(),
    memo,
    source: 'AUTO_PAYROLL',
    reference: `Payroll ${payroll.payrollMonth} — ${staffLabel}`,
    lines,
  })
}
