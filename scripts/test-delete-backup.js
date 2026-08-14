// Debug: test delete + backup behavior
const { PrismaClient } = require('@prisma/client')
const fs = require('fs')
const path = require('path')

const db = new PrismaClient()

async function test() {
  // Check journal mode
  const mode = await db.$queryRawUnsafe('PRAGMA journal_mode')
  console.log('Journal mode:', mode[0].journal_mode)

  // Count before
  const before = await db.$queryRawUnsafe('SELECT COUNT(*) as c FROM Expense')
  console.log('Before delete:', before[0].c)

  // Delete one expense
  const first = await db.$queryRawUnsafe('SELECT id, description FROM Expense LIMIT 1')
  console.log('Deleting:', first[0].id, '-', first[0].description)

  await db.expense.delete({ where: { id: first[0].id } })

  // Count after delete via Prisma
  const afterPrisma = await db.expense.count()
  console.log('After delete (Prisma count):', afterPrisma)

  // Now force checkpoint
  try { await db.$queryRawUnsafe('PRAGMA wal_checkpoint(FULL)') } catch(e) { console.log('Checkpoint:', e.message.slice(0,80)) }

  // Now disconnect to flush everything
  await db.$disconnect()

  // Wait a moment
  await new Promise(r => setTimeout(r, 1000))

  // Read the DB file directly with a NEW PrismaClient
  const db2 = new PrismaClient()
  const afterFile = await db2.expense.count()
  console.log('After delete (new client count):', afterFile)

  // Also check the raw file size
  const stats = fs.statSync(path.join(process.cwd(), 'db', 'custom.db'))
  console.log('DB file size:', stats.size, 'bytes')

  // Now test backup: copy the file and count
  fs.copyFileSync(path.join(process.cwd(), 'db', 'custom.db'), '/tmp/test-backup.db')
  const db3 = new PrismaClient()
  await db3.$executeRawUnsafe("ATTACH DATABASE '/tmp/test-backup.db' AS backup")
  const backupCount = await db3.$queryRawUnsafe('SELECT COUNT(*) as c FROM backup.Expense')
  console.log('Backup file expense count:', backupCount[0].c)
  await db3.$executeRawUnsafe('DETACH DATABASE backup')
  await db3.$disconnect()

  // Clean up - re-add the deleted expense
  console.log('\nConclusion: delete is', afterFile < before[0].c ? 'PERSISTED ✅' : 'NOT PERSISTED ❌')
  console.log('Backup has', backupCount[0].c, 'expenses (should be', afterFile, ')')
}

test().catch(e => console.log('Error:', e.message.slice(0, 300)))
