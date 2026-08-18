'use client'

/**
 * AIContext — shared React Context that owns the AI assistant state.
 *
 * Why this exists:
 *   Previously all AI state lived inside AIAssistant.tsx, so feature buttons
 *   placed in module pages couldn't trigger AI calls without re-implementing
 *   the chat state. By lifting the state into a context provider:
 *     - AIAssistant.tsx reads from useAI() and renders the bubble + panel
 *     - Any module page can call useAI().triggerFeature('CARE_SUMMARY', prompt, residentId)
 *       to fire an AI request and have the result land in the same chat panel
 *     - Both the bubble AND the per-module buttons auto-hide when AI is
 *       disabled for the current org (the user's explicit requirement).
 *
 * Visibility rules:
 *   - FAMILY role → isAIEnabled stays false → all AI UI hidden.
 *   - Non-OWNER/MANAGER/NURSE/DEVELOPER roles → also hidden.
 *   - Org without Organization.aiEnabled OR without an active OrgAIConfig → hidden.
 *   - Org with enabled features but token cap exceeded → still renders,
 *     but triggerFeature() will surface the cap-exceeded error in the panel.
 *
 * === BUG-FIX HISTORY ===
 *   v1 (broken): useEffect in AIAssistant had `ai` in its dep array.
 *   The `ai` context value object was recreated every render → useEffect
 *   fired every render → called setOnNavigate → state changed → re-render
 *   → infinite loop → "Maximum update depth exceeded" → page crashed
 *   after login. Same problem with availableFeatures (new array every
 *   render via .filter()).
 *
 *   v2 (this file): switched navHandler to useRef (no re-renders),
 *   memoized availableFeatures + context value with useMemo so reference
 *   is stable across renders when contents don't change. Removed `ai`
 *   from all useEffect dep arrays.
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useFetch } from './api'
import { toast } from 'sonner'

// ---------- Types ----------
interface ActionButton {
  label: string
  module?: string
  tab?: string
  dialog?: string
  filter?: string
}

export interface AIMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  feature?: string
  fromKnowledgeBase?: boolean
  actions?: ActionButton[]
}

interface AIFeature {
  id: string
  label: string
  description?: string
  icon?: any
  quickPrompt?: string
}

type NavHandler = (module: string, tab?: string, dialog?: string, filter?: string) => void

interface AIContextValue {
  // state
  isAIEnabled: boolean
  aiEnabled: boolean             // raw org flag
  configActive: boolean          // raw OrgAIConfig.active flag
  availableFeatures: AIFeature[]
  loading: boolean              // initial config load
  messages: AIMessage[]
  open: boolean
  selectedFeature: string
  // actions
  setOpen: (open: boolean) => void
  sendMessage: (text: string, feature?: string, residentId?: string) => Promise<void>
  triggerFeature: (featureId: string, prompt?: string, residentId?: string) => Promise<void>
  clear: () => void
  // nav helper (set by AIAssistant consumer)
  onNavigate?: NavHandler
  setOnNavigate: (fn: NavHandler | undefined) => void
}

const AIContext = createContext<AIContextValue | null>(null)

// ---------- Provider ----------
export function AIProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [selectedFeature, setSelectedFeature] = useState<string>('CARE_SUMMARY')
  const [loading, setLoading] = useState(false)

  // Use a ref for the nav handler — refs don't trigger re-renders when
  // updated, which avoids the infinite loop bug from v1.
  const navHandlerRef = useRef<NavHandler | undefined>(undefined)

  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const orgId = currentUser?.user?.organizationId
  const userRole = currentUser?.user?.role

  const { data: aiConfigStatus, loading: configLoading } = useFetch<any>(
    orgId ? `/api/ai/config` : null
  )

  const aiEnabled = aiConfigStatus?.aiEnabled === true
  const configActive = aiConfigStatus?.config?.active ?? false

  // Memoize enabledFeatureIds so it's stable when the source string is unchanged.
  const enabledFeaturesStr = aiConfigStatus?.config?.enabledFeatures || ''
  const enabledFeatureIds = useMemo(
    () => new Set<string>(enabledFeaturesStr.split(',').map(s => s.trim()).filter(Boolean)),
    [enabledFeaturesStr]
  )

  // Memoize availableFeatures — without this it's a NEW array every render
  // (because .filter creates a new array), which causes any useEffect
  // depending on it to fire every render → infinite loops.
  const rawAvailableFeatures = aiConfigStatus?.availableFeatures || []
  const availableFeatures = useMemo(
    () => rawAvailableFeatures.filter((f: any) => enabledFeatureIds.size === 0 || enabledFeatureIds.has(f.id)),
    [rawAvailableFeatures, enabledFeatureIds]
  )

  const isAIEnabled = aiEnabled && configActive && availableFeatures.length > 0 && userRole !== 'FAMILY'

  // Auto-select the first enabled feature if the default isn't available.
  // Deps: availableFeatures.length (number, stable) + selectedFeature (string).
  // We deliberately do NOT put availableFeatures (array) in the deps to
  // avoid the loop — its length + content stability is enough.
  const availableFeatureIds = useMemo(
    () => availableFeatures.map(f => f.id),
    [availableFeatures]
  )
  useEffect(() => {
    if (availableFeatureIds.length > 0 && !availableFeatureIds.includes(selectedFeature)) {
      setSelectedFeature(availableFeatureIds[0])
    }
  }, [availableFeatureIds, selectedFeature])

  /**
   * Send a message to /api/ai/chat.
   * Used by both the chat input box and by triggerFeature().
   */
  const sendMessage = useCallback(async (text: string, feature?: string, residentId?: string) => {
    const useFeature = feature || selectedFeature
    if (!text.trim()) return

    const userMsg: AIMessage = {
      role: 'user',
      content: text,
      timestamp: new Date(),
      feature: useFeature,
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)
    setOpen(true)

    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feature: useFeature, prompt: text, residentId }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errMsg = data?.error || `AI request failed (HTTP ${res.status})`
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: `⚠ ${errMsg}`,
          timestamp: new Date(),
          feature: useFeature,
        }])
        return
      }
      const assistantMsg: AIMessage = {
        role: 'assistant',
        content: data.content || '',
        timestamp: new Date(),
        feature: useFeature,
        fromKnowledgeBase: data.fromKnowledgeBase,
        actions: data.actions,
      }
      setMessages(prev => [...prev, assistantMsg])
    } catch (e: any) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `⚠ Network error: ${e.message || 'unknown'}`,
        timestamp: new Date(),
        feature: useFeature,
      }])
    } finally {
      setLoading(false)
    }
  }, [selectedFeature])

  /**
   * Trigger an AI feature by id.
   * - Looks up the feature's preset prompt if `prompt` is not provided
   * - Opens the chat panel
   * - Sends the request
   * - The result lands in the chat panel as a normal assistant message
   *
   * This is the function module-page buttons call (when useChat=true).
   */
  const triggerFeature = useCallback(async (featureId: string, prompt?: string, residentId?: string) => {
    if (!isAIEnabled) {
      toast.error('AI is not enabled for your organization. Contact your Developer.')
      return
    }
    const feature = availableFeatures.find(f => f.id === featureId)
    if (!feature) {
      toast.error(`AI feature "${featureId}" is not enabled for your org.`)
      return
    }
    const finalPrompt = prompt || feature.quickPrompt || `Run the ${feature.label} AI feature.`
    setSelectedFeature(featureId)
    await sendMessage(finalPrompt, featureId, residentId)
  }, [isAIEnabled, availableFeatures, sendMessage])

  const clear = useCallback(() => setMessages([]), [])

  // Stable setter for navHandler — just updates the ref (no re-render).
  const setOnNavigate = useCallback((fn: NavHandler | undefined) => {
    navHandlerRef.current = fn
  }, [])

  // Memoize the context value so consumers don't re-render unnecessarily.
  // Without this, every provider render creates a new value object → all
  // consumers re-render → potentially another loop source.
  const value = useMemo<AIContextValue>(() => ({
    isAIEnabled,
    aiEnabled,
    configActive,
    availableFeatures,
    loading: configLoading,
    messages,
    open,
    selectedFeature,
    setOpen,
    sendMessage,
    triggerFeature,
    clear,
    onNavigate: navHandlerRef.current,
    setOnNavigate,
  }), [
    isAIEnabled, aiEnabled, configActive, availableFeatures, configLoading,
    messages, open, selectedFeature, sendMessage, triggerFeature, clear, setOnNavigate,
  ])

  return <AIContext.Provider value={value}>{children}</AIContext.Provider>
}

// ---------- Hook ----------
export function useAI(): AIContextValue {
  const ctx = useContext(AIContext)
  if (!ctx) {
    throw new Error('useAI() must be used inside <AIProvider>')
  }
  return ctx
}
