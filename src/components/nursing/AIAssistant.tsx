'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useFetch } from './api'
import {
  Sparkles, X, Send, MessageSquare,
  Stethoscope, Activity, FileText, AlertTriangle, Heart, TrendingUp, Clock, Users, ClipboardList,
  GripVertical, BookOpen, ArrowRight
} from 'lucide-react'
import { toast } from 'sonner'

interface ActionButton {
  label: string
  module?: string      // e.g. 'finance', 'residents', 'clinical'
  tab?: string         // e.g. 'invoices', 'medications', 'visits'
  dialog?: string      // e.g. 'createInvoice', 'addResident'
  filter?: string      // e.g. 'status=UNPAID'
}

interface Message {
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
  feature?: string
  fromKnowledgeBase?: boolean
  actions?: ActionButton[]   // clickable navigation buttons
}

const AI_FEATURE_ICONS: Record<string, any> = {
  CARE_SUMMARY: Heart,
  MED_INTERACTION: AlertTriangle,
  VITAL_ANALYSIS: TrendingUp,
  CLINICAL_NOTES: FileText,
  FAMILY_UPDATE: Users,
  INCIDENT_ANALYSIS: AlertTriangle,
  CARE_RECOMMENDATIONS: ClipboardList,
  SHIFT_HANDOVER: Clock,
  MAR_GENERATOR: Sparkles,
}

const QUICK_PROMPTS: Record<string, string> = {
  CARE_SUMMARY: 'Generate a daily care summary for our residents today, highlighting any concerns.',
  MED_INTERACTION: 'Check for potential drug interactions among common medications: Warfarin, Aspirin, Metformin.',
  VITAL_ANALYSIS: 'Analyze recent vital signs trends. What patterns should we be concerned about?',
  CLINICAL_NOTES: 'Help me structure a clinical note for a resident who had a fall today.',
  FAMILY_UPDATE: 'Draft a friendly weekly family update summarizing care provided this week.',
  INCIDENT_ANALYSIS: 'Analyze recent incident reports and identify any patterns or recurring issues.',
  CARE_RECOMMENDATIONS: 'Suggest care plan adjustments for an elderly resident with hypertension and diabetes.',
  SHIFT_HANDOVER: 'Generate a concise shift handover summary for the next shift.',
  MAR_GENERATOR: 'Parse the prescription from this visit note and create MAR entries.',
}

// ===== Draggable hook =====
// Persists the bubble position to localStorage so it stays where the user left it.
function useDraggablePosition() {
  const STORAGE_KEY = 'ai-bubble-position'
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const hasMoved = useRef(false)

  // Load saved position on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed && typeof parsed.x === 'number' && typeof parsed.y === 'number') {
          setPosition(parsed)
        }
      }
    } catch {}
  }, [])

  // Default position (bottom-right) if not set
  const effectiveX = position.x || (typeof window !== 'undefined' ? window.innerWidth - 70 : 0)
  const effectiveY = position.y || (typeof window !== 'undefined' ? window.innerHeight - 70 : 0)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only start drag from the grip handle area (or the button itself)
    setIsDragging(true)
    hasMoved.current = false
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: effectiveX,
      posY: effectiveY,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }, [effectiveX, effectiveY])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) hasMoved.current = true
    const newX = Math.max(0, Math.min(window.innerWidth - 56, dragStart.current.posX + dx))
    const newY = Math.max(0, Math.min(window.innerHeight - 56, dragStart.current.posY + dy))
    setPosition({ x: newX, y: newY })
  }, [isDragging])

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false)
    try { e.currentTarget.releasePointerCapture(e.pointerId) } catch {}
    // Save position
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
    } catch {}
  }, [position])

  return {
    effectiveX,
    effectiveY,
    isDragging,
    hasMoved,
    onPointerDown,
    onPointerMove,
    onPointerUp,
  }
}

/**
 * AI Assistant — floating draggable chat widget.
 *
 * Features:
 *   - Draggable bubble (position saved to localStorage)
 *   - Q&A knowledge base: checks org's preset FAQ first before calling LLM (saves tokens)
 *   - "allowDataQueries" org setting controls whether AI can access facility data
 *   - Hidden from FAMILY role users
 */
export function AIAssistant({ residentId, onNavigate }: { residentId?: string; onNavigate?: (module: string, tab?: string, dialog?: string, filter?: string) => void }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [selectedFeature, setSelectedFeature] = useState<string>('CARE_SUMMARY')
  const [loading, setLoading] = useState(false)
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Draggable position
  const drag = useDraggablePosition()

  // Fetch the org's AI config
  const orgId = currentUser?.user?.organizationId
  const userRole = currentUser?.user?.role
  const { data: aiConfigStatus, loading: configLoading } = useFetch<any>(
    orgId ? `/api/ai/config` : null
  )

  // Fetch org settings (allowDataQueries + knowledge base count)
  const { data: orgSettings } = useFetch<any>(
    orgId ? `/api/settings?facilityId=${orgId}` : null
  )

  const enabledFeatureIds = new Set<string>(aiConfigStatus?.config?.enabledFeatures || [])
  const availableFeatures = (aiConfigStatus?.availableFeatures || [])
    .filter((f: any) => enabledFeatureIds.size === 0 || enabledFeatureIds.has(f.id))
    .map((f: any) => ({
      ...f,
      icon: AI_FEATURE_ICONS[f.id] || Sparkles,
      quickPrompt: QUICK_PROMPTS[f.id] || '',
    }))
  const isAIEnabled = aiConfigStatus?.aiEnabled === true && (aiConfigStatus?.config?.active ?? false) && availableFeatures.length > 0

  // Hide from FAMILY users
  if (userRole === 'FAMILY') return null

  // Auto-scroll to bottom on new message
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, loading])

  const sendMessage = useCallback(async (text: string, feature: string) => {
    if (!text.trim() || loading) return
    const userMsg: Message = {
      role: 'user',
      content: text,
      timestamp: new Date(),
      feature,
    }
    setMessages(prev => [...prev, userMsg])
    setInput('')
    setLoading(true)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature,
          prompt: text,
          residentId: residentId || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        const errMsg: Message = {
          role: 'assistant',
          content: `⚠ ${data.error || `Request failed (HTTP ${res.status})`}`,
          timestamp: new Date(),
          feature,
        }
        setMessages(prev => [...prev, errMsg])
      } else {
        const aiMsg: Message = {
          role: 'assistant',
          content: data.content || '(empty response)',
          timestamp: new Date(),
          feature,
          fromKnowledgeBase: data.fromKnowledgeBase === true,
          actions: data.actions || undefined,
        }
        setMessages(prev => [...prev, aiMsg])
      }
    } catch (e: any) {
      const errMsg: Message = {
        role: 'assistant',
        content: `⚠ Network error: ${e.message}`,
        timestamp: new Date(),
        feature,
      }
      setMessages(prev => [...prev, errMsg])
    }
    setLoading(false)
  }, [loading, residentId])

  const handleQuickPrompt = (featureId: string) => {
    const prompt = QUICK_PROMPTS[featureId]
    if (prompt) {
      setSelectedFeature(featureId)
      setShowFeatures(false)
      sendMessage(prompt, featureId)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    sendMessage(input, selectedFeature)
  }

  const handleButtonClick = () => {
    // Only toggle if the user didn't drag
    if (!drag.hasMoved.current) {
      setOpen(o => !o)
    }
  }

  // Chat panel position: offset from the bubble position
  const panelX = Math.max(8, Math.min(drag.effectiveX - 380, (typeof window !== 'undefined' ? window.innerWidth : 400) - 400))
  const panelY = Math.max(8, drag.effectiveY - 50)

  return (
    <>
      {/* Draggable floating button */}
      <button
        onClick={handleButtonClick}
        onPointerDown={drag.onPointerDown}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        style={{
          left: `${drag.effectiveX}px`,
          top: `${drag.effectiveY}px`,
          position: 'fixed',
          touchAction: 'none',
          cursor: drag.isDragging ? 'grabbing' : 'grab',
        }}
        className="z-50 h-12 w-12 sm:h-14 sm:w-14 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-lg hover:shadow-xl transition-shadow flex items-center justify-center group select-none"
        title="AI Assistant (drag to move)"
        aria-label="Open AI Assistant"
      >
        {open ? (
          <X className="h-5 w-5 sm:h-6 sm:w-6 pointer-events-none" />
        ) : (
          <>
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 group-hover:animate-pulse pointer-events-none" />
            <span className="absolute inset-0 rounded-full bg-violet-400 opacity-30 animate-ping pointer-events-none" />
          </>
        )}
        {/* Grip indicator (visible on hover) */}
        <GripVertical className="absolute -top-1 -right-1 h-3.5 w-3.5 text-white/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </button>

      {/* Chat panel — positioned relative to the bubble */}
      {open && (
        <div
          style={{
            left: `${panelX}px`,
            top: `${panelY}px`,
            position: 'fixed',
          }}
          className="z-50 w-[calc(100vw-1rem)] sm:w-96 max-w-md max-h-[80vh] bg-background rounded-2xl shadow-2xl border border-border flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="bg-gradient-to-r from-violet-500 to-fuchsia-600 text-white p-3 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Sparkles className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">AI Assistant</div>
                <div className="text-[10px] opacity-90 truncate">
                  {configLoading
                    ? 'Loading…'
                    : isAIEnabled
                      ? `${availableFeatures.length} features available`
                      : 'Not enabled for your org'}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="h-9 w-9 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded-full flex-shrink-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Feature selector (collapsible) */}
          {isAIEnabled && (
            <div className="border-b bg-muted/30">
              <button
                onClick={() => setShowFeatures(s => !s)}
                className="w-full p-2 flex items-center justify-between text-xs hover:bg-muted/50"
              >
                <span className="font-medium text-muted-foreground">
                  Mode: <span className="text-foreground">{availableFeatures.find(f => f.id === selectedFeature)?.label || 'General'}</span>
                </span>
                {showFeatures ? <ChevronDown className="h-3 w-3" /> : <ChevronUp className="h-3 w-3" />}
              </button>
              {showFeatures && (
                <div className="p-2 grid grid-cols-2 gap-1 max-h-48 overflow-y-auto">
                  {availableFeatures.map((f: any) => (
                    <button
                      key={f.id}
                      onClick={() => { setSelectedFeature(f.id); setShowFeatures(false) }}
                      className={`flex items-center gap-1.5 p-2 rounded-lg text-xs text-left transition-colors ${
                        selectedFeature === f.id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-background hover:bg-muted/50 border'
                      }`}
                    >
                      <f.icon className="h-3.5 w-3.5 flex-shrink-0" />
                      <span className="truncate">{f.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[40vh]">
            {messages.length === 0 && (
              <div className="text-center py-6">
                {isAIEnabled ? (
                  <>
                    <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-violet-100 flex items-center justify-center">
                      <Sparkles className="h-6 w-6 text-violet-600" />
                    </div>
                    <p className="text-sm font-medium mb-1">Hi! I'm your AI Assistant</p>
                    <p className="text-xs text-muted-foreground mb-4">
                      Pick a feature above, or try a quick prompt below.
                    </p>
                    {/* Quick prompts */}
                    <div className="space-y-1.5 text-left">
                      {availableFeatures.slice(0, 4).map((f: any) => (
                        <button
                          key={f.id}
                          onClick={() => handleQuickPrompt(f.id)}
                          className="w-full p-2 rounded-lg border bg-background hover:bg-muted/50 hover:border-violet-300 transition-colors text-xs flex items-start gap-2"
                        >
                          <f.icon className="h-3.5 w-3.5 mt-0.5 text-violet-600 flex-shrink-0" />
                          <div className="min-w-0">
                            <div className="font-medium">{f.label}</div>
                            <div className="text-muted-foreground line-clamp-1">{f.quickPrompt}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-amber-100 flex items-center justify-center">
                      <MessageSquare className="h-6 w-6 text-amber-600" />
                    </div>
                    <p className="text-sm font-medium mb-1">AI is not enabled for your organization</p>
                    <p className="text-xs text-muted-foreground px-4">
                      Ask your App Developer to enable AI features in <strong>Developer → App Settings → AI</strong> and configure an API key.
                    </p>
                  </>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl p-3 text-sm whitespace-pre-wrap break-words ${
                    m.role === 'user'
                      ? 'bg-primary text-primary-foreground rounded-br-sm'
                      : m.content.startsWith('⚠')
                        ? 'bg-red-50 border border-red-200 text-red-700 rounded-bl-sm'
                        : 'bg-muted rounded-bl-sm'
                  }`}
                >
                  {m.content}
                  {/* Action buttons — clickable navigation shortcuts */}
                  {m.actions && m.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.actions.map((action, j) => (
                        <button
                          key={j}
                          onClick={() => {
                            if (onNavigate && action.module) {
                              onNavigate(action.module, action.tab, action.dialog, action.filter)
                              setOpen(false)  // close the chat panel so the user sees the destination
                            }
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-violet-100 text-violet-700 hover:bg-violet-200 text-xs font-medium border border-violet-200 transition-colors"
                        >
                          {action.label}
                          <ArrowRight className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  )}
                  <div className={`text-[10px] mt-1 ${m.role === 'user' ? 'text-primary-foreground/70' : 'text-muted-foreground'}`}>
                    {m.timestamp.toLocaleTimeString('en-MY', { hour: '2-digit', minute: '2-digit' })}
                    {m.feature && m.role === 'user' && ` • ${m.feature.replace(/_/g, ' ').toLowerCase()}`}
                    {m.fromKnowledgeBase && ` • from Q&A knowledge base (0 tokens used)`}
                  </div>
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm p-3 max-w-[85%]">
                  <div className="flex items-center gap-2">
                    <div className="flex gap-1">
                      <span className="h-2 w-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="h-2 w-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="h-2 w-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                    </div>
                    <span className="text-xs text-muted-foreground">AI is thinking…</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          {isAIEnabled && (
            <form onSubmit={handleSubmit} className="p-2 border-t flex gap-1.5 bg-background">
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder={`Ask about ${availableFeatures.find(f => f.id === selectedFeature)?.label?.toLowerCase() || 'anything'}…`}
                disabled={loading}
                className="flex-1 h-9 text-sm"
              />
              <Button
                type="submit"
                size="sm"
                disabled={!input.trim() || loading}
                className="bg-violet-600 hover:bg-violet-700 h-9 w-9 p-0"
              >
                <Send className="h-3.5 w-3.5" />
              </Button>
            </form>
          )}
        </div>
      )}
    </>
  )
}
