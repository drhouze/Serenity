'use client'

import { useState, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { useFetch } from './api'

/**
 * Renders custom field inputs for any entity (resident, invoice, product, staff, etc.).
 * Used in Add/Edit dialogs for the respective entity.
 *
 * Field types supported:
 *   TEXT      — text input
 *   NUMBER    — numeric input (with optional unit)
 *   DATE      — date picker
 *   SELECT    — dropdown (options from field definition)
 *   TEXTAREA  — multi-line text
 *   REFERENCE — dropdown that links to another entity (product, staff, resident, invoice)
 *               The referenced entities are fetched live and displayed by name.
 *
 * @param orgId        - the org ID to fetch field definitions for
 * @param entityId     - optional: if editing, fetch existing values for this entity
 * @param entityType   - which entity this field set is for ('resident', 'invoice', 'product', 'staff')
 *                       Defaults to 'resident' for backward compatibility.
 * @param values       - external state object; custom field values stored as { [fieldId]: value }
 * @param setValues    - setter to update the external state
 */
export function CustomFieldsSection({ orgId, entityId, entityType = 'resident', values, setValues }: {
  orgId?: string
  entityId?: string
  entityType?: string
  values: Record<string, string>
  setValues: (v: Record<string, string>) => void
}) {
  // Fetch field definitions for this entity type
  const { data: fields, loading } = useFetch<any[]>(
    orgId ? `/api/custom-fields?orgId=${orgId}&targetEntity=${entityType}` : null
  )
  // Fetch existing values for this entity (edit mode)
  const { data: existingValues } = useFetch<any[]>(
    entityId ? `/api/custom-field-values?entityId=${entityId}&entityType=${entityType}` : null
  )

  // When existing values load (edit mode), merge them into the values state
  useEffect(() => {
    if (existingValues && existingValues.length > 0) {
      const merged = { ...values }
      for (const v of existingValues) {
        merged[v.fieldId] = v.value || ''
      }
      setValues(merged)
    }
  }, [existingValues])

  if (loading || !fields || fields.length === 0) return null

  return (
    <div className="sm:col-span-2 border-t pt-3 mt-1">
      <div className="text-xs font-semibold text-muted-foreground mb-2">CUSTOM FIELDS ({entityType})</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fields.map((f: any) => {
          const val = values[f.id] || ''
          const label = f.required ? `${f.label} *` : f.label
          const unitSuffix = f.unit ? ` (${f.unit})` : ''

          return (
            <div key={f.id}>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}{unitSuffix}</label>
              {f.type === 'TEXT' && (
                <Input value={val} onChange={e => setValues({ ...values, [f.id]: e.target.value })} placeholder={f.label} className="text-sm" />
              )}
              {f.type === 'NUMBER' && (
                <Input type="number" step="0.1" value={val} onChange={e => setValues({ ...values, [f.id]: e.target.value })} placeholder={f.label} className="text-sm" />
              )}
              {f.type === 'DATE' && (
                <Input type="date" value={val} onChange={e => setValues({ ...values, [f.id]: e.target.value })} className="text-sm" />
              )}
              {f.type === 'SELECT' && (
                <select className="w-full border rounded px-2 py-1.5 text-sm" value={val} onChange={e => setValues({ ...values, [f.id]: e.target.value })}>
                  <option value="">— Select —</option>
                  {(f.options ? JSON.parse(f.options) : []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              )}
              {f.type === 'TEXTAREA' && (
                <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={val} onChange={e => setValues({ ...values, [f.id]: e.target.value })} placeholder={f.label} />
              )}
              {f.type === 'REFERENCE' && (
                <ReferenceFieldInput
                  field={f}
                  value={val}
                  onChange={(v) => setValues({ ...values, [f.id]: v })}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Renders a REFERENCE field — a dropdown that fetches entities of the
 * referenced type (product, staff, resident, invoice) and lets the user
 * select one. The selected entity's ID is stored as the value.
 */
function ReferenceFieldInput({ field, value, onChange }: { field: any; value: string; onChange: (v: string) => void }) {
  const refEntity = field.referenceEntity
  // Fetch entities of the referenced type
  // Use different endpoints based on the reference entity type
  const fetchUrl = getReferenceFetchUrl(refEntity)
  const { data: entities, loading } = useFetch<any[]>(fetchUrl)

  const entityLabel = (e: any) => {
    switch (refEntity) {
      case 'product':
        return e.name || e.id
      case 'staff':
        return `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.name || e.id
      case 'resident':
        return `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.id
      case 'invoice':
        return e.invoiceNumber || e.id
      default:
        return e.name || e.id
    }
  }

  return (
    <select
      className="w-full border rounded px-2 py-1.5 text-sm"
      value={value}
      onChange={e => onChange(e.target.value)}
      disabled={loading}
    >
      <option value="">— Select {refEntity} —</option>
      {(entities || []).map((e: any) => (
        <option key={e.id} value={e.id}>{entityLabel(e)}</option>
      ))}
    </select>
  )
}

/** Returns the API URL to fetch entities of the referenced type. */
function getReferenceFetchUrl(refEntity: string | null | undefined): string | null {
  if (!refEntity) return null
  switch (refEntity) {
    case 'product':
      return '/api/data?type=products'
    case 'staff':
      return '/api/data?type=staff'
    case 'resident':
      return '/api/data?type=residents'
    case 'invoice':
      return '/api/data?type=invoices'
    default:
      return null
  }
}

/**
 * Save custom field values for an entity.
 * Called after the entity is created/updated.
 *
 * Also creates a version snapshot (for measurement history) — each save
 * records a timestamped copy of all values so the user can track changes
 * over time (e.g. body measurements that change with each fitting).
 *
 * @param entityId     - the ID of the entity (resident, invoice, etc.)
 * @param values       - { [fieldId]: value }
 * @param entityType   - 'resident', 'invoice', 'product', 'staff' (default 'resident')
 * @param label        - optional label for this version (e.g. "Initial", "3-month checkup")
 */
export async function saveCustomFieldValues(entityId: string, values: Record<string, string>, entityType: string = 'resident', label?: string) {
  const entries = Object.entries(values).filter(([_, v]) => v !== '' && v != null)
  if (entries.length === 0) return

  // 1. Save the current values (upserts CustomFieldValue)
  await fetch('/api/custom-field-values', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entityId,
      entityType,
      values: entries.map(([fieldId, value]) => ({ fieldId, value })),
    }),
  })

  // 2. Create a version snapshot (for measurement history)
  const valuesObj: Record<string, string> = {}
  for (const [fieldId, value] of entries) {
    valuesObj[fieldId] = value
  }
  await fetch('/api/custom-field-versions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entityId, entityType, values: valuesObj, label }),
  }).catch(() => {}) // best-effort — don't fail the save if version creation fails
}
