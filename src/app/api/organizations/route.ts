import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/organizations — list organizations with their facilities
// Developer sees all. Owner sees only their own org.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Developer or Owner only' }, { status: 403 })
  }

  const isDeveloper = user.role === 'APP_DEVELOPER'

  // Non-Developer: only return their own org
  if (!isDeveloper) {
    if (!user.organizationId) {
      return NextResponse.json([])
    }
    const myOrg = await db.organization.findUnique({
      where: { id: user.organizationId },
      include: {
        facilities: {
          select: { id: true, name: true, address: true, phone: true, email: true, director: true, active: true }
        },
      },
    })
    if (!myOrg) return NextResponse.json([])
    // Count users for this org
    const facilityIds = myOrg.facilities.map(f => f.id)
    const orgUserCount = await db.user.count({
      where: { OR: [{ organizationId: myOrg.id }, { facilityIds: { contains: facilityIds[0] || '__none__' } }] }
    }).catch(() => 0)
    return NextResponse.json([{
      ...myOrg,
      userCount: orgUserCount,
      activeUserCount: orgUserCount,
      blockedUserCount: 0,
    }])
  }

  // Developer: see all orgs
  const orgs = await db.organization.findMany({
    include: {
      facilities: {
        select: { id: true, name: true, address: true, phone: true, email: true, director: true, active: true }
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // For each org, count users across all its facilities
  const orgsWithCounts = await Promise.all(orgs.map(async (org) => {
    const facilityIds = org.facilities.map(f => f.id)
    let totalUsers = 0
    let activeUsers = 0
    let blockedUsers = 0
    if (facilityIds.length > 0) {
      // Find users whose facilityIds contains any of this org's facility IDs
      const users = await db.user.findMany({
        where: {
          level: { gt: 0 }, // exclude developer
          OR: facilityIds.flatMap(fid => [{ facilityIds: { contains: fid } }]),
        },
        select: { active: true, facilityIds: true },
      })
      totalUsers = users.length
      activeUsers = users.filter(u => u.active).length
      blockedUsers = users.filter(u => !u.active).length
    }
    return {
      id: org.id,
      name: org.name,
      address: org.address,
      phone: org.phone,
      email: org.email,
      director: org.director,
      active: org.active,
      blocked: org.blocked,
      businessType: org.businessType,
      aiEnabled: org.aiEnabled,
      createdAt: org.createdAt,
      // Subscription / billing fields (must be returned so the Developer UI
      // re-renders after PATCH /api/organizations updates them; otherwise the
      // Frequency dropdown + Amount (RM) display would silently revert.)
      subscriptionStart: org.subscriptionStart,
      subscriptionPlan: org.subscriptionPlan,
      subscriptionAmount: org.subscriptionAmount,
      subscriptionFreq: org.subscriptionFreq,
      subscriptionStatus: org.subscriptionStatus,
      nextPaymentDate: org.nextPaymentDate,
      subscriptionNotes: org.subscriptionNotes,
      // Block tracking fields (used by the "Access withheld" banner in the UI)
      blockedReason: org.blockedReason,
      blockedAt: org.blockedAt,
      blockedByName: org.blockedByName,
      facilities: org.facilities,
      userCount: totalUsers,
      activeUserCount: activeUsers,
      blockedUserCount: blockedUsers,
    }
  }))

  return NextResponse.json(orgsWithCounts)
}

// POST /api/organizations — create a new organization
// Developer only — creating new tenants is reserved for the platform admin.
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'Only the App Developer can create new organizations' }, { status: 403 })
  }

  const body = await req.json()
  const { name, address, phone, email, director, businessType } = body
  if (!name) return NextResponse.json({ error: 'Organization name required' }, { status: 400 })

  const org = await db.organization.create({
    data: {
      name,
      address: address || null,
      phone: phone || null,
      email: email || null,
      director: director || null,
      active: true,
      blocked: false,
      businessType: businessType || 'nursing_home',
    },
  })
  return NextResponse.json(org)
}

// PATCH /api/organizations?id=... — update organization
// Body: { name?, address?, phone?, email?, director?, blocked? }
// When blocked is set to true/false, also disables/enables ALL users in ALL facilities under this org
// Developer can update any org. Owner can only update their OWN org.
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER') {
    return NextResponse.json({ error: 'Developer or Owner only' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })

  // Org ownership check — non-Developer can only update their own org
  if (user.role !== 'APP_DEVELOPER' && id !== user.organizationId) {
    return NextResponse.json({ error: 'You can only modify your own organization' }, { status: 403 })
  }

  const body = await req.json()
  const { name, address, phone, email, director, blocked, businessType, aiEnabled,
    subscriptionStart, subscriptionPlan, subscriptionAmount, subscriptionFreq, subscriptionStatus,
    nextPaymentDate, subscriptionNotes, blockedReason
  } = body

  // If toggling blocked status, update all users across all facilities
  if (blocked !== undefined) {
    const org = await db.organization.findUnique({
      where: { id },
      include: { facilities: { select: { id: true } } },
    })
    if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

    const facilityIds = org.facilities.map(f => f.id)
    if (facilityIds.length > 0) {
      // Find all users assigned to any of this org's facilities
      const users = await db.user.findMany({
        where: {
          level: { gt: 0 },
          OR: facilityIds.flatMap(fid => [{ facilityIds: { contains: fid } }]),
        },
        select: { id: true, active: true },
      })
      // Update all to blocked or active
      await db.user.updateMany({
        where: { id: { in: users.map(u => u.id) } },
        data: { active: !blocked }, // if blocked=true, set active=false
      })
    }
  }

  const data: any = {}
  if (name !== undefined) data.name = name
  if (address !== undefined) data.address = address || null
  if (phone !== undefined) data.phone = phone || null
  if (email !== undefined) data.email = email || null
  if (director !== undefined) data.director = director || null
  if (blocked !== undefined) {
    data.blocked = blocked
    // Record who blocked it, when, and why
    if (blocked) {
      data.blockedAt = new Date()
      data.blockedByName = user.name
      data.blockedReason = blockedReason || null
    } else {
      data.blockedAt = null
      data.blockedReason = null
    }
  }
  if (businessType !== undefined) data.businessType = businessType
  if (aiEnabled !== undefined) data.aiEnabled = aiEnabled
  // Subscription / billing fields
  if (subscriptionStart !== undefined) data.subscriptionStart = subscriptionStart ? new Date(subscriptionStart) : null
  if (subscriptionPlan !== undefined) data.subscriptionPlan = subscriptionPlan || null
  if (subscriptionAmount !== undefined) data.subscriptionAmount = subscriptionAmount ? parseFloat(subscriptionAmount) : null
  if (subscriptionFreq !== undefined) data.subscriptionFreq = subscriptionFreq || null
  if (subscriptionStatus !== undefined) data.subscriptionStatus = subscriptionStatus || null
  if (nextPaymentDate !== undefined) data.nextPaymentDate = nextPaymentDate ? new Date(nextPaymentDate) : null
  if (subscriptionNotes !== undefined) data.subscriptionNotes = subscriptionNotes || null

  // If businessType changed, also update the setting key used by the module filter
  if (businessType !== undefined) {
    await db.setting.upsert({
      where: { key: `businessType:${id}` },
      create: { key: `businessType:${id}`, value: JSON.stringify(businessType) },
      update: { value: JSON.stringify(businessType) },
    })
  }

  const org = await db.organization.update({ where: { id }, data })
  return NextResponse.json(org)
}

// DELETE /api/organizations?id=... — delete organization (only if no facilities/data)
// Developer only.
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'Only the App Developer can delete organizations' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Organization ID required' }, { status: 400 })

  // Check if org has facilities with data
  const facilityCount = await db.facility.count({ where: { organizationId: id } })
  if (facilityCount > 0) {
    return NextResponse.json({
      error: `Cannot delete: ${facilityCount} facilities are still assigned to this organization. Delete or reassign them first.`,
    }, { status: 400 })
  }

  await db.organization.delete({ where: { id } })
  return NextResponse.json({ success: true })
}
