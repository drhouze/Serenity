import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getLHDNConfig, getAccessToken, buildDocumentPayload, getSellerInfo, submitDocument } from '@/lib/myinvois'
import { logAudit, AUDIT_ACTIONS } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// POST /api/e-invoice/submit — submit an invoice to LHDN MyInvois
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
    // Load the invoice with items and resident
    const invoice = await db.invoice.findUnique({
      where: { id: invoiceId },
      include: { items: true, resident: true, facility: true },
    })
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

    // Check if already submitted
    if (invoice.lhdnStatus === 'VALIDATED') {
      return NextResponse.json({ error: 'This invoice has already been validated by LHDN', uuid: invoice.lhdnUUID }, { status: 400 })
    }
    if (invoice.lhdnStatus === 'PENDING') {
      return NextResponse.json({ error: 'This invoice is already pending validation', uuid: invoice.lhdnUUID }, { status: 400 })
    }

    // Get LHDN config
    const config = await getLHDNConfig(user.organizationId)
    if (!config) {
      return NextResponse.json({ error: 'E-Invoice is not configured. Go to Settings → Accounting & Billing → E-Invoice to set up LHDN credentials.' }, { status: 500 })
    }

    // Get access token
    const token = await getAccessToken(user.organizationId)
    if (!token) {
      return NextResponse.json({ error: 'Failed to authenticate with LHDN. Check your Client ID and Secret in Settings.' }, { status: 500 })
    }

    // Get seller info
    const sellerInfo = await getSellerInfo()
    if (!sellerInfo.tin) {
      return NextResponse.json({ error: 'Organization TIN is not set. Go to Settings → Accounting & Billing → E-Invoice to enter your TIN.' }, { status: 500 })
    }

    // Build document payload
    const payload = await buildDocumentPayload(invoice, sellerInfo)

    // Submit to LHDN
    const result = await submitDocument(token, config.environment, payload)

    // Update invoice with LHDN submission info
    await db.invoice.update({
      where: { id: invoiceId },
      data: {
        lhdnStatus: result.status,
        lhdnUUID: result.uuid,
        lhdnSubmittedAt: new Date(),
        lhdnLongId: result.longId || null,
        lhdnError: null,
      },
    })

    // Audit log
    await logAudit({
      userId: user.id,
      userName: user.name,
      userCode: user.code,
      userRole: user.role,
      action: 'E_INVOICE_SUBMITTED',
      entityType: 'INVOICE',
      entityId: invoice.id,
      description: `${user.name} submitted invoice ${invoice.invoiceNumber} to LHDN (UUID: ${result.uuid})`,
      metadata: { invoiceId, invoiceNumber: invoice.invoiceNumber, lhdnUUID: result.uuid, status: result.status },
      facilityId: invoice.facilityId,
      facilityName: invoice.facility?.name || null,
    })

    return NextResponse.json({
      success: true,
      uuid: result.uuid,
      status: result.status,
      message: result.status === 'VALIDATED'
        ? 'Invoice validated successfully by LHDN!'
        : 'Invoice submitted to LHDN. Status: Pending validation.',
    })
  } catch (e: any) {
    // Store error on the invoice
    try {
      await db.invoice.update({
        where: { id: invoiceId },
        data: { lhdnStatus: 'REJECTED', lhdnError: e.message?.slice(0, 500) },
      })
    } catch {}

    return NextResponse.json({ error: e.message || 'Failed to submit to LHDN' }, { status: 500 })
  }
}
