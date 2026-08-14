import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/messages/unread?facilityId=X
 * Returns the count of unread family messages for the current user.
 * - Staff (NURSE/MANAGER/OWNER): all unread INCOMING messages for their facility
 * - FAMILY: unread messages sent TO them (or all messages if no recipient filtering)
 */
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const facilityId = searchParams.get('facilityId') || undefined

  const where: any = { read: false }

  if (user.role === 'FAMILY') {
    // Family sees messages for their linked residents
    const linkedIds = (user.linkedResidentIds || '').split(',').map(s => s.trim()).filter(Boolean)
    if (linkedIds.length === 0) return NextResponse.json({ count: 0 })
    where.residentId = { in: linkedIds }
  } else {
    // Staff sees all unread messages for their facility (via resident relation)
    if (facilityId) {
      where.resident = { facilityId }
    } else if (user.level === 1 && user.organizationId) {
      // Owner without specific facility → all facilities in their org
      const orgFacilities = await db.facility.findMany({
        where: { organizationId: user.organizationId },
        select: { id: true },
      })
      where.resident = { facilityId: { in: orgFacilities.map(f => f.id) } }
    } else if (user.role !== 'APP_DEVELOPER') {
      // Manager/Nurse → their assigned facilities
      const fids = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
      if (fids.length > 0) {
        where.resident = { facilityId: { in: fids } }
      }
    }
    // Developer sees all
  }

  const count = await db.familyMessage.count({ where })

  return NextResponse.json({ count })
}
