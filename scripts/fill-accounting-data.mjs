// Fill in the accounting/ERP gaps:
// 1. Delete junk test invoices
// 2. Seed vendors (Malaysian nursing home suppliers)
// 3. Seed bank accounts
// 4. Link existing expenses to vendors
// 5. Generate payment records matching invoices (partial payments, full payments, unapplied)
// 6. Back-fill journal entries for ALL existing invoices + expenses (auto-posting retroactively)

import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const round2 = (n) => Math.round(n * 100) / 100

async function main() {
  console.log('=== FILLING APP WITH RELEVANT DATA ===\n')

  // ──────────────────────────────────────────────────────────────
  // STEP 1: Delete junk test invoices
  // ──────────────────────────────────────────────────────────────
  console.log('Step 1: Delete junk test invoices...')
  const junkInvoices = await db.invoice.findMany({
    where: { invoiceNumber: { in: ['TEST-FACILITY-001', 'BUG-TEST-001'] } },
    select: { id: true, invoiceNumber: true },
  })
  for (const inv of junkInvoices) {
    await db.invoiceItem.deleteMany({ where: { invoiceId: inv.id } })
    await db.invoice.delete({ where: { id: inv.id } })
    console.log(`  Deleted ${inv.invoiceNumber}`)
  }
  console.log(`  Done. (${junkInvoices.length} junk invoices removed)\n`)

  // ──────────────────────────────────────────────────────────────
  // STEP 2: Seed vendors (Malaysian nursing home suppliers)
  // ──────────────────────────────────────────────────────────────
  console.log('Step 2: Seed vendors...')
  const facilities = await db.facility.findMany()
  const vendors = [
    { name: 'Pharmaniaga Berhad', contactPerson: 'Tan Wei Ming', phone: '+603-5513 2000', email: 'orders@pharmaniaga.com', paymentTerms: 'Net 30', taxId: 'GST-00123456', address: 'No. 7, Lorong Keluli 1, Seksyen 13, 40100 Shah Alam, Selangor' },
    { name: 'Cengal Medical Supplies Sdn Bhd', contactPerson: 'Siti Aishah', phone: '+603-7956 8899', email: 'sales@cengalmedical.my', paymentTerms: 'Net 30', taxId: 'SST-00987654', address: '12 Jalan Utara, 46200 Petaling Jaya, Selangor' },
    { name: 'Metrojaya Catering Sdn Bhd', contactPerson: 'Lim Chee Keong', phone: '+603-2162 1177', email: 'catering@metrojaya.com.my', paymentTerms: 'Net 15', address: 'Lot 10, Jalan Bukit Bintang, 55100 Kuala Lumpur' },
    { name: 'TNB (Tenaga Nasional)', contactPerson: '—', phone: '15454', email: 'care@tnb.com.my', paymentTerms: 'Net 30', taxId: 'SST-199201012345', address: ' Wisma TNB, No. 19, Jalan Timur, 46200 Petaling Jaya' },
    { name: 'Air Selangor', contactPerson: '—', phone: '15300', email: 'care@airselangor.com', paymentTerms: 'Net 30', address: 'Jalan Air Selangor, 46600 Bandar Petaling Jaya' },
    { name: 'TIME dotCom Berhad', contactPerson: 'Helpdesk', phone: '+603-2727 1600', email: 'support@time.com.my', paymentTerms: 'Net 30', address: 'Level 12, Bangunan TIME, 15 Jalan Tembusu, 50470 Kuala Lumpur' },
    { name: 'Garden Bloom Sdn Bhd', contactPerson: 'Raj Kumar', phone: '+603-7722 4455', email: 'raj@gardenbloom.my', paymentTerms: 'COD', address: '23 Jalan Tropicana, 47410 Petaling Jaya' },
    { name: 'MedPro Equipment Sdn Bhd', contactPerson: 'Dr. Ng Hui Ling', phone: '+603-5637 9988', email: 'sales@medpro.com.my', paymentTerms: 'Net 45', taxId: 'SST-2018001234', address: '7A Jalan PJU 1a/41, 47301 Petaling Jaya' },
    { name: 'Prudential Insurance Berhad', contactPerson: 'Azizah Rahman', phone: '+603-2116 0228', email: 'group.claims@prudential.com.my', paymentTerms: 'Net 60', address: 'Prudential Tower, Jalan Sultan Ismail, 50250 Kuala Lumpur' },
    { name: 'AIA Malaysia', contactPerson: 'Cheong Wai Hoong', phone: '+603-2050 2233', email: 'claims@aia.com.my', paymentTerms: 'Net 60', address: 'Menara AIA, 99 Jalan Ampang, 50470 Kuala Lumpur' },
    { name: 'Office Depot Malaysia', contactPerson: 'Priya Shanmugam', phone: '+603-7803 3344', email: 'orders@officedepot.my', paymentTerms: 'Net 30', address: 'Block G, Jalan PJU 1/3a, 47301 Petaling Jaya' },
    { name: 'CleanPro Supplies Sdn Bhd', contactPerson: 'Mohd Faizal', phone: '+603-6140 5566', email: 'sales@cleanpro.com.my', paymentTerms: 'Net 15', address: '45 Jalan Kebun, 41050 Klang, Selangor' },
  ]

  let vendorSeq = 1
  for (const facility of facilities) {
    for (const v of vendors) {
      const code = `VEN-${String(vendorSeq).padStart(4, '0')}`
      vendorSeq++
      await db.vendor.create({
        data: { ...v, code, facilityId: facility.id, active: true },
      })
    }
  }
  console.log(`  Created ${vendorSeq - 1} vendors across ${facilities.length} facilities\n`)

  // ──────────────────────────────────────────────────────────────
  // STEP 3: Seed bank accounts (one operating, one savings, one petty cash per facility)
  // ──────────────────────────────────────────────────────────────
  console.log('Step 3: Seed bank accounts...')
  // Ensure chart of accounts is seeded first
  const allAccounts = await db.account.findMany()
  let operatingAcct, savingsAcct, pettyAcct
  for (const facility of facilities) {
    // Get the relevant GL accounts for this facility
    operatingAcct = allAccounts.find(a => a.code === '1010' && a.facilityId === facility.id)
    savingsAcct = allAccounts.find(a => a.code === '1020' && a.facilityId === facility.id)
    pettyAcct = allAccounts.find(a => a.code === '1030' && a.facilityId === facility.id)
    if (!operatingAcct) {
      console.log(`  Warning: no GL account 1010 for facility ${facility.name} — skipping bank accounts`)
      continue
    }
    const banks = [
      { code: 'BNK-001', name: 'Maybank Operating Account', type: 'BANK', bankName: 'Maybank Berhad', accountNumber: '5123 4567 890', glAccountId: operatingAcct.id, openingBalance: 150000, currentBalance: 150000 },
      ...(savingsAcct ? [{ code: 'BNK-002', name: 'Maybank Savings Account', type: 'SAVINGS', bankName: 'Maybank Berhad', accountNumber: '5123 4567 900', glAccountId: savingsAcct.id, openingBalance: 280000, currentBalance: 280000 }] : []),
      ...(pettyAcct ? [{ code: 'BNK-003', name: 'Petty Cash', type: 'CASH', bankName: '—', accountNumber: '—', glAccountId: pettyAcct.id, openingBalance: 2000, currentBalance: 1850 }] : []),
    ]
    for (const b of banks) {
      await db.bankAccount.create({ data: { ...b, facilityId: facility.id, active: true } })
    }
    console.log(`  Created ${banks.length} bank accounts for ${facility.name}`)
  }
  console.log('')

  // ──────────────────────────────────────────────────────────────
  // STEP 4: Link existing expenses to vendors (match by description keywords)
  // ──────────────────────────────────────────────────────────────
  console.log('Step 4: Link existing expenses to vendors...')
  const expenses = await db.expense.findMany()
  const allVendors = await db.vendor.findMany()
  let linkedCount = 0
  for (const exp of expenses) {
    if (exp.vendorId) continue // already linked
    const desc = (exp.description + ' ' + (exp.vendorName || '')).toLowerCase()
    let matchVendor = null
    if (desc.includes('wound') || desc.includes('medical') || desc.includes('medication') || desc.includes('pharma') || desc.includes('glove') || desc.includes('ppe') || desc.includes('bp monitor')) {
      matchVendor = allVendors.find(v => v.name.toLowerCase().includes('cengal') || v.name.toLowerCase().includes('pharmaniaga') || v.name.toLowerCase().includes('medpro')) || allVendors.find(v => v.name.toLowerCase().includes('cleanpro'))
    } else if (desc.includes('grocery') || desc.includes('catering') || desc.includes('food') || desc.includes('birthday')) {
      matchVendor = allVendors.find(v => v.name.toLowerCase().includes('catering') || v.name.toLowerCase().includes('metrojaya'))
    } else if (desc.includes('water') || desc.includes('sewage')) {
      matchVendor = allVendors.find(v => v.name.toLowerCase().includes('air selangor'))
    } else if (desc.includes('electric')) {
      matchVendor = allVendors.find(v => v.name.toLowerCase().includes('tnb'))
    } else if (desc.includes('internet') || desc.includes('phone')) {
      matchVendor = allVendors.find(v => v.name.toLowerCase().includes('time'))
    } else if (desc.includes('garden') || desc.includes('maintenance')) {
      matchVendor = allVendors.find(v => v.name.toLowerCase().includes('garden'))
    } else if (desc.includes('training') || desc.includes('office') || desc.includes('supplies')) {
      matchVendor = allVendors.find(v => v.name.toLowerCase().includes('office'))
    }
    if (matchVendor && (!matchVendor.facilityId || matchVendor.facilityId === exp.facilityId)) {
      await db.expense.update({ where: { id: exp.id }, data: { vendorId: matchVendor.id } })
      linkedCount++
    }
  }
  console.log(`  Linked ${linkedCount} of ${expenses.length} expenses to vendors\n`)

  // ──────────────────────────────────────────────────────────────
  // STEP 5: Generate payment records for invoices
  // ──────────────────────────────────────────────────────────────
  console.log('Step 5: Generate payment records for invoices...')
  const invoices = await db.invoice.findMany({
    where: { status: { in: ['UNPAID', 'PARTIAL', 'PAID'] } },
    orderBy: { issueDate: 'asc' },
  })

  // Get existing payments to avoid duplicates
  const existingPayments = await db.payment.findMany({ select: { invoiceId: true } })
  const existingInvoiceIds = new Set(existingPayments.map(p => p.invoiceId).filter(Boolean))

  const paymentMethods = ['BANK_TRANSFER', 'CASH', 'CHEQUE', 'CARD', 'INSURANCE', 'ONLINE']
  let paymentSeq = 1
  let paymentsCreated = 0
  const lastPayment = await db.payment.findFirst({ orderBy: { paymentCode: 'desc' } })
  if (lastPayment?.paymentCode) {
    const m = lastPayment.paymentCode.match(/PMT-(\d+)/)
    if (m) paymentSeq = parseInt(m[1], 10) + 1
  }

  for (const inv of invoices) {
    // Skip if already has a payment (from earlier testing)
    if (existingInvoiceIds.has(inv.id)) continue

    const balance = inv.total - inv.amountPaid
    const r = Math.random()
    let paymentAmount = 0
    let status = 'CLEARED'
    let method = paymentMethods[Math.floor(Math.random() * paymentMethods.length)]

    if (inv.status === 'PAID') {
      // Already fully paid — back-fill a single payment for the full amount
      paymentAmount = inv.total
      method = inv.recipient?.includes('Medicare') || inv.recipient?.includes('BlueCross') || inv.recipient?.includes('Aetna') || inv.recipient?.includes('Cigna') || inv.recipient?.includes('United') ? 'INSURANCE' : method
    } else if (inv.status === 'PARTIAL') {
      // Already partially paid — back-fill a payment matching the paid amount
      paymentAmount = inv.amountPaid
      method = inv.recipient?.includes('Medicare') || inv.recipient?.includes('BlueCross') || inv.recipient?.includes('Aetna') || inv.recipient?.includes('Cigna') || inv.recipient?.includes('United') ? 'INSURANCE' : 'BANK_TRANSFER'
    } else if (inv.status === 'UNPAID' && r < 0.3) {
      // 30% of unpaid get a recent partial payment
      paymentAmount = round2(balance * (0.3 + Math.random() * 0.4))
      method = 'BANK_TRANSFER'
    } else {
      // Skip — leave truly unpaid
      continue
    }

    if (paymentAmount <= 0) continue

    const paymentCode = `PMT-${String(paymentSeq).padStart(6, '0')}`
    paymentSeq++
    const paymentDate = new Date(inv.issueDate)
    paymentDate.setDate(paymentDate.getDate() + Math.floor(Math.random() * 20) + 1)

    await db.payment.create({
      data: {
        paymentCode,
        facilityId: inv.facilityId,
        residentId: inv.residentId,
        invoiceId: inv.id,
        payerName: inv.recipient || null,
        paymentDate,
        amount: paymentAmount,
        appliedAmount: paymentAmount,
        method,
        reference: method === 'CHEQUE' ? `CHQ-${Math.floor(Math.random() * 900000 + 100000)}` : method === 'BANK_TRANSFER' ? `MBB-TXN-${Math.floor(Math.random() * 9000000 + 1000000)}` : null,
        bankAccount: method === 'BANK_TRANSFER' || method === 'ONLINE' ? 'Maybank ****0890' : null,
        status,
        receivedBy: 'Sarah Chen',
      },
    })
    paymentsCreated++
  }
  console.log(`  Created ${paymentsCreated} payment records\n`)

  // ──────────────────────────────────────────────────────────────
  // STEP 6: Also create some unapplied payments (advances/deposits)
  // ──────────────────────────────────────────────────────────────
  console.log('Step 6: Create unapplied payment records (deposits/advances)...')
  const residents = await db.resident.findMany({ where: { status: 'ACTIVE' }, take: 10 })
  let unappliedCount = 0
  for (const r of residents) {
    if (Math.random() < 0.4) {
      const paymentCode = `PMT-${String(paymentSeq).padStart(6, '0')}`
      paymentSeq++
      const amount = round2(500 + Math.random() * 2000)
      await db.payment.create({
        data: {
          paymentCode,
          facilityId: r.facilityId,
          residentId: r.id,
          payerName: `${r.firstName} ${r.lastName} (Family)`,
          paymentDate: new Date(Date.now() - Math.random() * 30 * 86400000),
          amount,
          appliedAmount: 0,
          method: 'BANK_TRANSFER',
          reference: `MBB-ADV-${Math.floor(Math.random() * 9000000 + 1000000)}`,
          bankAccount: 'Maybank ****0890',
          status: 'CLEARED',
          receivedBy: 'Sarah Chen',
          notes: 'Advance deposit for upcoming month',
        },
      })
      unappliedCount++
    }
  }
  console.log(`  Created ${unappliedCount} unapplied payment records\n`)

  // ──────────────────────────────────────────────────────────────
  // STEP 7: Back-fill journal entries for ALL existing invoices + expenses
  // ──────────────────────────────────────────────────────────────
  console.log('Step 7: Back-fill journal entries for existing transactions...')

  // Get GL accounts once
  const getAcct = async (code, facilityId) => {
    return await db.account.findFirst({
      where: { code, OR: [{ facilityId }, { facilityId: null }] },
    })
  }

  // Get last JE number
  let jeSeq = 1
  const lastJE = await db.journalEntry.findFirst({ orderBy: { entryNumber: 'desc' } })
  if (lastJE?.entryNumber) {
    const m = lastJE.entryNumber.match(/JE-(\d+)/)
    if (m) jeSeq = parseInt(m[1], 10) + 1
  }

  const nextJENum = () => `JE-${String(jeSeq++).padStart(6, '0')}`

  // Helper: post a balanced JE
  const postJE = async (params) => {
    const td = round2(params.lines.reduce((s, l) => s + (l.debit || 0), 0))
    const tc = round2(params.lines.reduce((s, l) => s + (l.credit || 0), 0))
    if (Math.abs(td - tc) > 0.01 || td === 0) return null
    return await db.journalEntry.create({
      data: {
        entryNumber: nextJENum(),
        facilityId: params.facilityId,
        entryDate: params.entryDate,
        memo: params.memo,
        source: params.source,
        reference: params.reference,
        posted: true,
        invoiceId: params.invoiceId || null,
        expenseId: params.expenseId || null,
        paymentId: params.paymentId || null,
        lines: { create: params.lines },
      },
    })
  }

  // Skip invoices that already have a JE
  const existingInvoiceJEs = await db.journalEntry.findMany({ where: { source: 'AUTO_INVOICE' }, select: { invoiceId: true } })
  const skipInvoiceIds = new Set(existingInvoiceJEs.map(j => j.invoiceId).filter(Boolean))

  let invoiceJEsCreated = 0
  for (const inv of invoices) {
    if (skipInvoiceIds.has(inv.id)) continue
    const ar = await getAcct('1100', inv.facilityId)
    const rev = await getAcct('4000', inv.facilityId)
    const tax = await getAcct('2100', inv.facilityId)
    if (!ar || !rev) continue
    const lines = [{ accountId: ar.id, debit: inv.total }]
    if (inv.subtotal > 0) lines.push({ accountId: rev.id, credit: inv.subtotal })
    if (inv.tax > 0 && tax) lines.push({ accountId: tax.id, credit: inv.tax })
    await postJE({
      facilityId: inv.facilityId,
      entryDate: inv.issueDate,
      memo: `Invoice ${inv.invoiceNumber}`,
      source: 'AUTO_INVOICE',
      reference: inv.invoiceNumber,
      invoiceId: inv.id,
      lines,
    })
    invoiceJEsCreated++
  }
  console.log(`  Created ${invoiceJEsCreated} journal entries for invoices`)

  // Back-fill JEs for expenses
  const existingExpenseJEs = await db.journalEntry.findMany({ where: { source: 'AUTO_EXPENSE' }, select: { expenseId: true } })
  const skipExpenseIds = new Set(existingExpenseJEs.map(j => j.expenseId).filter(Boolean))

  const categoryMap = { SALARY: '5000', SUPPLIES: '5100', FOOD: '5200', UTILITIES: '5300', MAINTENANCE: '5400', EQUIPMENT: '5500', OTHER: '5999' }
  let expenseJEsCreated = 0
  const allExpenses = await db.expense.findMany()
  for (const exp of allExpenses) {
    if (skipExpenseIds.has(exp.id)) continue
    const expCode = categoryMap[exp.category] || '5999'
    const expAcct = await getAcct(expCode, exp.facilityId)
    const cashAcct = await getAcct('1010', exp.facilityId)
    if (!expAcct || !cashAcct) continue
    await postJE({
      facilityId: exp.facilityId,
      entryDate: exp.date,
      memo: `Expense: ${exp.description}`,
      source: 'AUTO_EXPENSE',
      reference: exp.description.slice(0, 50),
      expenseId: exp.id,
      lines: [
        { accountId: expAcct.id, debit: exp.amount },
        { accountId: cashAcct.id, credit: exp.amount },
      ],
    })
    expenseJEsCreated++
  }
  console.log(`  Created ${expenseJEsCreated} journal entries for expenses`)

  // Back-fill JEs for payments
  const existingPaymentJEs = await db.journalEntry.findMany({ where: { source: 'AUTO_PAYMENT' }, select: { paymentId: true } })
  const skipPaymentIds = new Set(existingPaymentJEs.map(j => j.paymentId).filter(Boolean))

  let paymentJEsCreated = 0
  const allPayments = await db.payment.findMany()
  for (const pay of allPayments) {
    if (skipPaymentIds.has(pay.id)) continue
    const cash = await getAcct('1010', pay.facilityId)
    const ar = await getAcct('1100', pay.facilityId)
    if (!cash || !ar) continue
    await postJE({
      facilityId: pay.facilityId,
      entryDate: pay.paymentDate,
      memo: `Payment ${pay.paymentCode}`,
      source: 'AUTO_PAYMENT',
      reference: pay.paymentCode,
      paymentId: pay.id,
      lines: [
        { accountId: cash.id, debit: pay.amount },
        { accountId: ar.id, credit: pay.amount },
      ],
    })
    paymentJEsCreated++
  }
  console.log(`  Created ${paymentJEsCreated} journal entries for payments\n`)

  // ──────────────────────────────────────────────────────────────
  // STEP 8: Final summary
  // ──────────────────────────────────────────────────────────────
  console.log('=== FINAL COUNTS ===')
  const finalCounts = {
    invoices: await db.invoice.count(),
    expenses: await db.expense.count(),
    payments: await db.payment.count(),
    vendors: await db.vendor.count(),
    bankAccounts: await db.bankAccount.count(),
    journalEntries: await db.journalEntry.count(),
    accounts: await db.account.count(),
  }
  console.log(finalCounts)

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
