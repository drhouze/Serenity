/**
 * Subscription Tier Presets
 *
 * Repurposed from "business types" to subscription tiers (Free, Pro, Enterprise).
 * Each tier defines which modules are visible + resource limits.
 *
 * The tier is stored as: businessType:<orgId> = 'free' | 'pro' | 'enterprise'
 * (reusing the existing setting key for backwards compat)
 *
 * Tier comparison:
 *
 *   Feature              Free           Pro            Enterprise
 *   ──────────────────────────────────────────────────────────────
 *   Bed Capacity         ≤ 8 beds       Unlimited     Unlimited
 *   Facilities           1              1             Unlimited
 *   User Accounts        3              Unlimited     Unlimited
 *   Resident Mgmt       ✅              ✅             ✅
 *   Room & Bed Mgmt     ✅              ✅             ✅
 *   Care Logs & Vitals  ✅              ✅             ✅
 *   Med Management      ✅              ✅             ✅
 *   Family Messaging    ✅              ✅             ✅
 *   Accounting Module   ❌              ✅              ✅
 *   Inventory & POs     ❌              ✅              ✅
 *   Staff & Payroll     ❌              ✅              ✅
 *   Vendor Management   ❌              ✅              ✅
 *   AI Features         ❌              ❌              ✅
 *   Multi-facility      ❌              ❌              ✅
 *   Stock Transfers     ❌              ❌              ✅
 */

export type BusinessType = 'free' | 'pro' | 'enterprise' | 'nursing_home' | 'generic' | 'clinic' | 'tailor'

export interface BusinessTypePreset {
  type: BusinessType
  label: string
  description: string
  /** Module IDs that are visible for this tier */
  visibleModules: string[]
  /** Customer fields that are hidden for this tier (key → false = hidden) */
  hiddenCustomerFields: string[]
  /** Customer feature tabs that are visible for this tier */
  visibleCustomerFeatures: string[]
  /** Label overrides — maps default labels to custom ones */
  labels: {
    customer?: string
    customerPlural?: string
    room?: string
    visit?: string
    visitPlural?: string
  }
}

/** All available customer feature tabs (shown in the customer detail view) */
export const ALL_CUSTOMER_FEATURES = [
  { id: 'overview', label: 'Overview' },
  { id: 'medications', label: 'Medications' },
  { id: 'vitals', label: 'Vital Signs' },
  { id: 'care', label: 'Care Logs' },
  { id: 'visits', label: 'Visits / Appointments' },
  { id: 'incidents', label: 'Incidents' },
  { id: 'messages', label: 'Family Messages' },
  { id: 'billing', label: 'Billing & Payments' },
  { id: 'custom', label: 'Custom Fields' },
  { id: 'history', label: 'Status History' },
]

// Core modules available on ALL tiers (including Free)
// 'users' is included so Free tier orgs can manage their 3 allowed user accounts
// 'settings' is included so Free tier orgs can configure basic facility info (name, address, etc.)
// Custom Roles & Permissions (the "Modules" button per user) is a Pro+ feature —
// controlled separately in the UI, not by the module list
const CORE_MODULES = [
  'dashboard', 'residents', 'clinical', 'rounds',
  'rooms', 'incidents', 'messages',
  'users', 'settings',
]

// Pro-tier modules (added on top of Free)
const PRO_MODULES = [
  ...CORE_MODULES,
  'staff', 'finance', 'inventory', 'products',
  'audit',
]

// Enterprise-tier modules (added on top of Pro)
const ENTERPRISE_MODULES = [
  ...PRO_MODULES,
  'developer', // AI features etc. — only Enterprise
]

// All customer features for clinical use
const ALL_CUSTOMER_FEATURES_LIST = ['overview', 'medications', 'vitals', 'care', 'visits', 'incidents', 'messages', 'billing', 'history']
// Free-tier customer features (no billing — no accounting on Free)
const FREE_CUSTOMER_FEATURES = ['overview', 'medications', 'vitals', 'care', 'visits', 'incidents', 'messages', 'history']

export const BUSINESS_TYPE_PRESETS: Record<BusinessType, BusinessTypePreset> = {
  // ============================================================
  // FREE TIER — core care only, ≤8 beds, 1 facility, 3 users
  // ============================================================
  free: {
    type: 'free',
    label: 'Free',
    description: 'Core care management: residents, rooms, medications, vitals, care logs, incidents, family messaging. Up to 8 beds, 1 facility, 3 user accounts.',
    visibleModules: CORE_MODULES,
    hiddenCustomerFields: [],
    visibleCustomerFeatures: FREE_CUSTOMER_FEATURES,
    labels: {
      customer: 'Resident',
      customerPlural: 'Residents',
      room: 'Room',
      visit: 'Visit',
      visitPlural: 'Visits',
    },
  },

  // ============================================================
  // PRO TIER — full operations + finance, unlimited beds/users
  // ============================================================
  pro: {
    type: 'pro',
    label: 'Pro',
    description: 'Full operations management: accounting (GL, JE, invoices, payments, deposits), inventory & purchase orders, staff attendance & payroll, vendor management. Unlimited beds and users, 1 facility.',
    visibleModules: PRO_MODULES,
    hiddenCustomerFields: [],
    visibleCustomerFeatures: ALL_CUSTOMER_FEATURES_LIST,
    labels: {
      customer: 'Resident',
      customerPlural: 'Residents',
      room: 'Room',
      visit: 'Visit',
      visitPlural: 'Visits',
    },
  },

  // ============================================================
  // ENTERPRISE TIER — everything including AI + multi-facility
  // ============================================================
  enterprise: {
    type: 'enterprise',
    label: 'Enterprise',
    label2: 'Enterprise',
    description: 'Everything in Pro, plus: AI features (care summaries, med interaction checks, vital analysis), multi-facility consolidated P&L/Balance Sheet, inter-facility stock transfers, custom roles & permissions. Unlimited everything.',
    visibleModules: ENTERPRISE_MODULES,
    hiddenCustomerFields: [],
    visibleCustomerFeatures: ALL_CUSTOMER_FEATURES_LIST,
    labels: {
      customer: 'Resident',
      customerPlural: 'Residents',
      room: 'Room',
      visit: 'Visit',
      visitPlural: 'Visits',
    },
  } as any,

  // ============================================================
  // LEGACY TYPES — mapped to Pro for backwards compat
  // ============================================================
  nursing_home: {
    type: 'nursing_home',
    label: 'Nursing Home (Legacy → Pro)',
    description: 'Legacy business type — treated as Pro tier. Full operations + finance.',
    visibleModules: PRO_MODULES,
    hiddenCustomerFields: [],
    visibleCustomerFeatures: ALL_CUSTOMER_FEATURES_LIST,
    labels: {
      customer: 'Resident',
      customerPlural: 'Residents',
      room: 'Room',
      visit: 'Visit',
      visitPlural: 'Visits',
    },
  },

  generic: {
    type: 'generic',
    label: 'Generic (Legacy → Pro)',
    description: 'Legacy generic type — treated as Pro tier.',
    visibleModules: PRO_MODULES,
    hiddenCustomerFields: [],
    visibleCustomerFeatures: ALL_CUSTOMER_FEATURES_LIST,
    labels: {
      customer: 'Resident',
      customerPlural: 'Residents',
      room: 'Room',
      visit: 'Visit',
      visitPlural: 'Visits',
    },
  },

  clinic: {
    type: 'clinic',
    label: 'Clinic (Legacy → Pro)',
    description: 'Legacy clinic type — treated as Pro tier.',
    visibleModules: PRO_MODULES,
    hiddenCustomerFields: [],
    visibleCustomerFeatures: ALL_CUSTOMER_FEATURES_LIST,
    labels: {
      customer: 'Resident',
      customerPlural: 'Residents',
      room: 'Room',
      visit: 'Visit',
      visitPlural: 'Visits',
    },
  },

  tailor: {
    type: 'tailor',
    label: 'Tailor (Legacy → Pro)',
    description: 'Legacy tailor type — treated as Pro tier.',
    visibleModules: PRO_MODULES,
    hiddenCustomerFields: [],
    visibleCustomerFeatures: ALL_CUSTOMER_FEATURES_LIST,
    labels: {
      customer: 'Resident',
      customerPlural: 'Residents',
      room: 'Room',
      visit: 'Visit',
      visitPlural: 'Visits',
    },
  },
}

export function getBusinessTypePreset(businessType: string | null | undefined): BusinessTypePreset {
  return BUSINESS_TYPE_PRESETS[businessType as BusinessType] || BUSINESS_TYPE_PRESETS.pro
}

/**
 * Check if a module should be visible for a given tier.
 */
export function isModuleVisible(businessType: string | null | undefined, moduleId: string): boolean {
  const preset = getBusinessTypePreset(businessType)
  return preset.visibleModules.includes(moduleId)
}

/**
 * Check if a customer field should be visible for a given tier.
 */
export function isFieldVisible(businessType: string | null | undefined, fieldKey: string): boolean {
  const preset = getBusinessTypePreset(businessType)
  return !preset.hiddenCustomerFields.includes(fieldKey)
}

/**
 * Check if a customer feature tab should be visible for a given tier.
 * Also checks for Developer-customized feature lists (stored as setting key: businessTypeFeatures:<type>).
 */
export function isCustomerFeatureVisible(businessType: string | null | undefined, featureId: string, customFeatures?: string[] | null): boolean {
  if (customFeatures && Array.isArray(customFeatures)) {
    return customFeatures.includes(featureId)
  }
  const preset = getBusinessTypePreset(businessType)
  return preset.visibleCustomerFeatures.includes(featureId)
}

/**
 * Get the label override for a given key. Falls back to the default.
 */
export function getBusinessLabel(businessType: string | null | undefined, key: keyof BusinessTypePreset['labels']): string {
  const preset = getBusinessTypePreset(businessType)
  return preset.labels[key] || BUSINESS_TYPE_PRESETS.pro.labels[key] || key
}

/**
 * All available business types for dropdowns.
 */
export const BUSINESS_TYPES = Object.values(BUSINESS_TYPE_PRESETS).filter(
  bt => !['nursing_home', 'generic', 'clinic', 'tailor'].includes(bt.type)
)

/**
 * Preset custom field definitions for each tier.
 * When a new org is created with a tier, these fields are auto-seeded.
 * The Owner can then add/edit/delete fields in Settings → Custom Fields.
 */
export const PRESET_CUSTOM_FIELDS: Record<BusinessType, Array<{
  label: string
  type: 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'TEXTAREA' | 'REFERENCE'
  options?: string[]
  unit?: string
  required?: boolean
  targetEntity?: string
  referenceEntity?: string
}>> = {
  free: [
    { label: 'Blood Type', type: 'SELECT', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] },
    { label: 'Religion', type: 'TEXT' },
    { label: 'Mobility Aid', type: 'SELECT', options: ['None', 'Walking Stick', 'Walker', 'Wheelchair', 'Crutches', 'Hoist'] },
    { label: 'Fall Risk', type: 'SELECT', options: ['Low', 'Medium', 'High'] },
  ],
  pro: [
    { label: 'Blood Type', type: 'SELECT', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] },
    { label: 'Religion', type: 'TEXT' },
    { label: 'Occupation (Former)', type: 'TEXT' },
    { label: 'Hobbies / Interests', type: 'TEXTAREA' },
    { label: 'Mobility Aid', type: 'SELECT', options: ['None', 'Walking Stick', 'Walker', 'Wheelchair', 'Crutches', 'Hoist'] },
    { label: 'Fall Risk', type: 'SELECT', options: ['Low', 'Medium', 'High'] },
    { label: 'Dietary Restrictions', type: 'TEXTAREA' },
    { label: 'Preferred Language', type: 'TEXT' },
  ],
  enterprise: [
    { label: 'Blood Type', type: 'SELECT', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] },
    { label: 'Religion', type: 'TEXT' },
    { label: 'Occupation (Former)', type: 'TEXT' },
    { label: 'Hobbies / Interests', type: 'TEXTAREA' },
    { label: 'Mobility Aid', type: 'SELECT', options: ['None', 'Walking Stick', 'Walker', 'Wheelchair', 'Crutches', 'Hoist'] },
    { label: 'Fall Risk', type: 'SELECT', options: ['Low', 'Medium', 'High'] },
    { label: 'Dietary Restrictions', type: 'TEXTAREA' },
    { label: 'Preferred Language', type: 'TEXT' },
    { label: 'Insurance Provider', type: 'TEXT' },
    { label: 'Emergency Contact Priority', type: 'SELECT', options: ['Primary', 'Secondary', 'Tertiary'] },
  ],
  // Legacy types fall back to Pro presets
  nursing_home: [
    { label: 'Blood Type', type: 'SELECT', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] },
    { label: 'Religion', type: 'TEXT' },
    { label: 'Occupation (Former)', type: 'TEXT' },
    { label: 'Hobbies / Interests', type: 'TEXTAREA' },
    { label: 'Mobility Aid', type: 'SELECT', options: ['None', 'Walking Stick', 'Walker', 'Wheelchair', 'Crutches', 'Hoist'] },
    { label: 'Fall Risk', type: 'SELECT', options: ['Low', 'Medium', 'High'] },
    { label: 'Dietary Restrictions', type: 'TEXTAREA' },
    { label: 'Preferred Language', type: 'TEXT' },
  ],
  generic: [
    { label: 'Notes', type: 'TEXTAREA' },
    { label: 'Preferred Contact Method', type: 'SELECT', options: ['Phone', 'Email', 'SMS', 'WhatsApp'] },
  ],
  clinic: [
    { label: 'Blood Type', type: 'SELECT', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] },
    { label: 'Referring Doctor', type: 'REFERENCE', referenceEntity: 'staff', targetEntity: 'resident' },
    { label: 'Chief Complaint', type: 'TEXTAREA' },
    { label: 'Known Allergies', type: 'TEXTAREA' },
    { label: 'Current Medications', type: 'TEXTAREA' },
  ],
  tailor: [
    { label: 'Notes', type: 'TEXTAREA' },
  ],
}
