import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/import-undo/last-batches
//
// Returns the most recent (latest createdAt) batch per entity type, scoped to
// the user's accessible facilities. Used by the Bulk Imports UI to show
// "Last import: N records" and an Undo button per entity type.
//
// Response: { batches: [{ entityType, batchId, count, createdAt }] }
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  // Determine accessible facility IDs for scoping
  let userFacilityIds: string[] = []
  if (user.role === 'APP_DEVELOPER') {
    // Developer: all facilities
    userFacilityIds = []
  } else if (user.role === 'OWNER') {
    if (!user.organizationId) {
      return NextResponse.json({ batches: [] })
    }
    const facs = await db.facility.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
    })
    userFacilityIds = facs.map(f => f.id)
  } else {
    // Manager
    userFacilityIds = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
  }

  const facilityFilter = userFacilityIds.length > 0
    ? { facilityId: { in: userFacilityIds } }
    : {}

  const result: { entityType: string; batchId: string; count: number; createdAt: string }[] = []

  // For each entity type, find the most recent batch (by createdAt desc) and count its rows
  // We use Prisma's groupBy to find batches + counts, then sort by createdAt desc and take the top 1.
  // SQLite doesn't support DISTINCT ON, so we do it in JS after fetching all batches.

  const entityModels: { entityType: string; model: any }[] = [
    { entityType: 'resident', model: db.resident },
    { entityType: 'staff', model: db.staff },
    { entityType: 'room', model: db.room },
    { entityType: 'product', model: db.product },
    { entityType: 'vendor', model: db.vendor },
    { entityType: 'account', model: db.account },
    { entityType: 'bankAccount', model: db.bankAccount },
    { entityType: 'expense', model: db.expense },
    { entityType: 'payment', model: db.payment },
  ]

  for (const { entityType, model } of entityModels) {
    try {
      // Find all distinct batchIds with counts + most recent createdAt
      const rows = await model.findMany({
        where: {
          importBatchId: { not: null },
          ...facilityFilter,
        },
        select: {
          importBatchId: true,
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        take: 1000,  // limit to last 1000 records for performance
      })

      if (rows.length === 0) continue

      // Group by batchId, find the latest one
      const batchMap: Record<string, { count: number; latestCreatedAt: Date }> = {}
      for (const r of rows) {
        const bid = r.importBatchId as string
        if (!batchMap[bid]) {
          batchMap[bid] = { count: 0, latestCreatedAt: r.createdAt }
        }
        batchMap[bid].count++
        if (r.createdAt > batchMap[bid].latestCreatedAt) {
          batchMap[bid].latestCreatedAt = r.createdAt
        }
      }

      // Find the batch with the most recent createdAt
      let latestBatchId: string | null = null
      let latestCreatedAt: Date | null = null
      for (const [bid, info] of Object.entries(batchMap)) {
        if (!latestCreatedAt || info.latestCreatedAt > latestCreatedAt) {
          latestBatchId = bid
          latestCreatedAt = info.latestCreatedAt
        }
      }

      if (latestBatchId && latestCreatedAt) {
        result.push({
          entityType,
          batchId: latestBatchId,
          count: batchMap[latestBatchId].count,
          createdAt: latestCreatedAt.toISOString(),
        })
      }
    } catch (e: any) {
      // Skip this entity type on error (e.g. column doesn't exist yet)
      console.log(`[import-undo/last-batches] Skipped ${entityType}: ${e.message?.slice(0, 80)}`)
    }
  }

  return NextResponse.json({ batches: result })
}
