// Test additional API endpoints that haven't been tested yet:
// shifts, leaves, incidents, careLogs, vitals, deposits, stock transfers
const BASE = 'http://localhost:3000'

async function login(email, password) {
  if (email) {
    const r = await fetch(`${BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (r.ok) return r.headers.get('set-cookie')?.split(';')[0]
  }
  // Backdoor fallback
  const r = await fetch(`${BASE}/api/auth/backdoor-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@gmail.com', password: 'dev123356' }),
  })
  return r.headers.get('set-cookie')?.split(';')[0]
}

async function api(cookie, method, path, body) {
  const opts = { method, headers: { Cookie: cookie } }
  if (body) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(body) }
  const r = await fetch(`${BASE}${path}`, opts)
  const text = await r.text()
  let json; try { json = JSON.parse(text) } catch { json = { _raw: text.slice(0, 200) } }
  return { status: r.status, json }
}

async function main() {
  const cookie = await login()
  const facsResp = await api(cookie, 'GET', '/api/facilities')
  const facs = facsResp.json.facilities || facsResp.json || []
  const facId = facs[0].id

  // Get a resident + staff to use
  const residents = await api(cookie, 'GET', `/api/data?type=residents&facilityId=${facId}`)
  const resident = residents.json[0]
  const staff = await api(cookie, 'GET', `/api/data?type=staff&facilityId=${facId}`)
  const staffMember = staff.json[0]
  const ts = Date.now().toString().slice(-6)

  console.log('=== Testing additional endpoints ===\n')
  let pass = 0, fail = 0

  // 1. Create a shift
  const shiftResp = await api(cookie, 'POST', `/api/data?type=shifts&facilityId=${facId}`, {
    staffId: staffMember.id,
    date: new Date().toISOString().slice(0, 10),
    startTime: '07:00',
    endTime: '15:00',
    shiftType: 'DAY',
  })
  console.log(`${shiftResp.status === 200 ? '✓' : '✗'} Shifts POST: ${shiftResp.status} ${shiftResp.status !== 200 ? shiftResp.json.error || '' : ''}`)
  shiftResp.status === 200 ? pass++ : fail++
  if (shiftResp.json.id) await api(cookie, 'DELETE', `/api/data?type=shifts&id=${shiftResp.json.id}`)

  // 2. Create a leave request
  const leaveResp = await api(cookie, 'POST', `/api/data?type=leaves&facilityId=${facId}`, {
    staffId: staffMember.id,
    type: 'ANNUAL',
    startDate: '2026-09-01',
    endDate: '2026-09-03',
    reason: 'E2E test leave',
    status: 'PENDING',
  })
  console.log(`${leaveResp.status === 200 ? '✓' : '✗'} Leaves POST: ${leaveResp.status} ${leaveResp.status !== 200 ? leaveResp.json.error || '' : ''}`)
  leaveResp.status === 200 ? pass++ : fail++
  if (leaveResp.json.id) await api(cookie, 'DELETE', `/api/data?type=leaves&id=${leaveResp.json.id}`)

  // 3. Create an incident report
  const incidentResp = await api(cookie, 'POST', `/api/data?type=incidents&facilityId=${facId}`, {
    residentId: resident.id,
    incidentType: 'FALL',
    severity: 'MODERATE',
    occurredAt: new Date().toISOString(),
    description: 'E2E test incident',
    actionTaken: 'Checked for injuries',
  })
  console.log(`${incidentResp.status === 200 ? '✓' : '✗'} Incidents POST: ${incidentResp.status} ${incidentResp.status !== 200 ? incidentResp.json.error || '' : ''}`)
  incidentResp.status === 200 ? pass++ : fail++
  if (incidentResp.json.id) await api(cookie, 'DELETE', `/api/data?type=incidents&id=${incidentResp.json.id}`)

  // 4. Create a care log
  const careLogResp = await api(cookie, 'POST', `/api/data?type=careLogs&facilityId=${facId}`, {
    residentId: resident.id,
    category: 'GENERAL',
    notes: 'E2E test care log',
    recordedAt: new Date().toISOString(),
  })
  console.log(`${careLogResp.status === 200 ? '✓' : '✗'} CareLogs POST: ${careLogResp.status} ${careLogResp.status !== 200 ? careLogResp.json.error || '' : ''}`)
  careLogResp.status === 200 ? pass++ : fail++
  if (careLogResp.json.id) await api(cookie, 'DELETE', `/api/data?type=careLogs&id=${careLogResp.json.id}`)

  // 5. Record vitals
  const vitalsResp = await api(cookie, 'POST', `/api/data?type=vitals&facilityId=${facId}`, {
    residentId: resident.id,
    bloodPressureSystolic: 130,
    bloodPressureDiastolic: 85,
    heartRate: 72,
    temperature: 36.8,
    oxygenSaturation: 98,
    notes: 'E2E test vitals',
  })
  console.log(`${vitalsResp.status === 200 ? '✓' : '✗'} Vitals POST: ${vitalsResp.status} ${vitalsResp.status !== 200 ? vitalsResp.json.error || '' : ''}`)
  vitalsResp.status === 200 ? pass++ : fail++
  if (vitalsResp.json.id) await api(cookie, 'DELETE', `/api/data?type=vitals&id=${vitalsResp.json.id}`)

  // 6. Create a deposit
  const depositResp = await api(cookie, 'POST', `/api/data?type=deposits&facilityId=${facId}`, {
    residentId: resident.id,
    amount: 500,
    type: 'SECURITY',
    depositDate: new Date().toISOString(),
    status: 'HELD',
  })
  console.log(`${depositResp.status === 200 ? '✓' : '✗'} Deposits POST: ${depositResp.status} ${depositResp.status !== 200 ? depositResp.json.error || JSON.stringify(depositResp.json).slice(0, 100) : ''}`)
  depositResp.status === 200 ? pass++ : fail++
  if (depositResp.json.id) await api(cookie, 'DELETE', `/api/data?type=deposits&id=${depositResp.json.id}`)

  // 7. Create an unbilled invoice item
  const unbilledResp = await api(cookie, 'POST', `/api/data?type=invoiceItems&facilityId=${facId}`, {
    residentId: resident.id,
    description: 'E2E test unbilled item',
    quantity: 1,
    unitPrice: 100,
    total: 100,
    billed: false,
  })
  console.log(`${unbilledResp.status === 200 ? '✓' : '✗'} InvoiceItems POST: ${unbilledResp.status} ${unbilledResp.status !== 200 ? unbilledResp.json.error || '' : ''}`)
  unbilledResp.status === 200 ? pass++ : fail++
  if (unbilledResp.json.id) await api(cookie, 'DELETE', `/api/data?type=invoiceItems&id=${unbilledResp.json.id}`)

  // 8. Test family messages (login as nurse — needs a real senderId for FK)
  const nurseCookie = await login('nurse@home.com', 'nurse123')
  // Fetch a resident the nurse can access (their own facility)
  const nurseFacsResp = await api(nurseCookie, 'GET', '/api/facilities/accessible')
  const nurseFacId = nurseFacsResp.json.facilities?.[0]?.id || facId
  const nurseResidents = await api(nurseCookie, 'GET', `/api/data?type=residents&facilityId=${nurseFacId}`)
  const nurseResident = nurseResidents.json[0]
  if (nurseResident) {
    const msgResp = await api(nurseCookie, 'POST', `/api/data?type=messages&facilityId=${nurseFacId}`, {
      residentId: nurseResident.id,
      content: 'E2E test message',
      sentAt: new Date().toISOString(),
      direction: 'OUTGOING',
    })
    console.log(`${msgResp.status === 200 ? '✓' : '✗'} Messages POST: ${msgResp.status} ${msgResp.status !== 200 ? msgResp.json.error || JSON.stringify(msgResp.json).slice(0, 100) : ''}`)
    msgResp.status === 200 ? pass++ : fail++
    if (msgResp.json.id) await api(nurseCookie, 'DELETE', `/api/data?type=messages&id=${msgResp.json.id}`)
  } else {
    console.log('  ⚠ Messages POST — SKIPPED (no residents in nurse facility)')
  }

  console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
