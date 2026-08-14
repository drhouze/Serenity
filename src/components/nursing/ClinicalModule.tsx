'use client'

import { useState } from 'react'
import { useFetch } from './api'
import { Medications, VitalsOverview } from './Medications'
import { Visits } from './Visits'
import { Pill, Activity, Calendar, FileText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { StandardSearchBar } from './StandardSearchBar'

/**
 * ClinicalModule — combines MAR (Medications), Vital Signs, Visits, and any
 * custom tabs linked to the 'clinical' module into a single sidebar module.
 *
 * Built-in tabs (MAR, Vital Signs, Visits) always show.
 * Custom tabs only show if they don't duplicate a built-in tab.
 */
export function ClinicalModule({ facilityId, role }: { facilityId?: string; role?: string }) {
  const [tab, setTab] = useState<string>('mar')

  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const orgId = currentUser?.user?.organizationId
  const isDev = currentUser?.user?.role === 'APP_DEVELOPER'

  // Fetch custom tabs — Developer sees all global tabs, others see org-enabled tabs
  const { data: devGlobalTabs } = useFetch<any[]>(isDev ? '/api/global-custom-tabs' : null)
  const { data: orgCustomTabs } = useFetch<any[]>(!isDev && orgId ? `/api/org-custom-tabs?orgId=${orgId}&enabledOnly=true&module=clinical` : null)

  // Normalize custom tabs data
  const rawCustomTabs = isDev
    ? (devGlobalTabs || []).filter((t: any) => t.module === 'clinical')
    : (orgCustomTabs || [])

  const builtinTabs = [
    { id: 'mar', label: 'MAR (Medications)', icon: Pill },
    { id: 'vitals', label: 'Vital Signs', icon: Activity },
    { id: 'visits', label: 'Visits', icon: Calendar },
  ]

  // Filter out custom tabs that duplicate built-in tab names (by label, case-insensitive)
  const builtinLabels = builtinTabs.map(t => t.label.toLowerCase())
  const customTabEntries = rawCustomTabs
    .filter((t: any) => {
      const label = (t.label || '').toLowerCase()
      // Skip if the custom tab name matches a built-in tab name
      if (builtinLabels.includes(label)) return false
      // Skip "Vital Signs" and "Visit Notes" if they duplicate built-in
      if (label === 'vital signs' || label === 'visits' || label === 'visit notes') return false
      return true
    })
    .map((t: any) => ({
      id: `custom_${t.globalTabId || t.id}`,
      label: t.label,
      icon: FileText,
    }))

  const allTabs = [...builtinTabs, ...customTabEntries]

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b pb-px scrollbar-thin">
        {allTabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                tab === t.id
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-3.5 w-3.5" /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'mar' && <Medications facilityId={facilityId} />}
      {tab === 'vitals' && <VitalsOverview facilityId={facilityId} />}
      {tab === 'visits' && <Visits facilityId={facilityId} />}

      {tab.startsWith('custom_') && (
        <ClinicalCustomTabView
          tabId={tab.replace('custom_', '')}
          orgId={orgId}
          facilityId={facilityId}
          isDev={isDev}
        />
      )}
    </div>
  )
}

/**
 * ClinicalCustomTabView — renders a custom tab as a TABLE where:
 *   - Each column = a field from the tab definition
 *   - Each row = a resident and their values for those fields
 */
function ClinicalCustomTabView({ tabId, orgId, facilityId, isDev }: {
  tabId: string
  orgId?: string
  facilityId?: string
  isDev?: boolean
}) {
  const [search, setSearch] = useState('')

  // Fetch tab definition — global for Developer, org-scoped for others
  const { data: devGlobalTabs } = useFetch<any[]>(isDev ? '/api/global-custom-tabs' : null)
  const { data: orgCustomTabs } = useFetch<any[]>(!isDev && orgId ? `/api/org-custom-tabs?orgId=${orgId}&module=clinical` : null)
  const allTabsData = isDev ? (devGlobalTabs || []) : (orgCustomTabs || [])
  const tabDef = allTabsData.find(t => (t.globalTabId || t.id) === tabId)

  // Fetch custom field definitions — global for Developer, org-scoped for others
  const { data: customFields } = useFetch<any[]>(
    isDev ? '/api/global-custom-fields' : (orgId ? `/api/custom-fields?orgId=${orgId}` : null)
  )

  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: residents } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)

  if (!tabDef) {
    return <div className="text-center py-8 text-sm text-muted-foreground">Tab not found.</div>
  }

  const fieldIds: string[] = JSON.parse(tabDef.fields || '[]')
  // For Developer, customFields are global field definitions (id = global field id)
  // For org users, customFields are merged (id = global field id, from the merge logic)
  const fields = (customFields || []).filter(f => fieldIds.includes(f.id))

  // Filter residents by search
  const allResidents = residents || []
  const filteredResidents = allResidents.filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      `${r.firstName} ${r.lastName}`.toLowerCase().includes(s) ||
      r.code?.toLowerCase().includes(s) ||
      r.room?.roomNumber?.toLowerCase().includes(s) ||
      r.icPassportNumber?.toLowerCase().includes(s)
    )
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <h3 className="font-semibold text-sm">{tabDef.label}</h3>
        {tabDef.enableVersioning && (
          <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">Versioned</Badge>
        )}
        <span className="text-[10px] text-muted-foreground">{fields.length} columns • {allResidents.length} residents</span>
      </div>
      {tabDef.description && <p className="text-xs text-muted-foreground">{tabDef.description}</p>}

      {fields.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No fields in this tab.</p>
      ) : allResidents.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">No residents found.</p>
      ) : (
        <>
        <StandardSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by resident name, code, room, IC..."
          totalCount={allResidents.length}
          filteredCount={filteredResidents.length}
        />
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium whitespace-nowrap">Resident</th>
                    {fields.map(f => (
                      <th key={f.id} className="text-left p-2 font-medium whitespace-nowrap">
                        {f.label}{f.unit ? <span className="text-[10px] text-muted-foreground ml-0.5">({f.unit})</span> : null}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredResidents.map(r => (
                    <ResidentCustomFieldRow key={r.id} resident={r} fieldIds={fieldIds} fields={fields} enableVersioning={tabDef.enableVersioning} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
        </>
      )}
    </div>
  )
}

/**
 * ResidentCustomFieldRow — fetches a single resident's custom field values
 * and renders them as a table row.
 */
function ResidentCustomFieldRow({ resident, fieldIds, fields, enableVersioning }: {
  resident: any
  fieldIds: string[]
  fields: any[]
  enableVersioning: boolean
}) {
  const { data: values } = useFetch<any[]>(`/api/custom-field-values?entityId=${resident.id}&entityType=resident`)
  const { data: versions } = useFetch<any[]>(enableVersioning ? `/api/custom-field-versions?entityId=${resident.id}&entityType=resident` : null)

  // Build value lookup: fieldId → value
  const valueByFieldId: Record<string, string> = {}
  for (const v of values || []) {
    valueByFieldId[v.fieldId] = v.value || ''
  }

  // If versioning, show latest version's values
  if (enableVersioning && versions && versions.length > 0) {
    const latest = versions[0]
    try {
      const versionValues = JSON.parse(latest.values || '{}')
      for (const fid of fieldIds) {
        if (versionValues[fid] !== undefined) {
          valueByFieldId[fid] = versionValues[fid]
        }
      }
    } catch {}
  }

  const displayName = `${resident.firstName || ''} ${resident.lastName || ''}`.trim() || resident.code || resident.id
  const residentCode = resident.code

  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="p-2 whitespace-nowrap">
        <div className="flex items-center gap-1.5">
          {residentCode && <span className="text-[10px] font-mono text-primary">{residentCode}</span>}
          <span className="font-medium">{displayName}</span>
        </div>
      </td>
      {fields.map(f => {
        const val = valueByFieldId[f.id] || ''
        const display = val || <span className="text-muted-foreground/40">—</span>
        return (
          <td key={f.id} className="p-2 whitespace-nowrap">
            {f.type === 'SELECT' && val ? (
              <Badge variant="outline" className="text-[10px]">{val}</Badge>
            ) : (
              display
            )}
          </td>
        )
      })}
    </tr>
  )
}
