import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { sendEmail, isEmailConfigured } from '@/lib/email'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/email/send
 *
 * Sends a transactional email. Owner/Manager only (to prevent abuse).
 *
 * Body: { to, subject, html?, text? }
 *
 * Returns: { success, error? }
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const { to, subject, html, text } = await req.json()
  if (!to || !subject) {
    return NextResponse.json({ error: 'to and subject are required' }, { status: 400 })
  }

  if (!isEmailConfigured()) {
    return NextResponse.json({
      error: 'SMTP is not configured. Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS environment variables.',
      configured: false,
    }, { status: 400 })
  }

  const result = await sendEmail({ to, subject, html, text })
  if (!result.success) {
    return NextResponse.json({ error: result.error }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
