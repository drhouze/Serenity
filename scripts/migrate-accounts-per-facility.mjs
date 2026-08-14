// Migrate global accounts (facilityId=null) to per-facility accounts.
// For each facility, creates a copy of the chart of accounts with that facility's ID,
// re-links all journal lines + bank accounts to the facility-specific accounts,
// then deletes the global accounts.
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  const facilities = await db.facility.findMany()
  console.log(`Found ${facilities.length} facilities`)

  const globalAccounts = await db.account.findMany({ where: { facilityId: null } })
  console.log(`Found ${globalAccounts.length} global accounts`)

  if (globalAccounts.length === 0) {
    console.log('No global accounts to migrate — already per-facility.')
    await db.$disconnect()
    return
  }

  // Create a mapping: oldGlobalAccountId → { facilityId → newAccountId }
  const accountMap = {}

  for (const facility of facilities) {
    console.log(`\nSeeding accounts for facility: ${facility.name} (${facility.id})`)

    // Check if this facility already has accounts
    const existing = await db.account.count({ where: { facilityId: facility.id } })
    if (existing > 0) {
      console.log(`  Already has ${existing} accounts — skipping seed, building map from existing`)
      const facAccts = await db.account.findMany({ where: { facilityId: facility.id } })
      for (const fa of facAccts) {
        const global = globalAccounts.find(g => g.code === fa.code)
        if (global) {
          if (!accountMap[global.id]) accountMap[global.id] = {}
          accountMap[global.id][facility.id] = fa.id
        }
      }
      continue
    }

    // Create facility-specific copies
    for (const g of globalAccounts) {
      const newAcct = await db.account.create({
        data: {
          code: g.code,
          name: g.name,
          type: g.type,
          subtype: g.subtype,
          normalBalance: g.normalBalance,
          facilityId: facility.id,
          isGroup: g.isGroup,
          active: g.active,
          description: g.description,
        },
      })
      if (!accountMap[g.id]) accountMap[g.id] = {}
      accountMap[g.id][facility.id] = newAcct.id
    }
    console.log(`  Created ${globalAccounts.length} accounts for ${facility.name}`)
  }

  // Now re-link journal lines from global accounts to facility-specific accounts
  console.log('\nRe-linking journal lines...')
  const globalAccountIds = globalAccounts.map(a => a.id)
  const journalLines = await db.journalLine.findMany({
    where: { accountId: { in: globalAccountIds } },
    include: { journalEntry: { select: { facilityId: true } } },
  })
  console.log(`Found ${journalLines.length} journal lines referencing global accounts`)

  let relinked = 0
  let skipped = 0
  for (const jl of journalLines) {
    const jeFacilityId = jl.journalEntry.facilityId
    if (!jeFacilityId) {
      skipped++
      continue
    }
    const newAccountId = accountMap[jl.accountId]?.[jeFacilityId]
    if (newAccountId) {
      await db.journalLine.update({ where: { id: jl.id }, data: { accountId: newAccountId } })
      relinked++
    } else {
      skipped++
    }
  }
  console.log(`  Re-linked ${relinked} journal lines, skipped ${skipped} (no facility or no mapping)`)

  // Re-link bank accounts
  console.log('Re-linking bank accounts...')
  const bankAccounts = await db.bankAccount.findMany({
    where: { glAccountId: { in: globalAccountIds } },
  })
  let bankRelinked = 0
  for (const ba of bankAccounts) {
    if (!ba.facilityId) continue
    const newAccountId = accountMap[ba.glAccountId]?.[ba.facilityId]
    if (newAccountId) {
      await db.bankAccount.update({ where: { id: ba.id }, data: { glAccountId: newAccountId } })
      bankRelinked++
    }
  }
  console.log(`  Re-linked ${bankRelinked} bank accounts`)

  // Re-link budgets
  console.log('Re-linking budgets...')
  const budgets = await db.budget.findMany({
    where: { accountId: { in: globalAccountIds } },
  })
  let budgetRelinked = 0
  for (const bg of budgets) {
    if (!bg.facilityId) continue
    const newAccountId = accountMap[bg.accountId]?.[bg.facilityId]
    if (newAccountId) {
      await db.budget.update({ where: { id: bg.id }, data: { accountId: newAccountId } })
      budgetRelinked++
    }
  }
  console.log(`  Re-linked ${budgetRelinked} budgets`)

  // Now delete global accounts (should have no more references)
  console.log('\nDeleting global accounts...')
  const deleted = await db.account.deleteMany({ where: { facilityId: null } })
  console.log(`  Deleted ${deleted.count} global accounts`)

  // Final count
  const finalCount = await db.account.count()
  console.log(`\nFinal account count: ${finalCount} (should be ${globalAccounts.length * facilities.length})`)

  await db.$disconnect()
}

main().catch(e => { console.error(e); process.exit(1) })
