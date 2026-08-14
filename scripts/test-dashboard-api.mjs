// Test the dashboard endpoint as an authenticated owner
const BASE = 'http://localhost:3000'

async function main() {
  // Login as owner
  const loginRes = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@home.com', password: 'owner123' }),
  })
  const setCookie = loginRes.headers.get('set-cookie')
  const cookie = setCookie?.split(';')[0]
  console.log('Login status:', loginRes.status)
  if (!cookie) {
    console.log('Login failed:', await loginRes.text())
    return
  }

  // Fetch dashboard
  const dashRes = await fetch(`${BASE}/api/dashboard`, {
    headers: { Cookie: cookie },
  })
  const data = await dashRes.json()
  console.log('Dashboard status:', dashRes.status)
  console.log('KPIs:')
  console.log('  monthlyRevenue (Billed):', data.kpis?.monthlyRevenue)
  console.log('  monthlyCollected:', data.kpis?.monthlyCollected)
  console.log('  monthlyInvoiceCount:', data.kpis?.monthlyInvoiceCount)
  console.log('  monthlyExpenses:', data.kpis?.monthlyExpenses)
  console.log('  monthlyExpenseCount:', data.kpis?.monthlyExpenseCount)
  console.log('  monthStartDate:', data.kpis?.monthStartDate)
  console.log('  outstandingAmount:', data.kpis?.outstandingAmount)
  console.log('  overdueInvoicesCount:', data.kpis?.overdueInvoicesCount)
  console.log('  overdueAmount:', data.kpis?.overdueAmount)
}

main().catch(console.error)
