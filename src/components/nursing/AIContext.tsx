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
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react'
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
  onNavigate?: (module: string, tab?: string, dialog?: string, filter?: string) => void
  setOnNavigate: (fn: AIContextValue['onNavigate']) => void
}

const AIContext = createContext<AIContextValue | null>(null)

// ---------- Provider ----------
export function AIProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<AIMessage[]>([])
  const [selectedFeature, setSelectedFeature] = useState<string>('CARE_SUMMARY')
  const [loading, setLoading] = useState(false)
  const [navHandler, setNavHandler] = useState<AIContextValue['onNavigate']>()

  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const orgId = currentUser?.user?.organizationId
  const userRole = currentUser?.user?.role

  const { data: aiConfigStatus, loading: configLoading } = useFetch<any>(
    orgId ? `/api/ai/config` : null
  )

  const enabledFeatureIds = new Set<string>(aiConfigStatus?.config?.enabledFeatures || [])
  const availableFeatures: AIFeature[] = (aiConfigStatus?.availableFeatures || [])
    .filter((f: any) => enabledFeatureIds.size === 0 || enabledFeatureIds.has(f.id))

  const aiEnabled = aiConfigStatus?.aiEnabled === true
  const configActive = aiConfigStatus?.config?.active ?? false
  const isAIEnabled = aiEnabled && configActive && availableFeatures.length > 0 && userRole !== 'FAMILY'

  // Auto-select the first enabled feature if the default isn't available
  useEffect(() => {
    if (availableFeatures.length > 0 && !availableFeatures.find(f => f.id === selectedFeature)) {
      setSelectedFeature(availableFeatures[0].id)
    }
  }, [availableFeatures, selectedFeature])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading])

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
   * This is the function module-page buttons call.
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

  const value: AIContextValue = {
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
    onNavigate: navHandler,
    setOnNavigate: setNavHandler,
  }

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
