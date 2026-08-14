import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/fhir/metadata
 *
 * FHIR R4 CapabilityStatement — describes what this FHIR server supports.
 * Any FHIR-compliant client library calls this endpoint first to auto-discover:
 *   - Which FHIR version (R4)
 *   - Which resources are supported (Patient, Encounter)
 *   - Which operations are available (read, search, create)
 *   - Required authentication (API key header)
 *
 * This is the FHIR standard way for apps to "know" if the server is FHIR-compliant.
 * External apps call: GET https://yourapp.com/api/fhir/metadata
 * → They get this JSON → their FHIR library auto-configures itself.
 *
 * No API key required for this endpoint (it's public metadata, like an API spec).
 */
export async function GET(req: NextRequest) {
  return NextResponse.json({
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    publisher: 'Serenity Care Home Management System',
    fhirVersion: '4.0.1',  // FHIR R4
    format: ['application/fhir+json', 'application/json'],
    // Authentication: API key required for all other endpoints
    rest: [{
      mode: 'server',
      security: {
        extension: [{
          url: 'http://hl7.org/fhir/StructureDefinition/capabilitystatement-expected',
          valueString: 'API key via X-API-Key header (ext_... format)'
        }],
        cors: true,
        service: [{
          coding: [{
            system: 'http://hl7.org/fhir/restful-security-service',
            code: 'API-key',
            display: 'API Key Authentication'
          }],
          text: 'X-API-Key header required for all data endpoints'
        }],
      },
      // Supported resources
      resource: [
        {
          type: 'Patient',
          interaction: [
            { code: 'read' },
            { code: 'search-type' },
          ],
          searchParam: [
            { name: '_id', type: 'token', documentation: 'Search by FHIR resource ID (= resident code, e.g. RES-0001)' },
            { name: 'identifier', type: 'token', documentation: 'Search by identifier (system|value)' },
            { name: 'name', type: 'string', documentation: 'Search by patient name' },
            { name: 'facilityId', type: 'string', documentation: 'Facility ID (required — specify which facility)' },
          ],
        },
        {
          type: 'Encounter',
          interaction: [
            { code: 'create' },
          ],
          searchParam: [
            { name: 'facilityId', type: 'string', documentation: 'Facility ID (required)' },
          ],
        },
      ],
      // Available operations
      operation: [
        {
          name: 'sync-visit',
          definition: {
            reference: '/api/fhir/Encounter',
            display: 'Sync visit note from external app (POST FHIR Encounter resource)',
          },
        },
      ],
    }],
    // Legacy API also available (for non-FHIR apps)
    extension: [{
      url: 'http://serenity-care.home/fhir/StructureDefinition/legacy-api',
      valueBoolean: true,
      extension: [
        { url: 'residents', valueUri: '/api/external/residents' },
        { url: 'visits', valueUri: '/api/external/visits' },
        { url: 'mappings', valueUri: '/api/external/mappings' },
      ],
    }],
  })
}
