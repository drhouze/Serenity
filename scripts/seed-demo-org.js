const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient()

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  console.log('=== Creating Demo Organization ===\n')

  // 0. Clean up any existing demo data (idempotent)
  console.log('Cleaning up existing demo data...')
  await db.staff.deleteMany({ where: { code: { in: ['STF-0021','STF-0022','STF-0011','STF-0012'] } } }).catch(() => {})
  await db.room.deleteMany({ where: { code: { in: ['ROM-0011','ROM-0012','ROM-0021','ROM-0022'] } } }).catch(() => {})
  await db.resident.deleteMany({ where: { code: { in: ['RES-0011','RES-0012','RES-0021','RES-0022'] } } }).catch(() => {})
  await db.user.deleteMany({ where: { email: { contains: 'democare' } } }).catch(() => {})
  const existingOrgs = await db.organization.findMany({ where: { name: 'Demo Care Services' } })
  for (const o of existingOrgs) {
    const facs = await db.facility.findMany({ where: { organizationId: o.id }, select: { id: true } })
    for (const f of facs) {
      await db.vitalSign.deleteMany({ where: { resident: { facilityId: f.id } } }).catch(() => {})
      await db.medication.deleteMany({ where: { resident: { facilityId: f.id } } }).catch(() => {})
      await db.invoiceItem.deleteMany({ where: { resident: { facilityId: f.id } } }).catch(() => {})
      await db.invoice.deleteMany({ where: { facilityId: f.id } }).catch(() => {})
      await db.expense.deleteMany({ where: { facilityId: f.id } }).catch(() => {})
      await db.incidentReport.deleteMany({ where: { resident: { facilityId: f.id } } }).catch(() => {})
      await db.familyMessage.deleteMany({ where: { resident: { facilityId: f.id } } }).catch(() => {})
      await db.resident.deleteMany({ where: { facilityId: f.id } }).catch(() => {})
      await db.room.deleteMany({ where: { facilityId: f.id } }).catch(() => {})
      await db.staff.deleteMany({ where: { facilityId: f.id } }).catch(() => {})
      await db.account.deleteMany({ where: { facilityId: f.id } }).catch(() => {})
      await db.journalLine.deleteMany({ where: { journalEntry: { facilityId: f.id } } }).catch(() => {})
      await db.journalEntry.deleteMany({ where: { facilityId: f.id } }).catch(() => {})
      await db.facility.deleteMany({ where: { id: f.id } }).catch(() => {})
    }
    await db.organization.delete({ where: { id: o.id } }).catch(() => {})
  }
  console.log('✅ Cleanup complete\n')

  // Use unique codes to avoid conflicts
  const TS = Date.now().toString().slice(-4)

  // 1. Create Organization
  const org = await db.organization.create({
    data: {
      name: 'Demo Care Services',
      address: '456 Demo Street, Georgetown, Penang 10200',
      phone: '+60-4-222-3344',
      email: 'info@democare.com',
      director: 'Dr. Demo Tan',
      active: true,
      blocked: false,
    },
  })
  console.log(`✅ Organization: ${org.name} (${org.id})`)

  // 2. Create Facilities
  const fac1 = await db.facility.create({
    data: {
      name: 'Demo Care Home — Main',
      address: '456 Demo Street, Georgetown, Penang',
      phone: '+60-4-222-3344',
      email: 'main@democare.com',
      director: 'Dr. Demo Tan',
      active: true,
      organizationId: org.id,
    },
  })
  const fac2 = await db.facility.create({
    data: {
      name: 'Demo Care Home — Branch',
      address: '789 Example Road, Bayan Lepas, Penang',
      phone: '+60-4-333-5566',
      email: 'branch@democare.com',
      director: 'Nurse Sarah Goh',
      active: true,
      organizationId: org.id,
    },
  })
  console.log(`✅ Facilities: ${fac1.name}, ${fac2.name}`)

  const fidCsv = `${fac1.id},${fac2.id}`

  // 3. Create Users
  const owner = await db.user.create({
    data: { name: 'Demo Owner (Alex Lee)', email: 'demo.owner@democare.com', passwordHash: hashPassword('demo123'), role: 'OWNER', level: 1, code: 'USR-0021', phone: '+60-12-111-2222', organizationId: org.id, facilityIds: fidCsv, active: true }
  })
  const manager = await db.user.create({
    data: { name: 'Demo Manager (Siti Norain)', email: 'demo.manager@democare.com', passwordHash: hashPassword('demo123'), role: 'MANAGER', level: 2, code: 'USR-0022', phone: '+60-16-222-3333', organizationId: org.id, facilityIds: fac1.id, active: true }
  })
  const nurse = await db.user.create({
    data: { name: 'Demo Nurse (Fatimah)', email: 'demo.nurse@democare.com', passwordHash: hashPassword('demo123'), role: 'NURSE', level: 3, code: 'USR-0023', phone: '+60-13-333-4444', organizationId: org.id, facilityIds: fac1.id, active: true }
  })
  const careStaff = await db.user.create({
    data: { name: 'Demo Care Staff (Ahmad)', email: 'demo.care@democare.com', passwordHash: hashPassword('demo123'), role: 'CARE_STAFF', level: 4, code: 'USR-0024', phone: '+60-11-444-5555', organizationId: org.id, facilityIds: fac1.id, active: true }
  })
  console.log(`✅ Users: Owner, Manager, Nurse, Care Staff`)

  // 4. Create Staff records
  const staff1 = await db.staff.create({
    data: { code: `STF-${TS}1`, facilityId: fac1.id, facilityIds: fac1.id, firstName: 'Fatimah', lastName: 'Zahra', role: 'NURSE', email: 'demo.nurse@democare.com', phone: '+60-13-333-4444', hireDate: new Date('2024-01-15'), active: true }
  })
  const staff2 = await db.staff.create({
    data: { code: `STF-${TS}2`, facilityId: fac1.id, facilityIds: fac1.id, firstName: 'Ahmad', lastName: 'Ismail', role: 'CARE_STAFF', email: 'demo.care@democare.com', phone: '+60-11-444-5555', hireDate: new Date('2024-03-01'), active: true }
  })
  console.log(`✅ Staff: ${staff1.firstName} ${staff1.lastName}, ${staff2.firstName} ${staff2.lastName}`)

  // 5. Create Rooms (correct field names: type, floor as int, no monthlyRate)
  const room1 = await db.room.create({
    data: { code: `ROM-${TS}1`, facilityId: fac1.id, roomNumber: 'D-101', type: 'PRIVATE', status: 'OCCUPIED', floor: 1, capacity: 1, notes: 'Monthly rate: RM 3000' }
  })
  const room2 = await db.room.create({
    data: { code: `ROM-${TS}2`, facilityId: fac1.id, roomNumber: 'D-102', type: 'SEMI_PRIVATE', status: 'AVAILABLE', floor: 1, capacity: 2, notes: 'Monthly rate: RM 2200' }
  })
  console.log(`✅ Rooms: ${room1.roomNumber}, ${room2.roomNumber}`)

  // 6. Create Residents
  const res1 = await db.resident.create({
    data: { code: `RES-${TS}1`, facilityId: fac1.id, firstName: 'Robert', lastName: 'Kumar', dateOfBirth: new Date('1945-06-15'), gender: 'MALE', status: 'ACTIVE', roomId: room1.id, admissionDate: new Date('2024-02-01'), emergencyContactName: 'Priya Kumar (Daughter)', emergencyContactPhone: '+60-12-555-6789', emergencyContactRelation: 'Daughter', dietaryNeeds: 'Diabetic', allergies: 'Penicillin', notes: 'Demo resident — requires assistance with mobility' }
  })
  const res2 = await db.resident.create({
    data: { code: `RES-${TS}2`, facilityId: fac1.id, firstName: 'Margaret', lastName: 'Chen', dateOfBirth: new Date('1948-11-22'), gender: 'FEMALE', status: 'ACTIVE', admissionDate: new Date('2024-04-15'), emergencyContactName: 'David Chen (Son)', emergencyContactPhone: '+60-16-777-8888', emergencyContactRelation: 'Son', dietaryNeeds: 'Low Sodium', allergies: 'None', notes: 'Demo resident — independent with daily activities' }
  })
  console.log(`✅ Residents: ${res1.firstName} ${res1.lastName}, ${res2.firstName} ${res2.lastName}`)

  // 7. Vital Signs (recordedById, not recordedBy)
  await db.vitalSign.create({
    data: { residentId: res1.id, recordedAt: new Date('2026-07-07T08:00:00Z'), recordedById: nurse.id, temperature: 36.8, bloodPressureSystolic: 130, bloodPressureDiastolic: 85, heartRate: 72, oxygenSaturation: 97, bloodSugar: 7.2, notes: 'Morning vitals — stable' }
  })
  await db.vitalSign.create({
    data: { residentId: res1.id, recordedAt: new Date('2026-07-07T14:00:00Z'), recordedById: nurse.id, temperature: 37.1, bloodPressureSystolic: 135, bloodPressureDiastolic: 88, heartRate: 78, oxygenSaturation: 96, bloodSugar: 8.5, notes: 'Afternoon vitals — slightly elevated BP' }
  })
  console.log(`✅ Vital Signs: 2 records`)

  // 8. Invoice (invoiceNumber, not code; subtotal/tax fields)
  const invoice1 = await db.invoice.create({
    data: { facilityId: fac1.id, invoiceNumber: `INV-${TS}1`, residentId: res1.id, recipient: `${res1.firstName} ${res1.lastName}`, issueDate: new Date('2026-07-01'), dueDate: new Date('2026-07-31'), status: 'UNPAID', subtotal: 3500, tax: 0, total: 3500, amountPaid: 0, notes: 'July 2026 — Room + Care' }
  })
  await db.invoiceItem.create({
    data: { invoiceId: invoice1.id, description: 'Private Room (D-101) — July', quantity: 1, unitPrice: 3000, total: 3000, category: 'ROOM', residentId: res1.id }
  })
  await db.invoiceItem.create({
    data: { invoiceId: invoice1.id, description: 'Daily Care Services — July', quantity: 31, unitPrice: 16.13, total: 500, category: 'CARE', residentId: res1.id }
  })
  console.log(`✅ Invoice: ${invoice1.invoiceNumber} — RM ${invoice1.total}`)

  // 9. Expense (no code field; vendorName not vendor; date not expenseDate)
  await db.expense.create({
    data: { facilityId: fac1.id, description: 'Monthly groceries — July 2026', amount: 1200, category: 'FOOD', paidBy: manager.name, date: new Date('2026-07-05'), vendorName: 'Demo Supplier Sdn Bhd' }
  })
  console.log(`✅ Expense: RM 1,200 (FOOD)`)

  // 10. Medication
  await db.medication.create({
    data: { residentId: res1.id, name: 'Metformin 500mg', dosage: '1 tablet', frequency: 'Twice daily', route: 'Oral Tablet', startDate: new Date('2024-02-01'), active: true, prescribedBy: 'Dr. Demo Tan', notes: 'For diabetes management' }
  })
  console.log(`✅ Medication: Metformin 500mg`)

  // 11. Incident (incidentType, actionTaken, followUp, occurredAt, reportedById)
  await db.incidentReport.create({
    data: { residentId: res1.id, reportedById: staff1.id, incidentType: 'FALL', severity: 'LOW', description: 'Minor slip in bathroom. No injuries.', actionTaken: 'Assisted back to bed. Monitored.', followUp: 'Monitor for 24 hours.', occurredAt: new Date('2026-07-03T10:30:00Z') }
  })
  console.log(`✅ Incident: FALL (LOW)`)

  // 12. Family Message (body, read, senderId)
  await db.familyMessage.create({
    data: { residentId: res1.id, senderId: owner.id, body: 'Hi Dad, hope you are doing well. Will visit this weekend!', sentAt: new Date('2026-07-06T15:00:00Z'), read: false }
  })
  console.log(`✅ Family Message: from Owner`)

  // 13. Chart of Accounts
  const accounts = [
    { code: '1010', name: 'Cash on Hand', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1020', name: 'Bank Account', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1100', name: 'Accounts Receivable', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '2100', name: 'Accounts Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '3000', name: 'Owner Equity', type: 'EQUITY', normalBalance: 'CREDIT' },
    { code: '4000', name: 'Room & Board Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
    { code: '5000', name: 'Salaries & Wages', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '5100', name: 'Food & Supplies', type: 'EXPENSE', normalBalance: 'DEBIT' },
  ]
  for (const a of accounts) {
    await db.account.create({ data: { ...a, facilityId: fac1.id, active: true } })
  }
  console.log(`✅ Chart of Accounts: ${accounts.length} accounts`)

  // 14. Journal Entry
  const je1 = await db.journalEntry.create({
    data: { entryNumber: `JE-${TS}1`, facilityId: fac1.id, entryDate: new Date('2026-07-01'), memo: `Invoice INV-${TS}1 — July billing`, source: 'AUTO_INVOICE', reference: `INV-${TS}1`, posted: true }
  })
  // Get account IDs
  const arAccount = await db.account.findFirst({ where: { code: '1100', facilityId: fac1.id } })
  const revAccount = await db.account.findFirst({ where: { code: '4000', facilityId: fac1.id } })
  await db.journalLine.create({ data: { journalEntryId: je1.id, accountId: arAccount.id, debit: 3500, credit: 0, residentId: res1.id } })
  await db.journalLine.create({ data: { journalEntryId: je1.id, accountId: revAccount.id, debit: 0, credit: 3500, residentId: res1.id } })
  console.log(`✅ Journal Entry: JE-0011 — RM 3,500`)

  console.log('\n=== Demo Organization Complete ===')
  console.log(`Org: ${org.name}`)
  console.log(`Facilities: 2 | Users: 4 | Staff: 2 | Rooms: 2 | Residents: 2`)
  console.log(`Vitals: 2 | Invoices: 1 | Expenses: 1 | Meds: 1 | Incidents: 1`)
  console.log(`Messages: 1 | Accounts: ${accounts.length} | Journal Entries: 1`)
  console.log(`\nLogin: demo.owner@democare.com / demo123`)
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
