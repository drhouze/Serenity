import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getLHDNConfig, getAccessToken, getDocumentStatus } from '@/lib/myinvois'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/e-invoice/status — check LHDN validation status
// Body: { invoiceId: string }
export async function POST(req: NextRequest) {
  const user = await getSessionUser(req)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.role !== 'APP_DEVELOPER' && user.role !== 'OWNER' && user.role !== 'MANAGER') {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  const body = await req.json()
  const { invoiceId } = body
  if (!invoiceId) return NextResponse.json({ error: 'invoiceId is required' }, { status: 400 })

  try {
    const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    if (!invoice.lhdnUUID) {
      return NextResponse.json({ error: 'This invoice has not been submitted to LHDN' }, { status: 400 })
    }

    const config = await getLHDNConfig(user.organizationId)
    if (!config) return NextResponse.json({ error: 'LHDN not configured' }, { status: 500 })

    const token = await getAccessToken(user.organizationId)
    if (!token) return NextResponse.json({ error: 'Failed to authenticate with LHDN' }, { status: 500 })

    const result = await getDocumentStatus(token, config.environment, invoice.lhdnUUID)

    // Update invoice status
    const updateData: any = { lhdnStatus: result.status }
    if (result.status === 'VALIDATED') {
      updateData.lhdnValidatedAt = new Date()
      updateData.lhdnError = null
    } else if (result.status === 'REJECTED' || result.status === 'INVALID') {
      updateData.lhdnError = JSON.stringify(result.validationResults || {}).slice(0, 500)
    }

    await db.invoice.update({ where: { id: invoiceId }, data: updateData })

    return NextResponse.json({
      success: true,
      status: result.status,
      validationResults: result.validationResults,
      uuid: invoice.lhdnUUID,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Failed to check status' }, { status: 500 })
  }
}
