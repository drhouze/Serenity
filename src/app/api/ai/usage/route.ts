import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// GET /api/ai/usage — returns token usage stats for the user's org
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const orgId = user.organizationId
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 400 })

  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  // Current month usage
  const monthlyUsage = await db.aITokenUsage.aggregate({
    where: { organizationId: orgId, createdAt: { gte: monthStart }, status: 'SUCCESS' },
    _sum: { totalTokens: true, promptTokens: true, completionTokens: true },
    _count: true,
  })

  // Usage by feature this month
  const byFeature = await db.aITokenUsage.groupBy({
    by: ['feature'],
    where: { organizationId: orgId, createdAt: { gte: monthStart }, status: 'SUCCESS' },
    _sum: { totalTokens: true },
    _count: true,
  })

  // Last 30 days daily usage
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentUsage = await db.aITokenUsage.findMany({
    where: { organizationId: orgId, createdAt: { gte: thirtyDaysAgo }, status: 'SUCCESS' },
    select: { totalTokens: true, feature: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
    take: 500,
  })

  // Get the token cap
  const config = await db.orgAIConfig.findUnique({
    where: { organizationId: orgId },
    select: { tokenCap: true },
  })

  const used = monthlyUsage._sum.totalTokens || 0
  const cap = config?.tokenCap
  const remaining = cap ? Math.max(0, cap - used) : null

  return NextResponse.json({
    thisMonth: {
      totalTokens: used,
      promptTokens: monthlyUsage._sum.promptTokens || 0,
      completionTokens: monthlyUsage._sum.completionTokens || 0,
      requestCount: monthlyUsage._count,
      cap,
      remaining,
      unlimited: !cap,
    },
    byFeature: byFeature.map(f => ({
      feature: f.feature,
      tokens: f._sum.totalTokens || 0,
      requests: f._count,
    })),
    recent: recentUsage,
  })
}
