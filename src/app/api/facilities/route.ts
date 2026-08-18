import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { checkFacilityLimit } from '@/lib/tier-limits'

// GET /api/facilities — list facilities (org-scoped for Owner, all for Developer)
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Developer sees all facilities; Owner sees only their org's facilities
  if (user.role === 'APP_DEVELOPER') {
    const facilities = await db.facility.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { residents: true, staff: true, rooms: true } } },
    })
    return NextResponse.json(facilities)
  }

  // Owner: scoped to their organization
  if (user.level === 1) {
    if (!user.organizationId) {
      return NextResponse.json([])
    }
    const facilities = await db.facility.findMany({
      where: { organizationId: user.organizationId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { residents: true, staff: true, rooms: true } } },
    })
    return NextResponse.json(facilities)
  }

  // Manager and below: only their assigned facilities
  const userFacilityIds = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
  if (userFacilityIds.length === 0) return NextResponse.json([])
  const facilities = await db.facility.findMany({
    where: { id: { in: userFacilityIds } },
    orderBy: { name: 'asc' },
    include: { _count: { select: { residents: true, staff: true, rooms: true } } },
  })
  return NextResponse.json(facilities)
}

// POST /api/facilities — create a new facility
// Developer can create in any org. Owner can only create in their own org.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { name, address, phone, email, director, organizationId } = body
  if (!name) return NextResponse.json({ error: 'Facility name required' }, { status: 400 })

  // Force organizationId to the caller's own org (non-Developer can't create facilities in other orgs)
  const finalOrgId = user.role === 'APP_DEVELOPER'
    ? (organizationId || null)
    : user.organizationId
  if (user.role !== 'APP_DEVELOPER' && !finalOrgId) {
    return NextResponse.json({ error: 'Your account is not linked to an organization' }, { status: 400 })
  }

  // Tier limit check: verify the org won't exceed its facility limit
  if (finalOrgId) {
    const facCheck = await checkFacilityLimit(finalOrgId)
    if (!facCheck.allowed) {
      return NextResponse.json({
        error: facCheck.message,
        tier: facCheck.tier,
        limit: facCheck.limit,
        current: facCheck.current,
      }, { status: 402 }) // 402 Payment Required
    }
  }

  const facility = await db.facility.create({
    data: {
      name,
      address: address || null,
      phone: phone || null,
      email: email || null,
      director: director || null,
      active: true,
      organizationId: finalOrgId,
    },
  })

  // Auto-seed default Chart of Accounts for the new facility so
  // accounting features work immediately
  try {
    const { seedChartOfAccounts } = await import('@/lib/accounting')
    await seedChartOfAccounts(facility.id)
  } catch (e: any) {
    console.log('[Facilities] Auto-seed accounts warning:', e.message)
  }

  return NextResponse.json(facility)
}

// PATCH /api/facilities?id=... — update facility
// Developer can update any. Owner/Manager can only update facilities in their own org.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Facility ID required' }, { status: 400 })

  // Facility ownership check — non-Developer must have access to this facility
  const existing = await db.facility.findUnique({ where: { id }, select: { organizationId: true } })
  if (!existing) return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
  if (user.role !== 'APP_DEVELOPER') {
    if (existing.organizationId !== user.organizationId) {
      return NextResponse.json({ error: 'You do not have access to this facility' }, { status: 403 })
    }
  }

  const body = await req.json()
  const data: any = {}
  if (body.name !== undefined) data.name = body.name
  if (body.address !== undefined) data.address = body.address || null
  if (body.phone !== undefined) data.phone = body.phone || null
  if (body.email !== undefined) data.email = body.email || null
  if (body.director !== undefined) data.director = body.director || null
  if (body.active !== undefined) data.active = body.active

  const facility = await db.facility.update({ where: { id }, data })
  return NextResponse.json(facility)
}

// DELETE /api/facilities?id=... — delete facility (Developer or Owner only)
// Developer can delete any. Owner can only delete facilities in their own org.
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Only Developer or Owner can delete facilities' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Facility ID required' }, { status: 400 })

  // Facility ownership check
  const existing = await db.facility.findUnique({ where: { id }, select: { organizationId: true } })
  if (!existing) return NextResponse.json({ error: 'Facility not found' }, { status: 404 })
  if (user.role !== 'APP_DEVELOPER' && existing.organizationId !== user.organizationId) {
    return NextResponse.json({ error: 'You do not have access to this facility' }, { status: 403 })
  }

  // Check if facility has residents
  const residentCount = await db.resident.count({ where: { facilityId: id } })
  if (residentCount > 0) {
    return NextResponse.json({ error: `Cannot delete: ${residentCount} residents are assigned to this facility. Reassign them first.` }, { status: 400 })
  }

  await db.facility.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
