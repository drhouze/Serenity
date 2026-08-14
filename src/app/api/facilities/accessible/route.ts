import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// GET /api/facilities/accessible — returns facilities the current user can access
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // APP_DEVELOPER (L0): can access ALL facilities across ALL organizations
  if (user.role === 'APP_DEVELOPER') {
    const all = await db.facility.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true, phone: true, director: true, organizationId: true },
    })
    return NextResponse.json({ facilities: all, isOwner: true })
  }

  // OWNER (L1): scoped to their organization's facilities only
  if (user.level === 1) {
    if (!user.organizationId) {
      return NextResponse.json({ facilities: [], isOwner: true })
    }
    const orgFacilities = await db.facility.findMany({
      where: { active: true, organizationId: user.organizationId },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, address: true, phone: true, director: true, organizationId: true },
    })
    return NextResponse.json({ facilities: orgFacilities, isOwner: true })
  }

  // Other users: parse their facilityIds (comma-separated)
  const facilityIds = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
  if (facilityIds.length === 0) {
    return NextResponse.json({ facilities: [], isOwner: false })
  }

  const facilities = await db.facility.findMany({
    where: { id: { in: facilityIds }, active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, address: true, phone: true, director: true, organizationId: true },
  })
  return NextResponse.json({ facilities, isOwner: false })
}
