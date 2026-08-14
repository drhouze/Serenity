import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { verifyPassword, createSession, SESSION_COOKIE_NAME, SESSION_MAX_AGE } from '@/lib/auth'
import { logAudit, AUDIT_ACTIONS, getFacilityName } from '@/lib/audit'

// ===== Rate limiting (brute-force protection) =====
// Tracks failed login attempts per IP. After 5 failures within 15 minutes,
// the IP is blocked for 15 minutes. Uses an in-memory Map (resets on server restart).
const MAX_FAILED_ATTEMPTS = 5
const BLOCK_DURATION_MS = 15 * 60 * 1000  // 15 minutes
const failedAttempts = new Map<string, { count: number; firstAttempt: number; blockedUntil: number }>()

function getClientIP(req: NextRequest): string {
  // Check X-Forwarded-For (set by Caddy/Alibaba FC) or fall back to x-real-ip
  const xff = req.headers.get('x-forwarded-for')
  if (xff) return xff.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}

function isRateLimited(ip: string): boolean {
  const entry = failedAttempts.get(ip)
  if (!entry) return false
  // Check if still in block window
  if (entry.blockedUntil > Date.now()) return true
  // Reset if the block window has passed
  if (entry.blockedUntil > 0 && entry.blockedUntil <= Date.now()) {
    failedAttempts.delete(ip)
    return false
  }
  // Reset if the first attempt was more than 15 minutes ago
  if (entry.count > 0 && Date.now() - entry.firstAttempt > BLOCK_DURATION_MS) {
    failedAttempts.delete(ip)
    return false
  }
  return false
}

function recordFailedAttempt(ip: string) {
  const existing = failedAttempts.get(ip)
  if (existing) {
    existing.count++
    if (existing.count >= MAX_FAILED_ATTEMPTS) {
      existing.blockedUntil = Date.now() + BLOCK_DURATION_MS
    }
  } else {
    failedAttempts.set(ip, { count: 1, firstAttempt: Date.now(), blockedUntil: 0 })
  }
}

function clearFailedAttempts(ip: string) {
  failedAttempts.delete(ip)
}

// Demo account emails — if a user logging in matches one of these, apply demo facility restrictions.
// Doctor / Physio / Dietitian are deliberately NOT in this list — they don't
// log into Serenity directly (their entries come from the external doctor app
// via /api/external/visits or /api/fhir/Encounter). Their accounts may still
// exist in the DB for testing, but they're not treated as demo accounts.
const DEMO_EMAILS = [
  'owner@home.com', 'manager@home.com', 'nurse@home.com', 'care@home.com',
  'reception@home.com',
  'family@home.com',
]

export async function POST(req: NextRequest) {
  try {
    // ===== Rate limiting check =====
    const clientIP = getClientIP(req)
    if (isRateLimited(clientIP)) {
      const entry = failedAttempts.get(clientIP)
      const remainingMs = entry?.blockedUntil ? entry.blockedUntil - Date.now() : 0
      const remainingMin = Math.ceil(remainingMs / 60000)
      return NextResponse.json(
        { error: `Too many failed login attempts. Please try again in ${remainingMin} minute(s).` },
        { status: 429 },
      )
    }

    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    // Sanitize email input — prevent log injection
    const normalizedEmail = email.toLowerCase().trim().slice(0, 255)

    // === RATE LIMITING ===
    // Track failed attempts by IP address + email to prevent brute force
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown'
    const rateLimitKey = `loginAttempts:${clientIp}:${normalizedEmail}`
    const rateLimitData = await db.setting.findUnique({ where: { key: rateLimitKey } })
    let attempts = 0
    let lastAttempt = 0
    if (rateLimitData) {
      try {
        const parsed = JSON.parse(rateLimitData.value)
        attempts = parsed.attempts || 0
        lastAttempt = parsed.lastAttempt || 0
      } catch {}
    }

    // Lockout: 5 failed attempts → 15 minute lockout
    const MAX_ATTEMPTS = 5
    const LOCKOUT_MS = 15 * 60 * 1000 // 15 minutes
    const now = Date.now()

    if (attempts >= MAX_ATTEMPTS && (now - lastAttempt) < LOCKOUT_MS) {
      const remainingMs = LOCKOUT_MS - (now - lastAttempt)
      const remainingMin = Math.ceil(remainingMs / 60000)
      return NextResponse.json({
        error: `Too many failed attempts. Please try again in ${remainingMin} minute(s).`,
      }, { status: 429 })
    }

    // Reset counter if lockout period has passed
    if (attempts >= MAX_ATTEMPTS && (now - lastAttempt) >= LOCKOUT_MS) {
      attempts = 0
    }

    const user = await db.user.findUnique({ where: { email: normalizedEmail } })
    if (!user || !user.active) {
      // Record failed attempt (even if user doesn't exist — prevents user enumeration timing attacks)
      attempts++
      await db.setting.upsert({
        where: { key: rateLimitKey },
        create: { key: rateLimitKey, value: JSON.stringify({ attempts, lastAttempt: now }) },
        update: { value: JSON.stringify({ attempts, lastAttempt: now }) },
      })
      // Record failed attempt for rate limiting
      recordFailedAttempt(clientIP)
      // Add small delay to slow down brute force
      await new Promise(r => setTimeout(r, 500))
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    const valid = verifyPassword(password, user.passwordHash)
    if (!valid) {
      // Record failed attempt
      attempts++
      await db.setting.upsert({
        where: { key: rateLimitKey },
        create: { key: rateLimitKey, value: JSON.stringify({ attempts, lastAttempt: now }) },
        update: { value: JSON.stringify({ attempts, lastAttempt: now }) },
      })
      // Record failed attempt for rate limiting
      recordFailedAttempt(clientIP)
      // Add delay proportional to attempts (slow down brute force)
      await new Promise(r => setTimeout(r, Math.min(500 * attempts, 3000)))
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 })
    }

    // === SUCCESS — clear rate limit counter ===
    clearFailedAttempts(clientIP)
    if (rateLimitData) {
      await db.setting.delete({ where: { key: rateLimitKey } }).catch(() => {})
    }

    // Check if the user's organization is blocked — if so, deny login
    // (even if the individual user account is active)
    if (user.facilityIds && user.level > 0) {
      const userFids = user.facilityIds.split(',').map(s => s.trim()).filter(Boolean)
      if (userFids.length > 0) {
        const blockedOrg = await db.organization.findFirst({
          where: {
            blocked: true,
            facilities: { some: { id: { in: userFids } } },
          },
        })
        if (blockedOrg) {
          return NextResponse.json({
            error: `Your organization "${blockedOrg.name}" has been blocked. Please contact the administrator.`,
          }, { status: 403 })
        }
      }
    }

    // Check if this is a demo account — if so, verify demo mode is ON and
    // restrict to demo-allowed facilities only
    const isDemoAccount = DEMO_EMAILS.includes(normalizedEmail)
    let userFacilityIds = user.facilityIds || ''

    if (isDemoAccount) {
      // Load demo mode settings
      const demoModeSetting = await db.setting.findUnique({ where: { key: 'demoMode' } })
      const demoMode = demoModeSetting ? JSON.parse(demoModeSetting.value) : false

      if (!demoMode) {
        return NextResponse.json({
          error: 'Demo mode is currently disabled. Please contact the administrator for access.',
        }, { status: 403 })
      }

      // Apply demo facility restriction — override the user's facilityIds
      // with only the demo-allowed facilities
      const demoFacSetting = await db.setting.findUnique({ where: { key: 'demoFacilityIds' } })
      const demoFacilityIds = demoFacSetting ? JSON.parse(demoFacSetting.value) : []

      if (Array.isArray(demoFacilityIds) && demoFacilityIds.length > 0) {
        // Restrict to only the demo-allowed facilities
        userFacilityIds = demoFacilityIds.join(',')
      }
      // If demoFacilityIds is empty, demo accounts keep their original facility access (all)
    }

    const token = await createSession(user.id)
    const res = NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      level: user.level,
      phone: user.phone,
      linkedResidentIds: user.linkedResidentIds,
      facilityIds: userFacilityIds,
      moduleAccess: user.moduleAccess,
    })
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE / 1000,
      path: '/',
    })

    // For login/logout, derive facility context from the user's first assigned facility.
    // This is critical for audit-log scoping — every login event MUST have a facilityId
    // so other orgs can't see it. For Owner (level 1), who has no facilityIds string,
    // we look up the first facility in their organization.
    let loginFacilityId: string | null = null
    let loginFacilityName: string | null = null
    if (user.level === 0) {
      // App Developer — no org. Skip facility stamping (developer sees everything anyway).
      loginFacilityName = 'All Facilities'
    } else if (user.level === 1) {
      // Owner — derive from their org's first facility (or demo restriction)
      if (isDemoAccount && userFacilityIds) {
        const fids = userFacilityIds.split(',').map(s => s.trim()).filter(Boolean)
        if (fids.length > 0) {
          loginFacilityId = fids[0]
          loginFacilityName = await getFacilityName(loginFacilityId)
        }
      }
      // If still null, look up the first facility in their org
      if (!loginFacilityId && user.organizationId) {
        try {
          const firstFac = await db.facility.findFirst({
            where: { organizationId: user.organizationId },
            orderBy: { name: 'asc' },
            select: { id: true, name: true },
          })
          if (firstFac) {
            loginFacilityId = firstFac.id
            loginFacilityName = firstFac.name
          }
        } catch {}
      }
      if (!loginFacilityId) loginFacilityName = loginFacilityName || 'All Facilities'
    } else {
      const uFids = userFacilityIds.split(',').map(s => s.trim()).filter(Boolean)
      if (uFids.length > 0) {
        loginFacilityId = uFids[0]
        loginFacilityName = await getFacilityName(loginFacilityId)
      }
    }

    // Audit log
    await logAudit({
      userId: user.id,
      userName: user.name,
      userCode: user.code,
      userRole: user.role,
      action: AUDIT_ACTIONS.LOGIN,
      description: `${user.code ? user.code + ' ' : ''}${user.name} (${user.role}) signed in${isDemoAccount ? ' [DEMO]' : ''}`,
      metadata: { userCode: user.code, demo: isDemoAccount },
      ipAddress: req.headers.get('x-forwarded-for') || null,
      facilityId: loginFacilityId,
      facilityName: loginFacilityName,
    })

    return res
  } catch (e: any) {
    console.error('Login error:', e)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
