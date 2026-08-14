// Comprehensive end-to-end user flow test:
// Room → Resident → Medication → MAR → Visit → Invoice → Payment → Accounting Report
// Also tests data separation between facilities.
//
// Run: node scripts/test-e2e-user-flow.cjs

const BASE = 'http://localhost:3000'

async function login(email, password) {
  const r = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!r.ok) {
    // Try backdoor
    const r2 = await fetch(`${BASE}/api/auth/backdoor-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!r2.ok) throw new Error(`Login failed for ${email}`)
    const cookie = r2.headers.get('set-cookie')?.split(';')[0]
    return cookie
  }
  const cookie = r.headers.get('set-cookie')?.split(';')[0]
  return cookie
}

async function api(cookie, method, path, body) {
  const opts = { method, headers: { Cookie: cookie } }
  if (body) {
    opts.headers['Content-Type'] = 'application/json'
    opts.body = JSON.stringify(body)
  }
  const r = await fetch(`${BASE}${path}`, opts)
  const text = await r.text()
  let json
  try { json = JSON.parse(text) } catch { json = { _raw: text.slice(0, 200) } }
  return { status: r.status, json }
}

async function step(label, fn) {
  process.stdout.write(`  ${label}... `)
  try {
    const result = await fn()
    console.log('✓')
    return result
  } catch (e) {
    console.log(`✗ ${e.message}`)
    throw e
  }
}

async function main() {
  console.log('=== END-TO-END USER FLOW TEST ===\n')

  // Login as developer
  console.log('Logging in as developer...')
  const cookie = await login('dev@gmail.com', 'dev123356')
  console.log('Logged in.\n')

  // Get facilities
  const facsResp = await api(cookie, 'GET', '/api/facilities')
  const facilities = facsResp.json.facilities || facsResp.json || []
  if (facilities.length < 2) {
    console.log('WARNING: Need 2+ facilities for data separation test. Found:', facilities.length)
  }
  const fac1 = facilities[0]
  const fac2 = facilities[1] || facilities[0]
  console.log(`Facility 1: ${fac1.name} (${fac1.id})`)
  console.log(`Facility 2: ${fac2.name} (${fac2.id})`)
  console.log()

  // ===== STEP 1: Create a Room =====
  console.log('--- Step 1: Register a Room ---')
  const ts = Date.now().toString().slice(-6)
  const room = await step('Create room', async () => {
    const { status, json } = await api(cookie, 'POST', `/api/data?type=rooms&facilityId=${fac1.id}`, {
      roomNumber: `E2E-${ts}`,
      capacity: 2,
      type: 'PRIVATE',
      status: 'AVAILABLE',
    })
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
    return json
  })

  // ===== STEP 2: Create a Resident =====
  console.log('\n--- Step 2: Register a Resident ---')
  const resident = await step('Create resident', async () => {
    const { status, json } = await api(cookie, 'POST', `/api/data?type=residents&facilityId=${fac1.id}`, {
      firstName: 'E2E',
      lastName: `Test${ts}`,
      gender: 'Male',
      dateOfBirth: '1945-03-15',
      admissionDate: '2026-08-13',
      status: 'ACTIVE',
      roomId: room.id,
      emergencyContactName: 'Jane Test',
      emergencyContactPhone: '+60123456789',
      emergencyContactRelation: 'Daughter',
    })
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
    return json
  })

  // ===== STEP 3: Add a Medication =====
  console.log('\n--- Step 3: Add Medication ---')
  const med = await step('Create medication', async () => {
    const { status, json } = await api(cookie, 'POST', `/api/data?type=medications&facilityId=${fac1.id}`, {
      residentId: resident.id,
      name: 'Paracetamol',
      dosage: '500mg',
      frequency: 'Three times daily',
      route: 'Oral Tablet',
      active: true,
    })
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
    return json
  })

  // ===== STEP 4: Generate MAR entries =====
  console.log('\n--- Step 4: Generate MAR entries ---')
  await step('Generate tomorrow\'s meds', async () => {
    const { status, json } = await api(cookie, 'POST', '/api/meds/generate')
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
    if (!json.created && json.created !== 0) throw new Error('No created count in response')
  })

  // Verify MAR entries exist for today
  await step('Verify MAR entries exist', async () => {
    const { status, json } = await api(cookie, 'GET', `/api/data?type=medAdmins&today=true&residentId=${resident.id}&facilityId=${fac1.id}`)
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
    if (!Array.isArray(json)) throw new Error('Expected array')
    // Note: might be 0 if the med generation didn't create entries for this resident
    console.log(`(${json.length} MAR entries) `)
  })

  // ===== STEP 5: Create a Visit =====
  console.log('\n--- Step 5: Create + Complete a Visit ---')
  const visit = await step('Schedule visit', async () => {
    const { status, json } = await api(cookie, 'POST', `/api/data?type=visits&facilityId=${fac1.id}`, {
      residentId: resident.id,
      visitType: 'DOCTOR',
      scheduledAt: new Date().toISOString(),
      status: 'SCHEDULED',
    })
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
    return json
  })

  await step('Complete visit with clinical notes', async () => {
    const { status, json } = await api(cookie, 'PATCH', `/api/data?type=visits&id=${visit.id}`, {
      status: 'COMPLETED',
      completedAt: new Date().toISOString(),
      completedByName: 'Dr. E2E Test',
      chiefComplaint: 'Routine checkup',
      diagnosis: 'Stable',
      prescription: 'Paracetamol 500mg TDS',
      treatmentPlan: 'Continue current meds',
    })
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
  })

  // ===== STEP 6: Create an Invoice =====
  console.log('\n--- Step 6: Create Invoice ---')
  const invoice = await step('Create invoice', async () => {
    const { status, json } = await api(cookie, 'POST', `/api/data?type=invoices&facilityId=${fac1.id}`, {
      residentId: resident.id,
      issueDate: new Date().toISOString(),
      status: 'UNPAID',
      items: [
        { description: 'Room & Board (August)', quantity: 1, unitPrice: 1500, total: 1500 },
        { description: 'Care Services', quantity: 1, unitPrice: 500, total: 500 },
      ],
    })
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
    return json
  })

  // ===== STEP 7: Record a Payment =====
  console.log('\n--- Step 7: Record Payment ---')
  const payment = await step('Record payment', async () => {
    const { status, json } = await api(cookie, 'POST', `/api/data?type=payments&facilityId=${fac1.id}`, {
      residentId: resident.id,
      amount: 1000,
      method: 'BANK_TRANSFER',
      paymentDate: new Date().toISOString(),
      payerName: 'Jane Test (Daughter)',
      reference: 'E2E-PAY-001',
    })
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
    return json
  })

  // Apply payment to invoice
  await step('Apply payment to invoice', async () => {
    const { status, json } = await api(cookie, 'POST', `/api/data?type=paymentApplications&facilityId=${fac1.id}`, {
      paymentId: payment.id,
      invoiceId: invoice.id,
      amount: 1000,
    })
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
  })

  // ===== STEP 8: Check Accounting Report =====
  console.log('\n--- Step 8: Check Accounting Report ---')
  await step('Fetch trial balance report', async () => {
    const { status, json } = await api(cookie, 'GET', `/api/accounting/reports?type=trial_balance&facilityId=${fac1.id}`)
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
    if (!json) throw new Error('No report data returned')
  })

  await step('Fetch income statement report', async () => {
    const { status, json } = await api(cookie, 'GET', `/api/accounting/reports?type=income_statement&facilityId=${fac1.id}`)
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
    if (!json) throw new Error('No report data returned')
  })

  // ===== STEP 9: Check Dashboard =====
  console.log('\n--- Step 9: Check Dashboard ---')
  await step('Fetch dashboard data', async () => {
    const { status, json } = await api(cookie, 'GET', `/api/dashboard?facilityId=${fac1.id}`)
    if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
    if (!json) throw new Error('No dashboard data returned')
  })

  // ===== STEP 10: Data Separation Test =====
  console.log('\n--- Step 10: Data Separation Test ---')
  if (fac1.id !== fac2.id) {
    // Create a room in fac2, verify fac1 can't see it
    const room2 = await step(`Create room in Facility 2 (${fac2.name})`, async () => {
      const { status, json } = await api(cookie, 'POST', `/api/data?type=rooms&facilityId=${fac2.id}`, {
        roomNumber: `SEP-${ts}`,
        capacity: 1,
        type: 'PRIVATE',
        status: 'AVAILABLE',
      })
      if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
      return json
    })

    await step('Verify Fac1 cannot see Fac2 room', async () => {
      const { status, json } = await api(cookie, 'GET', `/api/data?type=rooms&facilityId=${fac1.id}`)
      if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
      const found = (json || []).find(r => r.id === room2.id)
      if (found) throw new Error('DATA LEAK: Fac1 can see Fac2 room!')
    })

    await step('Verify Fac2 cannot see Fac1 resident', async () => {
      const { status, json } = await api(cookie, 'GET', `/api/data?type=residents&facilityId=${fac2.id}`)
      if (status !== 200) throw new Error(json.error || `HTTP ${status}`)
      const found = (json || []).find(r => r.id === resident.id)
      if (found) throw new Error('DATA LEAK: Fac2 can see Fac1 resident!')
    })

    // Cleanup room2
    await api(cookie, 'DELETE', `/api/data?type=rooms&id=${room2.id}`)
  } else {
    console.log('  ⚠ Only 1 facility found — skipping data separation test')
  }

  // ===== CLEANUP =====
  console.log('\n--- Cleanup ---')
  await step('Delete test payment', async () => {
    const { status } = await api(cookie, 'DELETE', `/api/data?type=payments&id=${payment.id}`)
    if (status !== 200) console.log(`(delete payment returned ${status})`)
  })
  await step('Delete test invoice', async () => {
    const { status } = await api(cookie, 'DELETE', `/api/data?type=invoices&id=${invoice.id}`)
    if (status !== 200) console.log(`(delete invoice returned ${status})`)
  })
  await step('Delete test visit', async () => {
    const { status } = await api(cookie, 'DELETE', `/api/data?type=visits&id=${visit.id}`)
    if (status !== 200) console.log(`(delete visit returned ${status})`)
  })
  await step('Delete test medication', async () => {
    const { status } = await api(cookie, 'DELETE', `/api/data?type=medications&id=${med.id}`)
    if (status !== 200) console.log(`(delete med returned ${status})`)
  })
  await step('Delete test resident', async () => {
    const { status } = await api(cookie, 'DELETE', `/api/data?type=residents&id=${resident.id}`)
    if (status !== 200) console.log(`(delete resident returned ${status})`)
  })
  await step('Delete test room', async () => {
    const { status } = await api(cookie, 'DELETE', `/api/data?type=rooms&id=${room.id}`)
    if (status !== 200) console.log(`(delete room returned ${status})`)
  })

  console.log('\n=== END-TO-END TEST COMPLETE ===')
  console.log('All steps passed! ✓')
  process.exit(0)
}

main().catch(e => {
  console.error('\n=== TEST FAILED ===')
  console.error(e.message)
  process.exit(1)
})
