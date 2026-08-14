// Create bank accounts using the global chart of accounts
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const facilities = await db.facility.findMany()
  const operating = await db.account.findFirst({ where: { code: '1010' } })
  const savings = await db.account.findFirst({ where: { code: '1020' } })
  const petty = await db.account.findFirst({ where: { code: '1030' } })

  console.log('GL accounts:', { operating: operating?.id, savings: savings?.id, petty: petty?.id })

  let seq = 1
  const lastBank = await db.bankAccount.findFirst({ orderBy: { code: 'desc' } })
  if (lastBank?.code) {
    const m = lastBank.code.match(/BNK-(\d+)/)
    if (m) seq = parseInt(m[1], 10) + 1
  }

  for (const facility of facilities) {
    const banks = [
      { code: `BNK-${String(seq++).padStart(3, '0')}`, name: 'Maybank Operating Account', type: 'BANK', bankName: 'Maybank Berhad', accountNumber: '5123 4567 890', glAccountId: operating.id, openingBalance: 150000, currentBalance: 150000 },
      ...(savings ? [{ code: `BNK-${String(seq++).padStart(3, '0')}`, name: 'Maybank Savings Account', type: 'SAVINGS', bankName: 'Maybank Berhad', accountNumber: '5123 4567 900', glAccountId: savings.id, openingBalance: 280000, currentBalance: 280000 }] : []),
      ...(petty ? [{ code: `BNK-${String(seq++).padStart(3, '0')}`, name: 'Petty Cash', type: 'CASH', bankName: '—', accountNumber: '—', glAccountId: petty.id, openingBalance: 2000, currentBalance: 1850 }] : []),
    ]
    for (const b of banks) {
      await db.bankAccount.create({ data: { ...b, facilityId: facility.id, active: true } })
      console.log(`  Created ${b.code} — ${b.name} (${facility.name})`)
    }
  }
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
