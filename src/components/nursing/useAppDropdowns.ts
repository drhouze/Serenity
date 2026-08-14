'use client'

import { useState, useEffect } from 'react'

export interface AppDropdowns {
  // Medication-related
  medFrequencies: string[]
  medRoutes: string[]
  medPrescribers: string[]
  medDurations: string[]
  // Rooms
  roomTypes: string[]
  roomStatuses: string[]
  // Products & billing
  productCategories: string[]
  productUnits: string[]
  expenseCategories: string[]
  // Inventory
  inventoryCategories: string[]
  inventoryUnits: string[]
  // Care
  visitTypes: string[]
  incidentTypes: string[]
  incidentSeverities: string[]
  careLogCategories: string[]
  // Staff
  leaveTypes: string[]
  shiftTypes: { type: string; start: string; end: string }[]
  staffRoles: string[]
  // Finance / Accounting
  paymentMethods: string[]
  paymentStatuses: string[]
  invoiceStatuses: string[]
  bankAccountTypes: string[]
  depositTypes: string[]
  // Resident / clinical
  residentStatuses: { id: string; label: string; desc: string }[]
  dietaryNeeds: string[]
  // Loading state
  loading: boolean
}

// Fallback defaults (mirror the API's DEFAULTS so the UI works even before fetch completes)
const FALLBACKS: Omit<AppDropdowns, 'loading'> = {
  medFrequencies: ['Once daily', 'Twice daily', 'Three times daily', 'Once daily at bedtime', 'PRN every 4 hours', 'As needed'],
  medRoutes: ['Oral Tablet', 'Oral Syrup', 'Crushed Tablet', 'Subcutaneous', 'IV', 'Topical', 'Inhalation', 'Rectal', 'Other'],
  medPrescribers: [],
  medDurations: ['Ongoing', '7 days', '14 days', '30 days', '60 days', '90 days', '6 months', '1 year'],
  roomTypes: ['PRIVATE', 'SEMI_PRIVATE', 'WARD'],
  roomStatuses: ['AVAILABLE', 'OCCUPIED', 'MAINTENANCE'],
  productCategories: ['ROOM', 'CARE', 'MEDICATION', 'THERAPY', 'SUPPLIES', 'FOOD', 'OTHER'],
  productUnits: ['each', 'day', 'session', 'month', 'hour'],
  expenseCategories: ['SALARY', 'SUPPLIES', 'FOOD', 'UTILITIES', 'MAINTENANCE', 'EQUIPMENT', 'OTHER'],
  inventoryCategories: ['MEDICAL', 'FOOD', 'CLEANING', 'OFFICE', 'OTHER'],
  inventoryUnits: ['each', 'box', 'pack', 'bottle', 'kg', 'L', 'roll'],
  visitTypes: ['DOCTOR', 'PHYSIO', 'DIETITIAN', 'NURSE_ASSESSMENT', 'OTHER'],
  incidentTypes: ['FALL', 'MEDICATION_ERROR', 'BEHAVIOR', 'INJURY', 'OTHER'],
  incidentSeverities: ['LOW', 'MODERATE', 'HIGH', 'CRITICAL'],
  careLogCategories: ['HYGIENE', 'MEALS', 'MOBILITY', 'TOILETING', 'BEHAVIOR', 'OTHER'],
  leaveTypes: ['ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'OTHER'],
  shiftTypes: [
    { type: 'DAY', start: '07:00', end: '15:00' },
    { type: 'EVENING', start: '15:00', end: '23:00' },
    { type: 'NIGHT', start: '23:00', end: '07:00' },
  ],
  staffRoles: ['NURSE', 'CARE_STAFF', 'DOCTOR', 'PHYSIO', 'DIETITIAN', 'RECEPTION'],
  paymentMethods: ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'INSURANCE', 'ONLINE', 'OTHER'],
  paymentStatuses: ['PENDING', 'CLEARED', 'BOUNCED', 'REFUNDED'],
  invoiceStatuses: ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED'],
  bankAccountTypes: ['BANK', 'CASH', 'SAVINGS'],
  depositTypes: ['ADMISSION', 'SECURITY', 'ADVANCE', 'OTHER'],
  residentStatuses: [
    { id: 'ACTIVE', label: 'Active', desc: 'Resident is currently in the facility' },
    { id: 'HOSPITALIZED', label: 'Hospitalized', desc: 'Resident admitted to hospital' },
    { id: 'OUT_WITH_FAMILY', label: 'Out with Family', desc: 'Resident taken out by family' },
    { id: 'DISCHARGED', label: 'Discharged', desc: 'Resident permanently discharged' },
    { id: 'DECEASED', label: 'Deceased', desc: 'Resident has passed away' },
  ],
  dietaryNeeds: ['Regular', 'Low Sodium', 'Diabetic', 'Soft', 'Pureed', 'Vegetarian', 'High Protein', 'Renal'],
}

/**
 * Fetches ALL facility-scoped dropdown settings in a single request.
 * Used by every component that renders a dropdown (rooms, finance, inventory, residents, staff, etc.)
 * so dropdown options are always consistent with what's configured in Settings.
 */
export function useAppDropdowns(facilityId?: string): AppDropdowns {
  const [data, setData] = useState<AppDropdowns>({ ...FALLBACKS, loading: true })

  useEffect(() => {
    let cancelled = false
    const url = facilityId
      ? `/api/settings?facilityId=${encodeURIComponent(facilityId)}`
      : '/api/settings'
    fetch(url)
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const s = await r.json()
        if (!cancelled) {
          setData({
            medFrequencies: s.medFrequencies || FALLBACKS.medFrequencies,
            medRoutes: s.medRoutes || FALLBACKS.medRoutes,
            medPrescribers: s.medPrescribers || FALLBACKS.medPrescribers,
            medDurations: s.medDurations || FALLBACKS.medDurations,
            roomTypes: s.roomTypes || FALLBACKS.roomTypes,
            roomStatuses: s.roomStatuses || FALLBACKS.roomStatuses,
            productCategories: s.productCategories || FALLBACKS.productCategories,
            productUnits: s.productUnits || FALLBACKS.productUnits,
            expenseCategories: s.expenseCategories || FALLBACKS.expenseCategories,
            inventoryCategories: s.inventoryCategories || FALLBACKS.inventoryCategories,
            inventoryUnits: s.inventoryUnits || FALLBACKS.inventoryUnits,
            visitTypes: s.visitTypes || FALLBACKS.visitTypes,
            incidentTypes: s.incidentTypes || FALLBACKS.incidentTypes,
            incidentSeverities: s.incidentSeverities || FALLBACKS.incidentSeverities,
            careLogCategories: s.careLogCategories || FALLBACKS.careLogCategories,
            leaveTypes: s.leaveTypes || FALLBACKS.leaveTypes,
            shiftTypes: s.shiftTypes || FALLBACKS.shiftTypes,
            staffRoles: s.staffRoles || FALLBACKS.staffRoles,
            paymentMethods: s.paymentMethods || FALLBACKS.paymentMethods,
            paymentStatuses: s.paymentStatuses || FALLBACKS.paymentStatuses,
            invoiceStatuses: s.invoiceStatuses || FALLBACKS.invoiceStatuses,
            bankAccountTypes: s.bankAccountTypes || FALLBACKS.bankAccountTypes,
            depositTypes: s.depositTypes || FALLBACKS.depositTypes,
            residentStatuses: s.residentStatuses || FALLBACKS.residentStatuses,
            dietaryNeeds: s.dietaryNeeds || FALLBACKS.dietaryNeeds,
            loading: false,
          })
        }
      })
      .catch(() => {
        if (!cancelled) setData(prev => ({ ...prev, loading: false }))
      })
    return () => { cancelled = true }
  }, [facilityId])

  return data
}

// Re-export the med-only hook for backward compat with AddMedicationDialog
export function useMedSettings(facilityId?: string) {
  const all = useAppDropdowns(facilityId)
  return {
    frequencies: all.medFrequencies,
    routes: all.medRoutes,
    prescribers: all.medPrescribers,
    loading: all.loading,
    error: null,
  }
}
