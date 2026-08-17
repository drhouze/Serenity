import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { AI_FEATURES, getMonthlyUsage } from '@/lib/ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/ai/config — returns the AI config for the user's org
// (Owner/Developer only)
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = user.organizationId
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { aiEnabled: true, aiConfig: true },
  })

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  // Get monthly usage
  const usage = await getMonthlyUsage(orgId)

  return NextResponse.json({
    aiEnabled: org.aiEnabled,
    config: org.aiConfig ? {
      provider: org.aiConfig.provider,
      baseUrl: org.aiConfig.baseUrl,
      model: org.aiConfig.model,
      tokenCap: org.aiConfig.tokenCap,
      enabledFeatures: org.aiConfig.enabledFeatures.split(',').map(f => f.trim()),
      temperature: org.aiConfig.temperature,
      maxTokens: org.aiConfig.maxTokens,
      active: org.aiConfig.active,
      hasApiKey: !!org.aiConfig.apiKey,
      // Don't return the actual API key
    } : null,
    usage,
    availableFeatures: AI_FEATURES,
  })
}

// POST /api/ai/config — saves the AI config for the user's org
// (Owner only)
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'OWNER' && user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'Owner or Developer only' }, { status: 403 })
  }

  const orgId = user.organizationId
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const body = await req.json()
  const { provider, apiKey, baseUrl, model, tokenCap, enabledFeatures, temperature, maxTokens, systemPrompt } = body

  // Upsert the AI config
  const existing = await db.orgAIConfig.findUnique({ where: { organizationId: orgId } })

  const data = {
    provider: provider || 'openai',
    apiKey: apiKey || existing?.apiKey || '',
    baseUrl: baseUrl || 'https://api.openai.com/v1',
    model: model || 'gpt-4o-mini',
    tokenCap: tokenCap === '' || tokenCap === null ? null : parseInt(tokenCap),
    enabledFeatures: Array.isArray(enabledFeatures) ? enabledFeatures.join(',') : (enabledFeatures || 'CARE_SUMMARY,FAMILY_UPDATE,SHIFT_HANDOVER'),
    temperature: parseFloat(temperature) || 0.7,
    maxTokens: parseInt(maxTokens) || 2000,
    systemPrompt: systemPrompt || null,
    active: true,
  }

  if (existing) {
    const updated = await db.orgAIConfig.update({
      where: { organizationId: orgId },
      data,
    })
    return NextResponse.json({ success: true, message: 'AI config updated' })
  } else {
    const created = await db.orgAIConfig.create({
      data: { ...data, organizationId: orgId },
    })
    return NextResponse.json({ success: true, message: 'AI config created' })
  }
}
