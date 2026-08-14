// Verify the dashboard Financial Snapshot numbers against the DB
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const now = new Date()
const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
console.log('Today:', now.toISOString())
console.log('Month start:', monthStart.toISOString())
console.log('---')

// 1. Total invoiced this month (issueDate >= monthStart)
const invoicesThisMonth = await db.invoice.aggregate({
  _sum: { total: true, amountPaid: true, subtotal: true, tax: true },
  _count: true,
  where: { issueDate: { gte: monthStart } },
})
console.log('Invoices issued this month:')
console.log('  count:', invoicesThisMonth._count)
console.log('  sum.total (revenue shown):', invoicesThisMonth._sum.total)
console.log('  sum.subtotal:', invoicesThisMonth._sum.subtotal)
console.log('  sum.tax:', invoicesThisMonth._sum.tax)
console.log('  sum.amountPaid:', invoicesThisMonth._sum.amountPaid)
console.log('---')

// 2. Expenses this month
const expensesThisMonth = await db.expense.aggregate({
  _sum: { amount: true },
  _count: true,
  where: { date: { gte: monthStart } },
})
console.log('Expenses this month:')
console.log('  count:', expensesThisMonth._count)
console.log('  sum.amount (shown):', expensesThisMonth._sum.amount)
console.log('---')

// 3. All-time expense count by month (last 6 months)
const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 6, 1)
const recentExpenses = await db.expense.findMany({
  where: { date: { gte: sixMonthsAgo } },
  select: { date: true, amount: true, description: true },
  orderBy: { date: 'desc' },
  take: 20,
})
console.log(`Recent expenses (last 6 months, top 20):`)
if (recentExpenses.length === 0) {
  console.log('  (none found — this is why Expenses shows RM 0.00)')
} else {
  for (const e of recentExpenses) {
    console.log(`  ${e.date.toISOString().slice(0,10)}  RM ${e.amount}  ${e.description}`)
  }
}
console.log('---')

// 4. Outstanding (UNPAID + PARTIAL + OVERDUE) — total minus paid
const unpaidInvoices = await db.invoice.aggregate({
  _sum: { total: true, amountPaid: true },
  _count: true,
  where: { status: { in: ['UNPAID', 'PARTIAL', 'OVERDUE'] } },
})
const outstanding = (unpaidInvoices._sum.total || 0) - (unpaidInvoices._sum.amountPaid || 0)
console.log('Outstanding (UNPAID + PARTIAL + OVERDUE):')
console.log('  count:', unpaidInvoices._count)
console.log('  sum.total:', unpaidInvoices._sum.total)
console.log('  sum.amountPaid:', unpaidInvoices._sum.amountPaid)
console.log('  outstanding (total - paid):', outstanding)
console.log('---')

// 5. Break down by status
const byStatus = await db.invoice.groupBy({
  by: ['status'],
  _sum: { total: true, amountPaid: true },
  _count: true,
})
console.log('Invoices by status:')
for (const s of byStatus) {
  const bal = s._sum.total - s._sum.amountPaid
  console.log(`  ${s.status.padEnd(10)}: count=${s._count}, total=RM ${s._sum.total.toFixed(2)}, paid=RM ${s._sum.amountPaid.toFixed(2)}, balance=RM ${bal.toFixed(2)}`)
}
console.log('---')

// 6. Show a sample of invoices issued this month (to see what's making up the 396K)
const sample = await db.invoice.findMany({
  where: { issueDate: { gte: monthStart } },
  select: { invoiceNumber: true, issueDate: true, status: true, subtotal: true, tax: true, total: true, amountPaid: true, recipient: true },
  orderBy: { total: 'desc' },
  take: 10,
})
console.log('Top 10 invoices issued this month by total:')
for (const i of sample) {
  console.log(`  ${i.invoiceNumber}  ${i.issueDate.toISOString().slice(0,10)}  ${i.status.padEnd(8)}  total=RM ${i.total.toFixed(2)}  paid=RM ${i.amountPaid.toFixed(2)}  ${i.recipient || ''}`)
}

await db.$disconnect()
