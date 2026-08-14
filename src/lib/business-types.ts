/**
 * Business Type Presets
 *
 * Defines which modules are visible, which customer fields are visible,
 * and label customizations for each business type.
 *
 * When a new organization is created (or business type is changed), the
 * preset is applied automatically. The Developer can still override per-org.
 *
 * To add a new business type:
 *   1. Add an entry to BUSINESS_TYPE_PRESETS below
 *   2. Add the type to the dropdown in Developer → Organization Management
 *   3. Add the type to the module filtering in page.tsx
 */

export type BusinessType = 'nursing_home' | 'tailor' | 'clinic' | 'generic'

export interface BusinessTypePreset {
  type: BusinessType
  label: string
  description: string
  /** Module IDs that are visible for this business type */
  visibleModules: string[]
  /** Customer fields that are hidden for this business type (key → false = hidden) */
  hiddenCustomerFields: string[]
  /** Customer feature tabs that are visible for this business type */
  visibleCustomerFeatures: string[]
  /** Label overrides — maps default labels to custom ones */
  labels: {
    customer?: string      // default: "Customer"
    customerPlural?: string // default: "Customers"
    room?: string          // default: "Room"
    visit?: string         // default: "Visit" (e.g. "Fitting" for tailor)
    visitPlural?: string   // default: "Visits"
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

export const BUSINESS_TYPE_PRESETS: Record<BusinessType, BusinessTypePreset> = {
  // ============================================================
  // NURSING HOME — the default, full-featured
  // ============================================================
  nursing_home: {
    type: 'nursing_home',
    label: 'Nursing Home / Care Facility',
    description: 'Full care facility management: medications, vitals, care rounds, rooms, incidents, family messaging.',
    visibleModules: [
      'dashboard', 'residents', 'clinical', 'rounds',
      'staff', 'rooms', 'incidents', 'messages',
      'finance', 'inventory', 'products', 'audit',
      'settings', 'users',
    ],
    hiddenCustomerFields: [],
    visibleCustomerFeatures: ['overview', 'medications', 'vitals', 'care', 'visits', 'incidents', 'messages', 'billing', 'history'],
    labels: {
      customer: 'Customer',
      customerPlural: 'Customers',
      room: 'Room',
      visit: 'Visit',
      visitPlural: 'Visits',
    },
  },

  // ============================================================
  // TAILOR — garment business with body measurements
  // ============================================================
  tailor: {
    type: 'tailor',
    label: 'Tailor / Garment Business',
    description: 'Customer management with body measurements, fabric inventory, fitting appointments, and invoicing.',
    visibleModules: [
      'dashboard', 'residents', 'staff', 'clinical',
      'finance', 'inventory', 'products',
      'audit', 'settings', 'users',
    ],
    hiddenCustomerFields: [
      'roomId',           // no rooms in a tailor shop
      'allergies',
      'conditions',
      'dietaryNeeds',
      'doctorName',
      'doctorPhone',
      'insuranceProvider',
      'insuranceNumber',
      'admissionDate',    // not admitted, just a customer
      'dischargeDate',
    ],
    visibleCustomerFeatures: ['overview', 'visits', 'billing', 'custom', 'history'],
    labels: {
      customer: 'Customer',
      customerPlural: 'Customers',
      room: 'Fitting Room',
      visit: 'Fitting',
      visitPlural: 'Fittings',
    },
  },

  // ============================================================
  // CLINIC — medical clinic (no rooms, no care rounds)
  // ============================================================
  clinic: {
    type: 'clinic',
    label: 'Medical Clinic',
    description: 'Patient management with medications, vitals, appointments, and invoicing. No rooms or care rounds.',
    visibleModules: [
      'dashboard', 'residents', 'clinical',
      'staff', 'incidents',
      'finance', 'inventory', 'products',
      'audit', 'settings', 'users',
    ],
    hiddenCustomerFields: [
      'roomId',
      'dietaryNeeds',
      'admissionDate',
      'dischargeDate',
    ],
    visibleCustomerFeatures: ['overview', 'medications', 'vitals', 'visits', 'incidents', 'billing', 'custom', 'history'],
    labels: {
      customer: 'Patient',
      customerPlural: 'Patients',
      room: 'Room',
      visit: 'Appointment',
      visitPlural: 'Appointments',
    },
  },

  // ============================================================
  // GENERIC — minimal, just customers + finance + inventory
  // ============================================================
  generic: {
    type: 'generic',
    label: 'Generic Business',
    description: 'Basic customer management, invoicing, and inventory. No clinical or care features.',
    visibleModules: [
      'dashboard', 'residents', 'staff',
      'finance', 'inventory', 'products',
      'audit', 'settings', 'users',
    ],
    hiddenCustomerFields: [
      'roomId',
      'allergies',
      'conditions',
      'dietaryNeeds',
      'doctorName',
      'doctorPhone',
      'insuranceProvider',
      'insuranceNumber',
      'admissionDate',
      'dischargeDate',
      'billingTIN',
    ],
    visibleCustomerFeatures: ['overview', 'billing', 'custom', 'history'],
    labels: {
      customer: 'Customer',
      customerPlural: 'Customers',
      room: 'Room',
      visit: 'Appointment',
      visitPlural: 'Appointments',
    },
  },
}

/**
 * Get the preset for a business type. Falls back to nursing_home.
 */
export function getBusinessTypePreset(businessType: string | null | undefined): BusinessTypePreset {
  return BUSINESS_TYPE_PRESETS[businessType as BusinessType] || BUSINESS_TYPE_PRESETS.nursing_home
}

/**
 * Check if a module should be visible for a given business type.
 */
export function isModuleVisible(businessType: string | null | undefined, moduleId: string): boolean {
  const preset = getBusinessTypePreset(businessType)
  return preset.visibleModules.includes(moduleId)
}

/**
 * Check if a customer field should be visible for a given business type.
 */
export function isFieldVisible(businessType: string | null | undefined, fieldKey: string): boolean {
  const preset = getBusinessTypePreset(businessType)
  return !preset.hiddenCustomerFields.includes(fieldKey)
}

/**
 * Check if a customer feature tab should be visible for a given business type.
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
  return preset.labels[key] || BUSINESS_TYPE_PRESETS.nursing_home.labels[key] || key
}

/**
 * All available business types for dropdowns.
 */
export const BUSINESS_TYPES = Object.values(BUSINESS_TYPE_PRESETS)

/**
 * Preset custom field definitions for each business type.
 * When a new org is created with a business type, these fields are auto-seeded.
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
  clinic: [
    { label: 'Blood Type', type: 'SELECT', options: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] },
    { label: 'Referring Doctor', type: 'REFERENCE', referenceEntity: 'staff', targetEntity: 'resident' },
    { label: 'Chief Complaint', type: 'TEXTAREA' },
    { label: 'Known Allergies', type: 'TEXTAREA' },
    { label: 'Current Medications', type: 'TEXTAREA' },
  ],
  generic: [
    { label: 'Notes', type: 'TEXTAREA' },
    { label: 'Preferred Contact Method', type: 'SELECT', options: ['Phone', 'Email', 'SMS', 'WhatsApp'] },
    { label: 'Preferred Sales Rep', type: 'REFERENCE', referenceEntity: 'staff', targetEntity: 'resident' },
  ],
  tailor: [
    { label: 'Chest', type: 'NUMBER', unit: 'cm' },
    { label: 'Waist', type: 'NUMBER', unit: 'cm' },
    { label: 'Hip', type: 'NUMBER', unit: 'cm' },
    { label: 'Shoulder', type: 'NUMBER', unit: 'cm' },
    { label: 'Sleeve Length', type: 'NUMBER', unit: 'cm' },
    { label: 'Neck', type: 'NUMBER', unit: 'cm' },
    { label: 'Inseam', type: 'NUMBER', unit: 'cm' },
    { label: 'Fabric Preference', type: 'REFERENCE', referenceEntity: 'product', targetEntity: 'resident' },
    { label: 'Preferred Tailor', type: 'REFERENCE', referenceEntity: 'staff', targetEntity: 'resident' },
    { label: 'Fitting Date', type: 'DATE' },
    { label: 'Delivery Date', type: 'DATE' },
    { label: 'Special Instructions', type: 'TEXTAREA' },
  ],
}
