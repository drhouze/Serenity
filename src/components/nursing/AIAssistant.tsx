'use client'

/**
 * AI Assistant — floating draggable chat bubble + chat panel.
 *
 * REFACTORED: All AI state (messages, open, selectedFeature, loading,
 * isAIEnabled, availableFeatures) now lives in AIContext (src/components/
 * nursing/AIContext.tsx). This lets per-module "AI feature buttons"
 * call useAI().triggerFeature(...) and have the result land in the same
 * chat panel — they no longer need to live inside this component.
 *
 * Visibility rule (per user requirement):
 *   - The ENTIRE bubble + panel returns null when AI is disabled for the
 *     current org. Previously the bubble still rendered with a "Not enabled"
 *     hint — now it doesn't render at all.
 *   - Per-module buttons (in AIFeatureButton.tsx) ALSO auto-hide when AI
 *     is disabled, because they call useAI() and check isAIEnabled.
 *
 * The `residentId` prop is preserved for backwards compat (used to scope
 * chat requests to a resident when this bubble is rendered inside a
 * resident detail page). For module-level buttons, pass residentId
 * explicitly to triggerFeature(featureId, prompt, residentId).
 */

import { useState, useRef, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useFetch } from './api'
import { useAI } from './AIContext'
import {
  Sparkles, X, Send, MessageSquare,
  Stethoscope, Activity, FileText, AlertTriangle, Heart, TrendingUp, Clock, Users, ClipboardList,
  DollarSign,
  GripVertical, BookOpen, ArrowRight
} from 'lucide-react'

// ===== Feature icon + quick-prompt maps (shared by AIFeatureButton.tsx too) =====
// These map a feature id (CARE_SUMMARY, MED_INTERACTION, etc.) to a lucide
// icon and a default prompt. AIFeatureButton imports these so a single
// `<AIFeatureButton feature="VITAL_ANALYSIS" residentId="..." />` is enough
// to render a properly-labeled button that fires the right prompt.
export const AI_FEATURE_ICONS: Record<string, any> = {
  CARE_SUMMARY: Heart,
  MED_INTERACTION: AlertTriangle,
  VITAL_ANALYSIS: TrendingUp,
  CLINICAL_NOTES: FileText,
  FAMILY_UPDATE: Users,
  INCIDENT_ANALYSIS: AlertTriangle,
  CARE_RECOMMENDATIONS: ClipboardList,
  SHIFT_HANDOVER: Clock,
  MAR_GENERATOR: Sparkles,
  FINANCE_ANALYSIS: DollarSign,
}

export const AI_FEATURE_LABELS: Record<string, string> = {
  CARE_SUMMARY: 'Care Summary',
  MED_INTERACTION: 'Med Interactions',
  VITAL_ANALYSIS: 'Vital Trends',
  CLINICAL_NOTES: 'SOAP Notes',
  FAMILY_UPDATE: 'Family Update',
  INCIDENT_ANALYSIS: 'Incident Patterns',
  CARE_RECOMMENDATIONS: 'Care Plan',
  SHIFT_HANDOVER: 'Shift Handover',
  MAR_GENERATOR: 'Generate MAR',
  FINANCE_ANALYSIS: 'Analyse Accounts',
}

export const QUICK_PROMPTS: Record<string, string> = {
  CARE_SUMMARY: 'Generate a daily care summary for our residents today, highlighting any concerns.',
  MED_INTERACTION: 'Check for potential drug interactions among common medications: Warfarin, Aspirin, Metformin.',
  VITAL_ANALYSIS: 'Analyze recent vital signs trends. What patterns should we be concerned about?',
  CLINICAL_NOTES: 'Help me structure a clinical note for a resident who had a fall today.',
  FAMILY_UPDATE: 'Draft a friendly weekly family update summarizing care provided this week.',
  INCIDENT_ANALYSIS: 'Analyze recent incident reports and identify any patterns or recurring issues.',
  CARE_RECOMMENDATIONS: 'Suggest care plan adjustments for an elderly resident with hypertension and diabetes.',
  SHIFT_HANDOVER: 'Generate a concise shift handover summary for the next shift.',
  MAR_GENERATOR: 'Parse the prescription from this visit note and create MAR entries.',
  FINANCE_ANALYSIS: 'Analyse our accounts: total billed, collected, outstanding, unbilled, expenses, net income, overdue invoices, and top expense categories. Then suggest concrete next-step actions to improve cash flow and reduce overdue invoices.',
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

  const effectiveX = position.x || (typeof window !== 'undefined' ? window.innerWidth - 70 : 0)
  const effectiveY = position.y || (typeof window !== 'undefined' ? window.innerHeight - 70 : 0)

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    setIsDragging(true)
    hasMoved.current = false
    dragStart.current = { x: e.clientX, y: e.clientY, posX: effectiveX, posY: effectiveY }
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
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
    } catch {}
  }, [position])

  return { effectiveX, effectiveY, isDragging, hasMoved, onPointerDown, onPointerMove, onPointerUp }
}

/**
 * AI Assistant — floating draggable chat widget.
 * Reads all state from AIContext. Returns null when AI is disabled.
 */
export function AIAssistant({
  residentId,
  onNavigate,
}: {
  residentId?: string
  onNavigate?: (module: string, tab?: string, dialog?: string, filter?: string) => void
}) {
  const [input, setInput] = useState('')
  const ai = useAI()
  const drag = useDraggablePosition()

  // Wire the parent's onNavigate handler into the context so any
  // navigation action chip rendered inside the chat panel can call it.
  useEffect(() => {
    if (onNavigate) {
      ai.setOnNavigate(onNavigate)
    }
  }, [onNavigate, ai])

  // === Hide the bubble entirely when AI is disabled for this org ===
  // (User requirement: "AI chat and AI buttons are viewable only if AI enabled")
  if (!ai.isAIEnabled) return null

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim()) return
    ai.sendMessage(input, ai.selectedFeature, residentId)
    setInput('')
  }

  const handleButtonClick = () => {
    if (!drag.hasMoved.current) ai.setOpen(!ai.open)
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
        {ai.open ? (
          <X className="h-5 w-5 sm:h-6 sm:w-6 pointer-events-none" />
        ) : (
          <>
            <Sparkles className="h-5 w-5 sm:h-6 sm:w-6 group-hover:animate-pulse pointer-events-none" />
            <span className="absolute inset-0 rounded-full bg-violet-400 opacity-30 animate-ping pointer-events-none" />
          </>
        )}
        <GripVertical className="absolute -top-1 -right-1 h-3.5 w-3.5 text-white/40 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
      </button>

      {/* Chat panel — positioned relative to the bubble */}
      {ai.open && (
        <div
          style={{ left: `${panelX}px`, top: `${panelY}px`, position: 'fixed' }}
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
                <div className="text-[10px] opacity-90 truncate">Ask me anything about your facility</div>
              </div>
            </div>
            <button
              onClick={() => ai.setOpen(false)}
              className="h-9 w-9 flex items-center justify-center text-white/80 hover:text-white hover:bg-white/10 rounded-full flex-shrink-0"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[40vh]">
            {ai.messages.length === 0 && (
              <div className="text-center py-6">
                <div className="h-12 w-12 mx-auto mb-3 rounded-full bg-violet-100 flex items-center justify-center">
                  <Sparkles className="h-6 w-6 text-violet-600" />
                </div>
                <p className="text-sm font-medium mb-1">Hi! I'm your AI Assistant</p>
                <p className="text-xs text-muted-foreground mb-4">
                  Ask me about residents, medications, vitals, invoices, or how to use the app.
                </p>
                <div className="text-[10px] text-muted-foreground">
                  Tip: use the AI buttons in each module for one-click actions (Care Summary, Vital Trends, etc.)
                </div>
              </div>
            )}

            {ai.messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
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
                  {m.actions && m.actions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {m.actions.map((action, j) => (
                        <button
                          key={j}
                          onClick={() => {
                            if (ai.onNavigate && action.module) {
                              ai.onNavigate(action.module, action.tab, action.dialog, action.filter)
                              ai.setOpen(false)
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

            {ai.loading && (
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
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-2 border-t flex gap-1.5 bg-background">
            <Input
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Ask me anything…"
              disabled={ai.loading}
              className="flex-1 h-9 text-sm"
            />
            <Button
              type="submit"
              size="sm"
              disabled={!input.trim() || ai.loading}
              className="bg-violet-600 hover:bg-violet-700 h-9 w-9 p-0"
            >
              <Send className="h-3.5 w-3.5" />
            </Button>
          </form>
        </div>
      )}
    </>
  )
}
