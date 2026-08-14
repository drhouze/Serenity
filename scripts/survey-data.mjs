// Survey what data already exists in the database
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  console.log('=== CURRENT DATA COUNTS ===\n')

  const counts = {
    facilities: await db.facility.count(),
    users: await db.user.count(),
    residents: await db.resident.count(),
    rooms: await db.room.count(),
    staff: await db.staff.count(),
    medications: await db.medication.count(),
    medAdmins: await db.medAdministration.count(),
    vitals: await db.vitalSign.count(),
    careLogs: await db.careLog.count(),
    visits: await db.visit.count(),
    incidents: await db.incidentReport.count(),
    invoices: await db.invoice.count(),
    invoiceItems: await db.invoiceItem.count(),
    expenses: await db.expense.count(),
    payments: await db.payment.count(),
    products: await db.product.count(),
    inventory: await db.inventoryItem.count(),
    inventoryTxns: await db.inventoryTransaction.count(),
    shifts: await db.shift.count(),
    messages: await db.familyMessage.count(),
    accounts: await db.account.count(),
    journalEntries: await db.journalEntry.count(),
    vendors: await db.vendor.count(),
    bankAccounts: await db.bankAccount.count(),
    auditLogs: await db.auditLog.count(),
  }

  for (const [key, count] of Object.entries(counts)) {
    const pad = key.padEnd(18)
    const bar = '█'.repeat(Math.min(count, 50))
    console.log(`${pad} ${String(count).padStart(5)}  ${bar}`)
  }

  console.log('\n=== SAMPLES ===\n')

  // Show a sample of key tables
  const facilities = await db.facility.findMany({ take: 5, select: { id: true, name: true, active: true } })
  console.log('Facilities:', JSON.stringify(facilities, null, 2))

  const residents = await db.resident.findMany({ take: 3, select: { id: true, code: true, firstName: true, lastName: true, status: true, facilityId: true }, orderBy: { code: 'asc' } })
  console.log('\nSample residents:', JSON.stringify(residents, null, 2))

  const staff = await db.staff.findMany({ take: 3, select: { id: true, code: true, firstName: true, lastName: true, role: true, facilityId: true } })
  console.log('\nSample staff:', JSON.stringify(staff, null, 2))

  const rooms = await db.room.findMany({ take: 3, select: { id: true, code: true, roomNumber: true, type: true, status: true, facilityId: true } })
  console.log('\nSample rooms:', JSON.stringify(rooms, null, 2))

  const invoices = await db.invoice.findMany({ take: 3, select: { invoiceNumber: true, status: true, total: true, amountPaid: true, issueDate: true }, orderBy: { issueDate: 'desc' } })
  console.log('\nSample invoices:', JSON.stringify(invoices, null, 2))

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
