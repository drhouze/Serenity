// End-to-end test for the new Payments feature
const BASE = 'http://localhost:3000'

async function main() {
  // 1. Login as owner
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@home.com', password: 'owner123' }),
  })
  const setCookie = loginRes.headers.get('set-cookie')
  const cookie = setCookie?.split(';')[0]
  console.log('Login:', loginRes.status)
  if (!cookie) return console.log('Login failed')

  // 2. Find an UNPAID invoice to test with
  const invRes = await fetch(`${BASE}/api/data?type=invoices&status=UNPAID`, { headers: { Cookie: cookie } })
  const invoices = await invRes.json()
  console.log(`Found ${invoices.length} UNPAID invoices`)
  if (invoices.length === 0) return
  const testInvoice = invoices[0]
  console.log(`Test invoice: ${testInvoice.invoiceNumber} total=${testInvoice.total} paid=${testInvoice.amountPaid} balance=${testInvoice.total - testInvoice.amountPaid}`)
  const beforeBalance = testInvoice.total - testInvoice.amountPaid

  // 3. Create a payment matched to this invoice
  const payAmount = Math.min(500, beforeBalance)
  const createRes = await fetch(`${BASE}/api/data?type=payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      invoiceId: testInvoice.id,
      residentId: testInvoice.residentId,
      payerName: 'Test Payer',
      amount: payAmount,
      method: 'BANK_TRANSFER',
      reference: 'TEST-TXN-001',
      status: 'CLEARED',
      applyToInvoice: true,
    }),
  })
  const payment = await createRes.json()
  console.log(`\nCreate payment: ${createRes.status}`)
  console.log(`  paymentCode: ${payment.paymentCode}`)
  console.log(`  amount: ${payment.amount}`)
  console.log(`  appliedAmount: ${payment.appliedAmount}`)
  console.log(`  invoice.invoiceNumber: ${payment.invoice?.invoiceNumber}`)
  console.log(`  applications: ${payment.applications?.length || 0}`)

  // 4. Re-fetch the invoice — its amountPaid should have increased
  const invAfterRes = await fetch(`${BASE}/api/data?type=invoices`, { headers: { Cookie: cookie } })
  const invoicesAfter = await invAfterRes.json()
  const invAfter = invoicesAfter.find((i) => i.id === testInvoice.id)
  console.log(`\nInvoice after payment:`)
  console.log(`  amountPaid: ${invAfter.amountPaid} (was ${testInvoice.amountPaid})`)
  console.log(`  status: ${invAfter.status} (was ${testInvoice.status})`)
  console.log(`  ✓ Payment correctly applied: ${invAfter.amountPaid === testInvoice.amountPaid + payAmount ? 'PASS' : 'FAIL'}`)

  // 5. List payments — should include our new payment
  const listRes = await fetch(`${BASE}/api/data?type=payments`, { headers: { Cookie: cookie } })
  const payments = await listRes.json()
  console.log(`\nPayments list: ${payments.length} total`)
  const found = payments.find((p) => p.id === payment.id)
  console.log(`  ✓ New payment in list: ${found ? 'PASS' : 'FAIL'}`)

  // 6. Test creating an unapplied payment (no invoiceId)
  const unappliedRes = await fetch(`${BASE}/api/data?type=payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      residentId: testInvoice.residentId,
      payerName: 'Test Unapplied Payer',
      amount: 1000,
      method: 'CASH',
      status: 'CLEARED',
      applyToInvoice: false,
    }),
  })
  const unappliedPay = await unappliedRes.json()
  console.log(`\nUnapplied payment:`)
  console.log(`  paymentCode: ${unappliedPay.paymentCode}`)
  console.log(`  amount: ${unappliedPay.amount}`)
  console.log(`  appliedAmount: ${unappliedPay.appliedAmount}`)
  console.log(`  invoiceId: ${unappliedPay.invoiceId}`)
  console.log(`  applications: ${unappliedPay.applications?.length || 0}`)
  console.log(`  ✓ Unapplied payment has 0 applied: ${unappliedPay.appliedAmount === 0 ? 'PASS' : 'FAIL'}`)

  // 7. Apply the unapplied payment to a different invoice (test the paymentApplications endpoint)
  const inv2 = invoices[1]
  if (inv2) {
    const applyRes = await fetch(`${BASE}/api/data?type=paymentApplications`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookie },
      body: JSON.stringify({
        paymentId: unappliedPay.id,
        invoiceId: inv2.id,
        amount: 300,
      }),
    })
    const appResult = await applyRes.json()
    console.log(`\nApply unapplied payment to ${inv2.invoiceNumber}: ${applyRes.status}`)
    console.log(`  applicationId: ${appResult.id}`)
    console.log(`  amount: ${appResult.amount}`)

    // Check the payment's appliedAmount increased
    const payCheckRes = await fetch(`${BASE}/api/data?type=payments`, { headers: { Cookie: cookie } })
    const paysCheck = await payCheckRes.json()
    const payCheck = paysCheck.find((p) => p.id === unappliedPay.id)
    console.log(`  ✓ Payment appliedAmount now ${payCheck.appliedAmount} (was 0): ${payCheck.appliedAmount === 300 ? 'PASS' : 'FAIL'}`)

    // Check the invoice's amountPaid increased
    const inv2CheckRes = await fetch(`${BASE}/api/data?type=invoices`, { headers: { Cookie: cookie } })
    const invs2Check = await inv2CheckRes.json()
    const inv2Check = invs2Check.find((i) => i.id === inv2.id)
    console.log(`  ✓ Invoice ${inv2.invoiceNumber} amountPaid now ${inv2Check.amountPaid} (was ${inv2.amountPaid}): ${Math.abs(inv2Check.amountPaid - (inv2.amountPaid + 300)) < 0.01 ? 'PASS' : 'FAIL'}`)
    console.log(`  ✓ Invoice status: ${inv2Check.status} (was ${inv2.status})`)

    // 8. Unapply the application (test DELETE paymentApplications)
    const unapplyRes = await fetch(`${BASE}/api/data?type=paymentApplications&id=${appResult.id}`, {
      method: 'DELETE',
      headers: { Cookie: cookie },
    })
    console.log(`\nUnapply application: ${unapplyRes.status}`)
    const unappResult = await unapplyRes.json()
    console.log(`  success: ${unappResult.success}`)

    // Verify invoice amountPaid went back down
    const inv2FinalRes = await fetch(`${BASE}/api/data?type=invoices`, { headers: { Cookie: cookie } })
    const invs2Final = await inv2FinalRes.json()
    const inv2Final = invs2Final.find((i) => i.id === inv2.id)
    console.log(`  ✓ Invoice amountPaid back to ${inv2Final.amountPaid} (was ${inv2.amountPaid}): ${Math.abs(inv2Final.amountPaid - inv2.amountPaid) < 0.01 ? 'PASS' : 'FAIL'}`)
  }

  // 9. Delete the first payment — should reverse the application on testInvoice
  const delRes = await fetch(`${BASE}/api/data?type=payments&id=${payment.id}`, {
    method: 'DELETE',
    headers: { Cookie: cookie },
  })
  console.log(`\nDelete payment ${payment.paymentCode}: ${delRes.status}`)
  const delResult = await delRes.json()
  console.log(`  success: ${delResult.success}`)

  // Verify the invoice amountPaid went back to original
  const invFinalRes = await fetch(`${BASE}/api/data?type=invoices`, { headers: { Cookie: cookie } })
  const invsFinal = await invFinalRes.json()
  const invFinal = invsFinal.find((i) => i.id === testInvoice.id)
  console.log(`  ✓ Invoice amountPaid back to ${invFinal.amountPaid} (was ${testInvoice.amountPaid}): ${Math.abs(invFinal.amountPaid - testInvoice.amountPaid) < 0.01 ? 'PASS' : 'FAIL'}`)
  console.log(`  ✓ Invoice status back to ${invFinal.status} (was ${testInvoice.status})`)

  // 10. Clean up the unapplied payment too
  await fetch(`${BASE}/api/data?type=payments&id=${unappliedPay.id}`, { method: 'DELETE', headers: { Cookie: cookie } })
  console.log(`\nCleaned up test data.`)
}

main().catch(console.error)
