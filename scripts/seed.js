/* eslint-disable @typescript-eslint/no-var-requires */
// Seed script for Nursing Home Management System
const { PrismaClient } = require('@prisma/client')
const crypto = require('crypto')
const db = new PrismaClient()

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

const FIRST_NAMES = ['Mary','John','Elizabeth','James','Margaret','Robert','Patricia','William','Jennifer','Charles','Catherine','Thomas','Susan','Daniel','Helen','Joseph','Linda','Frank','Barbara','George','Sandra','Henry','Dorothy','Edward','Ruth','Paul','Patricia','Michael','Sarah','David','Karen','Richard','Nancy','Donald','Lisa','Steven','Betty','Brian','Donna','Ronald','Carol','Anthony','Angela','Kevin','Shirley','Jason','Emily','Mark','Hannah']
const LAST_NAMES = ['Smith','Johnson','Williams','Brown','Jones','Garcia','Miller','Davis','Rodriguez','Martinez','Hernandez','Lopez','Gonzalez','Wilson','Anderson','Thomas','Taylor','Moore','Jackson','Martin','Lee','Perez','Thompson','White','Harris','Sanchez','Clark','Ramirez','Lewis','Robinson']

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)] }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min }
function randDate(daysBack) {
  const d = new Date()
  d.setDate(d.getDate() - randInt(0, daysBack))
  d.setHours(randInt(6,20), randInt(0,59), 0, 0)
  return d
}
function randFuture(daysAhead) {
  const d = new Date()
  d.setDate(d.getDate() + randInt(0, daysAhead))
  d.setHours(randInt(8,17), randInt(0,59), 0, 0)
  return d
}

async function main() {
  console.log('Seeding...')

  // ============== USERS (with role-based access) ==============
  const users = [
    { name: 'Sarah Chen (Owner)', email: 'owner@home.com', role: 'OWNER', phone: '+1-555-0100', password: 'owner123' },
    { name: 'Robert Hayes (Manager)', email: 'manager@home.com', role: 'MANAGER', phone: '+1-555-0101', password: 'manager123' },
    { name: 'Nurse Linda Park', email: 'nurse@home.com', role: 'NURSE', phone: '+1-555-0102', password: 'nurse123' },
    { name: 'Carlos Reyes (Care Staff)', email: 'care@home.com', role: 'CARE_STAFF', phone: '+1-555-0103', password: 'care123' },
    { name: 'Aisha Patel (Reception)', email: 'reception@home.com', role: 'RECEPTION', phone: '+1-555-0104', password: 'reception123' },
    { name: 'Dr. Emily Carter', email: 'doctor@home.com', role: 'DOCTOR', phone: '+1-555-0105', password: 'doctor123' },
    { name: 'Mark Thompson (Physio)', email: 'physio@home.com', role: 'PHYSIO', phone: '+1-555-0106', password: 'physio123' },
    { name: 'Diana Wells (Dietitian)', email: 'dietitian@home.com', role: 'DIETITIAN', phone: '+1-555-0107', password: 'dietitian123' },
    { name: 'Family Member', email: 'family@home.com', role: 'FAMILY', phone: '+1-555-0108', password: 'family123' },
  ]
  for (const u of users) {
    const { password, ...userData } = u
    const passwordHash = hashPassword(password)
    await db.user.upsert({
      where: { email: u.email },
      update: { ...userData, passwordHash },
      create: { ...userData, passwordHash },
    })
  }

  // ============== DEMO ACCOUNTS SETTING ==============
  // Seed the `demoAccounts` Setting so the Login page quick-pick buttons
  // show the demo credentials. The list is kept in sync by /api/users PATCH
  // when the developer changes a demo account's email/password via User
  // Management. Doctor/Physio/Dietitian are intentionally NOT in this list
  // — they don't log into Serenity directly (their visit notes come from
  // the external doctor app).
  const demoAccountsList = [
    { email: 'owner@home.com',      password: 'owner123',     label: 'Org Owner',  desc: 'Full access' },
    { email: 'manager@home.com',    password: 'manager123',   label: 'Manager',    desc: 'Operations + finance' },
    { email: 'nurse@home.com',      password: 'nurse123',     label: 'Nurse',      desc: 'Clinical care' },
    { email: 'care@home.com',       password: 'care123',      label: 'Care Staff', desc: 'Daily care' },
    { email: 'reception@home.com',  password: 'reception123', label: 'Reception',  desc: 'Front desk' },
    { email: 'family@home.com',     password: 'family123',    label: 'Family',     desc: 'Loved one updates' },
  ]
  await db.setting.upsert({
    where: { key: 'demoAccounts' },
    update: { value: JSON.stringify(demoAccountsList) },
    create: { key: 'demoAccounts', value: JSON.stringify(demoAccountsList) },
  })

  // ============== STAFF (10) ==============
  const staffData = [
    { firstName: 'Linda', lastName: 'Park', role: 'NURSE', phone: '+1-555-0201', email: 'l.park@home.com' },
    { firstName: 'Carlos', lastName: 'Reyes', role: 'CARE_STAFF', phone: '+1-555-0202', email: 'c.reyes@home.com' },
    { firstName: 'Maria', lastName: 'Gomez', role: 'NURSE', phone: '+1-555-0203', email: 'm.gomez@home.com' },
    { firstName: 'James', lastName: 'Okafor', role: 'CARE_STAFF', phone: '+1-555-0204', email: 'j.okafor@home.com' },
    { firstName: 'Emily', lastName: 'Carter', role: 'DOCTOR', phone: '+1-555-0205', email: 'e.carter@home.com' },
    { firstName: 'Mark', lastName: 'Thompson', role: 'PHYSIO', phone: '+1-555-0206', email: 'm.thompson@home.com' },
    { firstName: 'Diana', lastName: 'Wells', role: 'DIETITIAN', phone: '+1-555-0207', email: 'd.wells@home.com' },
    { firstName: 'Aisha', lastName: 'Patel', role: 'RECEPTION', phone: '+1-555-0208', email: 'a.patel@home.com' },
    { firstName: 'Tom', lastName: 'Nguyen', role: 'CARE_STAFF', phone: '+1-555-0209', email: 't.nguyen@home.com' },
    { firstName: 'Olivia', lastName: 'Bauer', role: 'NURSE', phone: '+1-555-0210', email: 'o.bauer@home.com' },
  ]
  const staff = []
  for (const s of staffData) {
    const hire = new Date()
    hire.setDate(hire.getDate() - randInt(60, 1500))
    const st = await db.staff.create({ data: { ...s, hireDate: hire } })
    staff.push(st)
  }

  // ============== ROOMS (40 rooms, mix of types) ==============
  const rooms = []
  for (let i = 1; i <= 40; i++) {
    const floor = i <= 20 ? 1 : 2
    const roomNum = `${floor}${String(i <= 20 ? i : i - 20).padStart(2, '0')}`
    const type = i % 7 === 0 ? 'WARD' : i % 3 === 0 ? 'SEMI_PRIVATE' : 'PRIVATE'
    const capacity = type === 'WARD' ? 4 : type === 'SEMI_PRIVATE' ? 2 : 1
    const r = await db.room.create({ data: { roomNumber: roomNum, floor, capacity, type, status: 'AVAILABLE' } })
    rooms.push(r)
  }

  // ============== RESIDENTS (60) ==============
  const CONDITIONS = ['Hypertension','Diabetes Type 2','Arthritis','Dementia','Heart Disease','COPD','Parkinsons','Stroke Recovery','Osteoporosis','Hearing Loss']
  const ALLERGIES = ['Penicillin','Peanuts','Shellfish','Latex','Sulfa','Aspirin','None']
  const DIETS = ['Regular','Low Sodium','Diabetic','Soft','Pureed','Vegetarian','High Protein','Renal']
  const DOCTORS = ['Dr. Emily Carter','Dr. James Lin','Dr. Susan Mills','Dr. Robert Kahn','Dr. Priya Shah']

  const residents = []
  for (let i = 0; i < 60; i++) {
    const first = rand(FIRST_NAMES)
    const last = rand(LAST_NAMES)
    const dob = new Date()
    dob.setFullYear(dob.getFullYear() - randInt(65, 98))
    dob.setMonth(randInt(0,11), randInt(1,28))

    const admission = new Date()
    admission.setDate(admission.getDate() - randInt(30, 1500))

    const condCount = randInt(1, 4)
    const conditions = []
    for (let j = 0; j < condCount; j++) conditions.push(rand(CONDITIONS))
    const allergyCount = randInt(0, 2)
    const allergies = []
    for (let j = 0; j < allergyCount; j++) {
      const a = rand(ALLERGIES)
      if (!allergies.includes(a)) allergies.push(a)
    }

    const ins = ['BlueCross','Medicare','Aetna','Cigna','United Health','Humana']
    const r = await db.resident.create({
      data: {
        firstName: first,
        lastName: last,
        dateOfBirth: dob,
        gender: rand(['Male','Female']),
        emergencyContactName: `${rand(FIRST_NAMES)} ${last}`,
        emergencyContactPhone: `+1-555-${randInt(1000,9999)}`,
        emergencyContactRelation: rand(['Son','Daughter','Spouse','Nephew','Niece','Grandchild']),
        allergies: allergies.length ? allergies.join(', ') : 'None',
        conditions: [...new Set(conditions)].join(', '),
        dietaryNeeds: rand(DIETS),
        doctorName: rand(DOCTORS),
        doctorPhone: `+1-555-${randInt(1000,9999)}`,
        insuranceProvider: rand(ins),
        insuranceNumber: `INS-${randInt(100000,999999)}`,
        admissionDate: admission,
        status: 'ACTIVE',
        notes: i % 5 === 0 ? 'Requires assistance with mobility.' : null,
      }
    })
    residents.push(r)
  }

  // Assign residents to rooms
  let roomIdx = 0
  for (const r of residents) {
    let assigned = false
    while (roomIdx < rooms.length && !assigned) {
      const room = rooms[roomIdx]
      const occCount = await db.resident.count({ where: { roomId: room.id, status: 'ACTIVE' } })
      if (occCount < room.capacity) {
        await db.resident.update({ where: { id: r.id }, data: { roomId: room.id } })
        await db.room.update({ where: { id: room.id }, data: { status: 'OCCUPIED' } })
        assigned = true
      } else {
        roomIdx++
      }
    }
  }

  // ============== SHIFTS (next 14 days for 10 staff) ==============
  const shiftTypes = [
    { type: 'DAY', start: '07:00', end: '15:00' },
    { type: 'EVENING', start: '15:00', end: '23:00' },
    { type: 'NIGHT', start: '23:00', end: '07:00' },
  ]
  for (let day = 0; day < 14; day++) {
    for (const s of staff) {
      if (Math.random() < 0.35) continue // off day
      if (s.role === 'RECEPTION' || s.role === 'DOCTOR' || s.role === 'PHYSIO' || s.role === 'DIETITIAN') {
        if (Math.random() < 0.6) {
          const d = new Date(); d.setDate(d.getDate() + day); d.setHours(0,0,0,0)
          await db.shift.create({ data: { staffId: s.id, date: d, startTime: '09:00', endTime: '17:00', shiftType: 'DAY' } })
        }
      } else {
        const sh = rand(shiftTypes)
        const d = new Date(); d.setDate(d.getDate() + day); d.setHours(0,0,0,0)
        await db.shift.create({ data: { staffId: s.id, date: d, startTime: sh.start, endTime: sh.end, shiftType: sh.type } })
      }
    }
  }

  // ============== MEDICATIONS (3-6 per resident) ==============
  const MEDS = [
    { name: 'Lisinopril', dosage: '10mg', frequency: 'Once daily', route: 'Oral' },
    { name: 'Metformin', dosage: '500mg', frequency: 'Twice daily', route: 'Oral' },
    { name: 'Atorvastatin', dosage: '20mg', frequency: 'Once daily at bedtime', route: 'Oral' },
    { name: 'Amlodipine', dosage: '5mg', frequency: 'Once daily', route: 'Oral' },
    { name: 'Aspirin', dosage: '81mg', frequency: 'Once daily', route: 'Oral' },
    { name: 'Omeprazole', dosage: '20mg', frequency: 'Once daily before breakfast', route: 'Oral' },
    { name: 'Acetaminophen', dosage: '500mg', frequency: 'PRN every 6 hours', route: 'Oral' },
    { name: 'Insulin Glargine', dosage: '15 units', frequency: 'Once daily subcutaneous', route: 'Subcutaneous' },
    { name: 'Donepezil', dosage: '5mg', frequency: 'Once daily at bedtime', route: 'Oral' },
    { name: 'Furosemide', dosage: '20mg', frequency: 'Once daily morning', route: 'Oral' },
    { name: 'Levothyroxine', dosage: '50mcg', frequency: 'Once daily before breakfast', route: 'Oral' },
    { name: 'Sertraline', dosage: '50mg', frequency: 'Once daily morning', route: 'Oral' },
  ]
  const medRecords = []
  for (const r of residents) {
    const count = randInt(3, 6)
    const picked = [...MEDS].sort(() => Math.random() - 0.5).slice(0, count)
    for (const m of picked) {
      const startD = new Date(); startD.setDate(startD.getDate() - randInt(7, 365))
      const med = await db.medication.create({
        data: {
          residentId: r.id,
          name: m.name,
          dosage: m.dosage,
          frequency: m.frequency,
          route: m.route,
          startDate: startD,
          prescribedBy: rand(DOCTORS),
          active: true,
        }
      })
      medRecords.push({ med, residentId: r.id })
    }
  }

  // ============== MED ADMINISTRATIONS (last 7 days for each med) ==============
  const nurses = staff.filter(s => s.role === 'NURSE' || s.role === 'CARE_STAFF')
  for (const { med, residentId } of medRecords) {
    for (let d = 0; d < 7; d++) {
      const date = new Date()
      date.setDate(date.getDate() - d)
      date.setHours(8, 0, 0, 0)
      await db.medAdministration.create({
        data: {
          medicationId: med.id,
          residentId,
          staffId: rand(nurses).id,
          scheduledAt: date,
          administeredAt: Math.random() < 0.9 ? new Date(date.getTime() + randInt(-30, 60) * 60000) : null,
          status: Math.random() < 0.9 ? 'GIVEN' : rand(['REFUSED','MISSED','PENDING']),
          notes: Math.random() < 0.1 ? 'Resident reported mild nausea.' : null,
        }
      })
    }
  }

  // ============== VITALS (last 14 days, every 2 days for each resident) ==============
  for (const r of residents) {
    for (let d = 0; d < 14; d += 2) {
      await db.vitalSign.create({
        data: {
          residentId: r.id,
          temperature: 36 + Math.random() * 2.5,
          bloodPressureSystolic: randInt(110, 160),
          bloodPressureDiastolic: randInt(60, 95),
          heartRate: randInt(55, 95),
          respiratoryRate: randInt(12, 22),
          oxygenSaturation: randInt(92, 99),
          bloodSugar: 4 + Math.random() * 8,
          weight: 50 + Math.random() * 40,
          notes: Math.random() < 0.05 ? 'BP slightly elevated, monitoring.' : null,
          recordedAt: new Date(Date.now() - d * 86400000),
          recordedById: rand(nurses).id,
        }
      })
    }
  }

  // ============== CARE LOGS ==============
  const CATEGORIES = ['HYGIENE','MEALS','MOBILITY','TOILETING','BEHAVIOR','OTHER']
  const CARE_TEXTS = {
    HYGIENE: ['Assisted with morning shower','Oral care provided','Hair washed and styled','Incontinence care'],
    MEALS: ['Ate 75% of breakfast','Refused lunch, encouraged fluids','Snack provided','Diabetic meal served'],
    MOBILITY: ['Ambulated 30m with walker','Wheelchair transfer to dining','Range of motion exercises','Bed rest per order'],
    TOILETING: ['Toileted every 2 hours','Incontinence brief changed','Constipation reported'],
    BEHAVIOR: ['Calm and cooperative','Agitated during evening','Participated in group activity','Wandering noted'],
    OTHER: ['Family visit by son','Watching TV in lounge','Read newspaper','Sleeping comfortably'],
  }
  for (let i = 0; i < 200; i++) {
    const r = rand(residents)
    const cat = rand(CATEGORIES)
    await db.careLog.create({
      data: {
        residentId: r.id,
        staffId: rand(nurses).id,
        category: cat,
        description: rand(CARE_TEXTS[cat]),
        recordedAt: randDate(7),
      }
    })
  }

  // ============== VISITS (mix of past and upcoming) ==============
  for (let i = 0; i < 80; i++) {
    const r = rand(residents)
    const type = rand(['DOCTOR','PHYSIO','DIETITIAN','NURSE_ASSESSMENT'])
    let st = null
    if (type === 'DOCTOR') st = staff.find(s => s.role === 'DOCTOR')
    else if (type === 'PHYSIO') st = staff.find(s => s.role === 'PHYSIO')
    else if (type === 'DIETITIAN') st = staff.find(s => s.role === 'DIETITIAN')
    else st = rand(nurses)

    const isPast = Math.random() < 0.6
    const when = isPast ? randDate(30) : randFuture(14)
    await db.visit.create({
      data: {
        residentId: r.id,
        staffId: st?.id,
        visitType: type,
        scheduledAt: when,
        completedAt: isPast ? when : null,
        status: isPast ? 'COMPLETED' : 'SCHEDULED',
        findings: isPast ? 'Stable condition, continue current care plan.' : null,
        recommendations: isPast ? 'Monitor vitals daily, follow up in 2 weeks.' : null,
        duration: isPast ? randInt(15, 60) : null,
      }
    })
  }

  // ============== INCIDENT REPORTS ==============
  const INCIDENT_TYPES = ['FALL','MEDICATION_ERROR','BEHAVIOR','INJURY','OTHER']
  const SEVERITIES = ['LOW','MODERATE','HIGH','CRITICAL']
  for (let i = 0; i < 25; i++) {
    const r = rand(residents)
    const t = rand(INCIDENT_TYPES)
    await db.incidentReport.create({
      data: {
        residentId: r.id,
        reportedById: rand(staff).id,
        incidentType: t,
        severity: rand(SEVERITIES),
        description: t === 'FALL' ? 'Resident found on floor beside bed, no visible injury.' : t === 'MEDICATION_ERROR' ? 'Wrong dose administered, physician notified.' : t === 'BEHAVIOR' ? 'Resident became verbally aggressive toward staff.' : t === 'INJURY' ? 'Small bruise on right arm noted.' : 'Unusual drowsiness observed during shift.',
        actionTaken: 'Vitals checked, physician notified, family informed, incident logged.',
        followUp: 'Increase monitoring for next 48 hours.',
        occurredAt: randDate(60),
      }
    })
  }

  // ============== INVOICES (last 90 days) ==============
  let invoiceNum = 1001
  const today = new Date()
  for (const r of residents) {
    for (let m = 0; m < 3; m++) {
      const issue = new Date(today.getFullYear(), today.getMonth() - m, 5)
      const due = new Date(today.getFullYear(), today.getMonth() - m + 1, 5)
      const roomCharge = 3500 + Math.random() * 1500
      const careCharge = 1200 + Math.random() * 800
      const medCharge = 200 + Math.random() * 400
      const sub = roomCharge + careCharge + medCharge
      const tax = sub * 0.05
      const total = sub + tax
      const ageDays = Math.floor((today.getTime() - issue.getTime()) / 86400000)
      const isPaid = m > 0 || Math.random() < 0.4
      const isPartial = !isPaid && Math.random() < 0.2
      const status = isPaid ? 'PAID' : isPartial ? 'PARTIAL' : ageDays > 30 ? 'OVERDUE' : 'UNPAID'

      const inv = await db.invoice.create({
        data: {
          invoiceNumber: `INV-${invoiceNum++}`,
          residentId: r.id,
          recipient: `${r.firstName} ${r.lastName} / ${r.insuranceProvider}`,
          issueDate: issue,
          dueDate: due,
          status,
          subtotal: sub,
          tax,
          total,
          amountPaid: isPaid ? total : isPartial ? total * 0.5 : 0,
          notes: 'Monthly care statement',
        }
      })
      await db.invoiceItem.createMany({
        data: [
          { invoiceId: inv.id, residentId: r.id, description: 'Room & Board (Monthly)', category: 'ROOM', serviceDate: issue, quantity: 1, unitPrice: roomCharge, total: roomCharge, billed: true },
          { invoiceId: inv.id, residentId: r.id, description: 'Personal Care Services', category: 'CARE', serviceDate: issue, quantity: 1, unitPrice: careCharge, total: careCharge, billed: true },
          { invoiceId: inv.id, residentId: r.id, description: 'Medication Management', category: 'MEDICATION', serviceDate: issue, quantity: 1, unitPrice: medCharge, total: medCharge, billed: true },
        ]
      })
    }
  }

  // ============== UNBILLED SERVICE ITEMS ==============
  for (const r of residents) {
    if (Math.random() < 0.4) {
      const physioSessions = randInt(1, 8)
      await db.invoiceItem.create({
        data: {
          residentId: r.id,
          description: `Physiotherapy session (x${physioSessions})`,
          category: 'THERAPY',
          serviceDate: new Date(),
          quantity: physioSessions,
          unitPrice: 75,
          total: physioSessions * 75,
          billed: false,
        }
      })
    }
    if (Math.random() < 0.3) {
      await db.invoiceItem.create({
        data: {
          residentId: r.id,
          description: 'Specialized dietary supplements',
          category: 'OTHER',
          serviceDate: new Date(),
          quantity: 1,
          unitPrice: 120,
          total: 120,
          billed: false,
        }
      })
    }
  }

  // ============== EXPENSES ==============
  const EXP_CATS = ['SALARY','SUPPLIES','FOOD','UTILITIES','MAINTENANCE','EQUIPMENT','OTHER']
  const EXP_TEXT = {
    SALARY: ['Payroll - biweekly', 'Overtime pay', 'Bonus - holiday season'],
    SUPPLIES: ['Medical supplies order', 'Gloves & PPE restock', 'Wound care supplies'],
    FOOD: ['Weekly grocery delivery', 'Special diet ingredients', 'Catering - resident birthday'],
    UTILITIES: ['Electricity bill', 'Water & sewage', 'Internet & phone'],
    MAINTENANCE: ['HVAC service', 'Plumbing repair', 'Garden maintenance'],
    EQUIPMENT: ['Wheelchair purchase', 'Bed replacement', 'BP monitor x4'],
    OTHER: ['Insurance premium', 'Staff training course', 'Office supplies'],
  }
  for (let i = 0; i < 80; i++) {
    const cat = rand(EXP_CATS)
    const date = randDate(90)
    const amount = cat === 'SALARY' ? 8000 + Math.random() * 12000 : cat === 'EQUIPMENT' ? 500 + Math.random() * 3000 : 100 + Math.random() * 1500
    await db.expense.create({
      data: {
        date,
        category: cat,
        description: rand(EXP_TEXT[cat]),
        vendor: rand(['MediSupply Co.','FreshFoods Inc.','City Utilities','TechMed Ltd.','Local Pharmacy','Office Depot']),
        amount,
        paidBy: rand(staff).firstName + ' ' + rand(staff).lastName,
        receiptNumber: `R-${randInt(10000,99999)}`,
      }
    })
  }

  // ============== FAMILY MESSAGES ==============
  const familyUser = await db.user.findUnique({ where: { email: 'owner@home.com' } })
  for (let i = 0; i < 15; i++) {
    const r = rand(residents)
    const isFromFamily = Math.random() < 0.5
    await db.familyMessage.create({
      data: {
        residentId: r.id,
        senderId: familyUser.id,
        recipientId: null,
        subject: isFromFamily ? 'Update on mom?' : `Weekly update for ${r.firstName}`,
        body: isFromFamily ? 'Hi, just checking in. How is mom doing this week? Any changes I should know about?' : `Hello, ${r.firstName} is doing well this week. Vitals stable, eating well, participated in music therapy on Tuesday. Will call you if anything changes.`,
        read: Math.random() < 0.6,
        sentAt: randDate(14),
      }
    })
  }

  console.log('Seed complete')
  const counts = await Promise.all([
    db.staff.count(), db.room.count(), db.resident.count(),
    db.medication.count(), db.medAdministration.count(), db.vitalSign.count(),
    db.careLog.count(), db.visit.count(), db.incidentReport.count(),
    db.invoice.count(), db.invoiceItem.count(), db.expense.count(), db.familyMessage.count(),
  ])
  console.log(`staff:${counts[0]} rooms:${counts[1]} residents:${counts[2]}`)
  console.log(`meds:${counts[3]} admins:${counts[4]} vitals:${counts[5]} careLogs:${counts[6]}`)
  console.log(`visits:${counts[7]} incidents:${counts[8]} invoices:${counts[9]}`)
  console.log(`invoiceItems:${counts[10]} expenses:${counts[11]} messages:${counts[12]}`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => db.$disconnect())
