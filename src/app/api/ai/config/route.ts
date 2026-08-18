import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { AI_FEATURES, getMonthlyUsage } from '@/lib/ai'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/ai/config — returns the AI config for the user's org
// (Owner/Developer only)
//
// For APP_DEVELOPER with no organizationId (e.g. backdoor login), returns the
// list of orgs so the UI can let them pick one. When ?orgId=xxx is passed,
// returns that org's AI config.
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let orgId = user.organizationId

  // Developer with no org (backdoor login) — allow picking via ?orgId= query,
  // otherwise return the list of orgs so the UI can show a picker.
  if (!orgId && user.role === 'APP_DEVELOPER') {
    const requestedOrgId = new URL(req.url).searchParams.get('orgId')
    if (requestedOrgId) {
      orgId = requestedOrgId
    } else {
      const orgs = await db.organization.findMany({
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      })
      return NextResponse.json({
        aiEnabled: false,
        config: null,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCost: 0, count: 0 },
        availableFeatures: AI_FEATURES,
        needsOrgSelection: true,
        organizations: orgs,
      })
    }
  }

  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const org = await db.organization.findUnique({
    where: { id: orgId },
    select: { aiEnabled: true, aiConfig: true, name: true },
  })

  if (!org) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

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
    organizationId: orgId,
    organizationName: org.name,
  })
}

// POST /api/ai/config — saves the AI config for the user's org
// (Owner only, or Developer with explicit organizationId in body)
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'OWNER' && user.role !== 'APP_DEVELOPER') {
    return NextResponse.json({ error: 'Owner or Developer only' }, { status: 403 })
  }

  const body = await req.json()
  // Owner uses their own orgId. Developer (esp. backdoor without orgId) can
  // pass `organizationId` in the body to choose which org to configure.
  let orgId = user.organizationId
  if (!orgId && user.role === 'APP_DEVELOPER') {
    orgId = body.organizationId || null
  }
  if (!orgId) return NextResponse.json({ error: 'No organization — pass organizationId in the request body (Developer backdoor account has no org).' }, { status: 400 })

  // Verify the org exists
  const orgExists = await db.organization.findUnique({ where: { id: orgId }, select: { id: true } })
  if (!orgExists) return NextResponse.json({ error: 'Organization not found' }, { status: 404 })

  const { provider, apiKey, baseUrl, model, tokenCap, enabledFeatures, temperature, maxTokens, systemPrompt } = body

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
    await db.orgAIConfig.update({ where: { organizationId: orgId }, data })
    return NextResponse.json({ success: true, message: 'AI config updated' })
  } else {
    await db.orgAIConfig.create({ data: { ...data, organizationId: orgId } })
    return NextResponse.json({ success: true, message: 'AI config created' })
  }
}
