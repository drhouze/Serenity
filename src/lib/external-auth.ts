import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { logAudit } from '@/lib/audit'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * External API authentication — validates an API key from the X-API-Key header.
 * API keys are stored in the Setting table with key `externalApiKey:<facilityId>` or `externalApiKey:global`.
 * Returns the facilityId(s) the key has access to, or null if invalid.
 *
 * API key format: `ext_<random32hex>` (e.g., ext_a1b2c3d4e5f6...)
 * Generated in Settings → External Integration
 */
export async function validateExternalApiKey(req: NextRequest): Promise<{
  valid: boolean
  facilityId?: string
  organizationId?: string
  externalAppName?: string
  error?: string
}> {
  const apiKey = req.headers.get('x-api-key')
  if (!apiKey || !apiKey.startsWith('ext_')) {
    return { valid: false, error: 'Missing or invalid API key. Use X-API-Key header with format ext_...' }
  }

  // Look up the API key in the Setting table
  // Keys are stored with facility scope prefix: "facility:<facilityId>:externalApiKey:<facilityId>"
  // or without prefix: "externalApiKey:<facilityId>" (global)
  // Use contains to catch both formats
  const allSettings = await db.setting.findMany({
    where: { key: { contains: 'externalApiKey' } },
  })

  for (const setting of allSettings) {
    try {
      // The setting value may be double-JSON-encoded:
      // The Settings API stores values as JSON strings, and the ExternalIntegrationSettings
      // code saves JSON.stringify({...}), resulting in a double-encoded value.
      // Parse once → if result is still a string, parse again.
      let parsed: any = JSON.parse(setting.value)
      if (typeof parsed === 'string') {
        parsed = JSON.parse(parsed)
      }
      const config = parsed
      if (config.key === apiKey) {
        const facilityId = config.facilityId || setting.key.replace(/^facility:.*:externalApiKey:/, '').replace(/^externalApiKey:/, '')
        return {
          valid: true,
          facilityId: facilityId === 'global' ? undefined : facilityId,
          externalAppName: config.appName || 'Unknown App',
        }
      }
    } catch {
      continue
    }
  }

  return { valid: false, error: 'Invalid API key' }
}

/**
 * Looks up a resident by external code mapping.
 * The mapping is stored in Setting: `externalCodeMapping:<facilityId>:<externalAppName>` =
 * JSON array of [{ externalCode: 'DR-001', residentCode: 'RES-0001', residentId: '...' }]
 *
 * If no mapping exists, falls back to matching by resident.code directly.
 */
export async function resolveResidentByExternalCode(
  externalCode: string,
  externalAppName: string,
  facilityId?: string
): Promise<{ residentId: string; residentCode: string; matchedBy: 'mapping' | 'code' | 'name' } | null> {
  // 1. Try code mapping table
  if (facilityId) {
    const mappingSetting = await db.setting.findUnique({
      where: { key: `externalCodeMapping:${facilityId}:${externalAppName}` },
    })
    if (mappingSetting) {
      try {
        const mappings = JSON.parse(mappingSetting.value)
        const match = mappings.find((m: any) => m.externalCode === externalCode)
        if (match) {
          return { residentId: match.residentId, residentCode: match.residentCode, matchedBy: 'mapping' }
        }
      } catch {
        // invalid JSON — fall through
      }
    }
  }

  // 2. Fall back to matching by resident.code directly (if external code happens to match our code)
  const resident = await db.resident.findFirst({
    where: {
      code: externalCode,
      ...(facilityId ? { facilityId } : {}),
      status: { in: ['ACTIVE', 'HOSPITALIZED', 'OUT_WITH_FAMILY'] },
    },
    select: { id: true, code: true },
  })
  if (resident) {
    return { residentId: resident.id, residentCode: resident.code!, matchedBy: 'code' }
  }

  // 3. Last resort: try matching by name (less reliable)
  // External app might send "John Doe" — try to match firstName + lastName
  const nameParts = externalCode.trim().split(/\s+/)
  if (nameParts.length >= 2) {
    const firstName = nameParts[0]
    const lastName = nameParts.slice(1).join(' ')
    const residentByName = await db.resident.findFirst({
      where: {
        firstName: { equals: firstName },
        lastName: { equals: lastName },
        ...(facilityId ? { facilityId } : {}),
        status: { in: ['ACTIVE'] },
      },
      select: { id: true, code: true },
    })
    if (residentByName) {
      return { residentId: residentByName.id, residentCode: residentByName.code!, matchedBy: 'name' }
    }
  }

  return null
}
