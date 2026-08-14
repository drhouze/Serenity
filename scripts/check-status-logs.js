const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()
async function main() {
  try {
    const count = await db.residentStatusLog.count()
    console.log('Total status logs:', count)
    
    const all = await db.residentStatusLog.findMany()
    for (const l of all) {
      console.log(`  ${l.fromStatus} → ${l.toStatus} at ${l.changedAt} by ${l.changedByName}: ${l.reason || 'no reason'}`)
    }
  } catch (e) {
    console.error('Error:', e.message)
  }
}
main().finally(() => db.$disconnect())
