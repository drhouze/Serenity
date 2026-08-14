// Migrate Expense.vendor → Expense.vendorName before prisma db push
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

async function main() {
  // Check if old column exists
  const cols = await db.$queryRawUnsafe(`PRAGMA table_info(Expense)`)
  const hasOldVendor = cols.some(c => c.name === 'vendor')
  const hasNewVendor = cols.some(c => c.name === 'vendorName')
  console.log('Has vendor:', hasOldVendor, 'Has vendorName:', hasNewVendor)
  
  if (hasOldVendor && !hasNewVendor) {
    console.log('Renaming vendor → vendorName...')
    await db.$executeRawUnsafe(`ALTER TABLE Expense RENAME COLUMN vendor TO vendorName`)
    console.log('Done.')
  } else if (hasOldVendor && hasNewVendor) {
    console.log('Both exist — copying data and dropping old...')
    await db.$executeRawUnsafe(`UPDATE Expense SET vendorName = vendor WHERE vendorName IS NULL AND vendor IS NOT NULL`)
    // Can't drop column in older SQLite, but prisma db push will handle it
  } else {
    console.log('Nothing to migrate.')
  }
  
  await db.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
