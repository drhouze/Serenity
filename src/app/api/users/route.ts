import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { checkUserLimit } from '@/lib/tier-limits'
import { ROLE_LEVELS, type Role } from '@/lib/types'
import { generateUserCode } from '@/lib/codes'
import { validatePasswordStrength, sanitizeEmail, isValidEmail, sanitizeString } from '@/lib/sanitize'
import crypto from 'crypto'

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

// ============================================================================
// DEMO ACCOUNTS — kept in sync with the Login page's quick-pick buttons
// ----------------------------------------------------------------------------
// Demo accounts are identified by email AND tracked in a Setting called
// `demoAccounts` (a JSON array of { email, password, label, desc }). The
// Login page fetches this Setting via /api/settings/public so the quick-pick
// buttons always show the CURRENT email + password — even after a user
// changes them via User Management.
//
// When a developer/owner edits a user whose email matches one in the
// `demoAccounts` Setting, we update that entry's email and/or password to
// match. If they change the email to something not in the list, the entry's
// email is updated (so the quick-pick still finds it). If they create a NEW
// user via the demo button flow, we don't auto-add it — only seeded demo
// accounts are tracked.
//
// Mark a user as a demo account: their email must match an entry in the
// `demoAccounts` Setting. We don't add a separate isDemo boolean column to
// avoid schema migrations on the production DB.
// ============================================================================
const DEMO_LABELS: Record<string, { label: string; desc: string }> = {
  OWNER: { label: 'Org Owner', desc: 'Full access' },
  MANAGER: { label: 'Manager', desc: 'Operations + finance' },
  NURSE: { label: 'Nurse', desc: 'Clinical care' },
  CARE_STAFF: { label: 'Care Staff', desc: 'Daily care' },
  RECEPTION: { label: 'Reception', desc: 'Front desk' },
  FAMILY: { label: 'Family', desc: 'Loved one updates' },
}

async function syncDemoAccountSetting(oldEmail: string | null, newEmail: string | null, newPassword: string | null, role: string | null) {
  try {
    const setting = await db.setting.findUnique({ where: { key: 'demoAccounts' } })
    let list: Array<{ email: string; password: string; label: string; desc: string }> =
      setting ? JSON.parse(setting.value) : []

    // Find by old email (the email BEFORE the edit)
    let entryIndex = oldEmail ? list.findIndex(a => a.email.toLowerCase() === oldEmail.toLowerCase()) : -1

    if (entryIndex >= 0) {
      // Existing demo account — update email + password
      if (newEmail) list[entryIndex].email = newEmail
      if (newPassword) list[entryIndex].password = newPassword
      if (role && DEMO_LABELS[role]) {
        list[entryIndex].label = DEMO_LABELS[role].label
        list[entryIndex].desc = DEMO_LABELS[role].desc
      }
    } else if (newEmail && newPassword && role && DEMO_LABELS[role]) {
      // Check if the NEW email matches a known demo email pattern — if so,
      // this might be a fresh seeding. Auto-add to the list.
      const knownDemoEmails = [
        'owner@home.com', 'manager@home.com', 'nurse@home.com',
        'care@home.com', 'reception@home.com', 'family@home.com',
      ]
      if (knownDemoEmails.includes(newEmail.toLowerCase())) {
        list.push({
          email: newEmail,
          password: newPassword,
          label: DEMO_LABELS[role].label,
          desc: DEMO_LABELS[role].desc,
        })
      }
    }

    await db.setting.upsert({
      where: { key: 'demoAccounts' },
      update: { value: JSON.stringify(list) },
      create: { key: 'demoAccounts', value: JSON.stringify(list) },
    })
  } catch (e: any) {
    console.log('[Users] syncDemoAccountSetting error:', e.message?.slice(0, 100))
  }
}

function getDefaultLevel(role: string): number {
  return (ROLE_LEVELS as any)[role] || 5
}

// GET /api/users — list users (only APP_DEVELOPER/OWNER/MANAGER)
// A user can only see users at their level or BELOW (higher or equal level number)
// Optional ?facilityId=xxx — filter to users assigned to that facility (or Owner who sees all)
// Optional ?demoOnly=true — return only demo accounts (APP_DEVELOPER only)
export async function GET(req: Request) {
  const me = await getSessionUser(req)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (me.role !== 'APP_DEVELOPER' && me.role !== 'OWNER' && me.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const facilityId = searchParams.get('facilityId') || ''
  const demoOnly = searchParams.get('demoOnly') === 'true'
  const allExceptDemo = searchParams.get('allExceptDemo') === 'true'

  // Demo-only filter: APP_DEVELOPER can see demo accounts regardless of level
  if (demoOnly) {
    if (me.role !== 'APP_DEVELOPER') {
      return NextResponse.json({ error: 'Only App Developer can view demo accounts' }, { status: 403 })
    }
    const demoEmails = ['owner@home.com', 'manager@home.com', 'nurse@home.com', 'care@home.com', 'reception@home.com', 'doctor@home.com', 'physio@home.com', 'dietitian@home.com', 'family@home.com']
    const users = await db.user.findMany({
      where: { email: { in: demoEmails } },
      select: { id: true, code: true, name: true, email: true, role: true, level: true, phone: true, active: true, linkedResidentIds: true, facilityIds: true, moduleAccess: true, organizationId: true, createdAt: true },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json(users)
  }

  // All-except-demo filter: APP_DEVELOPER can see all real (non-demo) accounts
  if (allExceptDemo) {
    if (me.role !== 'APP_DEVELOPER') {
      return NextResponse.json({ error: 'Only App Developer can view all accounts' }, { status: 403 })
    }
    const demoEmails = ['owner@home.com', 'manager@home.com', 'nurse@home.com', 'care@home.com', 'reception@home.com', 'doctor@home.com', 'physio@home.com', 'dietitian@home.com', 'family@home.com']
    const users = await db.user.findMany({
      where: { email: { notIn: [...demoEmails, 'dev@serenity.app', 'developer@gmail.com'] }, level: { gt: 0 } },
      select: { id: true, code: true, name: true, email: true, role: true, level: true, phone: true, active: true, linkedResidentIds: true, facilityIds: true, moduleAccess: true, organizationId: true, createdAt: true },
      orderBy: [{ level: 'asc' }, { name: 'asc' }],
    })
    return NextResponse.json(users)
  }

  // Build where clause: level filter (can only see users with level >= my level)
  // Exclude demo accounts from the regular user list.
  // Developer accounts (level 0, role APP_DEVELOPER) are visible ONLY to other
  // developers — hidden from Owners/Managers via the org-scope filter below
  // (developer accounts have null organizationId, so org-scoped users can't see them).
  const demoEmails = ['owner@home.com', 'manager@home.com', 'nurse@home.com', 'care@home.com', 'reception@home.com', 'doctor@home.com', 'physio@home.com', 'dietitian@home.com', 'family@home.com', 'developer@gmail.com', 'dev@serenity.app']
  const where: any = {
    level: { gte: me.level },
    email: { notIn: demoEmails },
  }

  // Organization scoping:
  //   - APP_DEVELOPER (L0): sees users across ALL orgs (no org filter)
  //     Also sees other Developer accounts (which have null organizationId).
  //   - OWNER (L1) / MANAGER (L2) / staff: sees only users in their OWN org.
  //     Developer accounts (null organizationId) are NOT visible to them —
  //     this is the "hidden from lower levels" behaviour.
  if (me.role !== 'APP_DEVELOPER' && me.organizationId) {
    where.OR = [
      { organizationId: me.organizationId },
    ]
  }

  // Facility filter: if a specific facility is selected, narrow further to
  // users assigned to that facility (within the already-scoped org).
  if (facilityId) {
    const facilityClauses: any[] = [
      { facilityIds: { contains: facilityId } },
    ]
    // Owner always shows up in their org's facility lists
    if (me.role === 'OWNER' || me.role === 'APP_DEVELOPER') {
      facilityClauses.push({ level: 1, role: 'OWNER' })
    }
    // Only Developer sees themselves in the list
    if (me.role === 'APP_DEVELOPER') {
      facilityClauses.push({ level: 0, role: 'APP_DEVELOPER' })
    }
    const facilityCondition = { OR: facilityClauses }
    if (where.OR) {
      // Already have org-scope OR — combine with AND so both org-scope AND facility-condition must match
      where.AND = [facilityCondition]
    } else {
      // No org scope (Developer without org) — use facility OR directly
      where.OR = facilityCondition.OR
    }
  }

  const users = await db.user.findMany({
    where,
    select: { id: true, code: true, name: true, email: true, role: true, level: true, phone: true, active: true, linkedResidentIds: true, facilityIds: true, moduleAccess: true, organizationId: true, createdAt: true },
    orderBy: [{ level: 'asc' }, { name: 'asc' }],
  })
  return NextResponse.json(users)
}

// POST /api/users — create a new user
// Hierarchy rules:
//   - APP_DEVELOPER (L0): can create any user, optionally assign to any organization
//   - OWNER (L1): can create users within their own organization only (managers, staff, family)
//   - MANAGER (L2): can create users within their assigned facilities only (staff, family)
export async function POST(req: NextRequest) {
  const me = await getSessionUser(req)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (me.role !== 'APP_DEVELOPER' && me.role !== 'OWNER' && me.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, password, role, phone, linkedResidentIds, moduleAccess, level, facilityIds, organizationId } = body
  
  // Sanitize inputs
  const sanitizedName = sanitizeString(name, 255)
  const sanitizedEmail = sanitizeEmail(email)
  
  if (!sanitizedName || !sanitizedEmail || !password || !role) {
    return NextResponse.json({ error: 'Name, email, password, and role are required' }, { status: 400 })
  }
  if (!isValidEmail(sanitizedEmail)) {
    return NextResponse.json({ error: 'Invalid email format' }, { status: 400 })
  }
  // Validate password strength
  const pwdCheck = validatePasswordStrength(password)
  if (!pwdCheck.valid) {
    return NextResponse.json({ error: pwdCheck.message }, { status: 400 })
  }

  // Determine the level: use provided level, or default from role
  const userLevel = level != null ? parseInt(String(level), 10) : getDefaultLevel(role)

  // Only APP_DEVELOPER can create another APP_DEVELOPER
  // (hidden from Owners/Managers — they can't even see the role in the dropdown)
  if (role === 'APP_DEVELOPER' && me.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'Only an App Developer can create another App Developer account' }, { status: 403 })
  }

  // Cannot create a user with a higher level (lower number) than yourself
  if (userLevel < me.level) {
    return NextResponse.json({ error: `You cannot create a user with a higher access level than your own (Level ${me.level})` }, { status: 403 })
  }

  // Developer accounts get access to ALL facilities + orgs (no org/facility scope)
  if (role === 'APP_DEVELOPER') {
    finalOrgId = null  // no org — sees all orgs
    finalFacilityIds = null  // no facility restriction — sees all facilities
  }

  // Hierarchy enforcement:
  // - Owner can only create users in their own organization
  // - Manager can only create users in their assigned facilities
  let finalOrgId: string | null = organizationId || null
  let finalFacilityIds: string | null = facilityIds || null

  if (me.role === 'OWNER') {
    // Owner is scoped to their own org
    finalOrgId = me.organizationId || null
    // Owner can assign any facility within their org — verify if facilityIds provided
    if (finalFacilityIds) {
      const providedFids = finalFacilityIds.split(',').map(s => s.trim()).filter(Boolean)
      // Verify all facilities belong to the owner's org
      const orgFacilities = await db.facility.findMany({
        where: { organizationId: finalOrgId },
        select: { id: true },
      })
      const orgFidSet = new Set(orgFacilities.map(f => f.id))
      const invalid = providedFids.filter(fid => !orgFidSet.has(fid))
      if (invalid.length > 0) {
        return NextResponse.json({ error: 'You can only assign facilities within your own organization' }, { status: 403 })
      }
    }
  } else if (me.role === 'MANAGER') {
    // Manager is scoped to their assigned facilities
    const myFids = (me.facilityIds || '').split(',').map(s => s.trim()).filter(Boolean)
    if (finalFacilityIds) {
      const providedFids = finalFacilityIds.split(',').map(s => s.trim()).filter(Boolean)
      const invalid = providedFids.filter(fid => !myFids.includes(fid))
      if (invalid.length > 0) {
        return NextResponse.json({ error: 'You can only assign facilities you have access to' }, { status: 403 })
      }
    } else {
      // Default to manager's facilities
      finalFacilityIds = myFids.join(',') || null
    }
    // Manager cannot set organizationId (inherited from facility)
    finalOrgId = null
  }

  const existing = await db.user.findUnique({ where: { email: sanitizedEmail } })
  if (existing) {
    return NextResponse.json({ error: 'A user with this email already exists' }, { status: 400 })
  }

  // Tier limit check: verify the org won't exceed its user account limit
  // (Developer accounts at level 0 don't count toward the limit)
  if (role !== 'APP_DEVELOPER' && finalOrgId) {
    const userCheck = await checkUserLimit(finalOrgId)
    if (!userCheck.allowed) {
      return NextResponse.json({
        error: userCheck.message,
        tier: userCheck.tier,
        limit: userCheck.limit,
        current: userCheck.current,
      }, { status: 402 }) // 402 Payment Required
    }
  }

  const userCode = await generateUserCode()
  const user = await db.user.create({
    data: {
      name: sanitizedName,
      email: sanitizedEmail,
      passwordHash: hashPassword(password),
      role,
      level: userLevel,
      code: userCode,
      phone: phone ? sanitizeString(phone, 50) : null,
      linkedResidentIds: linkedResidentIds || null,
      facilityIds: finalFacilityIds,
      moduleAccess: moduleAccess !== undefined ? (moduleAccess || null) : null,
      organizationId: finalOrgId,
      active: true,
    },
    select: { id: true, code: true, name: true, email: true, role: true, level: true, phone: true, active: true, linkedResidentIds: true, moduleAccess: true, organizationId: true, facilityIds: true },
  })

  // If this is a known demo-account email pattern, sync the demoAccounts Setting
  // so the Login page quick-pick buttons show the new credentials.
  await syncDemoAccountSetting(null, sanitizedEmail, password, role)

  return NextResponse.json(user)
}

// PATCH /api/users?id=... — update user
export async function PATCH(req: NextRequest) {
  const me = await getSessionUser(req)
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (me.role !== 'APP_DEVELOPER' && me.role !== 'OWNER' && me.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'User ID required' }, { status: 400 })

  // Fetch the target user to check their level + capture their current email
  // (needed for syncDemoAccountSetting — it looks up the demo entry by old email)
  const targetUser = await db.user.findUnique({ where: { id }, select: { level: true, id: true, organizationId: true, email: true, role: true } })
  if (!targetUser) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  // Org ownership check — non-Developer can only modify users in their own org
  if (me.role !== 'APP_DEVELOPER' && targetUser.organizationId !== me.organizationId) {
    return NextResponse.json({ error: 'You can only modify users in your own organization' }, { status: 403 })
  }

  // Cannot edit a user with a higher level (lower number) than yourself
  if (targetUser.level < me.level) {
    return NextResponse.json({ error: 'You cannot edit a user with a higher access level than your own' }, { status: 403 })
  }

  const body = await req.json()
  const { name, email, role, phone, active, password, linkedResidentIds, moduleAccess, level, facilityIds, organizationId } = body

  // If changing level, ensure new level is >= my level (can't promote above self)
  if (level != null) {
    const newLevel = parseInt(String(level), 10)
    if (newLevel < me.level) {
      return NextResponse.json({ error: 'You cannot assign a higher access level than your own' }, { status: 403 })
    }
  }

  // If changing role, recalculate default level if level not explicitly provided
  let finalLevel: number | undefined
  if (role !== undefined && level === undefined) {
    finalLevel = getDefaultLevel(role)
    if (finalLevel < me.level) {
      return NextResponse.json({ error: 'You cannot assign a role with a higher access level than your own' }, { status: 403 })
    }
  } else if (level != null) {
    finalLevel = parseInt(String(level), 10)
  }

  const data: any = {}
  if (name !== undefined) data.name = name
  if (email !== undefined) data.email = email.toLowerCase().trim()
  if (role !== undefined) data.role = role
  if (phone !== undefined) data.phone = phone
  if (active !== undefined) data.active = active
  if (linkedResidentIds !== undefined) data.linkedResidentIds = linkedResidentIds || null
  if (facilityIds !== undefined) data.facilityIds = facilityIds || null
  if (moduleAccess !== undefined) data.moduleAccess = moduleAccess || null
  if (organizationId !== undefined) data.organizationId = organizationId || null
  if (finalLevel !== undefined) data.level = finalLevel
  if (password) {
    const pwdCheck = validatePasswordStrength(password)
    if (!pwdCheck.valid) {
      return NextResponse.json({ error: pwdCheck.message }, { status: 400 })
    }
    data.passwordHash = hashPassword(password)
  }

  const user = await db.user.update({
    where: { id },
    data,
    // Include organizationId and facilityIds in the response so the frontend
    // can display the org column correctly after an edit. Without these, the
    // local user list loses the org association and shows "—" until refreshed.
    select: { id: true, code: true, name: true, email: true, role: true, level: true, phone: true, active: true, linkedResidentIds: true, moduleAccess: true, organizationId: true, facilityIds: true },
  })

  // If this user is a tracked demo account, sync the demoAccounts Setting
  // so the Login page quick-pick buttons show the new email/password.
  // We pass:
  //   - oldEmail = targetUser.email (the email BEFORE the edit)
  //   - newEmail = sanitized email from the PATCH body (may be undefined if unchanged)
  //   - newPassword = plaintext password from the PATCH body (may be undefined)
  //   - role = the new role (may be undefined if unchanged — fall back to target role)
  await syncDemoAccountSetting(
    targetUser.email,
    email !== undefined ? sanitizeEmail(email) : null,
    password || null,
    role || targetUser.role,
  )

  return NextResponse.json(user)
}
