'use client'

import { useState, useEffect } from 'react'

export interface MedSettings {
  frequencies: string[]
  routes: string[]
  prescribers: string[]
  loading: boolean
  error: string | null
}

const FALLBACK_FREQS = [
  'Once daily', 'Twice daily', 'Three times daily', 'Once daily at bedtime',
  'PRN every 4 hours', 'PRN every 6 hours', 'As needed',
]
const FALLBACK_ROUTES = ['Oral Tablet', 'Oral Syrup', 'Crushed Tablet', 'Subcutaneous', 'IV', 'Topical', 'Inhalation', 'Rectal', 'Other']
const FALLBACK_PRESCRIBERS: string[] = []

/**
 * Fetches facility-scoped medication settings (frequencies, routes, prescribers).
 * Used by Add Medication dialog and any other component that needs the dropdowns.
 */
export function useMedSettings(facilityId?: string): MedSettings {
  const [data, setData] = useState<MedSettings>({
    frequencies: FALLBACK_FREQS,
    routes: FALLBACK_ROUTES,
    prescribers: FALLBACK_PRESCRIBERS,
    loading: true,
    error: null,
  })

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
            frequencies: s.medFrequencies || FALLBACK_FREQS,
            routes: s.medRoutes || FALLBACK_ROUTES,
            prescribers: s.medPrescribers || FALLBACK_PRESCRIBERS,
            loading: false,
            error: null,
          })
        }
      })
      .catch(e => {
        if (!cancelled) {
          setData(prev => ({ ...prev, loading: false, error: e.message || 'Failed to load settings' }))
        }
      })
    return () => { cancelled = true }
  }, [facilityId])

  return data
}
