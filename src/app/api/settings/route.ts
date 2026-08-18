import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// ============================================================================
// PER-FACILITY SETTINGS
// ----------------------------------------------------------------------------
// Settings are stored in a single Setting table using a key convention:
//   • Global / system-wide setting        → key = "medRoutes"
//   • Facility-specific override           → key = "facility:<facilityId>:medRoutes"
//
// When reading settings for a facility, the API merges:
//   DEFAULTS  →  global DB value  →  facility-specific DB value
// (each layer overrides the previous one)
//
// Settings that are inherently system-wide (userLevels, medStatuses,
// residentStatuses) are ALWAYS stored globally — they are not facility-scoped.
// ============================================================================

// Default settings (used when no DB setting exists yet)
const DEFAULTS: Record<string, any> = {
  medFrequencies: [
    'Once daily', 'Twice daily', 'Three times daily', 'Once daily at bedtime',
    'Once daily before breakfast', 'Once daily morning', 'Once daily evening',
    'Four times daily', 'Every 4 hours', 'Every 6 hours', 'Every 8 hours',
    'PRN every 4 hours', 'PRN every 6 hours', 'PRN every 8 hours',
    'Once weekly', 'As needed',
  ],
  // Expanded to include the granular oral routes commonly used in Malaysian nursing homes
  medRoutes: [
    'Oral Tablet', 'Oral Syrup', 'Crushed Tablet',
    'Subcutaneous', 'Intramuscular', 'IV', 'Topical', 'Inhalation',
    'Rectal', 'Vaginal', 'Ophthalmic', 'Otic', 'Nasal', 'Other',
  ],
  // Common prescribers — populated by users in Settings, shown as dropdown in MAR / Add Medication
  medPrescribers: [
    'Dr. Tan (Visiting GP)',
    'Dr. Lim (Geriatrician)',
    'Dr. Wong (Internal Medicine)',
  ],
  facilityName: 'Serenity Care Home',
  facilityAddress: '',
  facilityPhone: '',
  facilityEmail: '',
  facilityDirector: '',
  currency: 'RM (Malaysian Ringgit)',
  taxRate: 5,
  invoiceDueDays: 30,
  invoicePrefix: 'INV-',
  // Organization identity
  organizationName: 'Serenity Care Home',
  organizationLogoUrl: '',
  organizationRegistrationNumber: '',
  organizationAddress: '',
  organizationAddress2: '',
  organizationCity: '',
  organizationState: '',
  organizationPostalCode: '',
  organizationCountry: 'Malaysia',
  // App-level branding (controlled by App Developer in Developer → App Settings)
  appName: 'Serenity Care Home',
  appTagline: 'Resident & Operations Management',
  appLogoUrl: '',
  appPrimaryColor: '#e11d48',
  defaultNewUserPassword: '',
  sessionTimeoutMinutes: 480,
  // E-Invoice (LHDN MyInvois) defaults
  lhdnEnabled: false,
  lhdnEnvironment: 'sandbox',
  lhdnClientId: '',
  lhdnClientSecret: '',
  organizationTIN: '',
  organizationMSIC: '86901',
  organizationSSTNumber: '',
  organizationSSTRegistered: false,
  organizationBusinessActivity: 'Residential care activities for the elderly and disabled',
  // System-wide (NOT facility-scoped)
  medStatuses: [
    { id: 'PENDING', label: 'Pending', desc: 'Waiting to be administered' },
    { id: 'GIVEN', label: 'Given', desc: 'Successfully administered' },
    { id: 'REFUSED', label: 'Refused', desc: 'Resident refused' },
    { id: 'WITHHELD', label: 'Withheld', desc: 'Held by nurse per order' },
    { id: 'DELAYED', label: 'Delayed', desc: 'Will give later' },
    { id: 'FINISHED', label: 'Med Finished', desc: 'Supply run out' },
    { id: 'RESIDENT_OUT', label: 'Resident Out', desc: 'Resident not in facility' },
    { id: 'MISSED', label: 'Missed', desc: 'Dose window passed' },
  ],
  residentStatuses: [
    { id: 'ACTIVE', label: 'Active', desc: 'Resident is currently in the facility' },
    { id: 'HOSPITALIZED', label: 'Hospitalized', desc: 'Resident admitted to hospital' },
    { id: 'OUT_WITH_FAMILY', label: 'Out with Family', desc: 'Resident taken out by family' },
    { id: 'DISCHARGED', label: 'Discharged', desc: 'Resident permanently discharged' },
    { id: 'DECEASED', label: 'Deceased', desc: 'Resident has passed away' },
  ],
  userLevels: [
    { level: 0, label: 'App Developer', desc: 'Highest authority — full system access including Developer tools', roles: ['APP_DEVELOPER'] },
    { level: 1, label: 'Org Owner', desc: 'Full access to all facilities and modules (subscription owner)', roles: ['OWNER'] },
    { level: 2, label: 'Manager', desc: 'Manages operations, staff, finance — cannot see Owner or Developer', roles: ['MANAGER'] },
    { level: 3, label: 'Clinical', desc: 'Doctor, Nurse, Physio, Dietitian — sees own level and below', roles: ['DOCTOR', 'NURSE', 'PHYSIO', 'DIETITIAN'] },
    { level: 4, label: 'Support', desc: 'Care Staff, Reception — limited operational access', roles: ['CARE_STAFF', 'RECEPTION'] },
    { level: 5, label: 'Family', desc: 'Sees only their linked resident — dashboard + messages', roles: ['FAMILY'] },
  ],
  // Code prefixes — configurable per facility
  prefixResident: 'RES',
  prefixUser: 'USR',
  prefixProduct: 'PRD',
  prefixStaff: 'STF',
  prefixRoom: 'ROM',
  prefixInventory: 'ITM',
  prefixInvoice: 'INV',
  prefixPayment: 'PMT',
  prefixJournalEntry: 'JE',
  prefixVendor: 'VEN',
  prefixBankAccount: 'BNK',
  prefixDeposit: 'DEP',
  // When true, all generated codes include the YYMMDD date segment
  // (e.g. RES-250708-0001 instead of RES-0001). The sequential number
  // resets daily.
  codeIncludeDate: false,
  // Receipt customization
  receiptHeaderText: 'Official Receipt',
  receiptFooterText: 'This is a computer-generated receipt. No signature required.',
  // Demo mode — controlled by App Developer. When OFF, demo accounts are deactivated.
  demoMode: false,
  // Which facilities demo accounts can access (empty = all facilities).
  // Only the App Developer can change this.
  demoFacilityIds: [],
  // ============ Dropdown options (configurable per facility) ============
  roomTypes: ['PRIVATE', 'SEMI_PRIVATE', 'WARD'],
  roomStatuses: ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'],
  productCategories: ['ROOM', 'CARE', 'MEDICATION', 'THERAPY', 'SUPPLIES', 'FOOD', 'OTHER'],
  productUnits: ['each', 'day', 'session', 'month', 'hour'],
  inventoryCategories: ['MEDICAL', 'FOOD', 'CLEANING', 'OFFICE', 'OTHER'],
  inventoryUnits: ['each', 'box', 'pack', 'bottle', 'kg', 'L', 'roll'],
  expenseCategories: ['SALARY', 'SUPPLIES', 'FOOD', 'UTILITIES', 'MAINTENANCE', 'EQUIPMENT', 'OTHER'],
  visitTypes: ['DOCTOR', 'PHYSIO', 'DIETITIAN', 'NURSE_ASSESSMENT', 'OTHER'],
  incidentTypes: ['FALL', 'MEDICATION_ERROR', 'BEHAVIOR', 'INJURY', 'OTHER'],
  incidentSeverities: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'],
  careLogCategories: ['HYGIENE', 'MEALS', 'MOBILITY', 'TOILETING', 'BEHAVIOR', 'OTHER'],
  leaveTypes: ['ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'OTHER'],
  // Shift types include default times so the schedule auto-fill knows when each shift starts/ends
  shiftTypes: [
    { type: 'DAY', start: '07:00', end: '15:00' },
    { type: 'EVENING', start: '15:00', end: '23:00' },
    { type: 'NIGHT', start: '23:00', end: '07:00' },
  ],
  // ============ Finance / Accounting dropdowns ============
  paymentMethods: ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'INSURANCE', 'ONLINE', 'OTHER'],
  paymentStatuses: ['PENDING', 'CLEARED', 'BOUNCED', 'REFUNDED'],
  invoiceStatuses: ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'],
  bankAccountTypes: ['BANK', 'CASH', 'SAVINGS'],
  depositTypes: ['ADMISSION', 'SECURITY', 'ADVANCE', 'OTHER'],
  // ============ Clinical / resident dropdowns ============
  dietaryNeeds: ['Regular', 'Low Sodium', 'Diabetic', 'Soft', 'Pureed', 'Vegetarian', 'High Protein', 'Renal'],
  medDurations: ['Ongoing', '7 days', '14 days', '30 days', '60 days', '90 days', '6 months', '1 year'],
  // ============ Staff dropdowns ============
  staffRoles: ['NURSE', 'CARE_STAFF', 'DOCTOR', 'PHYSIO', 'DIETITIAN', 'RECEPTION'],
}

// Keys that are always global (never facility-scoped)
const GLOBAL_ONLY_KEYS = new Set([
  'medStatuses', 'residentStatuses', 'userLevels',
  // App-level branding & security (controlled by App Developer)
  'appName', 'appTagline', 'appLogoUrl', 'appPrimaryColor',
  'defaultNewUserPassword', 'sessionTimeoutMinutes',
  'primaryColor',
])

// Build the storage key for a setting
function storageKey(key: string, facilityId?: string | null): string {
  if (facilityId && !GLOBAL_ONLY_KEYS.has(key)) {
    return `facility:${facilityId}:${key}`
  }
  return key
}

// Get a setting value from DB by storage key
async function getSetting(storageKey: string): Promise<any | undefined> {
  const s = await db.setting.findUnique({ where: { key: storageKey } })
  if (!s) return undefined
  try { return JSON.parse(s.value) } catch { return undefined }
}

// GET /api/settings — returns merged settings for a facility
// Query params:
//   ?key=xxx            → return single setting (merged)
//   ?facilityId=xxx     → return facility-scoped merged settings
//   (no params)         → return global settings only
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  const facilityId = searchParams.get('facilityId') || undefined

  // Facility ownership check — non-Developer cannot read another org's facility settings
  if (facilityId && user.role !== 'APP_DEVELOPER') {
    const { canAccessFacility } = await import('@/lib/auth')
    const canAccess = await canAccessFacility(user, facilityId)
    if (!canAccess) {
      return NextResponse.json({ error: 'You do not have access to this facility' }, { status: 403 })
    }
  }

  // Single-key request
  if (key) {
    let value: any
    if (GLOBAL_ONLY_KEYS.has(key)) {
      // System-wide setting — ignore facilityId
      value = await getSetting(key) ?? DEFAULTS[key]
    } else {
      // Facility-scoped: try facility-specific first, fall back to global, then default
      value = (facilityId ? await getSetting(storageKey(key, facilityId)) : undefined)
        ?? await getSetting(key)
        ?? DEFAULTS[key]
    }
    return NextResponse.json({ key, value })
  }

  // Return ALL settings — merged
  // 1. Start with defaults
  const merged: Record<string, any> = { ...DEFAULTS }

  // 2. Apply global DB overrides
  const globalSettings = await db.setting.findMany({
    where: { key: { not: { startsWith: 'facility:' } } },
  })
  for (const s of globalSettings) {
    try { merged[s.key] = JSON.parse(s.value) } catch {}
  }

  // 3. Apply facility-specific overrides
  if (facilityId) {
    const facilitySettings = await db.setting.findMany({
      where: { key: { startsWith: `facility:${facilityId}:` } },
    })
    for (const s of facilitySettings) {
      const originalKey = s.key.replace(`facility:${facilityId}:`, '')
      if (!GLOBAL_ONLY_KEYS.has(originalKey)) {
        try { merged[originalKey] = JSON.parse(s.value) } catch {}
      }
    }
  }

  return NextResponse.json(merged)
}

// POST /api/settings — save a setting
//   • APP_DEVELOPER — can save both global and facility-specific settings
//   • OWNER / MANAGER — can only save facility-specific settings (NOT global)
// Body: { key, value, facilityId? }
//   • If facilityId provided (and key is not global-only) → save as facility-specific
//   • Otherwise → save as global
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { key, value } = body
  if (!key) return NextResponse.json({ error: 'Key required' }, { status: 400 })

  // Determine facilityId from body OR query string
  const { searchParams } = new URL(req.url)
  const facilityId = body.facilityId || searchParams.get('facilityId') || null

  // Facility ownership check — non-Developer cannot write another org's facility settings
  if (facilityId && user.role !== 'APP_DEVELOPER') {
    const { canAccessFacility } = await import('@/lib/auth')
    const canAccess = await canAccessFacility(user, facilityId)
    if (!canAccess) {
      return NextResponse.json({ error: 'You do not have access to this facility' }, { status: 403 })
    }
  }

  // Enforce scope: OWNER and MANAGER can only save facility-specific settings.
  // Only APP_DEVELOPER can modify global defaults.
  // Exceptions:
  //   - org-level keys like "orgDefaultPassword:<orgId>" can be saved by the Owner of that org
  //   - per-user keys like "user:<userId>:*" can be saved by that user themselves
  //   - org-scoped level modules "levelModules:<orgId>:<level>" can be saved by the Owner of that org
  const isOrgLevelKey = key.startsWith('orgDefaultPassword:')
  const isPerUserKey = key.startsWith(`user:${user.id}:`)
  const isOrgLevelModuleKey = key.startsWith('levelModules:') && key.split(':').length === 3  // levelModules:<orgId>:<level>
  const isGlobalLevelModuleKey = key.startsWith('levelModules:') && key.split(':').length === 2  // levelModules:<level> (global)
  const isOrgModulesKey = key.startsWith('orgModules:')  // orgModules:<orgId> — org-level module gate
  const isOrgScoped = isOrgLevelKey || isOrgLevelModuleKey || isOrgModulesKey
  const isGlobalSave = (!facilityId || GLOBAL_ONLY_KEYS.has(key)) && !isOrgScoped && !isPerUserKey && !isGlobalLevelModuleKey
  if (isGlobalSave && user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({
      error: 'Only the App Developer can modify global defaults. Select a specific facility to create a facility-specific override instead.',
    }, { status: 403 })
  }

  // For org-level keys, verify the Owner actually owns the org
  if (isOrgLevelKey && user.role === 'OWNER') {
    const orgIdInKey = key.replace('orgDefaultPassword:', '')
    if (orgIdInKey !== user.organizationId) {
      return NextResponse.json({ error: 'You can only set defaults for your own organization' }, { status: 403 })
    }
  }

  // For org-scoped level module keys, verify the Owner owns the org
  if (isOrgLevelModuleKey && user.role === 'OWNER') {
    const parts = key.split(':')  // levelModules:<orgId>:<level>
    const orgIdInKey = parts[1]
    if (orgIdInKey !== user.organizationId) {
      return NextResponse.json({ error: 'You can only set module access for your own organization' }, { status: 403 })
    }
  }

  // For per-user keys, verify the key belongs to the current user
  if (key.startsWith('user:') && !isPerUserKey) {
    return NextResponse.json({ error: 'You can only modify your own user settings' }, { status: 403 })
  }

  // ============== TIER DOWNGRADE CHECK ==============
  // When setting businessType:<orgId>, verify the org's current resource
  // counts don't exceed the new tier's limits. If they do, reject with a
  // clear message telling the Developer what needs to be reduced first.
  if (key.startsWith('businessType:') && key.split(':').length === 2) {
    const orgIdForTier = key.split(':')[1]
    const newTier = typeof value === 'string' ? value : null
    if (newTier === 'free') {
      // Check all 3 resource limits
      const { checkBedLimit, checkFacilityLimit, checkUserLimit } = await import('@/lib/tier-limits')
      const [bedCheck, facCheck, userCheck] = await Promise.all([
        checkBedLimit(orgIdForTier, 0),  // 0 additional = just check current count
        checkFacilityLimit(orgIdForTier),
        checkUserLimit(orgIdForTier),
      ])
      const violations: string[] = []
      // For downgrade validation: use > (strictly over) not >= (at-or-over).
      // If current = limit exactly, the org is AT the limit (OK to downgrade).
      // Only if current > limit (strictly over) should we block the downgrade.
      if (bedCheck.limit !== null && bedCheck.current > bedCheck.limit) {
        violations.push(`${bedCheck.current} beds (Free limit: ${bedCheck.limit})`)
      }
      if (facCheck.limit !== null && facCheck.current > facCheck.limit) {
        violations.push(`${facCheck.current} facilities (Free limit: ${facCheck.limit})`)
      }
      if (userCheck.limit !== null && userCheck.current > userCheck.limit) {
        violations.push(`${userCheck.current} user accounts (Free limit: ${userCheck.limit})`)
      }
      if (violations.length > 0) {
        return NextResponse.json({
          error: `Cannot downgrade to Free tier — this org exceeds Free limits: ${violations.join(', ')}. Reduce these resources first, or keep the org on Pro tier.`,
          violations,
          tierChecks: { beds: bedCheck, facilities: facCheck, users: userCheck },
        }, { status: 400 })
      }
    }
  }

  // Global-only keys always save globally (and only Developer can do this — checked above)
  const finalStorageKey = storageKey(key, GLOBAL_ONLY_KEYS.has(key) ? null : facilityId)

  const setting = await db.setting.upsert({
    where: { key: finalStorageKey },
    update: { value: JSON.stringify(value) },
    create: { key: finalStorageKey, value: JSON.stringify(value) },
  })

  return NextResponse.json({ key, value: JSON.parse(setting.value), storageKey: finalStorageKey })
}

// DELETE /api/settings?key=xxx[&facilityId=xxx] — delete a setting (reverts to default / global)
//   • APP_DEVELOPER — can delete both global and facility-specific
//   • OWNER / MANAGER — can only delete facility-specific overrides
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { searchParams } = new URL(req.url)
  const key = searchParams.get('key')
  const facilityId = searchParams.get('facilityId') || null
  if (!key) return NextResponse.json({ error: 'Key required' }, { status: 400 })

  // Enforce scope: OWNER and MANAGER can only delete facility-specific overrides.
  // Exception: per-user keys can be deleted by the user themselves.
  const isPerUserKey = key.startsWith(`user:${user.id}:`)
  const isGlobalDelete = (!facilityId || GLOBAL_ONLY_KEYS.has(key)) && !isPerUserKey
  if (isGlobalDelete && user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({
      error: 'Only the App Developer can reset global defaults. Select a specific facility to reset its override instead.',
    }, { status: 403 })
  }

  // For per-user keys, verify ownership
  if (key.startsWith('user:') && !isPerUserKey) {
    return NextResponse.json({ error: 'You can only delete your own user settings' }, { status: 403 })
  }

  const finalStorageKey = storageKey(key, GLOBAL_ONLY_KEYS.has(key) ? null : facilityId)
  await db.setting.deleteMany({ where: { key: finalStorageKey } })

  return NextResponse.json({ success: true, message: `Setting '${key}' reset to default` })
}
