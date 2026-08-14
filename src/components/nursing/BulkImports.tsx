'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Upload, Undo2, Loader2, AlertCircle, CheckCircle, FileText, ChevronRight,
} from 'lucide-react'
import { toast } from 'sonner'
import { CsvUpload } from './CsvUpload'
import { BULK_IMPORT_REGISTRY, getBulkImportDefinition, type BulkImportDefinition } from './bulk-import-registry'
import { apiPost, withFacility, useFetch } from './api'

/**
 * Lists all importable entity types as cards with:
 *   - Description + sample of fields
 *   - "Import CSV" button (opens the CsvUpload dialog with the right columns)
 *   - "Undo last import" button (if a previous import exists for this entity type)
 *
 * This component is embedded in Settings → Backup & Restore → Bulk Imports section.
 * The inline Import buttons in Residents / ProductCatalog modules have been
 * removed — this is now the canonical place for bulk imports.
 *
 * The list is filtered by the current organization's business type — entries
 * whose `applicableBusinessTypes` doesn't include the org's type are hidden.
 * If `applicableBusinessTypes` is omitted, the entry applies to all types.
 */
export function BulkImports({ facilityId, role }: { facilityId?: string; role?: string }) {
  const [activeImport, setActiveImport] = useState<BulkImportDefinition | null>(null)
  const [undoing, setUndoing] = useState<string | null>(null)  // entityType being undone
  const [lastBatches, setLastBatches] = useState<Record<string, { batchId: string; count: number; createdAt: string } | null>>({})

  // Load last-import info for each entity type
  // We use a separate endpoint to fetch the most recent batchId per entity type
  const { data: lastImports, refetch: refetchLastImports } = useFetch<any>('/api/import-undo/last-batches')

  // Fetch the current user's org to determine the business type for filtering.
  // Also fetch the list of facilities the user can access — these are scoped to
  // the user's organization (Owner sees all facilities in their org; Manager and
  // below see only their assigned facilities).
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const userOrgId = currentUser?.user?.organizationId
  const { data: orgData } = useFetch<any>(userOrgId ? `/api/organizations` : null)
  const currentOrg = useMemo(() => (orgData || []).find((o: any) => o.id === userOrgId), [orgData, userOrgId])
  const businessType: string = currentOrg?.businessType || 'nursing_home'

  // Fetch accessible facilities (auto-scoped to user's org by /api/facilities/accessible)
  const { data: facData } = useFetch<any>('/api/facilities/accessible')
  const facilities = facData?.facilities || []

  // Local facility selection — defaults to the prop value (from Settings header),
  // but the user can override within the BulkImports component. This is the
  // facility that imports will be created in. The user must select a facility
  // (not "All Facilities") before they can import.
  const [localFacilityId, setLocalFacilityId] = useState<string>(facilityId || '')
  useEffect(() => {
    // Sync from prop when it changes (e.g. user switches facility in the header)
    if (facilityId && facilityId !== localFacilityId) {
      setLocalFacilityId(facilityId)
    }
    // If the prop is empty (All Facilities) but we have facilities, auto-select the first
    if (!facilityId && !localFacilityId && facilities.length > 0) {
      setLocalFacilityId(facilities[0].id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facilityId, facilities])

  useEffect(() => {
    if (lastImports?.batches) {
      const map: Record<string, { batchId: string; count: number; createdAt: string } | null> = {}
      for (const b of lastImports.batches) {
        map[b.entityType] = { batchId: b.batchId, count: b.count, createdAt: b.createdAt }
      }
      setLastBatches(map)
    }
  }, [lastImports])

  // Filter the registry by the current org's business type
  const visibleRegistry = useMemo(() => {
    return BULK_IMPORT_REGISTRY.filter(def => {
      if (!def.applicableBusinessTypes || def.applicableBusinessTypes.length === 0) return true
      return def.applicableBusinessTypes.includes(businessType)
    })
  }, [businessType])

  const handleUndo = async (entityType: string) => {
    const info = lastBatches[entityType]
    if (!info) return
    if (!confirm(`Undo your last ${entityType} import?\n\nThis will delete all ${info.count} record(s) imported in batch ${info.batchId}.\n\nThis cannot be undone.`)) return
    setUndoing(entityType)
    try {
      const res = await fetch('/api/import-undo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchId: info.batchId, entityType }),
      })
      const data = await res.json()
      if (!res.ok || !data.success) {
        throw new Error(data.error || `HTTP ${res.status}`)
      }
      toast.success(`Undone — deleted ${data.deleted} record(s)`)
      refetchLastImports()
    } catch (e: any) {
      toast.error(e.message || 'Undo failed')
    }
    setUndoing(null)
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4" /> Bulk Imports
          </CardTitle>
          <CardDescription>
            Import data in bulk from CSV files. Each import creates a batch — you can undo it later if needed.
            Imports are created in the facility selected below — this list is auto-scoped to your organization.
            {businessType && businessType !== 'nursing_home' && (
              <> <Badge variant="outline" className="ml-1 text-[10px] capitalize">{businessType.replace(/_/g, ' ')}</Badge> — only imports relevant to your business type are shown.</>
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Facility selector — scoped to user's org via /api/facilities/accessible */}
          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold text-blue-900 block mb-1">
                Import Destination Facility
              </label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm bg-white"
                value={localFacilityId}
                onChange={e => setLocalFacilityId(e.target.value)}
                disabled={facilities.length === 0}
              >
                <option value="">— select a facility —</option>
                {facilities.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name}{f.address ? ` — ${f.address}` : ''}</option>
                ))}
              </select>
              {facilities.length === 0 && (
                <p className="text-[11px] text-amber-700 mt-1">
                  No facilities are assigned to you. Contact your administrator.
                </p>
              )}
              {!localFacilityId && facilities.length > 0 && (
                <p className="text-[11px] text-amber-700 mt-1">
                  Select a facility above before importing.
                </p>
              )}
            </div>
            <div className="text-[11px] text-blue-800 sm:max-w-xs">
              <strong>Why?</strong> Each record (resident, room, invoice, etc.) belongs to a specific facility. The list above only shows facilities in your organization.
            </div>
          </div>

          <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800 flex items-start gap-2">
            <FileText className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <div>
              <strong>How it works:</strong> Click &quot;Import CSV&quot; for the data type you want to import. After uploading your file, you&apos;ll be able to map your CSV columns to our fields — no need to reformat your file first. We auto-detect common column names (English + Malay).
              If something goes wrong, click &quot;Undo last import&quot; to roll back.
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visibleRegistry.map(def => {
              const Icon = def.icon
              const lastBatch = lastBatches[def.entityType]
              const isUndoing = undoing === def.entityType
              const canImport = !!localFacilityId
              return (
                <div key={def.entityType} className={`rounded-md border p-3 hover:border-primary/50 transition-colors flex flex-col gap-2 ${!canImport ? 'opacity-60' : ''}`}>
                  <div className="flex items-start gap-2">
                    <div className="rounded-md bg-primary/10 p-1.5 flex-shrink-0">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm">{def.title.replace(' from CSV', '')}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{def.description}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {def.columns.slice(0, 5).map(c => (
                      <span key={c.key} className={`text-[10px] px-1.5 py-0.5 rounded border ${c.required ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-border bg-muted text-muted-foreground'}`}>
                        {c.label.split(' ')[0]}{c.required && '*'}
                      </span>
                    ))}
                    {def.columns.length > 5 && (
                      <span className="text-[10px] px-1.5 py-0.5 text-muted-foreground">+{def.columns.length - 5} more</span>
                    )}
                  </div>

                  {lastBatch && (
                    <div className="text-[11px] text-muted-foreground bg-muted/40 rounded px-2 py-1 flex items-center gap-1.5">
                      <CheckCircle className="h-3 w-3 text-emerald-500" />
                      <span>Last import: <strong>{lastBatch.count}</strong> record(s)</span>
                      <span className="text-muted-foreground/70">•</span>
                      <code className="text-[10px]">{lastBatch.batchId.slice(0, 16)}…</code>
                    </div>
                  )}

                  <div className="flex gap-2 mt-1">
                    <Button size="sm" onClick={() => setActiveImport(def)} className="flex-1" disabled={!canImport} title={!canImport ? 'Select a facility first' : undefined}>
                      <Upload className="h-3 w-3 mr-1" /> Import CSV
                    </Button>
                    {lastBatch && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUndo(def.entityType)}
                        disabled={isUndoing}
                        title={`Undo batch ${lastBatch.batchId}`}
                      >
                        {isUndoing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Undo2 className="h-3 w-3" />}
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {visibleRegistry.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6">
              No bulk imports are available for this business type.
            </div>
          )}

          <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground mt-2">
            <strong>Tip:</strong> Download a template from inside each import dialog to see the expected column format.
            Templates include sample rows you can edit.
          </div>
        </CardContent>
      </Card>

      {activeImport && (
        <CsvUpload
          title={activeImport.title}
          columns={activeImport.columns}
          templateRows={activeImport.templateRows}
          onImport={async (rows, batchId) => {
            let success = 0
            let failed = 0
            const errors: string[] = []
            const def = activeImport

            // === Special handling: Journal Entries — group rows by `reference` ===
            // Each unique reference becomes ONE JE with multiple lines. The API
            // expects { memo, entryDate, lines: [{ accountId, debit, credit, description }] }
            // — we resolve accountCode → accountId here.
            if (def.entityType === 'journalEntry') {
              // Group rows by reference
              const groups: Record<string, any[]> = {}
              for (const row of rows) {
                const ref = row.reference || 'JE-IMPORT'
                if (!groups[ref]) groups[ref] = []
                groups[ref].push(row)
              }
              // Pre-fetch accounts for code→id resolution
              let accounts: any[] = []
              try {
                const accRes = await fetch(withFacility('/api/data?type=accounts', localFacilityId))
                accounts = await accRes.json()
              } catch (e) {
                return { success: 0, failed: rows.length, errors: ['Failed to load chart of accounts for code resolution'] }
              }
              for (const [ref, groupRows] of Object.entries(groups)) {
                try {
                  const firstRow = groupRows[0]
                  const lines = []
                  for (const r of groupRows) {
                    const acc = accounts.find(a => a.code === r.accountCode)
                    if (!acc) throw new Error(`Account code "${r.accountCode}" not found in chart of accounts`)
                    lines.push({
                      accountId: acc.id,
                      debit: Number(r.debit) || 0,
                      credit: Number(r.credit) || 0,
                      description: r.lineDescription || null,
                    })
                  }
                  const totalDebit = lines.reduce((s, l) => s + l.debit, 0)
                  const totalCredit = lines.reduce((s, l) => s + l.credit, 0)
                  if (Math.abs(totalDebit - totalCredit) > 0.01) {
                    throw new Error(`Journal entry "${ref}" does not balance — debits ${totalDebit.toFixed(2)} ≠ credits ${totalCredit.toFixed(2)}`)
                  }
                  const payload = {
                    memo: firstRow.memo || ref,
                    entryDate: firstRow.entryDate || new Date().toISOString().slice(0, 10),
                    lines,
                    facilityId: localFacilityId || null,
                  }
                  await apiPost(withFacility(def.endpoint, localFacilityId), payload)
                  success += groupRows.length
                } catch (e: any) {
                  failed += groupRows.length
                  errors.push(`JE "${ref}": ${e.message}`)
                }
              }
              return { success, failed, errors }
            }

            // === Special handling: Product Vendor Prices — resolve productCode + vendorCode ===
            // Pre-fetch products + vendors so we can convert codes to IDs.
            if (def.entityType === 'productVendorPrice') {
              let products: any[] = []
              let vendors: any[] = []
              try {
                const [pRes, vRes] = await Promise.all([
                  fetch(withFacility('/api/data?type=products&includeInactive=true', localFacilityId)),
                  fetch(withFacility('/api/data?type=vendors&includeInactive=true', localFacilityId)),
                ])
                products = await pRes.json()
                vendors = await vRes.json()
              } catch (e) {
                return { success: 0, failed: rows.length, errors: ['Failed to load products/vendors for code resolution'] }
              }
              for (const row of rows) {
                try {
                  const product = products.find(p => p.code === row.productCode)
                  if (!product) throw new Error(`Product code "${row.productCode}" not found`)
                  const vendor = vendors.find(v => v.code === row.vendorCode)
                  if (!vendor) throw new Error(`Vendor code "${row.vendorCode}" not found`)
                  const payload = {
                    productId: product.id,
                    vendorId: vendor.id,
                    unitCost: Number(row.unitCost) || 0,
                    minOrderQty: row.minOrderQty ?? null,
                    leadTimeDays: row.leadTimeDays ?? null,
                    effectiveFrom: row.effectiveFrom || null,
                    effectiveTo: row.effectiveTo || null,
                    notes: row.notes || null,
                    importBatchId: batchId,
                  }
                  await apiPost(withFacility(def.endpoint, localFacilityId), payload)
                  success++
                } catch (e: any) {
                  failed++
                  errors.push(`${row.productCode || ''} / ${row.vendorCode || ''}: ${e.message}`)
                }
              }
              return { success, failed, errors }
            }

            // === Special handling: Purchase Orders — resolve vendorCode to vendorId ===
            if (def.entityType === 'purchaseOrder') {
              let vendors: any[] = []
              try {
                const vRes = await fetch(withFacility('/api/data?type=vendors&includeInactive=true', localFacilityId))
                vendors = await vRes.json()
              } catch (e) {
                return { success: 0, failed: rows.length, errors: ['Failed to load vendors for code resolution'] }
              }
              for (const row of rows) {
                try {
                  const payload = def.buildPayload ? def.buildPayload(row, batchId) : { ...row, importBatchId: batchId }
                  if (row.vendorCode) {
                    const vendor = vendors.find(v => v.code === row.vendorCode)
                    if (vendor) payload.vendorId = vendor.id
                    else throw new Error(`Vendor code "${row.vendorCode}" not found`)
                  }
                  delete payload.vendorCode  // not a real field on the PO model
                  await apiPost(withFacility(def.endpoint, localFacilityId), payload)
                  success++
                } catch (e: any) {
                  failed++
                  errors.push(`${row.vendorCode || 'row ' + (success + failed + 1)}: ${e.message}`)
                }
              }
              return { success, failed, errors }
            }

            // === Default: one row → one POST ===
            for (const row of rows) {
              try {
                const payload = def.buildPayload
                  ? def.buildPayload(row, batchId)
                  : { ...row, importBatchId: batchId }
                const url = withFacility(def.endpoint, localFacilityId)
                await apiPost(url, payload)
                success++
              } catch (e: any) {
                failed++
                // Use a meaningful identifier for the error message
                const identifier = row.firstName
                  ? `${row.firstName} ${row.lastName || ''}`
                  : row.name || row.roomNumber || `row ${success + failed + 1}`
                errors.push(`${identifier}: ${e.message}`)
              }
            }
            return { success, failed, errors }
          }}
          onUndo={async (batchId) => {
            try {
              const res = await fetch('/api/import-undo', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ batchId, entityType: activeImport.entityType }),
              })
              const data = await res.json()
              if (!res.ok || !data.success) {
                return { success: false, deleted: 0, error: data.error || `HTTP ${res.status}` }
              }
              return { success: true, deleted: data.deleted }
            } catch (e: any) {
              return { success: false, deleted: 0, error: e.message }
            }
          }}
          onClose={() => setActiveImport(null)}
          onSaved={() => {
            setActiveImport(null)
            refetchLastImports()
            toast.success('Import list refreshed')
          }}
        />
      )}
    </>
  )
}
