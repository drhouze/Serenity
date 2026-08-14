import { db } from '@/lib/db'

/**
 * AI Helper — handles per-organization AI API calls.
 *
 * Each org has their own AI API config (OrgAIConfig):
 *   - Provider (OpenAI, Anthropic, Gemini, or custom)
 *   - API key
 *   - Base URL
 *   - Model name
 *   - Token cap (null = unlimited, number = monthly limit)
 *   - Feature toggles (which AI features are enabled)
 *
 * The Developer toggles `aiEnabled` on the Organization model to
 * control which orgs can use AI features at all.
 */

export const AI_FEATURES = [
  { id: 'CARE_SUMMARY', label: 'Resident Care Summary', description: 'Generates daily/weekly care summaries from MAR, vitals, and care logs' },
  { id: 'MED_INTERACTION', label: 'Medication Interaction Checker', description: 'Checks drug interactions when adding new medications' },
  { id: 'VITAL_ANALYSIS', label: 'Vital Signs Trend Analysis', description: 'Analyzes vitals trends and flags concerning patterns' },
  { id: 'CLINICAL_NOTES', label: 'Clinical Note Generator', description: 'Structures rough notes into proper SOAP format' },
  { id: 'FAMILY_UPDATE', label: 'Family Update Generator', description: 'Drafts family-friendly weekly summaries' },
  { id: 'INCIDENT_ANALYSIS', label: 'Incident Pattern Analysis', description: 'Identifies patterns across incident reports' },
  { id: 'CARE_RECOMMENDATIONS', label: 'Care Plan Recommendations', description: 'Suggests care adjustments based on resident data' },
  { id: 'SHIFT_HANDOVER', label: 'Shift Handover Summary', description: 'Generates concise handover for next shift' },
  { id: 'MAR_GENERATOR', label: 'MAR Generator from Prescription', description: 'Parses free-text prescriptions from visit notes into structured Medication + MAR entries' },
] as const

export interface AIRequest {
  organizationId: string
  feature: string
  prompt: string
  systemPrompt?: string
  userId?: string
  userName?: string
  residentId?: string
  maxTokens?: number
}

export interface AIResponse {
  success: boolean
  content?: string
  error?: string
  tokensUsed?: {
    prompt: number
    completion: number
    total: number
  }
  capped?: boolean
}

/**
 * Checks if AI is available for an organization.
 * Returns the config if AI is enabled, null otherwise.
 */
export async function getAIConfig(organizationId: string) {
  const org = await db.organization.findUnique({
    where: { id: organizationId },
    select: { aiEnabled: true, aiConfig: true },
  })
  if (!org || !org.aiEnabled || !org.aiConfig || !org.aiConfig.active) {
    return null
  }
  return org.aiConfig
}

/**
 * Checks if a specific AI feature is enabled for an org.
 */
export function isFeatureEnabled(config: any, feature: string): boolean {
  const features = (config.enabledFeatures || '').split(',').map(f => f.trim())
  return features.includes(feature)
}

/**
 * Checks if the org has exceeded their monthly token cap.
 * Returns true if the cap is exceeded (should block AI requests).
 */
export async function isTokenCapExceeded(organizationId: string, config: any): Promise<boolean> {
  if (!config.tokenCap) return false // unlimited
  // Get current month's token usage
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const usage = await db.aITokenUsage.aggregate({
    where: {
      organizationId,
      createdAt: { gte: monthStart },
      status: 'SUCCESS',
    },
    _sum: { totalTokens: true },
  })
  const used = usage._sum.totalTokens || 0
  return used >= config.tokenCap
}

/**
 * Gets the current month's token usage for an org.
 */
export async function getMonthlyUsage(organizationId: string) {
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const usage = await db.aITokenUsage.aggregate({
    where: {
      organizationId,
      createdAt: { gte: monthStart },
      status: 'SUCCESS',
    },
    _sum: { totalTokens: true, promptTokens: true, completionTokens: true },
    _count: true,
  })
  return {
    totalTokens: usage._sum.totalTokens || 0,
    promptTokens: usage._sum.promptTokens || 0,
    completionTokens: usage._sum.completionTokens || 0,
    requestCount: usage._count,
  }
}

/**
 * Makes an AI API call to the org's configured provider.
 * Supports OpenAI-compatible APIs (OpenAI, Azure, custom) and Anthropic.
 */
export async function callAI(req: AIRequest): Promise<AIResponse> {
  const config = await getAIConfig(req.organizationId)
  if (!config) {
    return { success: false, error: 'AI is not enabled for your organization. Ask the App Developer to enable it.', capped: false }
  }

  if (!isFeatureEnabled(config, req.feature)) {
    return { success: false, error: `The "${req.feature}" feature is not enabled for your organization.` }
  }

  if (await isTokenCapExceeded(req.organizationId, config)) {
    return { success: false, error: 'Monthly token cap exceeded. AI features will be available again next month.', capped: true }
  }

  const startTime = Date.now()

  try {
    let response: Response
    let content: string
    let promptTokens = 0
    let completionTokens = 0

    if (config.provider === 'anthropic') {
      // Anthropic API
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: req.maxTokens || config.maxTokens || 2000,
          temperature: config.temperature,
          system: req.systemPrompt || 'You are a helpful healthcare assistant for a nursing home.',
          messages: [{ role: 'user', content: req.prompt }],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || `API error: ${response.status}`)
      content = data.content?.[0]?.text || ''
      promptTokens = data.usage?.input_tokens || 0
      completionTokens = data.usage?.output_tokens || 0
    } else {
      // OpenAI-compatible API (OpenAI, Azure, Gemini via OpenAI compat, custom)
      const url = config.baseUrl.endsWith('/')
        ? `${config.baseUrl}chat/completions`
        : `${config.baseUrl}/chat/completions`
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.apiKey}`,
        },
        body: JSON.stringify({
          model: config.model,
          max_tokens: req.maxTokens || config.maxTokens || 2000,
          temperature: config.temperature,
          messages: [
            { role: 'system', content: req.systemPrompt || 'You are a helpful healthcare assistant for a nursing home. Keep responses concise and professional.' },
            { role: 'user', content: req.prompt },
          ],
        }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error?.message || `API error: ${response.status}`)
      content = data.choices?.[0]?.message?.content || ''
      promptTokens = data.usage?.prompt_tokens || 0
      completionTokens = data.usage?.completion_tokens || 0
    }

    const totalTokens = promptTokens + completionTokens
    const durationMs = Date.now() - startTime

    // Record usage
    await db.aITokenUsage.create({
      data: {
        organizationId: req.organizationId,
        feature: req.feature,
        prompt: req.prompt.slice(0, 500),
        response: content.slice(0, 500),
        promptTokens,
        completionTokens,
        totalTokens,
        estimatedCost: Math.round(totalTokens * 0.000002 * 10000) / 10000, // rough estimate
        userId: req.userId,
        userName: req.userName,
        residentId: req.residentId,
        status: 'SUCCESS',
        durationMs,
      },
    }).catch(() => {}) // non-fatal

    return {
      success: true,
      content,
      tokensUsed: { prompt: promptTokens, completion: completionTokens, total: totalTokens },
    }
  } catch (e: any) {
    const durationMs = Date.now() - startTime
    // Record error
    await db.aITokenUsage.create({
      data: {
        organizationId: req.organizationId,
        feature: req.feature,
        prompt: req.prompt.slice(0, 500),
        userId: req.userId,
        userName: req.userName,
        residentId: req.residentId,
        status: 'ERROR',
        errorMessage: e.message?.slice(0, 500),
        durationMs,
      },
    }).catch(() => {})

    return { success: false, error: e.message || 'AI request failed' }
  }
}
