import { db } from './db'

// ============================================================
// LHDN MyInvois API Integration — Updated per Integration Practices
// https://sdk.myinvois.hasil.gov.my/integration-practices/
// ============================================================
// Malaysian e-invoice submission via LHDN's MyInvois API.
// Each organization uses its own credentials (TIN, Client ID, Secret).
//
// Integration Flow (Polling Approach — per LHDN guidelines):
//   1. Login as Taxpayer → get access token (cache for 60 minutes)
//   2. Submit documents → get submission ID
//   3. Wait (depending on submission size) → Get Submission status
//   4. Once processed → update internal ERP system with results
//   5. Retrieve validated document (PDF + QR code) if needed
//   6. Cancel document (if needed)
//
// Key Integration Practices (from LHDN):
//   ✅ DO: Cache access tokens for their full lifetime (60 min default)
//   ✅ DO: Use Get Submission API (not Get Recent Documents) to check submission status
//   ✅ DO: Wait before polling after submission (depends on size)
//   ✅ DO: Accept any 20x response — don't resubmit
//   ❌ DON'T: Acquire new token with every API call
//   ❌ DON'T: Check status via Get Recent Documents / Search Documents / Get Document during submission
//   ❌ DON'T: Resubmit the same submission (causes throttling)
//   ❌ DON'T: Call /connect/token without client_id, grant_type, client_secret
//
// Rate Limits (per minute per Client ID):
//   Login: 12 RPM | Submit: 100 RPM | Get Submission: 300 RPM
//   Cancel: 12 RPM | Reject: 12 RPM | Get Document: 60 RPM
//   Get Document Details: 125 RPM | Get Recent Documents: 12 RPM
//   Search Documents: 12 RPM | Search TIN: 60 RPM | Validate TIN: 60 RPM
//   QR Code: 60 RPM
//   Exceeding limits → 429 Too Many Requests + Retry-After header
//
// API docs: https://sdk.myinvois.hasil.gov.my
// ============================================================

const SANDBOX_BASE = 'https://preprod-api.myinvois.hasil.gov.my'
const PRODUCTION_BASE = 'https://api.myinvois.hasil.gov.my'

// Rate limits (requests per minute) — used for client-side throttling
export const LHDN_RATE_LIMITS = {
  login: 12,
  submit: 100,
  getSubmission: 300,
  cancel: 12,
  reject: 12,
  getDocument: 60,
  getDocumentDetails: 125,
  getRecentDocuments: 12,
  searchDocuments: 12,
  searchTIN: 60,
  validateTIN: 60,
  qrCode: 60,
} as const

interface LHDNConfig {
  clientId: string
  clientSecret: string
  environment: 'sandbox' | 'production'
}

interface LHDNToken {
  accessToken: string
  expiresAt: number // epoch ms
  tokenType: string
}

// Token cache (per org — keyed by orgId)
// Per LHDN guidelines: "access tokens should be cached for the lifetime of the token"
const tokenCache = new Map<string, LHDNToken>()

/** Reads LHDN config from the database settings for a given org. */
export async function getLHDNConfig(orgId?: string | null): Promise<LHDNConfig | null> {
  if (!orgId) {
    // Try global settings (for developer testing)
    const settings = await db.setting.findMany({
      where: { key: { in: ['lhdnClientId', 'lhdnClientSecret', 'lhdnEnvironment'] } },
    })
    const map: any = {}
    for (const s of settings) {
      try { map[s.key] = JSON.parse(s.value) } catch { map[s.key] = s.value }
    }
    if (!map.lhdnClientId || !map.lhdnClientSecret) return null
    return {
      clientId: map.lhdnClientId,
      clientSecret: map.lhdnClientSecret,
      environment: map.lhdnEnvironment || 'sandbox',
    }
  }

  // For org-specific settings — LHDN credentials are stored globally per org
  const settings = await db.setting.findMany({
    where: { key: { in: ['lhdnClientId', 'lhdnClientSecret', 'lhdnEnvironment', 'lhdnEnabled'] } },
  })
  const map: any = {}
  for (const s of settings) {
    try { map[s.key] = JSON.parse(s.value) } catch { map[s.key] = s.value }
  }
  if (!map.lhdnEnabled) return null
  if (!map.lhdnClientId || !map.lhdnClientSecret) return null
  return {
    clientId: map.lhdnClientId,
    clientSecret: map.lhdnClientSecret,
    environment: map.lhdnEnvironment || 'sandbox',
  }
}

/** Gets seller info (TIN, MSIC, SST, etc.) from settings. */
export async function getSellerInfo() {
  const keys = ['organizationTIN', 'organizationMSIC', 'organizationSSTNumber', 'organizationSSTRegistered', 'organizationBusinessActivity', 'organizationName', 'organizationAddress', 'organizationAddress2', 'organizationCity', 'organizationState', 'organizationPostalCode', 'organizationCountry', 'organizationPhone', 'organizationEmail', 'organizationRegistrationNumber']
  const settings = await db.setting.findMany({ where: { key: { in: keys } } })
  const map: any = {}
  for (const s of settings) {
    try { map[s.key] = JSON.parse(s.value) } catch { map[s.key] = s.value }
  }
  return {
    tin: map.organizationTIN || '',
    msicCode: map.organizationMSIC || '86901',
    sstNumber: map.organizationSSTNumber || '',
    sstRegistered: map.organizationSSTRegistered || false,
    businessActivity: map.organizationBusinessActivity || 'Residential care activities for the elderly and disabled',
    name: map.organizationName || 'Serenity Care Home',
    address: map.organizationAddress || '',
    address2: map.organizationAddress2 || '',
    city: map.organizationCity || '',
    state: map.organizationState || '',
    postalCode: map.organizationPostalCode || '',
    country: map.organizationCountry || 'Malaysia',
    phone: map.organizationPhone || '',
    email: map.organizationEmail || '',
    regNumber: map.organizationRegistrationNumber || '',
  }
}

/** Gets the API base URL based on environment. */
function getBaseUrl(environment: string): string {
  return environment === 'production' ? PRODUCTION_BASE : SANDBOX_BASE
}

/**
 * Authenticates with LHDN and returns an access token.
 * Per LHDN guidelines: tokens are cached for their full lifetime (default 60 minutes).
 * DO NOT call this with every API request — reuse the cached token.
 */
export async function getAccessToken(orgId?: string | null): Promise<string | null> {
  // Check cache first — per LHDN: "access tokens should be cached for the lifetime of the token"
  const cacheKey = orgId || 'global'
  const cached = tokenCache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    // Token still valid (with 60s buffer before expiry)
    return cached.accessToken
  }

  const config = await getLHDNConfig(orgId)
  if (!config) return null

  const baseUrl = getBaseUrl(config.environment)
  try {
    // Per LHDN: must supply grant_type, client_id, and client_secret
    // Calling without these params will be blocked
    const res = await fetch(`${baseUrl}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'InvoicingAPI',
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      throw new Error(`LHDN auth failed: ${err.error || err.error_description || res.status}`)
    }

    const data = await res.json()
    // Cache the token for its full lifetime (minus 60s buffer)
    // Per LHDN: "Received authentication tokens remain valid for a duration specified in the response"
    const token: LHDNToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in - 60) * 1000,
      tokenType: data.token_type || 'Bearer',
    }
    tokenCache.set(cacheKey, token)
    return token.accessToken
  } catch (e: any) {
    console.error('[LHDN] Auth error:', e.message)
    return null
  }
}

/** Builds the MyInvois document payload from an invoice. */
export async function buildDocumentPayload(invoice: any, sellerInfo: any) {
  const items = invoice.items || []
  const countryCode = 'MYS'
  const stateCode = mapStateCode(sellerInfo.state)

  return {
    format: 'JSON',
    document: {
      invoice: {
        invoiceNumber: invoice.invoiceNumber,
        invoiceType: '01', // 01 = Invoice, 02 = Credit Note, 03 = Debit Note
        issueDate: new Date(invoice.issueDate).toISOString().split('T')[0],
        invoiceCurrencyCode: 'MYR',
        currencyExchangeRate: 1.0,
        // Seller (your care home)
        supplier: {
          tin: sellerInfo.tin,
          name: sellerInfo.name,
          msicCode: sellerInfo.msicCode,
          businessActivityDescription: sellerInfo.businessActivity,
          sstRegistrationNumber: sellerInfo.sstRegistered ? sellerInfo.sstNumber : undefined,
          address: {
            line0: sellerInfo.address || '',
            line1: sellerInfo.address2 || '',
            city: sellerInfo.city || '',
            state: stateCode,
            postalZone: sellerInfo.postalCode || '',
            country: countryCode,
          },
          contact: {
            telephone: sellerInfo.phone || '',
            email: sellerInfo.email || '',
          },
          registrationNumber: sellerInfo.regNumber || undefined,
        },
        // Buyer (resident / family / insurance)
        buyer: {
          tin: invoice.resident?.billingTIN || 'EI00000000000', // Generic TIN for consumer (B2C)
          name: invoice.recipient || `${invoice.resident?.firstName || ''} ${invoice.resident?.lastName || ''}`.trim() || 'Consumer',
          address: {
            line0: invoice.resident?.billingAddress || '',
            city: '',
            state: stateCode,
            postalZone: '',
            country: countryCode,
          },
          contact: {
            telephone: invoice.resident?.billingPhone || invoice.resident?.emergencyContactPhone || '',
            email: invoice.resident?.billingEmail || '',
          },
        },
        // Line items
        invoiceLines: items.map((item: any, idx: number) => {
          const lineTotal = item.unitPrice * item.quantity
          const taxAmount = 0 // Care services are typically exempt from SST
          return {
            lineNumber: idx + 1,
            itemDescription: item.description || `Item ${idx + 1}`,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            lineAmount: lineTotal,
            tax: {
              taxType: sellerInfo.sstRegistered ? 'SST' : 'OTH', // OTH = Other (exempt)
              taxRate: sellerInfo.sstRegistered ? 6 : 0,
              taxAmount: taxAmount,
            },
          }
        }),
        // Totals
        totalExcludingTax: invoice.subtotal,
        totalTax: invoice.tax || 0,
        totalIncludingTax: invoice.total,
        totalPayableAmount: invoice.total,
        payment: {
          paymentMethod: 'OTH',
          paymentTerms: `Due within ${Math.ceil((new Date(invoice.dueDate).getTime() - new Date(invoice.issueDate).getTime()) / (1000 * 60 * 60 * 24))} days`,
        },
      },
    },
  }
}

/** Maps Malaysian state name to LHDN state code. */
function mapStateCode(state?: string): string {
  if (!state) return '14' // Default: Wilayah Persekutuan Kuala Lumpur
  const map: Record<string, string> = {
    'johor': '01', 'kedah': '02', 'kelantan': '03', 'melaka': '04',
    'negeri sembilan': '05', 'pahang': '06', 'penang': '07', 'perak': '08',
    'perlis': '09', 'sabah': '12', 'sarawak': '13', 'selangor': '10',
    'terengganu': '11', 'kuala lumpur': '14', 'labuan': '15', 'putrajaya': '16',
  }
  return map[state.toLowerCase()] || '14'
}

/**
 * Submits a document to LHDN for validation.
 * Per LHDN: returns a submission ID + per-document UUID + status.
 * Accept any 20x response — do NOT resubmit (causes throttling/duplicate flagging).
 */
export async function submitDocument(
  accessToken: string,
  environment: string,
  payload: any
): Promise<{ uuid: string; status: string; longId?: string; submissionId?: string }> {
  const baseUrl = getBaseUrl(environment)
  const res = await fetch(`${baseUrl}/api/v1.0/documents`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  // Per LHDN: any 20x response means the submission was received — don't resubmit
  if (res.status >= 200 && res.status < 300) {
    const data = await res.json()
    // LHDN returns an array of submission results
    const result = Array.isArray(data) ? data[0] : data
    return {
      uuid: result.uuid,
      status: result.status || 'PENDING',
      longId: result.longId,
      submissionId: result.submissionId,
    }
  }

  // Non-20x — error
  const data = await res.json().catch(() => ({}))
  throw new Error(`LHDN submit failed (${res.status}): ${data.error?.message || data.message || JSON.stringify(data.errors || data)}`)
}

/**
 * Gets the submission status using the Get Submission API.
 * Per LHDN guidelines: USE THIS (not Get Recent Documents / Search Documents / Get Document)
 * to check if a submission has been fully processed.
 *
 * Rate limit: 300 RPM (generous — designed for polling)
 */
export async function getSubmissionStatus(
  accessToken: string,
  environment: string,
  submissionId: string
): Promise<{ status: string; documents: any[] }> {
  const baseUrl = getBaseUrl(environment)
  const res = await fetch(`${baseUrl}/api/v1.0/documentsubmissions/${submissionId}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`LHDN get submission failed (${res.status}): ${data.error?.message || res.status}`)
  }

  return {
    status: data.status,
    documents: data.documents || [],
  }
}

/**
 * Checks the validation status of a single submitted document.
 * Uses Get Document Status API (not Get Recent Documents).
 *
 * Rate limit: 60 RPM
 */
export async function getDocumentStatus(
  accessToken: string,
  environment: string,
  uuid: string
): Promise<{ status: string; validationResults?: any }> {
  const baseUrl = getBaseUrl(environment)
  const res = await fetch(`${baseUrl}/api/v1.0/documents/${uuid}/status`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  // Handle 429 Too Many Requests (rate limit exceeded)
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After') || '60'
    throw new Error(`LHDN rate limit exceeded. Retry after ${retryAfter} seconds.`)
  }

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`LHDN status check failed (${res.status}): ${data.error?.message || res.status}`)
  }

  return {
    status: data.status,
    validationResults: data.validationResults,
  }
}

/**
 * Retrieves the validated document (includes PDF link + QR code).
 * Per LHDN: use this AFTER the document has been validated, not during submission.
 *
 * Rate limit: 60 RPM
 */
export async function getDocument(
  accessToken: string,
  environment: string,
  uuid: string
): Promise<{ document: any; pdfUrl?: string; qrCode?: string }> {
  const baseUrl = getBaseUrl(environment)
  const res = await fetch(`${baseUrl}/api/v1.0/documents/${uuid}`, {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  })

  // Handle 429
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After') || '60'
    throw new Error(`LHDN rate limit exceeded. Retry after ${retryAfter} seconds.`)
  }

  const data = await res.json()
  if (!res.ok) {
    throw new Error(`LHDN retrieve failed (${res.status}): ${data.error?.message || res.status}`)
  }

  return {
    document: data,
    pdfUrl: data.links?.pdf,
    qrCode: data.qrCode,
  }
}

/**
 * Cancels a submitted document.
 * Per LHDN: use when an invoice needs to be voided after submission.
 *
 * Rate limit: 12 RPM
 */
export async function cancelDocument(
  accessToken: string,
  environment: string,
  uuid: string,
  reason: string
): Promise<{ success: boolean }> {
  const baseUrl = getBaseUrl(environment)
  const res = await fetch(`${baseUrl}/api/v1.0/documents/${uuid}/state/cancel`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ reason }),
  })

  // Handle 429
  if (res.status === 429) {
    const retryAfter = res.headers.get('Retry-After') || '60'
    throw new Error(`LHDN rate limit exceeded. Retry after ${retryAfter} seconds.`)
  }

  if (!res.ok) {
    const data = await res.json().catch(() => ({}))
    throw new Error(`LHDN cancel failed (${res.status}): ${data.error?.message || res.status}`)
  }

  return { success: true }
}

/**
 * Tests LHDN connectivity by attempting to authenticate.
 * Uses the Login as Taxpayer API.
 */
export async function testConnection(config: LHDNConfig): Promise<{ success: boolean; message: string }> {
  const baseUrl = getBaseUrl(config.environment)
  try {
    const res = await fetch(`${baseUrl}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: 'InvoicingAPI',
      }),
    })

    if (res.ok) {
      const data = await res.json()
      return { success: true, message: `Connected successfully. Token valid for ${data.expires_in} seconds (${Math.round(data.expires_in / 60)} minutes).` }
    } else {
      const err = await res.json().catch(() => ({}))
      return { success: false, message: `Authentication failed: ${err.error_description || err.error || res.status}` }
    }
  } catch (e: any) {
    return { success: false, message: `Connection error: ${e.message}` }
  }
}
