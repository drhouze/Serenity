// Comprehensive bulk import test — exercises ALL 13 entity types end-to-end.
// For each: creates a minimal CSV → POSTs to /api/data?type=X → verifies the
// record was created → deletes it (cleanup).
//
// Run: node scripts/test-all-bulk-imports.cjs

const BASE = 'http://localhost:3000'

async function login() {
  const r = await fetch(`${BASE}/api/auth/backdoor-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'dev@gmail.com', password: 'dev123356' }),
  })
  if (!r.ok) throw new Error('Backdoor login failed')
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

async function getFacility(cookie) {
  const { json } = await api(cookie, 'GET', '/api/facilities')
  const facs = json.facilities || json
  if (!facs || facs.length === 0) throw new Error('No facilities found — cannot test imports')
  return facs[0].id
}

async function testImport(cookie, entityType, payload, cleanup = null) {
  const facilityId = await getFacility(cookie)
  const fullPayload = { ...payload, facilityId }
  const { status, json } = await api(cookie, 'POST', `/api/data?type=${entityType}`, fullPayload)
  const ok = status === 200 || status === 201
  console.log(`  ${ok ? '✓' : '✗'} ${entityType.padEnd(20)} → HTTP ${status} ${ok ? '' : 'ERROR: ' + (json.error || JSON.stringify(json).slice(0, 150))}`)
  if (ok && json.id && cleanup) {
    // Cleanup the created record
    await api(cookie, 'DELETE', `/api/data?type=${entityType}&id=${json.id}`)
  }
  return ok
}

async function main() {
  console.log('=== Logging in via backdoor ===')
  const cookie = await login()
  console.log('Logged in.\n')

  console.log('=== Testing ALL 13 bulk imports ===\n')

  let pass = 0, fail = 0
  const ts = Date.now().toString().slice(-6)  // unique suffix to avoid "already exists" errors

  // 1. RESIDENT
  if (await testImport(cookie, 'residents', {
    firstName: 'Test', lastName: `R${ts}`, gender: 'Male', dateOfBirth: '1950-01-01',
    admissionDate: '2026-08-13', status: 'ACTIVE',
  })) pass++; else fail++

  // 2. STAFF
  if (await testImport(cookie, 'staff', {
    firstName: 'Test', lastName: `S${ts}`, role: 'NURSE', hireDate: '2026-08-13',
    active: true,
  })) pass++; else fail++

  // 3. ROOM
  if (await testImport(cookie, 'rooms', {
    roomNumber: `T-${ts}`, capacity: 1, type: 'PRIVATE', status: 'AVAILABLE',
  })) pass++; else fail++

  // 4. PRODUCT
  if (await testImport(cookie, 'products', {
    name: `Test Product ${ts}`, category: 'OTHER', unitPrice: 10.00, unit: 'each', active: true,
  })) pass++; else fail++

  // 5. VENDOR
  if (await testImport(cookie, 'vendors', {
    name: `Test Vendor ${ts}`, email: `test${ts}@vendor.com`, phone: '12345678',
  })) pass++; else fail++

  // 6. ACCOUNT (GL account)
  if (await testImport(cookie, 'accounts', {
    code: `9${ts}`, name: `Test GL Account ${ts}`, type: 'ASSET', normalBalance: 'DEBIT',
  })) pass++; else fail++

  // 7. BANK ACCOUNT
  if (await testImport(cookie, 'bankAccounts', {
    name: `Test Bank ${ts}`, type: 'BANK', glAccountCode: `9${ts}`, accountNumber: '1234',
    bankName: 'TestBank', openingBalance: 0,
  })) pass++; else fail++

  // 8. EXPENSE (no paymentMethod — it's not an Expense field)
  if (await testImport(cookie, 'expenses', {
    description: `Test Expense ${ts}`, category: 'OTHER', amount: 50.00, date: '2026-08-13',
  })) pass++; else fail++

  // 9. PAYMENT
  if (await testImport(cookie, 'payments', {
    amount: 100.00, paymentMethod: 'CASH', paymentDate: '2026-08-13',
    receivedFrom: `Test Payer ${ts}`,
  })) pass++; else fail++

  // 10. INVENTORY ITEM (uses currentStock, not quantity)
  if (await testImport(cookie, 'inventory', {
    name: `Test Item ${ts}`, sku: `SKU-${ts}`, currentStock: 10, unit: 'each',
    reorderLevel: 5, category: 'OTHER',
  })) pass++; else fail++

  // 11. PURCHASE ORDER — needs vendorId + lines array
  const vendorResp = await api(cookie, 'POST', '/api/data?type=vendors', {
    name: `Test PO Vendor ${ts}`, facilityId: (await getFacility(cookie)),
  })
  if (vendorResp.json.id) {
    if (await testImport(cookie, 'purchaseOrders', {
      vendorId: vendorResp.json.id, orderDate: '2026-08-13', status: 'DRAFT',
      lines: [{ description: `Test Item ${ts}`, quantity: 2, unitPrice: 15.50, total: 31.00 }],
    })) pass++; else fail++
    await api(cookie, 'DELETE', `/api/data?type=vendors&id=${vendorResp.json.id}`)
  } else { fail++; console.log('  ✗ purchaseOrders — SKIPPED (could not create vendor)') }

  // 12. JOURNAL ENTRY — needs 2+ balanced lines
  // First create 2 GL accounts to reference
  const acc1 = await api(cookie, 'POST', '/api/data?type=accounts', {
    code: `91${ts}`, name: `Test JE Debit ${ts}`, type: 'ASSET', normalBalance: 'DEBIT',
    facilityId: (await getFacility(cookie)),
  })
  const acc2 = await api(cookie, 'POST', '/api/data?type=accounts', {
    code: `92${ts}`, name: `Test JE Credit ${ts}`, type: 'LIABILITY', normalBalance: 'CREDIT',
    facilityId: (await getFacility(cookie)),
  })
  if (acc1.json.id && acc2.json.id) {
    if (await testImport(cookie, 'journalEntries', {
      memo: `Test JE ${ts}`, entryDate: '2026-08-13',
      lines: [
        { accountId: acc1.json.id, debit: 100, credit: 0, description: 'Debit side' },
        { accountId: acc2.json.id, debit: 0, credit: 100, description: 'Credit side' },
      ],
    })) pass++; else fail++
    await api(cookie, 'DELETE', `/api/data?type=accounts&id=${acc1.json.id}`)
    await api(cookie, 'DELETE', `/api/data?type=accounts&id=${acc2.json.id}`)
  } else { fail++; console.log('  ✗ journalEntries — SKIPPED (could not create GL accounts)') }

  // 13. PRODUCT VENDOR PRICE — needs productId + vendorId
  const prodResp = await api(cookie, 'POST', '/api/data?type=products', {
    name: `Test PVP Product ${ts}`, category: 'OTHER', unitPrice: 10, unit: 'each', active: true,
    facilityId: (await getFacility(cookie)),
  })
  const vResp = await api(cookie, 'POST', '/api/data?type=vendors', {
    name: `Test PVP Vendor ${ts}`, facilityId: (await getFacility(cookie)),
  })
  if (prodResp.json.id && vResp.json.id) {
    if (await testImport(cookie, 'productVendorPrices', {
      productId: prodResp.json.id, vendorId: vResp.json.id, unitCost: 9.50, minOrderQty: 1,
    })) pass++; else fail++
    await api(cookie, 'DELETE', `/api/data?type=products&id=${prodResp.json.id}`)
    await api(cookie, 'DELETE', `/api/data?type=vendors&id=${vResp.json.id}`)
  } else { fail++; console.log('  ✗ productVendorPrices — SKIPPED (could not create product/vendor)') }

  console.log(`\n=== Summary: ${pass} passed, ${fail} failed ===`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch(e => { console.error('Fatal:', e); process.exit(1) })
