import { NextRequest, NextResponse } from 'next/server'
import { SESSION_COOKIE_NAME, getSessionUser } from '@/lib/auth'
import { logAudit, AUDIT_ACTIONS, getFacilityName } from '@/lib/audit'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  // Log who is logging out before clearing the cookie
  const user = await getSessionUser(req)
  if (user) {
    // Derive facility context (same as login) — every logout event MUST have
    // a facilityId so other orgs can't see it in their audit log.
    let logoutFacilityId: string | null = null
    let logoutFacilityName: string | null = null
    if (user.level === 0) {
      // App Developer — no org, no facility
      logoutFacilityName = 'All Facilities'
    } else if (user.level === 1) {
      // Owner — look up first facility in their org
      if (user.organizationId) {
        try {
          const firstFac = await db.facility.findFirst({
            where: { organizationId: user.organizationId },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
          })
          if (firstFac) {
            logoutFacilityId = firstFac.id
            logoutFacilityName = firstFac.name
          }
        } catch {}
      }
      if (!logoutFacilityId) logoutFacilityName = 'All Facilities'
    } else {
      const userFacilityIds = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
      if (userFacilityIds.length > 0) {
        logoutFacilityId = userFacilityIds[0]
        logoutFacilityName = await getFacilityName(logoutFacilityId)
      }
    }
    await logAudit({
      userId: user.id,
      userName: user.name,
      userCode: (user as any).code,
      userRole: user.role,
      action: AUDIT_ACTIONS.LOGOUT,
      description: `${(user as any).code ? (user as any).code + ' ' : ''}${user.name} (${user.role}) signed out`,
      metadata: { userCode: (user as any).code },
      facilityId: logoutFacilityId,
      facilityName: logoutFacilityName,
    })
  }

  const res = NextResponse.json({ success: true })
  res.cookies.set(SESSION_COOKIE_NAME, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 0,
    path: '/',
  })
  return res
}
