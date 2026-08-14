'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// Global data version — incremented when the database is restored.
// All useFetch hooks include this in their URL as a cache-buster,
// so when it changes, all components re-fetch fresh data.
let globalDataVersion = 0
const listeners = new Set<() => void>()

export function bumpDataVersion() {
  globalDataVersion++
  // Notify all listeners to re-fetch
  listeners.forEach(fn => fn())
}

export function getDataVersion() {
  return globalDataVersion
}

interface FetchState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

interface UseFetchOptions {
  /**
   * If provided, re-fetches the data every `refreshInterval` milliseconds.
   * This is essential for multi-user apps so that changes made by one user
   * (e.g. adding a medication, marking a task done) are visible to other
   * users within a few seconds without requiring a manual page refresh.
   *
   * Default: 0 (no auto-refresh). Set to e.g. 30000 for a 30-second poll.
   */
  refreshInterval?: number
}

/**
 * useFetch — fetches JSON from an API URL with cache-busting, error handling,
 * and optional periodic refresh for multi-user data synchronization.
 *
 * @param url - The API URL to fetch, or null to skip fetching
 * @param options.refreshInterval - Re-fetch every N ms (for multi-user sync)
 */
export function useFetch<T>(url: string | null, options?: UseFetchOptions): FetchState<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState<boolean>(!!url)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const [version, setVersion] = useState(globalDataVersion)
  const refreshInterval = options?.refreshInterval ?? 0

  // Listen for global data version changes (e.g. after database restore)
  useEffect(() => {
    const listener = () => {
      setVersion(globalDataVersion)
      setTick(t => t + 1) // Force re-fetch
    }
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }, [])

  useEffect(() => {
    if (!url) return
    let cancelled = false
    setLoading(true)
    setError(null)
    // Cache-busting: no-store header + timestamp + global version
    const sep = url.includes('?') ? '&' : '?'
    const cacheBustUrl = `${url}${sep}_t=${Date.now()}&_v=${version}`
    fetch(cacheBustUrl, { cache: 'no-store' })
      .then(async r => {
        if (!r.ok) {
          // If unauthorized, the session may have been lost after a DB restore.
          // Log the error so it's visible in the console.
          console.error(`[useFetch] ${r.status} for ${url}`)
          throw new Error(`HTTP ${r.status}`)
        }
        const json = await r.json()
        if (!cancelled) {
          setData(json)
          setLoading(false)
        }
      })
      .catch(e => {
        if (!cancelled) {
          console.error(`[useFetch] Error for ${url}:`, e.message)
          setError(e.message || 'Failed to load')
          setLoading(false)
        }
      })
    return () => { cancelled = true }
  }, [url, tick, version])

  // Periodic refresh — re-fetches every `refreshInterval` ms so that changes
  // made by OTHER users show up without requiring a manual page refresh.
  // The first fetch (above) is immediate; this only sets up the interval.
  // Uses a ref to avoid stale closure issues.
  const urlRef = useRef(url)
  urlRef.current = url
  useEffect(() => {
    if (!refreshInterval || refreshInterval < 1000) return
    const id = setInterval(() => {
      if (urlRef.current) {
        setTick(t => t + 1)
      }
    }, refreshInterval)
    return () => clearInterval(id)
  }, [refreshInterval])

  const refetch = useCallback(() => setTick(t => t + 1), [])
  return { data, loading, error, refetch }
}

export async function apiPost<T = any>(url: string, body: any): Promise<T> {
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${r.status}`)
  }
  return r.json()
}

// Helper: build a POST URL with facilityId query param
// Usage: apiPostFacility('/api/data?type=invoices', payload, facilityId)
export function withFacility(url: string, facilityId?: string): string {
  if (!facilityId) return url
  return url + (url.includes('?') ? '&' : '?') + `facilityId=${facilityId}`
}

export async function apiPatch<T = any>(url: string, body: any): Promise<T> {
  const r = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${r.status}`)
  }
  return r.json()
}

export async function apiDelete<T = any>(url: string): Promise<T> {
  const r = await fetch(url, { method: 'DELETE' })
  if (!r.ok) {
    const err = await r.json().catch(() => ({}))
    throw new Error(err.error || `HTTP ${r.status}`)
  }
  return r.json()
}
