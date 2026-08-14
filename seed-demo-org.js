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

  // 2. Create Facilities under this org
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
  console.log(`✅ Facility 1: ${fac1.name}`)

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
  console.log(`✅ Facility 2: ${fac2.name}`)

  const fidCsv = `${fac1.id},${fac2.id}`

  // 3. Create Owner for this org
  const ownerCode = 'USR-0017'
  const owner = await db.user.create({
    data: {
      name: 'Demo Owner (Alex Lee)',
      email: 'demo.owner@democare.com',
      passwordHash: hashPassword('demo123'),
      role: 'OWNER',
      level: 1,
      code: ownerCode,
      phone: '+60-12-111-2222',
      organizationId: org.id,
      facilityIds: fidCsv,
      active: true,
    },
  })
  console.log(`✅ Owner: ${owner.name} (${owner.email})`)

  // 4. Create Manager
  const mgrCode = 'USR-0018'
  const manager = await db.user.create({
    data: {
      name: 'Demo Manager (Siti Norain)',
      email: 'demo.manager@democare.com',
      passwordHash: hashPassword('demo123'),
      role: 'MANAGER',
      level: 2,
      code: mgrCode,
      phone: '+60-16-222-3333',
      organizationId: org.id,
      facilityIds: fac1.id,
      active: true,
    },
  })
  console.log(`✅ Manager: ${manager.name} (${manager.email})`)

  // 5. Create Nurse
  const nurseCode = 'USR-0019'
  const nurse = await db.user.create({
    data: {
      name: 'Demo Nurse (Fatimah)',
      email: 'demo.nurse@democare.com',
      passwordHash: hashPassword('demo123'),
      role: 'NURSE',
      level: 3,
      code: nurseCode,
      phone: '+60-13-333-4444',
      organizationId: org.id,
      facilityIds: fac1.id,
      active: true,
    },
  })
  console.log(`✅ Nurse: ${nurse.name} (${nurse.email})`)

  // 6. Create Care Staff
  const careCode = 'USR-0020'
  const careStaff = await db.user.create({
    data: {
      name: 'Demo Care Staff (Ahmad)',
      email: 'demo.care@democare.com',
      passwordHash: hashPassword('demo123'),
      role: 'CARE_STAFF',
      level: 4,
      code: careCode,
      phone: '+60-11-444-5555',
      organizationId: org.id,
      facilityIds: fac1.id,
      active: true,
    },
  })
  console.log(`✅ Care Staff: ${careStaff.name} (${careStaff.email})`)

  // 7. Create Staff records
  const staff1 = await db.staff.create({
    data: {
      code: 'STF-0011',
      facilityId: fac1.id,
      facilityIds: fac1.id,
      firstName: 'Fatimah',
      lastName: 'Zahra',
      role: 'NURSE',
      email: 'demo.nurse@democare.com',
      phone: '+60-13-333-4444',
      hireDate: new Date('2024-01-15'),
      active: true,
    },
  })
  console.log(`✅ Staff: ${staff1.firstName} ${staff1.lastName} (${staff1.code})`)

  const staff2 = await db.staff.create({
    data: {
      code: 'STF-0012',
      facilityId: fac1.id,
      facilityIds: fac1.id,
      firstName: 'Ahmad',
      lastName: 'Ismail',
      role: 'CARE_STAFF',
      email: 'demo.care@democare.com',
      phone: '+60-11-444-5555',
      hireDate: new Date('2024-03-01'),
      active: true,
    },
  })
  console.log(`✅ Staff: ${staff2.firstName} ${staff2.lastName} (${staff2.code})`)

  // 8. Create Rooms
  const room1 = await db.room.create({
    data: {
      code: 'ROM-0001',
      facilityId: fac1.id,
      roomNumber: 'D-101',
      roomType: 'PRIVATE',
      status: 'OCCUPIED',
      floor: '1st Floor',
      monthlyRate: 3000,
    },
  })
  const room2 = await db.room.create({
    data: {
      code: 'ROM-0002',
      facilityId: fac1.id,
      roomNumber: 'D-102',
      roomType: 'SEMI_PRIVATE',
      status: 'AVAILABLE',
      floor: '1st Floor',
      monthlyRate: 2200,
    },
  })
  console.log(`✅ Rooms: ${room1.roomNumber}, ${room2.roomNumber}`)

  // 9. Create Residents
  const res1 = await db.resident.create({
    data: {
      code: 'RES-0001',
      facilityId: fac1.id,
      firstName: 'Robert',
      lastName: 'Kumar',
      dateOfBirth: new Date('1945-06-15'),
      gender: 'MALE',
      status: 'ACTIVE',
      roomId: room1.id,
      admissionDate: new Date('2024-02-01'),
      emergencyContactName: 'Priya Kumar (Daughter)',
      emergencyContactPhone: '+60-12-555-6789',
      emergencyContactRelation: 'Daughter',
      dietaryNeeds: 'Diabetic',
      allergies: 'Penicillin',
      notes: 'Demo resident — requires assistance with mobility',
    },
  })
  const res2 = await db.resident.create({
    data: {
      code: 'RES-0002',
      facilityId: fac1.id,
      firstName: 'Margaret',
      lastName: 'Chen',
      dateOfBirth: new Date('1948-11-22'),
      gender: 'FEMALE',
      status: 'ACTIVE',
      admissionDate: new Date('2024-04-15'),
      emergencyContactName: 'David Chen (Son)',
      emergencyContactPhone: '+60-16-777-8888',
      emergencyContactRelation: 'Son',
      dietaryNeeds: 'Low Sodium',
      allergies: 'None',
      notes: 'Demo resident — independent with daily activities',
    },
  })
  console.log(`✅ Residents: ${res1.firstName} ${res1.lastName} (${res1.code}), ${res2.firstName} ${res2.lastName} (${res2.code})`)

  // 10. Create Vital Signs
  const vital1 = await db.vitalSign.create({
    data: {
      residentId: res1.id,
      recordedAt: new Date('2026-07-07T08:00:00Z'),
      recordedBy: nurse.id,
      temperature: 36.8,
      bloodPressureSystolic: 130,
      bloodPressureDiastolic: 85,
      heartRate: 72,
      oxygenSaturation: 97,
      bloodSugar: 7.2,
      notes: 'Morning vitals — stable',
    },
  })
  const vital2 = await db.vitalSign.create({
    data: {
      residentId: res1.id,
      recordedAt: new Date('2026-07-07T14:00:00Z'),
      recordedBy: nurse.id,
      temperature: 37.1,
      bloodPressureSystolic: 135,
      bloodPressureDiastolic: 88,
      heartRate: 78,
      oxygenSaturation: 96,
      bloodSugar: 8.5,
      notes: 'Afternoon vitals — slightly elevated BP',
    },
  })
  console.log(`✅ Vital Signs: 2 records for ${res1.firstName}`)

  // 11. Create Invoice
  const invoice1 = await db.invoice.create({
    data: {
      code: 'INV-0001',
      facilityId: fac1.id,
      residentId: res1.id,
      issueDate: new Date('2026-07-01'),
      dueDate: new Date('2026-07-31'),
      status: 'UNPAID',
      total: 3500,
      amountPaid: 0,
      notes: 'July 2026 — Room + Care + Medication',
    },
  })
  await db.invoiceItem.create({
    data: {
      invoiceId: invoice1.id,
      description: 'Private Room (D-101) — July',
      quantity: 1,
      unitPrice: 3000,
      total: 3000,
      category: 'ROOM',
      residentId: res1.id,
    },
  })
  await db.invoiceItem.create({
    data: {
      invoiceId: invoice1.id,
      description: 'Daily Care Services — July',
      quantity: 31,
      unitPrice: 16.13,
      total: 500,
      category: 'CARE',
      residentId: res1.id,
    },
  })
  console.log(`✅ Invoice: ${invoice1.code} — RM ${invoice1.total} (UNPAID)`)

  // 12. Create Expense
  const expense1 = await db.expense.create({
    data: {
      code: 'EXP-0001',
      facilityId: fac1.id,
      description: 'Monthly groceries — July 2026',
      amount: 1200,
      category: 'FOOD',
      paidBy: manager.name,
      expenseDate: new Date('2026-07-05'),
      vendor: 'Demo Supplier Sdn Bhd',
    },
  })
  console.log(`✅ Expense: ${expense1.code} — RM ${expense1.amount} (${expense1.category})`)

  // 13. Create Medication
  const med1 = await db.medication.create({
    data: {
      residentId: res1.id,
      drugName: 'Metformin 500mg',
      dosage: '1 tablet',
      frequency: 'Twice daily',
      route: 'Oral Tablet',
      startDate: new Date('2024-02-01'),
      active: true,
      prescribedBy: 'Dr. Demo Tan',
      notes: 'For diabetes management',
    },
  })
  console.log(`✅ Medication: ${med1.drugName} for ${res1.firstName}`)

  // 14. Create Incident Report
  const incident1 = await db.incidentReport.create({
    data: {
      residentId: res1.id,
      reportedBy: nurse.id,
      incidentDate: new Date('2026-07-03T10:30:00Z'),
      type: 'FALL',
      severity: 'LOW',
      description: 'Resident had a minor slip in the bathroom. No visible injuries. Assisted back to bed.',
      followUpAction: 'Monitor for 24 hours. Report any discomfort.',
      status: 'RESOLVED',
    },
  })
  console.log(`✅ Incident: ${incident1.type} (${incident1.severity}) for ${res1.firstName}`)

  // 15. Create Family Message
  const msg1 = await db.familyMessage.create({
    data: {
      residentId: res1.id,
      senderId: owner.id,
      senderRole: 'OWNER',
      message: 'Hi Dad, hope you are doing well today. Will visit this weekend!',
      sentAt: new Date('2026-07-06T15:00:00Z'),
      isRead: false,
    },
  })
  console.log(`✅ Family Message: from ${owner.name} to ${res1.firstName}`)

  // 16. Seed Chart of Accounts for the facility
  console.log('\n--- Seeding Chart of Accounts ---')
  const accounts = [
    { code: '1010', name: 'Cash on Hand', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1020', name: 'Bank Account — Maybank', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1100', name: 'Accounts Receivable', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1200', name: 'Inventory', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '1500', name: 'Equipment', type: 'ASSET', normalBalance: 'DEBIT' },
    { code: '2100', name: 'Accounts Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '2300', name: 'Resident Deposits', type: 'LIABILITY', normalBalance: 'CREDIT' },
    { code: '3000', name: 'Owner Equity', type: 'EQUITY', normalBalance: 'CREDIT' },
    { code: '4000', name: 'Room & Board Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
    { code: '4100', name: 'Care Services Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
    { code: '5000', name: 'Salaries & Wages', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '5100', name: 'Food & Supplies', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '5200', name: 'Utilities', type: 'EXPENSE', normalBalance: 'DEBIT' },
    { code: '5300', name: 'Medical Supplies', type: 'EXPENSE', normalBalance: 'DEBIT' },
  ]
  for (const a of accounts) {
    await db.account.create({
      data: { ...a, facilityId: fac1.id, active: true },
    })
  }
  console.log(`✅ Chart of Accounts: ${accounts.length} accounts seeded for ${fac1.name}`)

  // 17. Create Journal Entry (auto-post for the invoice)
  const je1 = await db.journalEntry.create({
    data: {
      code: 'JE-0001',
      facilityId: fac1.id,
      entryDate: new Date('2026-07-01'),
      description: `Invoice ${invoice1.code} — July billing`,
      posted: true,
      createdAt: new Date(),
    },
  })
  await db.journalLine.create({
    data: {
      journalEntryId: je1.id,
      accountCode: '1100',
      accountName: 'Accounts Receivable',
      debit: 3500,
      credit: 0,
      residentId: res1.id,
    },
  })
  await db.journalLine.create({
    data: {
      journalEntryId: je1.id,
      accountCode: '4000',
      accountName: 'Room & Board Revenue',
      debit: 0,
      credit: 3000,
      residentId: res1.id,
    },
  })
  await db.journalLine.create({
    data: {
      journalEntryId: je1.id,
      accountCode: '4100',
      accountName: 'Care Services Revenue',
      debit: 0,
      credit: 500,
      residentId: res1.id,
    },
  })
  console.log(`✅ Journal Entry: ${je1.code} — RM 3,500 (AR → Revenue)`)

  // Summary
  console.log('\n=== Demo Organization Summary ===')
  console.log(`Organization: ${org.name}`)
  console.log(`  Facilities: 2 (${fac1.name}, ${fac2.name})`)
  console.log(`  Users: 4 (Owner, Manager, Nurse, Care Staff)`)
  console.log(`  Staff: 2`)
  console.log(`  Rooms: 2`)
  console.log(`  Residents: 2`)
  console.log(`  Vital Signs: 2`)
  console.log(`  Invoices: 1 (RM 3,500)`)
  console.log(`  Expenses: 1 (RM 1,200)`)
  console.log(`  Medications: 1`)
  console.log(`  Incidents: 1`)
  console.log(`  Family Messages: 1`)
  console.log(`  Chart of Accounts: ${accounts.length} accounts`)
  console.log(`  Journal Entries: 1`)
  console.log(`\nAll passwords: demo123`)
  console.log(`\nLogin credentials:`)
  console.log(`  Owner:   demo.owner@democare.com / demo123`)
  console.log(`  Manager: demo.manager@democare.com / demo123`)
  console.log(`  Nurse:   demo.nurse@democare.com / demo123`)
  console.log(`  Care:    demo.care@democare.com / demo123`)

  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
