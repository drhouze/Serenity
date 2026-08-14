// Shared types and utilities for the nursing home app

export type Role = 'APP_DEVELOPER' | 'OWNER' | 'MANAGER' | 'NURSE' | 'CARE_STAFF' | 'RECEPTION' | 'FAMILY' | 'PHYSIO' | 'DIETITIAN' | 'DOCTOR'

export interface RoleInfo {
  id: Role
  label: string
  description: string
}

export const ROLES: RoleInfo[] = [
  { id: 'APP_DEVELOPER', label: 'App Developer', description: 'Highest authority — full system access including Developer tools' },
  { id: 'OWNER', label: 'Org Owner', description: 'Full access to all modules and settings (subscription owner)' },
  { id: 'MANAGER', label: 'Manager', description: 'All operations, staff & finance, limited settings access' },
  { id: 'NURSE', label: 'Nurse', description: 'Resident care, meds, vitals, visits, incidents' },
  { id: 'CARE_STAFF', label: 'Care Staff', description: 'Daily care logs, vitals, med assistance' },
  { id: 'RECEPTION', label: 'Reception', description: 'Residents overview, family messages, visits' },
  { id: 'FAMILY', label: 'Family', description: 'View loved one status, send messages' },
  { id: 'DOCTOR', label: 'Doctor', description: 'Resident medical records, visits, prescriptions' },
  { id: 'PHYSIO', label: 'Physiotherapist', description: 'Scheduled physio visits, mobility notes' },
  { id: 'DIETITIAN', label: 'Dietitian', description: 'Dietary needs, assessments, visits' },
]

// Modules each role can access
// 'profile' is accessible to ALL roles (self-service profile + password change)
export const ROLE_MODULES: Record<Role, string[]> = {
  APP_DEVELOPER: ['dashboard', 'residents', 'rooms', 'staff', 'clinical', 'incidents', 'finance', 'messages', 'users', 'products', 'inventory', 'audit', 'rounds', 'settings', 'profile', 'developer'],
  OWNER: ['dashboard', 'residents', 'rooms', 'staff', 'clinical', 'incidents', 'finance', 'messages', 'users', 'products', 'inventory', 'audit', 'rounds', 'settings', 'profile'],
  MANAGER: ['dashboard', 'residents', 'rooms', 'staff', 'clinical', 'incidents', 'finance', 'messages', 'users', 'products', 'inventory', 'audit', 'rounds', 'settings', 'profile'],
  NURSE: ['dashboard', 'residents', 'clinical', 'incidents', 'messages', 'inventory', 'rounds', 'profile'],
  CARE_STAFF: ['dashboard', 'residents', 'clinical', 'incidents', 'inventory', 'rounds', 'profile'],
  RECEPTION: ['dashboard', 'residents', 'rooms', 'clinical', 'messages', 'profile'],
  FAMILY: ['dashboard', 'residents', 'messages', 'profile'],
  DOCTOR: ['dashboard', 'residents', 'clinical', 'incidents', 'profile'],
  PHYSIO: ['dashboard', 'residents', 'clinical', 'profile'],
  DIETITIAN: ['dashboard', 'residents', 'clinical', 'profile'],
}

// Default level for each role (0 = highest, 5 = lowest)
// Level 0 (App Developer) can see and manage ALL users.
// Level 1 (Org Owner) can see users at level 1+ but NOT App Developer.
// Level 2 (Manager) can see users at level 2+ but NOT Owner or Developer.
export const ROLE_LEVELS: Record<Role, number> = {
  APP_DEVELOPER: 0,
  OWNER: 1,
  MANAGER: 2,
  DOCTOR: 3,
  NURSE: 3,
  PHYSIO: 3,
  DIETITIAN: 3,
  CARE_STAFF: 4,
  RECEPTION: 4,
  FAMILY: 5,
}

export const LEVEL_LABELS: Record<number, string> = {
  0: 'Level 0 — App Developer',
  1: 'Level 1 — Org Owner',
  2: 'Level 2 — Manager',
  3: 'Level 3 — Clinical',
  4: 'Level 4 — Support',
  5: 'Level 5 — Family',
}

export function fmtDate(d: string | Date | null | undefined, opts?: Intl.DateTimeFormatOptions): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleDateString('en-US', opts || { year: 'numeric', month: 'short', day: 'numeric' })
}

export function fmtDateTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function fmtTime(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

export function fmtMoney(n: number | null | undefined): string {
  if (n == null) return 'RM 0.00'
  return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR', maximumFractionDigits: 2 }).format(n)
}

export function age(dob: string | Date | null | undefined): number | null {
  if (!dob) return null
  const d = typeof dob === 'string' ? new Date(dob) : dob
  const diff = Date.now() - d.getTime()
  return Math.floor(diff / (365.25 * 86400000))
}

export function initials(first?: string, last?: string): string {
  return ((first?.[0] || '') + (last?.[0] || '')).toUpperCase() || '?'
}
