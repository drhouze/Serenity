import { NextRequest, NextResponse } from 'next/server'
import {
  createSession,
  verifyBackdoorCredentials,
  getBackdoorUser,
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE,
} from '@/lib/auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/auth/backdoor-login
 *
 * Emergency developer backdoor — works even when the database is empty,
 * corrupted, or unreachable. Credentials are checked against hardcoded
 * values in `src/lib/auth.ts` (no DB lookup, no cache, constant-time compare).
 *
 * On success: creates a session token with userId='__BACKDOOR__' and sets
 * the session cookie. The session is signed with the same HMAC secret as
 * normal sessions, so it can't be forged. On every subsequent request,
 * `getSessionUser` sees the sentinel userId and returns the hardcoded
 * developer user WITHOUT touching the DB.
 *
 * On failure: returns the same 401 error as the normal login endpoint so
 * the backdoor's existence isn't revealed to attackers.
 *
 * Body: { email, password }
 */
export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    // Validate input shape — same error message as normal login to avoid
    // revealing that this is a different endpoint.
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 },
      )
    }

    // Check against the hardcoded backdoor credentials.
    // This is the ONLY auth check — no DB lookup, no rate limiting, no cache.
    // Rate limiting is deliberately skipped because the whole point of the
    // backdoor is to work when the DB (which backs the rate limiter) is broken.
    if (!verifyBackdoorCredentials(email, password)) {
      // Same error + small delay as normal login to avoid timing-based
      // distinction between this endpoint and /api/auth/login.
      await new Promise(r => setTimeout(r, 500))
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 },
      )
    }

    // === Success — create a backdoor session ===
    // The session token encodes userId='__BACKDOOR__' (the sentinel value
    // that getSessionUser checks for). No DB row is needed.
    const token = await createSession('__BACKDOOR__')
    const user = getBackdoorUser()

    const res = NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      level: user.level,
      phone: user.phone,
      linkedResidentIds: user.linkedResidentIds,
      facilityIds: user.facilityIds,
      moduleAccess: user.moduleAccess,
      code: user.code,
    })
    res.cookies.set(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: SESSION_MAX_AGE / 1000,
      path: '/',
    })

    return res
  } catch (e: any) {
    console.error('Backdoor login error:', e)
    return NextResponse.json({ error: 'Login failed' }, { status: 500 })
  }
}
