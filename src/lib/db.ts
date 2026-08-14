import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Creates a PrismaClient.
 *
 * For SQLite (local dev): appends WAL + busy_timeout PRAGMAs to the URL
 * for multi-user concurrent access.
 *
 * For PostgreSQL (Vercel/Supabase): the URL is used as-is — PostgreSQL
 * handles concurrency natively via MVCC.
 */
function createPrismaClient() {
  const baseUrl = process.env.DATABASE_URL || 'file:./db/custom.db'
  const isSqlite = baseUrl.startsWith('file:')

  const url = isSqlite
    ? (baseUrl.includes('?')
      ? `${baseUrl}&journal_mode=WAL&busy_timeout=5000&synchronous=NORMAL`
      : `${baseUrl}?journal_mode=WAL&busy_timeout=5000&synchronous=NORMAL`)
    : baseUrl

  const client = new PrismaClient({
    log: ['error', 'warn'],
    datasources: {
      db: { url },
    },
  })

  // For SQLite: reinforce PRAGMAs on connect
  if (isSqlite) {
    client.$connect().then(async () => {
      try {
        await client.$queryRawUnsafe('PRAGMA journal_mode=WAL')
        await client.$queryRawUnsafe('PRAGMA busy_timeout=5000')
        await client.$queryRawUnsafe('PRAGMA synchronous=NORMAL')
        console.log('[DB] SQLite PRAGMAs set: WAL, busy_timeout=5000, synchronous=NORMAL')
      } catch (e: any) {
        console.log('[DB] PRAGMA note:', e.message)
      }
    }).catch(e => console.error('[DB] Connect error:', e.message))
  }

  return client
}

if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = createPrismaClient()
}

export const db = new Proxy({} as PrismaClient, {
  get(_target, prop, receiver) {
    const client = globalForPrisma.prisma
    if (!client) throw new Error('Prisma client not initialized')
    const value = Reflect.get(client, prop, receiver)
    if (typeof value === 'function') return value.bind(client)
    return value
  },
})

export async function resetPrismaClient(): Promise<PrismaClient> {
  try {
    if (globalForPrisma.prisma) {
      await globalForPrisma.prisma.$disconnect()
      console.log('[DB] Old Prisma client disconnected')
    }
  } catch (e) {
    console.log('[DB] Disconnect warning:', e)
  }
  await new Promise(resolve => setTimeout(resolve, 500))
  const newClient = createPrismaClient()
  globalForPrisma.prisma = newClient
  console.log('[DB] New Prisma client created')
  return newClient
}
