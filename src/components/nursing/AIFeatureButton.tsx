'use client'

/**
 * AIFeatureButton — a self-contained button that triggers an AI feature
 * and shows the result INLINE, directly below the button.
 *
 * === DESIGN CHANGE (per user request) ===
 * Previously this button routed its result into the floating AI chat panel
 * (via useAI().triggerFeature()). The user explicitly said:
 *   "No not to have unified output. want the ai button to carry out task
 *    eg. analyse the accounts now, and suggest for next step"
 *
 * So now: each button calls /api/ai/chat directly, holds its own local
 * state (loading, result, error), and renders the result in an inline
 * card below the button. The chat bubble is NOT touched — it still works
 * independently for free-text Q&A.
 *
 * Both the chat bubble AND these buttons remain gated by AI enabled:
 *   - The bubble returns null when !isAIEnabled (see AIAssistant.tsx)
 *   - This button returns null when !isAIEnabled OR when this specific
 *     feature isn't in the org's enabledFeatures list
 *
 * Usage:
 *   <AIFeatureButton feature="FINANCE_ANALYSIS" />
 *   <AIFeatureButton feature="VITAL_ANALYSIS" residentId={r.id} />
 *   <AIFeatureButton feature="CLINICAL_NOTES" prompt={`Notes: ${text}`} />
 *
 * Optional `useChat` prop (default false) — if set to true, falls back to
 * the old behavior of routing the result into the chat bubble via
 * useAI().triggerFeature(). Useful for features whose result is long-form
 * and benefits from the chat's conversational follow-up context.
 */

import { useState, useRef, useEffect } from 'react'
import { Loader2, X, Sparkles, RefreshCw } from 'lucide-react'
import { Button, ButtonProps } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAI } from './AIContext'
import { AI_FEATURE_ICONS, AI_FEATURE_LABELS, QUICK_PROMPTS } from './AIAssistant'

interface AIFeatureButtonProps {
  /** AI feature id — see AI_FEATURE_LABELS for the supported set. */
  feature: string
  /** Override the default label (defaults to AI_FEATURE_LABELS[feature]). */
  label?: string
  /** Override the preset prompt (defaults to QUICK_PROMPTS[feature]). */
  prompt?: string
  /** Resident id — passed to /api/ai/chat so the backend can inject
   *  resident context (meds, vitals, conditions) when allowDataQueries is on. */
  residentId?: string
  /** Button visual variant. Defaults to 'outline'. */
  variant?: ButtonProps['variant']
  /** Button size. Defaults to 'sm'. */
  size?: ButtonProps['size']
  /** Extra className for the BUTTON. */
  className?: string
  /** Disabled state (independent of AI enabled). */
  disabled?: boolean
  /** Optional title attr. */
  title?: string
  /**
   * If true, route the result into the floating AI chat panel instead of
   * rendering inline (legacy behavior). Defaults to false — inline.
   */
  useChat?: boolean
  /** Extra className for the inline RESULT card. */
  resultClassName?: string
  /** If false, hide the "Re-run" + "Close" footer buttons on the result card. */
  showResultActions?: boolean
}

interface AIResult {
  content: string
  tokensUsed?: { prompt: number; completion: number; total: number }
  fromKnowledgeBase?: boolean
  error?: string
  ranAt: Date
}

export function AIFeatureButton({
  feature,
  label,
  prompt,
  residentId,
  variant = 'outline',
  size = 'sm',
  className = '',
  disabled = false,
  title,
  useChat = false,
  resultClassName = '',
  showResultActions = true,
}: AIFeatureButtonProps) {
  const ai = useAI()
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<AIResult | null>(null)
  const abortRef = useRef<AbortController | null>(null)

  // Auto-hide when AI disabled OR when this specific feature isn't enabled
  // for the org. This keeps the "AI buttons visible only if AI enabled" rule.
  if (!ai.isAIEnabled) return null
  const isEnabled = ai.availableFeatures.some(f => f.id === feature)
  if (!isEnabled) return null

  const Icon = AI_FEATURE_ICONS[feature] || Sparkles
  const displayLabel = label || AI_FEATURE_LABELS[feature] || feature
  const finalPrompt = prompt || QUICK_PROMPTS[feature] || `Run the ${displayLabel} AI feature.`

  // === Chat-routed mode (legacy) ===
  // Falls through to useAI().triggerFeature() which opens the chat panel
  // and pushes the result there.
  const handleClickChat = async () => {
    if (disabled || loading) return
    await ai.triggerFeature(feature, finalPrompt, residentId)
  }

  // === Inline mode (default) ===
  // Calls /api/ai/chat directly, holds result locally, renders below button.
  const handleClickInline = async () => {
    if (disabled || loading) return
    // Cancel any in-flight request (shouldn't normally happen since the
    // button is disabled while loading, but defensive)
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller

    setLoading(true)
    setResult(null)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feature,
          prompt: finalPrompt,
          residentId,
        }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (!res.ok) {
        setResult({
          content: '',
          error: data?.error || `AI request failed (HTTP ${res.status})`,
          ranAt: new Date(),
        })
      } else {
        setResult({
          content: data.content || '(empty response)',
          tokensUsed: data.tokensUsed,
          fromKnowledgeBase: data.fromKnowledgeBase,
          ranAt: new Date(),
        })
      }
    } catch (e: any) {
      if (e.name === 'AbortError') return  // ignore aborts
      setResult({
        content: '',
        error: e.message || 'Network error',
        ranAt: new Date(),
      })
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  const handleClick = useChat ? handleClickChat : handleClickInline
  const closeResult = () => setResult(null)

  return (
    <div className={`space-y-2 ${resultClassName}`}>
      <Button
        type="button"
        variant={variant}
        size={size}
        disabled={disabled || loading}
        onClick={handleClick}
        title={title || `AI: ${displayLabel}`}
        className={`gap-1.5 ${className}`}
      >
        {loading ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : Icon ? (
          <Icon className="h-3.5 w-3.5" />
        ) : null}
        <span>{loading ? `Running…` : displayLabel}</span>
      </Button>

      {/* === Inline result card === */}
      {/* Only rendered in inline mode. In useChat mode, result lands in the chat bubble instead. */}
      {!useChat && (loading || result) && (
        <Card className="border-violet-200 bg-violet-50/30">
          <CardHeader className="pb-2 flex flex-row items-start justify-between space-y-0">
            <div className="flex items-center gap-2 min-w-0">
              <div className="h-7 w-7 rounded-full bg-violet-100 flex items-center justify-center flex-shrink-0">
                <Icon className="h-3.5 w-3.5 text-violet-600" />
              </div>
              <div className="min-w-0">
                <CardTitle className="text-xs font-semibold text-violet-900 truncate">
                  {displayLabel}
                </CardTitle>
                <div className="text-[10px] text-muted-foreground">
                  {loading
                    ? 'AI is analysing…'
                    : result?.ranAt
                      ? result.ranAt.toLocaleString('en-MY', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })
                      : ''}
                  {result?.fromKnowledgeBase && ' • from knowledge base (0 tokens)'}
                  {result?.tokensUsed && !result.fromKnowledgeBase && ` • ${result.tokensUsed.total} tokens`}
                </div>
              </div>
            </div>
            {showResultActions && !loading && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <Button
                  size="sm" variant="ghost" className="h-6 w-6 p-0"
                  onClick={handleClickInline}
                  title="Re-run this analysis"
                  disabled={loading}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
                <Button
                  size="sm" variant="ghost" className="h-6 w-6 p-0"
                  onClick={closeResult}
                  title="Close"
                  disabled={loading}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-4">
                <div className="flex gap-1">
                  <span className="h-2 w-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="h-2 w-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="h-2 w-2 bg-violet-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span>AI is analysing…</span>
              </div>
            ) : result?.error ? (
              <div className="text-sm bg-red-50 border border-red-200 rounded p-3 text-red-700 whitespace-pre-wrap break-words">
                ⚠ {result.error}
              </div>
            ) : (
              <div className="text-sm whitespace-pre-wrap break-words text-foreground leading-relaxed">
                {result?.content}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * AIFeatureBar — renders a row of AIFeatureButtons for the given features.
 * Each button shows its result INLINE (no chat-bubble routing).
 *
 * Example:
 *   <AIFeatureBar features={['CARE_SUMMARY', 'SHIFT_HANDOVER']} />
 */
export function AIFeatureBar({
  features,
  residentId,
  prompts,
  labels,
  size = 'sm',
  className = '',
}: {
  features: string[]
  residentId?: string
  prompts?: Record<string, string>
  labels?: Record<string, string>
  size?: ButtonProps['size']
  className?: string
}) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {features.map(f => (
        <AIFeatureButton
          key={f}
          feature={f}
          residentId={residentId}
          prompt={prompts?.[f]}
          label={labels?.[f]}
          size={size}
        />
      ))}
    </div>
  )
}
