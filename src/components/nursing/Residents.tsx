'use client'

import { useState, useCallback, useEffect } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPost, apiPatch, apiDelete, withFacility } from './api'
import { isFieldVisible, isCustomerFeatureVisible, ALL_CUSTOMER_FEATURES } from '@/lib/business-types'
import { CustomFieldsSection, saveCustomFieldValues } from './CustomFieldsSection'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StatusBadge } from './Badges'
import { fmtDate, fmtDateTime, fmtMoney, age, initials } from '@/lib/types'
import {
  Search, ArrowLeft, Plus, Phone, AlertCircle, Heart, Activity,
  Pill, Calendar, FileText, User, BedDouble, Edit, Trash2, ChevronRight,
  Archive, ArchiveRestore, X, Clock, KeyRound, Stethoscope
} from 'lucide-react'
import { toast } from 'sonner'
import { useMedSettings } from './useMedSettings'
import { useAppDropdowns } from './useAppDropdowns'
import { StandardSearchBar } from './StandardSearchBar'

export function Residents({ initialId, onBack, facilityId }: { initialId?: string | null; onBack?: () => void; facilityId?: string }) {
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(initialId || null)
  const [showAdd, setShowAdd] = useState(false)
  const [showArchived, setShowArchived] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [refreshKey, setRefreshKey] = useState(0)
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const { data: settingsData } = useFetch<any>('/api/settings')

  // Resolve the current user's org business type for field visibility
  const userOrgId = currentUser?.user?.organizationId
  const businessType = (userOrgId && settingsData?.[`businessType:${userOrgId}`]) || 'nursing_home'

  const isFamily = currentUser?.user?.role === 'FAMILY'

  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), [])

  if (selectedId) {
    return <ResidentDetail id={selectedId} onBack={() => { setSelectedId(null); onBack?.() }} />
  }

  const handleArchive = async (ids: string[], archive: boolean) => {
    const action = archive ? 'Archiving' : 'Restoring'
    const done = archive ? 'archived' : 'restored'
    toast.info(`${action} ${ids.length} resident${ids.length > 1 ? 's' : ''}...`)
    let success = 0
    let failed = 0
    for (const id of ids) {
      try {
        if (archive) {
          await apiPatch(`/api/data?type=residents&id=${id}`, { status: 'DISCHARGED', dischargeDate: new Date().toISOString() })
        } else {
          await apiPatch(`/api/data?type=residents&id=${id}`, { status: 'ACTIVE', dischargeDate: null })
        }
        success++
      } catch {
        failed++
      }
    }
    if (success > 0) toast.success(`${success} resident${success > 1 ? 's' : ''} ${done}`)
    if (failed > 0) toast.error(`${failed} failed to ${archive ? 'archive' : 'restore'}`)
    setSelectedIds(new Set())
    triggerRefresh()
  }

  const hasSelection = selectedIds.size > 0

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <StandardSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search residents by name, room, condition..."
        />
        <div className="flex gap-2">
          {!isFamily && (
            <Button variant="outline" onClick={() => setShowArchived(!showArchived)}>
              <ArchiveRestore className="h-4 w-4 mr-1" /> {showArchived ? 'Hide archived' : 'Show archived'}
            </Button>
          )}
          {!isFamily && (
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Resident
            </Button>
          )}
        </div>
      </div>

      {/* Bulk action bar — hidden for family */}
      {hasSelection && !isFamily && (
        <div className="sticky top-14 z-20 flex items-center justify-between gap-2 bg-primary text-primary-foreground rounded-lg p-2 px-4 shadow-md">
          <div className="flex items-center gap-3 text-sm">
            <button onClick={() => setSelectedIds(new Set())} className="hover:opacity-80">
              <X className="h-4 w-4" />
            </button>
            <span className="font-medium">{selectedIds.size} selected</span>
          </div>
          <div className="flex gap-2">
            {showArchived ? (
              <Button size="sm" variant="secondary" onClick={() => handleArchive(Array.from(selectedIds), false)}>
                <ArchiveRestore className="h-3 w-3 mr-1" /> Restore
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => {
                if (confirm(`Archive ${selectedIds.size} resident(s)? They will be marked as discharged and hidden from the active list.`)) {
                  handleArchive(Array.from(selectedIds), true)
                }
              }}>
                <Archive className="h-3 w-3 mr-1" /> Archive
              </Button>
            )}
          </div>
        </div>
      )}

      <ResidentList
        key={refreshKey}
        search={search}
        onSelect={setSelectedId}
        showArchived={showArchived}
        selectedIds={selectedIds}
        onSelectionChange={setSelectedIds}
        isFamily={isFamily}
        facilityId={facilityId}
      />

      {showAdd && <AddResidentDialog facilityId={facilityId} businessType={businessType} onClose={() => setShowAdd(false)} onCreated={(id) => { setShowAdd(false); setSelectedId(id) }} />}
    </div>
  )
}


function ResidentList({
  search,
  onSelect,
  showArchived,
  selectedIds,
  onSelectionChange,
  isFamily,
  facilityId,
}: {
  search: string
  onSelect: (id: string) => void
  showArchived: boolean
  selectedIds: Set<string>
  onSelectionChange: (ids: Set<string>) => void
  isFamily?: boolean
  facilityId?: string
}) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const url = showArchived
    ? `/api/data?type=residents&includeArchived=true${facilityParam}`
    : `/api/data?type=residents${facilityParam}`
  // Auto-refresh every 60s so multiple users see each other's changes
  // (e.g. new admissions by other staff, status changes, discharges)
  const { data, loading } = useFetch<any[]>(url, { refreshInterval: 60000 })
  if (loading) return <div className="grid gap-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>
  if (!data) return null

  const filtered = data.filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      `${r.firstName} ${r.lastName}`.toLowerCase().includes(s) ||
      r.room?.roomNumber?.toLowerCase().includes(s) ||
      (r.conditions || '').toLowerCase().includes(s) ||
      (r.allergies || '').toLowerCase().includes(s)
    )
  })

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id))
  const someSelected = filtered.some(r => selectedIds.has(r.id))

  const toggleAll = () => {
    if (allSelected) {
      const next = new Set(selectedIds)
      filtered.forEach(r => next.delete(r.id))
      onSelectionChange(next)
    } else {
      const next = new Set(selectedIds)
      filtered.forEach(r => next.add(r.id))
      onSelectionChange(next)
    }
  }

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onSelectionChange(next)
  }

  return (
    <div className="grid gap-2">
      {/* Select-all header — hidden for family */}
      {filtered.length > 0 && !isFamily && (
        <div className="flex flex-wrap items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={toggleAll}
          />
          <span className="whitespace-nowrap">
            {filtered.length} resident{filtered.length !== 1 ? 's' : ''}
            {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
          </span>
        </div>
      )}
      {filtered.length > 0 && isFamily && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground">
          {filtered.length} resident{filtered.length !== 1 ? 's' : ''} — click to view details
        </div>
      )}
      {filtered.map(r => {
        const isSelected = selectedIds.has(r.id)
        const isArchived = r.status !== 'ACTIVE'
        return (
          <div key={r.id} className={`flex items-center gap-2 ${isSelected ? 'opacity-90' : ''}`}>
            {!isFamily && (
            <div className="flex-shrink-0 pl-3">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleOne(r.id)}
              />
            </div>
            )}
            <button
              onClick={() => onSelect(r.id)}
              className="text-left transition-shadow hover:shadow-md rounded-lg flex-1"
            >
              <Card className={`hover:bg-muted/30 ${isArchived ? 'opacity-60' : ''} ${isSelected ? 'ring-2 ring-primary' : ''}`}>
                <CardContent className="p-3 flex items-center gap-3">
                  <Avatar className="h-12 w-12 flex-shrink-0">
                    <AvatarFallback className="bg-emerald-100 text-emerald-700">
                      {initials(r.firstName, r.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.code && <Badge variant="outline" className="text-xs font-mono bg-primary/5 text-primary">{r.code}</Badge>}
                      <span className="font-semibold truncate">{r.firstName} {r.lastName}</span>
                      {r.dateOfBirth && <span className="text-xs text-muted-foreground">• {age(r.dateOfBirth)}y</span>}
                      <Badge variant="outline" className="text-xs">{r.gender || '—'}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="flex items-center gap-1 whitespace-nowrap"><BedDouble className="h-3 w-3" /> Room {r.room?.roomNumber || 'Unassigned'}</span>
                      <span className="flex items-center gap-1 whitespace-nowrap"><Heart className="h-3 w-3" /> {r.conditions?.split(',')[0] || 'No conditions'}</span>
                      {r.allergies && r.allergies !== 'None' && (
                        <span className="flex items-center gap-1 text-red-600 whitespace-nowrap"><AlertCircle className="h-3 w-3" /> {r.allergies}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={r.status} />
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Card>
            </button>
          </div>
        )
      })}
      {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No residents found</p>}
    </div>
  )
}

function ResidentDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { data: r, loading, refetch } = useFetch<any>(`/api/data?type=residents&id=${id}`)
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  // Fetch settings locally — ResidentDetail is a separate component from Residents
  // and cannot access the parent's `settingsData` or `businessType` variables.
  // Without this, referencing those variables causes a ReferenceError crash.
  const { data: settingsData } = useFetch<any>('/api/settings')
  const userOrgId = currentUser?.user?.organizationId
  const businessType = (userOrgId && settingsData?.[`businessType:${userOrgId}`]) || 'nursing_home'
  // Fetch the org's enabled custom tabs (created by Developer, enabled per-org)
  // Developer (no orgId) sees all tabs; other users see only their org's tabs
  const isDev = currentUser?.user?.role === 'APP_DEVELOPER'
  const tabsUrl = isDev
    ? '/api/global-custom-tabs'  // Developer: fetch all global tabs
    : (userOrgId ? `/api/org-custom-tabs?orgId=${userOrgId}&enabledOnly=true&module=residents` : null)
  const { data: devGlobalTabs } = useFetch<any[]>(isDev ? '/api/global-custom-tabs' : null)
  const { data: orgCustomTabs } = useFetch<any[]>(tabsUrl)

  // For Developer, transform global tabs into the same shape as org tabs
  const customTabsData = isDev
    ? (devGlobalTabs || []).filter((t: any) => t.module === 'residents' || t.module === 'resident').map((t: any) => ({
        globalTabId: t.id,
        label: t.label,
        enableVersioning: t.enableVersioning,
        fields: t.fields,
        description: t.description,
      }))
    : (orgCustomTabs || [])
  const [tab, setTab] = useState<string>('overview')
  const [showEdit, setShowEdit] = useState(false)
  const [showAddMed, setShowAddMed] = useState(false)
  const [showAddVital, setShowAddVital] = useState(false)
  const [showAddVisit, setShowAddVisit] = useState(false)
  const [showAddIncident, setShowAddIncident] = useState(false)
  const [showAddCare, setShowAddCare] = useState(false)
  const [pendingStatusChange, setPendingStatusChange] = useState<{ newStatus: string; residentId: string; residentName: string } | null>(null)

  if (loading || !r) return <Skeleton className="h-96" />

  const isFamily = currentUser?.user?.role === 'FAMILY'
  const canEdit = !isFamily // Family can view but not edit

  // Customer feature tabs — filtered by business type + Developer overrides
  const customFeaturesKey = `businessTypeFeatures:${businessType}`
  const customFeatures = settingsData?.[customFeaturesKey]
  // Feature label overrides — stored as businessTypeFeatureLabels:<type> → { featureId: "custom label" }
  const featureLabelsKey = `businessTypeFeatureLabels:${businessType}`
  const featureLabelOverrides = settingsData?.[featureLabelsKey]

  const allTabs = [
    { id: 'overview', label: 'Overview', icon: User },
    { id: 'medications', label: `Medications (${r.medications?.length || 0})`, icon: Pill },
    { id: 'vitals', label: `Vitals (${r.vitals?.length || 0})`, icon: Activity },
    { id: 'visits', label: `Visits (${r.visits?.length || 0})`, icon: Calendar },
    { id: 'incidents', label: `Incidents (${r.incidents?.length || 0})`, icon: AlertCircle },
    { id: 'care', label: `Care Log (${r.careLogs?.length || 0})`, icon: FileText },
    { id: 'billing', label: 'Billing', icon: Heart },
    { id: 'history', label: 'Status History', icon: Clock },
  ] as const

  // Apply feature label overrides (custom names set by Developer in Org Type Management)
  const tabsWithLabels = (featureLabelOverrides && typeof featureLabelOverrides === 'object')
    ? allTabs.map(t => ({
        ...t,
        label: featureLabelOverrides[t.id]
          ? `${featureLabelOverrides[t.id]}${t.label.includes('(') ? ' (' + t.label.split('(')[1] : ''}`
          : t.label,
      }))
    : allTabs

  // Filter tabs by business type visibility
  const builtinTabs = tabsWithLabels.filter(t => isCustomerFeatureVisible(businessType, t.id, customFeatures))

  // Add custom tabs (created by Developer, enabled per-org)
  const customTabs = customTabsData.map((t: any) => ({
    id: `custom_${t.globalTabId}`,
    label: t.label,
    icon: FileText,
  }))
  const tabs = [...builtinTabs, ...customTabs]

  return (
    <div className="space-y-4">
      {/* Header — stacks vertically on mobile, horizontal on desktop */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack} className="flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Avatar className="h-14 w-14 flex-shrink-0">
            <AvatarFallback className="bg-emerald-100 text-emerald-700 text-lg">
              {initials(r.firstName, r.lastName)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <h2 className="text-xl font-bold truncate">
              {r.code && <span className="text-sm font-mono text-primary mr-2">{r.code}</span>}
              {r.firstName} {r.lastName}
            </h2>
            <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
              <span>{age(r.dateOfBirth)}y • {r.gender}</span>
              {r.icPassportNumber && (
                <span className="whitespace-nowrap">• IC: {r.icPassportNumber}</span>
              )}
              <span className="whitespace-nowrap">• Room {r.room?.roomNumber || 'Unassigned'}</span>
              <span className="whitespace-nowrap">• Admitted {fmtDate(r.admissionDate)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap sm:flex-shrink-0">
          {/* Status changer — hidden for family (read-only view) */}
          {canEdit && (
            <select
              className="text-xs border rounded px-2 py-1.5 bg-background"
              value={r.status}
              onChange={(e) => {
                const newStatus = e.target.value
                if (newStatus === r.status) return
                setPendingStatusChange({ newStatus, residentId: r.id, residentName: `${r.firstName} ${r.lastName}` })
              }}
            >
              <option value="ACTIVE">✅ Active</option>
              <option value="HOSPITALIZED">🏥 Hospitalized</option>
              <option value="OUT_WITH_FAMILY">🏠 Out with Family</option>
              <option value="DISCHARGED">📤 Discharged</option>
              <option value="DECEASED">⚰️ Deceased</option>
            </select>
          )}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setShowEdit(true)}>
              <Edit className="h-3 w-3 mr-1" /> Edit
            </Button>
          )}
        </div>
      </div>

      {/* Status alert banner for non-active residents */}
      {r.status && r.status !== 'ACTIVE' && (
        <div className={`rounded-md border p-3 text-sm flex items-center gap-2 ${
          r.status === 'HOSPITALIZED' ? 'border-red-200 bg-red-50 text-red-800' :
          r.status === 'OUT_WITH_FAMILY' ? 'border-violet-200 bg-violet-50 text-violet-800' :
          'border-slate-200 bg-slate-50 text-slate-700'
        }`}>
          <AlertCircle className="h-4 w-4" />
          <span className="font-medium">{r.status.replace(/_/g, ' ')}:</span>
          {r.status === 'HOSPITALIZED' && <span>Resident is in hospital. Medications auto-marked as "Resident Out". Change status to Active when they return.</span>}
          {r.status === 'OUT_WITH_FAMILY' && <span>Resident is out with family. Medications auto-marked as "Resident Out". Change status to Active when they return.</span>}
          {r.status === 'DISCHARGED' && <span>Resident has been discharged. Medications deactivated. Record archived.</span>}
          {r.status === 'DECEASED' && <span>Resident has passed away. Record archived.</span>}
        </div>
      )}

      {/* Quick alert strip */}
      {(r.allergies && r.allergies !== 'None') && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800 flex items-center gap-2">
          <AlertCircle className="h-4 w-4" />
          <span className="font-medium">Allergies:</span> {r.allergies}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b pb-px scrollbar-thin">
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
              tab === t.id ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && <ResidentOverview r={r} />}
      {tab === 'medications' && (
        <MedicationsTab residentId={r.id} resident={r} meds={r.medications} medAdmins={r.medAdmins}
          onAdd={canEdit ? () => setShowAddMed(true) : undefined} refetch={refetch} />
      )}
      {tab === 'vitals' && (
        <VitalsTab residentId={r.id} vitals={r.vitals} onAdd={canEdit ? () => setShowAddVital(true) : undefined} refetch={refetch} />
      )}
      {tab === 'visits' && (
        <VisitsTab residentId={r.id} visits={r.visits} onAdd={canEdit ? () => setShowAddVisit(true) : undefined} refetch={refetch} />
      )}
      {tab === 'incidents' && (
        <IncidentsTab residentId={r.id} incidents={r.incidents} onAdd={canEdit ? () => setShowAddIncident(true) : undefined} refetch={refetch} />
      )}
      {tab === 'care' && (
        <CareLogsTab residentId={r.id} logs={r.careLogs} onAdd={canEdit ? () => setShowAddCare(true) : undefined} refetch={refetch} />
      )}
      {tab === 'billing' && (
        <BillingTab residentId={r.id} resident={r} unbilledItems={r.invoiceItems} facilityId={r.facilityId} />
      )}
      {tab === 'history' && (
        <StatusHistoryTab residentId={r.id} />
      )}

      {/* Custom tabs — rendered when a custom tab is selected */}
      {tab.startsWith('custom_') && (
        <CustomTabView
          tabId={tab.replace('custom_', '')}
          resident={r}
          orgId={userOrgId}
        />
      )}

      {showEdit && <EditResidentDialog resident={r} businessType={businessType} onClose={() => setShowEdit(false)} onSaved={() => { setShowEdit(false); refetch() }} />}
      {showAddMed && <AddMedicationDialog residentId={r.id} facilityId={r.facilityId} onClose={() => setShowAddMed(false)} onSaved={() => { setShowAddMed(false); refetch() }} />}
      {showAddVital && <AddVitalDialog residentId={r.id} onClose={() => setShowAddVital(false)} onSaved={() => { setShowAddVital(false); refetch() }} />}
      {showAddVisit && <AddVisitDialog residentId={r.id} facilityId={r.facilityId} onClose={() => setShowAddVisit(false)} onSaved={() => { setShowAddVisit(false); refetch() }} />}
      {showAddIncident && <AddIncidentDialog residentId={r.id} facilityId={r.facilityId} onClose={() => setShowAddIncident(false)} onSaved={() => { setShowAddIncident(false); refetch() }} />}
      {showAddCare && <AddCareLogDialog residentId={r.id} facilityId={r.facilityId} onClose={() => setShowAddCare(false)} onSaved={() => { setShowAddCare(false); refetch() }} />}
      {pendingStatusChange && (
        <StatusChangeDialog
          info={pendingStatusChange}
          currentStatus={r.status}
          onClose={() => setPendingStatusChange(null)}
          onSaved={() => { setPendingStatusChange(null); refetch() }}
        />
      )}
    </div>
  )
}

function StatusChangeDialog({ info, currentStatus, onClose, onSaved }: { info: { newStatus: string; residentId: string; residentName: string }; currentStatus: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const statusInfo: Record<string, { label: string; emoji: string; warning: string; color: string }> = {
    ACTIVE: { label: 'Active', emoji: '✅', warning: 'Resident is returning to the facility. New medications will need to be reviewed.', color: 'text-emerald-600' },
    HOSPITALIZED: { label: 'Hospitalized', emoji: '🏥', warning: 'All pending medications will be auto-marked as "Resident Out". Medications stay active for when they return.', color: 'text-red-600' },
    OUT_WITH_FAMILY: { label: 'Out with Family', emoji: '🏠', warning: 'All pending medications will be auto-marked as "Resident Out". Medications stay active for when they return.', color: 'text-violet-600' },
    DISCHARGED: { label: 'Discharged', emoji: '📤', warning: 'All medications will be DEACTIVATED. Resident will be archived. This cannot be undone.', color: 'text-slate-600' },
    DECEASED: { label: 'Deceased', emoji: '⚰️', warning: 'All medications will be DEACTIVATED. Resident will be archived. This cannot be undone.', color: 'text-slate-600' },
  }

  const si = statusInfo[info.newStatus] || { label: info.newStatus, emoji: '❓', warning: '', color: '' }

  const submit = async () => {
    setSaving(true)
    try {
      await apiPatch(`/api/data?type=residents&id=${info.residentId}`, {
        status: info.newStatus,
        statusReason: reason || undefined,
        dischargeDate: info.newStatus === 'DISCHARGED' || info.newStatus === 'DECEASED' ? new Date().toISOString() : null,
      })
      toast.success(`${info.residentName} marked as ${si.label}`)
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Clock className="h-4 w-4" /> Change Resident Status
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {/* Status change summary */}
          <div className="rounded-md bg-muted/50 p-3 text-center">
            <div className="text-xs text-muted-foreground mb-1">{info.residentName}</div>
            <div className="flex items-center justify-center gap-2">
              <Badge variant="outline" className="text-xs">{currentStatus.replace(/_/g, ' ')}</Badge>
              <span className="text-muted-foreground">→</span>
              <Badge variant="outline" className={`text-xs ${si.color} font-bold`}>{si.emoji} {si.label}</Badge>
            </div>
          </div>

          {/* Warning */}
          <div className={`rounded-md border p-2.5 text-xs ${si.color} bg-muted/30 border-current/20`}>
            <AlertCircle className="h-3.5 w-3.5 inline mr-1" />
            {si.warning}
          </div>

          {/* Reason / Notes textarea */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Reason / Notes <span className="text-muted-foreground/60">(optional but recommended)</span>
            </label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder={
                info.newStatus === 'HOSPITALIZED' ? 'e.g., Severe hypertension BP 190/110, admitted to General Hospital' :
                info.newStatus === 'ACTIVE' ? 'e.g., Discharged from hospital, BP stable at 135/82. Doctor changed medication.' :
                info.newStatus === 'OUT_WITH_FAMILY' ? 'e.g., Family took resident home for weekend, returning Monday' :
                info.newStatus === 'DISCHARGED' ? 'e.g., Family moved resident to another facility' :
                info.newStatus === 'DECEASED' ? 'e.g., Passed away peacefully, family notified' :
                'Enter reason for status change...'
              }
              value={reason}
              onChange={e => setReason(e.target.value)}
              autoFocus
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={saving}
            className={info.newStatus === 'DISCHARGED' || info.newStatus === 'DECEASED' ? 'bg-slate-600 hover:bg-slate-700' : ''}
          >
            {saving ? 'Saving...' : `Confirm: Change to ${si.label}`}
          </Button>
        </div>
      </div>
    </div>
  )
}

function ResidentOverview({ r }: { r: any }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Demographics</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <Row label="Date of Birth" value={r.dateOfBirth ? fmtDate(r.dateOfBirth) : '—'} />
          <Row label="Age" value={r.dateOfBirth ? `${age(r.dateOfBirth)} years` : '—'} />
          <Row label="Gender" value={r.gender || '—'} />
          <Row label="IC / Passport No." value={r.icPassportNumber || '—'} />
          <Row label="Admission Date" value={fmtDate(r.admissionDate)} />
          <Row label="Status" value={<StatusBadge status={r.status} />} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center justify-between">
            Emergency Contact
            <Button size="sm" variant="ghost" className="h-7 text-xs" title="Create family login account" onClick={async () => {
              if (!r.emergencyContactName) { toast.error('No emergency contact name set for this resident'); return }
              const email = prompt(`Create family login for ${r.emergencyContactName} (linked to ${r.firstName} ${r.lastName}).\nEnter email address:`)
              if (!email) return
              const password = prompt(`Enter password for ${email}:`)
              if (!password) return
              try {
                await fetch('/api/users', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    name: r.emergencyContactName,
                    email,
                    password,
                    role: 'FAMILY',
                    phone: r.emergencyContactPhone || null,
                    linkedResidentIds: r.id,
                    facilityIds: r.facilityId || '',
                  }),
                })
                toast.success(`Family login created for ${r.emergencyContactName}`)
              } catch (e: any) { toast.error(e.message) }
            }}>
              <KeyRound className="h-3 w-3 mr-0.5" /> Create Family Login
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <Row label="Name" value={r.emergencyContactName || '—'} />
          <Row label="Phone" value={r.emergencyContactPhone ? <a href={`tel:${r.emergencyContactPhone}`} className="text-primary hover:underline flex items-center gap-1"><Phone className="h-3 w-3" /> {r.emergencyContactPhone}</a> : '—'} />
          <Row label="Relationship" value={r.emergencyContactRelation || '—'} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Medical Information</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <Row label="Conditions" value={r.conditions || 'None recorded'} />
          <Row label="Allergies" value={<span className={r.allergies && r.allergies !== 'None' ? 'text-red-600 font-medium' : ''}>{r.allergies || 'None'}</span>} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm">Dietary Information</CardTitle></CardHeader>
        <CardContent className="text-sm space-y-1.5">
          <Row label="Dietary Needs" value={<Badge variant="outline">{r.dietaryNeeds || 'Regular'}</Badge>} />
        </CardContent>
      </Card>

      {r.notes && (
        <Card className="md:col-span-2">
          <CardHeader className="pb-3"><CardTitle className="text-sm">Notes</CardTitle></CardHeader>
          <CardContent className="text-sm text-muted-foreground">{r.notes}</CardContent>
        </Card>
      )}
    </div>
  )
}

/**
 * Displays a REFERENCE field value — fetches the referenced entity and shows
 * its name instead of just the raw ID.
 */
function ReferenceFieldValue({ field, value }: { field: any; value: string }) {
  const refEntity = field.referenceEntity
  const fetchUrl = getReferenceFetchUrl(refEntity)
  const { data: entities } = useFetch<any[]>(fetchUrl)
  const entity = (entities || []).find(e => e.id === value)

  if (!entity) {
    // Entity not found (may have been deleted) — show the raw ID
    return <span className="text-muted-foreground text-xs">{value.slice(0, 8)}…</span>
  }

  const name = getEntityDisplayName(entity, refEntity)
  return <Badge variant="outline" className="text-blue-700 border-blue-300">{name}</Badge>
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

/** Returns a human-readable display name for a referenced entity. */
function getEntityDisplayName(e: any, refEntity: string): string {
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

/**
 * CustomTabView — renders a custom tab's fields (both built-in and custom)
 * for a specific resident. Fetches the tab definition and custom field values.
 */
function CustomTabView({ tabId, resident, orgId }: { tabId: string; resident: any; orgId?: string }) {
  // Fetch tab definition — use global-custom-tabs for Developer (no orgId), org-custom-tabs for others
  const isDev = !orgId
  const { data: devGlobalTabs } = useFetch<any[]>(isDev ? '/api/global-custom-tabs' : null)
  const { data: orgCustomTabs } = useFetch<any[]>(!isDev && orgId ? `/api/org-custom-tabs?orgId=${orgId}&module=residents` : null)
  const allTabs = isDev ? (devGlobalTabs || []) : (orgCustomTabs || [])
  const tabDef = allTabs.find(t => (t.globalTabId || t.id) === tabId)

  // Fetch custom field definitions — for Developer, fetch from a default org or all
  const { data: customFields } = useFetch<any[]>(orgId ? `/api/custom-fields?orgId=${orgId}` : `/api/global-custom-fields`)
  // Fetch custom field values for this resident
  const { data: customValues } = useFetch<any[]>(resident?.id ? `/api/custom-field-values?entityId=${resident.id}&entityType=resident` : null)
  // Fetch version history if this tab has versioning enabled
  const { data: versions, refetch: refetchVersions } = useFetch<any[]>(
    tabDef?.enableVersioning && resident?.id ? `/api/custom-field-versions?entityId=${resident.id}&entityType=resident` : null
  )
  const [showRecordDialog, setShowRecordDialog] = useState(false)
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null)

  if (!tabDef) {
    // While loading or if tab not found, show a loading state
    return <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Loading tab...</CardContent></Card>
  }

  let fieldIds: string[] = []
  try {
    fieldIds = JSON.parse(tabDef.fields || '[]')
  } catch {
    fieldIds = []
  }
  const valueByFieldId: Record<string, string> = {}
  for (const v of customValues || []) {
    valueByFieldId[v.fieldId] = v.value || ''
  }

  // Built-in field labels
  const BUILTIN_LABELS: Record<string, string> = {
    firstName: 'First Name', lastName: 'Last Name', dateOfBirth: 'Date of Birth',
    gender: 'Gender', icPassportNumber: 'IC / Passport No.', admissionDate: 'Admission Date',
    dischargeDate: 'Discharge Date', allergies: 'Allergies', conditions: 'Conditions',
    dietaryNeeds: 'Dietary Needs',
    emergencyContactName: 'Emergency Contact Name', emergencyContactPhone: 'Emergency Contact Phone',
    emergencyContactRelation: 'Emergency Contact Relationship', roomNumber: 'Room Number', notes: 'Notes',
  }

  const fieldLabel = (fieldId: string) => {
    const isBuiltin = !!BUILTIN_LABELS[fieldId]
    const cf = (customFields || []).find(f => f.id === fieldId)
    return isBuiltin ? BUILTIN_LABELS[fieldId] : (cf?.label || fieldId)
  }

  const hasVersioning = tabDef.enableVersioning

  return (
    <div className="space-y-3">
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-sm flex items-center gap-2">
                {tabDef.label}
                {hasVersioning && <Badge className="text-[10px] bg-violet-100 text-violet-700 border-violet-200">Versioned</Badge>}
              </CardTitle>
              {tabDef.description && <CardDescription className="text-xs">{tabDef.description}</CardDescription>}
            </div>
            {hasVersioning && (
              <Button size="sm" onClick={() => setShowRecordDialog(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Record New
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-[10px] font-semibold text-muted-foreground mb-2">CURRENT VALUES</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fieldIds.map(fieldId => {
              const isBuiltin = !!BUILTIN_LABELS[fieldId]
              const customField = (customFields || []).find(f => f.id === fieldId)
              const label = fieldLabel(fieldId)
              const val = isBuiltin ? (resident as any)[fieldId] : valueByFieldId[fieldId]
              return (
                <div key={fieldId} className="border rounded-md p-2">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
                  <div className="font-medium break-words">
                    {customField?.type === 'SELECT' && val
                      ? <Badge variant="outline">{val}</Badge>
                      : customField?.type === 'REFERENCE' && val
                        ? <ReferenceFieldValue field={customField} value={val} />
                        : val || <span className="text-muted-foreground/60">—</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Version history — shown only if the tab has versioning enabled */}
      {hasVersioning && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Version History</CardTitle>
            <CardDescription className="text-xs">
              Each entry is a timestamped snapshot. The latest is shown above as "Current Values".
            </CardDescription>
          </CardHeader>
          <CardContent>
            {(!versions || versions.length === 0) ? (
              <div className="text-center py-6 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No versions recorded yet.</p>
                <p className="text-xs mt-1">Click "Record New" to create the first snapshot.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {(versions || []).map((v: any, idx: number) => {
                  const vValues = JSON.parse(v.values || '{}')
                  const isLatest = idx === 0
                  const isExpanded = expandedVersion === v.id
                  const entries = Object.entries(vValues).filter(([fid]) => fieldIds.includes(fid))
                  return (
                    <div key={v.id} className="border rounded-md">
                      <button
                        className="w-full flex items-center gap-3 p-2.5 text-left hover:bg-muted/30"
                        onClick={() => setExpandedVersion(isExpanded ? null : v.id)}
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm flex items-center gap-2">
                            {v.label || `Version ${versions.length - idx}`}
                            {isLatest && <Badge className="text-[10px] bg-emerald-100 text-emerald-700 border-emerald-200">Latest</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {fmtDateTime(v.recordedAt)}
                            {v.recordedByName && <span> • by {v.recordedByName}</span>}
                          </div>
                        </div>
                        <ChevronRight className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`} />
                      </button>
                      {isExpanded && (
                        <div className="border-t p-2.5 bg-muted/10">
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {entries.map(([fid, val]) => (
                              <div key={fid} className="border rounded p-1.5 bg-background">
                                <div className="text-[9px] uppercase tracking-wide text-muted-foreground">{fieldLabel(fid)}</div>
                                <div className="font-medium text-sm">{String(val)}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Record new values dialog — shown when the user clicks "Record New" */}
      {showRecordDialog && (
        <RecordValuesDialog
          tabDef={tabDef}
          fieldIds={fieldIds}
          customFields={customFields || []}
          resident={resident}
          currentValues={valueByFieldId}
          builtinLabels={BUILTIN_LABELS}
          onClose={() => setShowRecordDialog(false)}
          onSaved={() => { setShowRecordDialog(false); refetchVersions() }}
        />
      )}
    </div>
  )
}

/**
 * RecordValuesDialog — lets the user enter a new set of values for a versioned tab.
 * Creates a version snapshot AND updates the current values.
 */
function RecordValuesDialog({ tabDef, fieldIds, customFields, resident, currentValues, builtinLabels, onClose, onSaved }: {
  tabDef: any
  fieldIds: string[]
  customFields: any[]
  resident: any
  currentValues: Record<string, string>
  builtinLabels: Record<string, string>
  onClose: () => void
  onSaved: () => void
}) {
  useEscClose(onClose)
  const [values, setValues] = useState<Record<string, string>>(() => {
    // Pre-fill with current values
    const init: Record<string, string> = {}
    for (const fid of fieldIds) {
      const isBuiltin = !!builtinLabels[fid]
      init[fid] = isBuiltin ? ((resident as any)[fid] || '') : (currentValues[fid] || '')
    }
    return init
  })
  const [label, setLabel] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const entries = Object.entries(values).filter(([_, v]) => v !== '' && v != null)
    if (entries.length === 0) { toast.error('Enter at least one value'); return }
    setSaving(true)
    try {
      const valuesObj: Record<string, string> = {}
      for (const [fieldId, value] of entries) {
        valuesObj[fieldId] = value
      }
      const res = await fetch('/api/custom-field-versions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entityId: resident.id,
          entityType: 'resident',
          values: valuesObj,
          label: label.trim() || undefined,
        }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      toast.success(label.trim() ? `Recorded "${label.trim()}"` : 'Values recorded')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title={`Record New — ${tabDef.label}`} onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Label (optional)</label>
          <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Initial, 3-month checkup" className="text-sm" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {fieldIds.map(fieldId => {
            const isBuiltin = !!builtinLabels[fieldId]
            const cf = customFields.find(f => f.id === fieldId)
            const labelName = isBuiltin ? builtinLabels[fieldId] : (cf?.label || fieldId)
            const val = values[fieldId] || ''
            const unitSuffix = cf?.unit ? ` (${cf.unit})` : ''
            // Built-in fields are read-only in versioned tabs (they don't change often)
            if (isBuiltin) {
              return (
                <div key={fieldId}>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">{labelName}{unitSuffix}</label>
                  <Input value={val} disabled className="text-sm bg-muted/50" />
                  <p className="text-[9px] text-muted-foreground">Built-in field (read-only)</p>
                </div>
              )
            }
            return (
              <div key={fieldId}>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">{labelName}{unitSuffix}</label>
                {cf?.type === 'SELECT' ? (
                  <select className="w-full border rounded px-2 py-1.5 text-sm" value={val} onChange={e => setValues({ ...values, [fieldId]: e.target.value })}>
                    <option value="">—</option>
                    {(cf.options ? JSON.parse(cf.options) : []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : cf?.type === 'TEXTAREA' ? (
                  <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={val} onChange={e => setValues({ ...values, [fieldId]: e.target.value })} placeholder={labelName} />
                ) : (
                  <Input type={cf?.type === 'NUMBER' ? 'number' : cf?.type === 'DATE' ? 'date' : 'text'} value={val} onChange={e => setValues({ ...values, [fieldId]: e.target.value })} placeholder={labelName} className="text-sm" />
                )}
              </div>
            )
          })}
        </div>
        <div className="flex flex-wrap justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Saving...' : 'Record Values'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  )
}

// ============ SUB-TABS ============

function MedicationsTab({ residentId, resident, meds, medAdmins, onAdd, refetch }: any) {
  const [editMed, setEditMed] = useState<any | null>(null)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Active Medications</h3>
        {onAdd && <Button size="sm" onClick={onAdd}><Plus className="h-3 w-3 mr-1" /> Add Med</Button>}
      </div>
      <div className="grid gap-2">
        {meds?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No active medications</p>}
        {meds?.map((m: any) => (
          <Card key={m.id}>
            <CardContent className="p-3 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="font-medium">{m.name} <span className="text-muted-foreground">({m.dosage})</span></div>
                {resident?.code && <div className="text-xs font-mono text-primary mt-0.5">{resident.code}</div>}
                <div className="text-xs text-muted-foreground mt-0.5">
                  {m.frequency} • {m.route}
                  {m.duration && <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5 bg-sky-50 border-sky-200 text-sky-700">{m.duration}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">Started {fmtDate(m.startDate)} • Prescribed by {m.prescribedBy || '—'}</div>
                {m.notes && <div className="text-xs text-muted-foreground mt-0.5 italic">📝 {m.notes}</div>}
              </div>
              {onAdd && (
                <div className="flex flex-wrap gap-1 flex-shrink-0">
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditMed(m)} title="Edit">
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600" onClick={async () => {
                    if (confirm(`Discontinue ${m.name}?`)) {
                      try {
                        await apiPatch(`/api/data?type=medications&id=${m.id}`, { active: false })
                        toast.success('Medication discontinued')
                        refetch()
                      } catch (e: any) {
                        toast.error(e.message || 'Failed to discontinue medication')
                      }
                    }
                  }} title="Discontinue">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {editMed && (
        <EditMedicationDialog
          medication={editMed}
          facilityId={resident?.facilityId}
          onClose={() => setEditMed(null)}
          onSaved={() => { setEditMed(null); refetch() }}
        />
      )}

      <div>
        <h3 className="font-semibold text-sm mb-2">Recent Administration Log</h3>
        <div className="border rounded-md max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium">Medication</th>
                <th className="text-left p-2 font-medium">Scheduled</th>
                <th className="text-left p-2 font-medium">Given At</th>
                <th className="text-left p-2 font-medium">Staff</th>
                <th className="text-left p-2 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {medAdmins?.map((a: any) => (
                <tr key={a.id} className="border-t">
                  <td className="p-2">{a.medication?.name} {a.medication?.dosage}</td>
                  <td className="p-2 text-xs">{fmtDateTime(a.scheduledAt)}</td>
                  <td className="p-2 text-xs">{a.administeredAt ? fmtDateTime(a.administeredAt) : '—'}</td>
                  <td className="p-2 text-xs">{a.staff ? `${a.staff.code ? a.staff.code + ' • ' : ''}${a.staff.firstName} ${a.staff.lastName}` : '—'}</td>
                  <td className="p-2"><StatusBadge status={a.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function VitalsTab({ residentId, vitals, onAdd, refetch }: any) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Vital Signs History</h3>
        {onAdd && <Button size="sm" onClick={onAdd}><Plus className="h-3 w-3 mr-1" /> Record Vitals</Button>}
      </div>
      <div className="border rounded-md max-h-[500px] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 sticky top-0">
            <tr>
              <th className="text-left p-2 font-medium">Date</th>
              <th className="text-left p-2 font-medium">Temp</th>
              <th className="text-left p-2 font-medium">BP</th>
              <th className="text-left p-2 font-medium">HR</th>
              <th className="text-left p-2 font-medium">RR</th>
              <th className="text-left p-2 font-medium">O₂</th>
              <th className="text-left p-2 font-medium">Glucose</th>
              <th className="text-left p-2 font-medium">Weight</th>
              <th className="text-left p-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {vitals?.map((v: any) => (
              <tr key={v.id} className="border-t">
                <td className="p-2 text-xs">{fmtDateTime(v.recordedAt)}</td>
                <td className="p-2">{v.temperature?.toFixed(1)}°C</td>
                <td className="p-2">{v.bloodPressureSystolic}/{v.bloodPressureDiastolic}</td>
                <td className="p-2">{v.heartRate}</td>
                <td className="p-2">{v.respiratoryRate}</td>
                <td className="p-2">{v.oxygenSaturation}%</td>
                <td className="p-2">{v.bloodSugar?.toFixed(1)}</td>
                <td className="p-2">{v.weight?.toFixed(1)}</td>
                <td className="p-2 text-xs text-muted-foreground">{v.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VisitsTab({ residentId, visits, onAdd, refetch }: any) {
  const [noteVisit, setNoteVisit] = useState<any | null>(null)

  const upcoming = (visits || []).filter((v: any) => v.status === 'SCHEDULED')
  const past = (visits || []).filter((v: any) => v.status !== 'SCHEDULED')

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Visits</h3>
        {onAdd && <Button size="sm" onClick={onAdd}><Plus className="h-3 w-3 mr-1" /> Schedule Visit</Button>}
      </div>

      {/* Upcoming visits */}
      {upcoming.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">UPCOMING VISITS</div>
          <div className="grid gap-2">
            {upcoming.map((v: any) => (
              <Card key={v.id}>
                <CardContent className="p-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{v.visitType.replace(/_/g, ' ')}</Badge>
                        <StatusBadge status={v.status} />
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                        {fmtDateTime(v.scheduledAt)} • {v.staff ? `${v.staff.code ? v.staff.code + ' • ' : ''}${v.staff.firstName} ${v.staff.lastName}` : 'Unassigned'}
                      </div>
                      {v.findings && <div className="text-sm mt-2"><span className="font-medium">Notes:</span> {v.findings}</div>}
                    </div>
                    <div className="flex flex-wrap gap-1 flex-shrink-0">
                      <Button size="sm" variant="outline" onClick={() => setNoteVisit(v)}>
                        <Edit className="h-3 w-3 mr-1" /> Fill Form
                      </Button>
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={async () => {
                        await apiPatch(`/api/data?type=visits&id=${v.id}`, { status: 'CANCELLED' })
                        toast.success('Visit cancelled')
                        refetch()
                      }}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Past visits with clinical notes */}
      {past.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground mb-2">PAST VISITS</div>
          <div className="grid gap-2">
            {past.map((v: any) => (
              <Card key={v.id}>
                <CardContent className="p-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{v.visitType.replace(/_/g, ' ')}</Badge>
                        <StatusBadge status={v.status} />
                        {v.completedAt && <span className="text-xs text-muted-foreground whitespace-nowrap">Completed: {fmtDate(v.completedAt)}</span>}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">
                        Scheduled: {fmtDateTime(v.scheduledAt)} • {v.staff ? `${v.staff.firstName} ${v.staff.lastName}` : 'Unassigned'}
                        {v.duration && <span> • {v.duration} min</span>}
                      </div>

                      {/* Clinical note fields — shown if filled */}
                      {v.chiefComplaint && (
                        <div className="text-sm mt-2"><span className="font-medium">Chief Complaint:</span> {v.chiefComplaint}</div>
                      )}
                      {v.vitalsNote && (
                        <div className="text-sm mt-1"><span className="font-medium">Vitals:</span> {v.vitalsNote}</div>
                      )}
                      {v.findings && (
                        <div className="text-sm mt-1"><span className="font-medium">Findings:</span> {v.findings}</div>
                      )}
                      {v.diagnosis && (
                        <div className="text-sm mt-1"><span className="font-medium">Diagnosis:</span> {v.diagnosis}</div>
                      )}
                      {v.treatmentPlan && (
                        <div className="text-sm mt-1"><span className="font-medium">Treatment Plan:</span> {v.treatmentPlan}</div>
                      )}
                      {v.prescription && (
                        <div className="text-sm mt-1"><span className="font-medium">Prescription:</span> {v.prescription}</div>
                      )}
                      {v.followUpNote && (
                        <div className="text-sm mt-1"><span className="font-medium">Follow-up:</span> {v.followUpNote}</div>
                      )}
                      {v.recommendations && (
                        <div className="text-sm mt-1"><span className="font-medium">Recommendations:</span> {v.recommendations}</div>
                      )}
                    </div>
                    {v.status === 'COMPLETED' && (
                      <Button size="sm" variant="ghost" className="flex-shrink-0" onClick={() => setNoteVisit(v)} title="View visit notes">
                        <Stethoscope className="h-3 w-3" /> View
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {visits?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No visits recorded</p>}

      {/* Visit note dialog */}
      {noteVisit && (
        <VisitNoteDialog visit={noteVisit} onClose={() => setNoteVisit(null)} onSaved={() => { setNoteVisit(null); refetch() }} />
      )}
    </div>
  )
}

/**
 * Parses vital signs from free-text input.
 * Supports common formats:
 *   "BP 140/90, HR 72, Temp 37.2, RR 18, SpO2 98, BS 5.5, Wt 65"
 *   "Blood pressure 140/90, heart rate 72, temperature 37.2"
 *   "140/90, 72, 37.2, 18, 98"
 *
 * Returns an object with any parsed vitals, or null if nothing was parsed.
 */
function parseVitalsFromText(text: string): any | null {
  const result: any = {}
  const lower = text.toLowerCase()

  // Blood pressure: "BP 140/90", "Blood pressure 140/90", "140/90"
  const bpMatch = lower.match(/(?:bp|blood\s*pressure)?\s*(\d{2,3})\s*\/\s*(\d{2,3})/)
  if (bpMatch) {
    result.bloodPressureSystolic = parseInt(bpMatch[1])
    result.bloodPressureDiastolic = parseInt(bpMatch[2])
  }

  // Heart rate: "HR 72", "Heart rate 72", "pulse 72"
  const hrMatch = lower.match(/(?:hr|heart\s*rate|pulse)\s*:?\s*(\d{2,3})/)
  if (hrMatch) {
    result.heartRate = parseInt(hrMatch[1])
  }

  // Temperature: "Temp 37.2", "Temperature 37.2", "37.2°C", "37.2C"
  const tempMatch = lower.match(/(?:temp|temperature)?\s*:?\s*(\d{2,3}(?:\.\d)?)\s*(?:°?c|°?f)?/i)
  if (tempMatch) {
    const temp = parseFloat(tempMatch[1])
    // Only accept if it looks like a temperature (30-45°C or 90-115°F)
    if (temp >= 30 && temp <= 45) {
      result.temperature = temp
    } else if (temp >= 90 && temp <= 115) {
      // Convert Fahrenheit to Celsius
      result.temperature = parseFloat(((temp - 32) * 5/9).toFixed(1))
    }
  }

  // Respiratory rate: "RR 18", "Respiratory rate 18", "Resp 18"
  const rrMatch = lower.match(/(?:rr|resp(?:iratory)?\s*rate)\s*:?\s*(\d{2,3})/)
  if (rrMatch) {
    const rr = parseInt(rrMatch[1])
    if (rr >= 8 && rr <= 60) result.respiratoryRate = rr
  }

  // Oxygen saturation: "SpO2 98", "O2 98", "Oxygen 98%", "Sat 98"
  const o2Match = lower.match(/(?:spo2|o2|oxygen|sat)\s*:?\s*(\d{2,3})\s*%?/)
  if (o2Match) {
    const o2 = parseInt(o2Match[1])
    if (o2 >= 50 && o2 <= 100) result.oxygenSaturation = o2
  }

  // Blood sugar: "BS 5.5", "Blood sugar 5.5", "Glucose 5.5", "BGL 5.5"
  const bsMatch = lower.match(/(?:bs|blood\s*sugar|glucose|bgl)\s*:?\s*(\d{1,3}(?:\.\d)?)\s*(?:mmol\/l|mg\/dl)?/)
  if (bsMatch) {
    const bs = parseFloat(bsMatch[1])
    // Accept both mmol/L (3-30) and mg/dL (50-500)
    if (bs >= 3 && bs <= 30) {
      result.bloodSugar = bs
    } else if (bs >= 50 && bs <= 500) {
      // Convert mg/dL to mmol/L
      result.bloodSugar = parseFloat((bs / 18.0182).toFixed(1))
    }
  }

  // Weight: "Wt 65", "Weight 65", "65kg", "65 kg"
  const wtMatch = lower.match(/(?:wt|weight)\s*:?\s*(\d{2,3}(?:\.\d)?)\s*kg?/)
  if (wtMatch) {
    result.weight = parseFloat(wtMatch[1])
  }

  // Return null if nothing was parsed
  const hasAny = Object.keys(result).length > 0
  return hasAny ? result : null
}

/**
 * VisitNoteDialog — lets the visiting professional enter clinical notes
 * when completing a visit. Includes chief complaint, vitals, findings,
 * diagnosis, treatment plan, prescription, and follow-up.
 */
function VisitNoteDialog({ visit, onClose, onSaved }: { visit: any; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const { data: currentUser } = useFetch<any>('/api/auth/me')

  // No access denial — if the user can see the button, they can fill/edit.
  const [editMode, setEditMode] = useState(false)
  const isReadOnly = visit.status === 'COMPLETED' && !editMode

  const [form, setForm] = useState<any>({
    chiefComplaint: visit.chiefComplaint || '',
    vitalsNote: visit.vitalsNote || '',
    findings: visit.findings || '',
    diagnosis: visit.diagnosis || '',
    treatmentPlan: visit.treatmentPlan || '',
    prescription: visit.prescription || '',
    followUpNote: visit.followUpNote || '',
    recommendations: visit.recommendations || '',
    duration: visit.duration || '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      const userName = currentUser?.user?.name || 'Unknown'
      const payload: any = {
        chiefComplaint: form.chiefComplaint || null,
        vitalsNote: form.vitalsNote || null,
        findings: form.findings || null,
        diagnosis: form.diagnosis || null,
        treatmentPlan: form.treatmentPlan || null,
        prescription: form.prescription || null,
        followUpNote: form.followUpNote || null,
        recommendations: form.recommendations || null,
        duration: form.duration ? parseInt(form.duration) : null,
      }
      // If the visit is still SCHEDULED, mark it as COMPLETED and record who completed it
      if (visit.status === 'SCHEDULED') {
        payload.status = 'COMPLETED'
        payload.completedAt = new Date().toISOString()
        payload.completedById = currentUser?.user?.id || null
        payload.completedByName = userName
      }
      await apiPatch(`/api/data?type=visits&id=${visit.id}`, payload)

      // Auto-create a VitalSign record from the vitals note text.
      // Parses common formats: "BP 140/90, HR 72, Temp 37.2, RR 18, SpO2 98, BS 5.5, Wt 65"
      if (form.vitalsNote && form.vitalsNote.trim()) {
        const parsed = parseVitalsFromText(form.vitalsNote)
        if (parsed) {
          try {
            await apiPost('/api/data?type=vitals', {
              residentId: visit.residentId,
              ...parsed,
              notes: `Recorded during ${visit.visitType.replace(/_/g, ' ')} visit by ${userName}`,
              recordedById: currentUser?.user?.id || null,
            })
            toast.success('Vitals auto-saved to Vital Signs module')
          } catch (e: any) {
            console.log('Vitals auto-save failed (non-critical):', e.message)
          }
        }
      }

      toast.success(visit.status === 'SCHEDULED' ? 'Visit form submitted — moved to Past Visits' : 'Visit notes updated')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title={isReadOnly ? 'Visit Notes (Read-Only)' : visit.status === 'SCHEDULED' ? 'Visit Form — Clinical Notes' : 'Edit Visit Notes'} onClose={onClose}>
      <div className="space-y-3">
        {/* Visit info */}
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <Badge variant="outline">{visit.visitType.replace(/_/g, ' ')}</Badge>
          <span className="whitespace-nowrap">Scheduled: {fmtDateTime(visit.scheduledAt)}</span>
          {visit.staff && <span className="whitespace-nowrap">• Assigned: {visit.staff.firstName} {visit.staff.lastName}</span>}
          {visit.completedByName && <span className="whitespace-nowrap">• Filled by: {visit.completedByName}</span>}
          {isReadOnly && <Badge variant="outline" className="text-[9px] text-amber-700 border-amber-300">Read-Only</Badge>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Chief Complaint</label>
            <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={form.chiefComplaint} onChange={e => setForm({ ...form, chiefComplaint: e.target.value })} disabled={isReadOnly} placeholder="Patient's main complaint, e.g. lower back pain for 2 weeks" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Vitals Recorded <span className="text-[9px] text-emerald-600">(auto-saves to Vital Signs)</span></label>
            <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={form.vitalsNote} onChange={e => setForm({ ...form, vitalsNote: e.target.value })} disabled={isReadOnly} placeholder="BP 140/90, HR 72, Temp 37.2, RR 18, SpO2 98, BS 5.5, Wt 65" />
            <p className="text-[9px] text-muted-foreground mt-0.5">Vitals entered here are automatically parsed and saved to the Vital Signs module.</p>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Duration (minutes)</label>
            <Input type="number" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} disabled={isReadOnly} placeholder="30" className="text-sm" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Findings (examination)</label>
            <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={form.findings} onChange={e => setForm({ ...form, findings: e.target.value })} disabled={isReadOnly} placeholder="Physical examination findings, observations" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Diagnosis</label>
            <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={form.diagnosis} onChange={e => setForm({ ...form, diagnosis: e.target.value })} disabled={isReadOnly} placeholder="Working diagnosis / assessment" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Treatment Plan</label>
            <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={form.treatmentPlan} onChange={e => setForm({ ...form, treatmentPlan: e.target.value })} disabled={isReadOnly} placeholder="Management plan, procedures, therapy" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Prescription</label>
            <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={form.prescription} onChange={e => setForm({ ...form, prescription: e.target.value })} disabled={isReadOnly} placeholder="Medications prescribed, dosage, frequency" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Follow-up Instructions</label>
            <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={form.followUpNote} onChange={e => setForm({ ...form, followUpNote: e.target.value })} disabled={isReadOnly} placeholder="Follow-up advice, next appointment, referral" />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Recommendations</label>
            <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={form.recommendations} onChange={e => setForm({ ...form, recommendations: e.target.value })} disabled={isReadOnly} placeholder="Additional recommendations for care staff" />
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 pt-1">
          {(!isReadOnly || editMode) ? (
            <>
              {editMode ? (
                <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
              ) : (
                <Button variant="outline" onClick={onClose}>Cancel</Button>
              )}
              <Button onClick={submit} disabled={saving}>
                {saving ? 'Submitting...' : visit.status === 'SCHEDULED' ? 'Submit Form' : 'Update Notes'}
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setEditMode(true)}>
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  )
}

function IncidentsTab({ residentId, incidents, onAdd, refetch }: any) {
  const handleDelete = async (id: string) => {
    if (!confirm('Delete this incident report?')) return
    try {
      await apiDelete(`/api/data?type=incidents&id=${id}`)
      toast.success('Incident deleted')
      refetch()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleEdit = async (incident: any) => {
    const newDesc = prompt('Edit description:', incident.description)
    if (newDesc === null) return
    const newAction = prompt('Edit action taken:', incident.actionTaken || '')
    if (newAction === null) return
    const newFollowUp = prompt('Edit follow-up:', incident.followUp || '')
    if (newFollowUp === null) return
    try {
      await apiPatch(`/api/data?type=incidents&id=${incident.id}`, {
        description: newDesc,
        actionTaken: newAction || null,
        followUp: newFollowUp || null,
      })
      toast.success('Incident updated')
      refetch()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Incident Reports</h3>
        {onAdd && <Button size="sm" onClick={onAdd}><Plus className="h-3 w-3 mr-1" /> Report Incident</Button>}
      </div>
      <div className="grid gap-2">
        {incidents?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No incidents reported</p>}
        {incidents?.map((i: any) => (
          <Card key={i.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{i.incidentType.replace(/_/g, ' ')}</Badge>
                  <Badge variant="outline" className={
                    i.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                    i.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' :
                    i.severity === 'MODERATE' ? 'bg-amber-100 text-amber-700' :
                    'bg-emerald-100 text-emerald-700'
                  }>{i.severity}</Badge>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-xs text-muted-foreground mr-2">{fmtDateTime(i.occurredAt)}</span>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => handleEdit(i)} title="Edit">
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600" onClick={() => handleDelete(i.id)} title="Delete">
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
              <p className="text-sm mt-1">{i.description}</p>
              {i.actionTaken && <p className="text-xs mt-1 text-muted-foreground"><span className="font-medium">Action:</span> {i.actionTaken}</p>}
              {i.followUp && <p className="text-xs mt-0.5 text-muted-foreground"><span className="font-medium">Follow-up:</span> {i.followUp}</p>}
              {i.reportedBy && <p className="text-xs mt-0.5 text-muted-foreground">Reported by {i.reportedBy.code ? i.reportedBy.code + ' • ' : ''}{i.reportedBy.firstName} {i.reportedBy.lastName}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function CareLogsTab({ residentId, logs, onAdd, refetch }: any) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Daily Care Log</h3>
        {onAdd && <Button size="sm" onClick={onAdd}><Plus className="h-3 w-3 mr-1" /> Add Log</Button>}
      </div>
      <div className="grid gap-2">
        {logs?.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No care logs yet</p>}
        {logs?.map((l: any) => (
          <Card key={l.id}>
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <Badge variant="outline" className="text-xs">{l.category}</Badge>
                <span className="text-xs text-muted-foreground">{fmtDateTime(l.recordedAt)}</span>
              </div>
              <p className="text-sm">{l.description}</p>
              {l.staff && <p className="text-xs mt-1 text-muted-foreground">By {l.staff.code ? l.staff.code + ' • ' : ''}{l.staff.firstName} {l.staff.lastName}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

function BillingTab({ residentId, resident, unbilledItems, facilityId }: any) {
  const totalUnbilled = (unbilledItems || []).reduce((s: number, i: any) => s + i.total, 0)
  // Fetch invoices + payments + deposits for this resident
  const { data: invoices, loading: invLoading } = useFetch<any[]>(`/api/data?type=invoices&residentId=${residentId}`)
  const { data: payments, loading: payLoading } = useFetch<any[]>(`/api/data?type=payments&residentId=${residentId}`)
  const { data: deposits, loading: depLoading, refetch: refetchDeposits } = useFetch<any[]>(`/api/data?type=deposits&residentId=${residentId}`)
  const [showAddDeposit, setShowAddDeposit] = useState(false)

  const invList = invoices || []
  const payList = payments || []
  const depList = deposits || []

  // Summary calculations
  const totalBilled = invList.reduce((s: number, i: any) => s + i.total, 0)
  const totalPaid = invList.reduce((s: number, i: any) => s + i.amountPaid, 0)
  const totalOutstanding = invList
    .filter((i: any) => i.status !== 'PAID' && i.status !== 'CANCELLED')
    .reduce((s: number, i: any) => s + (i.total - i.amountPaid), 0)
  const totalPaymentsReceived = payList
    .filter((p: any) => p.status !== 'BOUNCED' && p.status !== 'REFUNDED')
    .reduce((s: number, p: any) => s + p.amount, 0)
  const totalUnapplied = payList
    .filter((p: any) => p.status !== 'BOUNCED' && p.status !== 'REFUNDED')
    .reduce((s: number, p: any) => s + (p.amount - (p.appliedAmount || 0)), 0)
  const totalDepositsHeld = depList
    .filter((d: any) => d.status === 'HELD')
    .reduce((s: number, d: any) => s + d.amount, 0)

  const loading = invLoading || payLoading || depLoading

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total Billed</div>
            <div className="text-lg font-bold text-sky-600">{fmtMoney(totalBilled)}</div>
            <div className="text-[10px] text-muted-foreground">{invList.length} invoice(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Collected</div>
            <div className="text-lg font-bold text-emerald-600">{fmtMoney(totalPaid)}</div>
            <div className="text-[10px] text-muted-foreground">{invList.filter((i: any) => i.status === 'PAID').length} fully paid</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Outstanding</div>
            <div className="text-lg font-bold text-red-600">{fmtMoney(totalOutstanding)}</div>
            <div className="text-[10px] text-muted-foreground">{invList.filter((i: any) => i.status !== 'PAID' && i.status !== 'CANCELLED').length} unpaid/partial</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Unapplied Credit</div>
            <div className="text-lg font-bold text-amber-600">{fmtMoney(totalUnapplied)}</div>
            <div className="text-[10px] text-muted-foreground">From {payList.filter((p: any) => p.status !== 'BOUNCED' && p.status !== 'REFUNDED' && (p.amount - (p.appliedAmount || 0)) > 0.01).length} payment(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Deposits Held</div>
            <div className="text-lg font-bold text-purple-600">{fmtMoney(totalDepositsHeld)}</div>
            <div className="text-[10px] text-muted-foreground">{depList.filter((d: any) => d.status === 'HELD').length} active deposit(s)</div>
          </CardContent>
        </Card>
      </div>

      {/* Invoices table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Invoice History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading invoices...</div>
          ) : invList.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No invoices for this resident yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Invoice #</th>
                    <th className="text-left p-2 font-medium">Issued</th>
                    <th className="text-left p-2 font-medium">Due</th>
                    <th className="text-right p-2 font-medium">Total</th>
                    <th className="text-right p-2 font-medium">Paid</th>
                    <th className="text-right p-2 font-medium">Balance</th>
                    <th className="text-left p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {invList.map((inv: any) => (
                    <tr key={inv.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">{inv.invoiceNumber}</td>
                      <td className="p-2 text-xs">{fmtDate(inv.issueDate)}</td>
                      <td className="p-2 text-xs">{fmtDate(inv.dueDate)}</td>
                      <td className="p-2 text-right">{fmtMoney(inv.total)}</td>
                      <td className="p-2 text-right text-emerald-600">{fmtMoney(inv.amountPaid)}</td>
                      <td className="p-2 text-right font-medium text-red-600">{fmtMoney(Math.round((inv.total - inv.amountPaid) * 100) / 100)}</td>
                      <td className="p-2"><StatusBadge status={inv.status} /></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 font-semibold bg-muted/30">
                  <tr>
                    <td colSpan={3} className="p-2 text-right">Totals:</td>
                    <td className="p-2 text-right">{fmtMoney(totalBilled)}</td>
                    <td className="p-2 text-right text-emerald-600">{fmtMoney(totalPaid)}</td>
                    <td className="p-2 text-right text-red-600">{fmtMoney(totalOutstanding)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Payment history */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Payment History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading payments...</div>
          ) : payList.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No payments recorded for this resident yet.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Payment #</th>
                    <th className="text-left p-2 font-medium">Date</th>
                    <th className="text-left p-2 font-medium">Payer</th>
                    <th className="text-left p-2 font-medium">Method</th>
                    <th className="text-left p-2 font-medium">Invoice</th>
                    <th className="text-right p-2 font-medium">Amount</th>
                    <th className="text-right p-2 font-medium">Applied</th>
                    <th className="text-left p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {payList.map((p: any) => (
                    <tr key={p.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">{p.paymentCode}</td>
                      <td className="p-2 text-xs">{fmtDate(p.paymentDate)}</td>
                      <td className="p-2 text-xs">{p.payerName || '—'}</td>
                      <td className="p-2"><Badge variant="outline" className="text-xs">{p.method.replace(/_/g, ' ')}</Badge></td>
                      <td className="p-2 font-mono text-xs">
                        {p.invoice?.invoiceNumber || (p.applications && p.applications.length > 0
                          ? p.applications.map((a: any) => a.invoice?.invoiceNumber).filter(Boolean).join(', ')
                          : '—')}
                      </td>
                      <td className="p-2 text-right font-medium">{fmtMoney(p.amount)}</td>
                      <td className="p-2 text-right">
                        <span className={p.appliedAmount >= p.amount - 0.01 ? 'text-emerald-600 font-medium' : p.appliedAmount > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                          {fmtMoney(p.appliedAmount)}
                        </span>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className={
                          p.status === 'CLEARED' ? 'bg-emerald-50 text-emerald-700 text-xs' :
                          p.status === 'PENDING' ? 'bg-amber-50 text-amber-700 text-xs' :
                          p.status === 'BOUNCED' ? 'bg-red-50 text-red-700 text-xs' :
                          'text-xs'
                        }>{p.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 font-semibold bg-muted/30">
                  <tr>
                    <td colSpan={5} className="p-2 text-right">Totals:</td>
                    <td className="p-2 text-right">{fmtMoney(totalPaymentsReceived)}</td>
                    <td className="p-2 text-right">{fmtMoney(totalPaymentsReceived - totalUnapplied)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Deposits */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Deposits</CardTitle>
            <Button size="sm" variant="outline" onClick={() => setShowAddDeposit(true)}>
              <Plus className="h-3 w-3 mr-1" /> Record Deposit
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {depLoading ? (
            <div className="p-4 text-center text-sm text-muted-foreground">Loading deposits...</div>
          ) : depList.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No deposits recorded for this resident.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Deposit #</th>
                    <th className="text-left p-2 font-medium">Date</th>
                    <th className="text-left p-2 font-medium">Type</th>
                    <th className="text-left p-2 font-medium">Method</th>
                    <th className="text-left p-2 font-medium">Payer</th>
                    <th className="text-right p-2 font-medium">Amount</th>
                    <th className="text-left p-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {depList.map((d: any) => (
                    <tr key={d.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">{d.depositCode}</td>
                      <td className="p-2 text-xs">{fmtDate(d.paymentDate)}</td>
                      <td className="p-2"><Badge variant="outline" className="text-xs">{d.type}</Badge></td>
                      <td className="p-2 text-xs">{d.paymentMethod?.replace(/_/g, ' ') || '—'}</td>
                      <td className="p-2 text-xs">{d.payerName || '—'}</td>
                      <td className="p-2 text-right font-medium">{fmtMoney(d.amount)}</td>
                      <td className="p-2">
                        <Badge variant="outline" className={
                          d.status === 'HELD' ? 'bg-purple-50 text-purple-700 text-xs' :
                          d.status === 'REFUNDED' ? 'bg-slate-100 text-slate-600 text-xs' :
                          d.status === 'APPLIED' ? 'bg-emerald-50 text-emerald-700 text-xs' :
                          'text-xs'
                        }>{d.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Unbilled services */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">
            Unbilled Services
            {resident?.code && <span className="text-xs font-mono text-primary ml-2">{resident.code}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {unbilledItems?.length === 0 ? (
            <p className="text-sm text-muted-foreground">No unbilled services</p>
          ) : (
            <>
              <div className="space-y-2 mb-3">
                {unbilledItems?.map((i: any) => (
                  <div key={i.id} className="flex justify-between text-sm border-b pb-1">
                    <div>
                      <div>{i.description}</div>
                      <div className="text-xs text-muted-foreground">{i.category} • Qty {i.quantity} × {fmtMoney(i.unitPrice)}</div>
                    </div>
                    <div className="font-medium">{fmtMoney(i.total)}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between font-semibold">
                <span>Total Unbilled</span>
                <span className="text-red-600">{fmtMoney(totalUnbilled)}</span>
              </div>
              <p className="text-xs text-muted-foreground mt-2">To create an invoice from these items, go to the Accounting module → Invoices tab → New Invoice.</p>
            </>
          )}
        </CardContent>
      </Card>

      {showAddDeposit && (
        <AddDepositDialog
          residentId={residentId}
          resident={resident}
          facilityId={facilityId}
          onClose={() => setShowAddDeposit(false)}
          onSaved={() => { setShowAddDeposit(false); refetchDeposits() }}
        />
      )}
    </div>
  )
}

// ============ ADD DEPOSIT DIALOG ============
function AddDepositDialog({ residentId, resident, onClose, onSaved, facilityId }: any) {
  useEscClose(onClose)
  const { depositTypes, paymentMethods } = useAppDropdowns()
  // Fetch the facility's bank accounts so the user can pick which bank
  // received the deposit. The selected bank's GL will be Dr'd in the auto-post
  // JE (instead of the generic 1010 Cash account).
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: bankAccounts } = useFetch<any[]>(`/api/data?type=bankAccounts${facilityParam}`)
  const [form, setForm] = useState({
    amount: '',
    type: 'ADMISSION',
    paymentDate: new Date().toISOString().slice(0, 10),
    paymentMethod: 'BANK_TRANSFER',
    payerName: resident ? `${resident.firstName} ${resident.lastName}` : '',
    reference: '',
    bankAccount: '',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      // Use raw fetch instead of apiPost so we can read the _autoPostWarning
      // field from the response. If the GL account is missing, the deposit
      // is still saved but a warning is returned to surface to the user.
      const r = await fetch('/api/data?type=deposits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          residentId,
          amount: parseFloat(form.amount),
          type: form.type,
          paymentDate: form.paymentDate,
          paymentMethod: form.paymentMethod,
          payerName: form.payerName || null,
          reference: form.reference || null,
          bankAccount: form.bankAccount || null,
          notes: form.notes || null,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
      if (data._autoPostWarning) {
        toast.warning(data._autoPostWarning, { duration: 12000 })
      } else {
        toast.success('Deposit recorded')
      }
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title="Record Deposit" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
          Deposits are held as a liability (account 2300 — Resident Deposits Held) and refunded when the resident leaves.
          {resident?.code && <span className="block mt-1">Resident: <span className="font-mono text-primary">{resident.code}</span> {resident.firstName} {resident.lastName}</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount (RM) *</label>
            <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
            <select className="w-full border rounded px-2 py-1.5" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {(depositTypes.length > 0 ? depositTypes : ['ADMISSION', 'SECURITY', 'ADVANCE', 'OTHER']).map(t => (
                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Date</label>
            <Input type="date" value={form.paymentDate} onChange={e => setForm({ ...form, paymentDate: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Method</label>
            <select className="w-full border rounded px-2 py-1.5" value={form.paymentMethod} onChange={e => setForm({ ...form, paymentMethod: e.target.value })}>
              {(paymentMethods.length > 0 ? paymentMethods : ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE']).map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Payer Name</label>
            <Input value={form.payerName} onChange={e => setForm({ ...form, payerName: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Reference</label>
            <Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="cheque #, txn id" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank Account</label>
            <select className="w-full border rounded px-2 py-1.5" value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })}>
              <option value="">— Select bank account —</option>
              {(bankAccounts || []).map(b => <option key={b.id} value={b.name}>{b.code} — {b.name}{b.bankName ? ` (${b.bankName})` : ''}</option>)}
            </select>
            <div className="text-[10px] text-muted-foreground mt-0.5">Which bank received this deposit (determines GL Dr account)</div>
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
          <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Record Deposit'}</Button>
      </div>
    </Modal>
  )
}

// ============ DIALOGS ============
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEscClose(onClose)
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8 max-h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex justify-between items-center border-b p-4 flex-shrink-0">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 overflow-y-auto flex-1">{children}</div>
      </div>
    </div>
  )
}

function StatusHistoryTab({ residentId }: { residentId: string }) {
  const { data, loading } = useFetch<any[]>(`/api/data?type=statusLogs&residentId=${residentId}`)
  const [showAdd, setShowAdd] = useState(false)

  if (loading) return <Skeleton className="h-48" />

  const logs = data || []

  // Calculate duration between status changes
  const processedLogs = logs.map((log, i) => {
    const nextLog = logs[i + 1] // next in DESC order = previous in time
    let duration = null
    if (nextLog) {
      const from = new Date(nextLog.changedAt)
      const to = new Date(log.changedAt)
      const diffMs = to.getTime() - from.getTime()
      const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
      const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      duration = days > 0 ? `${days}d ${hours}h` : `${hours}h`
    }
    return { ...log, duration }
  })

  const statusColors: Record<string, string> = {
    ACTIVE: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    HOSPITALIZED: 'bg-red-100 text-red-700 border-red-200',
    OUT_WITH_FAMILY: 'bg-violet-100 text-violet-700 border-violet-200',
    DISCHARGED: 'bg-slate-100 text-slate-700 border-slate-300',
    DECEASED: 'bg-slate-200 text-slate-600 border-slate-400',
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="font-semibold text-sm">Status Change History</h3>
        <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
          <Plus className="h-3 w-3 mr-1" /> Add Entry
        </Button>
      </div>

      {logs.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
            <p className="text-sm">No status changes recorded yet.</p>
            <p className="text-xs mt-1">When this resident's status changes (hospitalized, discharged, etc.), it will be logged here with timestamps.</p>
          </CardContent>
        </Card>
      )}

      {/* Timeline */}
      {processedLogs.length > 0 && (
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-2 top-0 bottom-0 w-0.5 bg-border" />

          {processedLogs.map((log, i) => (
            <div key={log.id} className="relative mb-4">
              {/* Dot */}
              <div className={`absolute -left-4.5 w-4 h-4 rounded-full border-2 border-background ${statusColors[log.toStatus] || 'bg-muted'} top-1`} style={{ left: '-1.625rem' }} />

              <Card>
                <CardContent className="p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className={`text-xs ${statusColors[log.fromStatus] || ''}`}>{log.fromStatus.replace(/_/g, ' ')}</Badge>
                      <span className="text-muted-foreground text-xs">→</span>
                      <Badge variant="outline" className={`text-xs ${statusColors[log.toStatus] || ''}`}>{log.toStatus.replace(/_/g, ' ')}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(log.changedAt)}</span>
                  </div>
                  {log.reason && (
                    <p className="text-sm text-muted-foreground italic">"{log.reason}"</p>
                  )}
                  <div className="flex items-center justify-between mt-1">
                    <span className="text-xs text-muted-foreground">By {log.changedByName}</span>
                    {log.duration && (
                      <Badge variant="outline" className="text-xs">Duration in previous status: {log.duration}</Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <AddStatusLogDialog residentId={residentId} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); window.location.reload() }} />
      )}
    </div>
  )
}

function AddStatusLogDialog({ residentId, onClose, onSaved }: { residentId: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const [toStatus, setToStatus] = useState('HOSPITALIZED')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      // Update the resident status (this auto-creates a status log entry)
      await apiPatch(`/api/data?type=residents&id=${residentId}`, {
        status: toStatus,
        statusReason: reason || undefined,
        dischargeDate: toStatus === 'DISCHARGED' || toStatus === 'DECEASED' ? new Date().toISOString() : null,
      })
      toast.success('Status change logged')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><Clock className="h-4 w-4" /> Log Status Change</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">New Status *</label>
            <select className="w-full border rounded px-2 py-1.5" value={toStatus} onChange={e => setToStatus(e.target.value)}>
              <option value="ACTIVE">✅ Active</option>
              <option value="HOSPITALIZED">🏥 Hospitalized</option>
              <option value="OUT_WITH_FAMILY">🏠 Out with Family</option>
              <option value="DISCHARGED">📤 Discharged</option>
              <option value="DECEASED">⚰️ Deceased</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason / Notes</label>
            <textarea
              className="w-full border rounded px-2 py-1.5 text-sm"
              rows={3}
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g., Admitted to hospital for hypertension, returned from hospital, family took resident home for weekend..."
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Log Status Change'}</Button>
        </div>
      </div>
    </div>
  )
}

function AddResidentDialog({ facilityId, businessType, onClose, onCreated }: { facilityId?: string; businessType?: string; onClose: () => void; onCreated: (id: string) => void }) {
  useEscClose(onClose)
  const { dietaryNeeds } = useAppDropdowns(facilityId)
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const { data: facilitiesResponse } = useFetch<any>('/api/facilities/accessible')
  const allFacilities = facilitiesResponse?.facilities || facilitiesResponse || []
  const orgId = currentUser?.user?.organizationId
  const isOwnerOrDev = currentUser?.user?.level <= 1
  const userOrgFacilities = isOwnerOrDev
    ? allFacilities.filter((f: any) => !orgId || f.organizationId === orgId || allFacilities.length === 1)
    : allFacilities.filter((f: any) => (currentUser?.user?.facilityIds || '').split(',').includes(f.id))
  const defaultFacilityId = facilityId || (userOrgFacilities[0]?.id as string) || ''
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>(defaultFacilityId)
  const showFacilityPicker = !facilityId && userOrgFacilities.length > 0

  // Fetch rooms (with beds) for the selected facility — used in the Bed dropdown
  const { data: roomsData } = useFetch<any[]>(selectedFacilityId ? `/api/data?type=rooms&facilityId=${selectedFacilityId}` : null)
  // Build a flat list of available beds across all rooms
  const availableBeds = (roomsData || []).flatMap((r: any) =>
    (r.beds || []).map((b: any) => ({
      ...b,
      roomNumber: r.roomNumber,
      roomType: r.type,
      roomCapacity: r.capacity,
      roomOccupancy: r.residents?.length || 0,
    }))
  ).filter((b: any) => b.status === 'AVAILABLE' || b.status === 'OCCUPIED')

  const [form, setForm] = useState<any>({
    firstName: '', lastName: '', gender: 'Male', icPassportNumber: '', dietaryNeeds: 'Regular',
    allergies: '', conditions: '',
    emergencyContactName: '', emergencyContactPhone: '', emergencyContactRelation: '',
    insuranceProvider: '', insuranceNumber: '', notes: '',
    roomId: '',
    bedId: '',
  })
  const [dob, setDob] = useState('')
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.firstName || !form.lastName) { toast.error('First and last name required'); return }
    if (!selectedFacilityId) { toast.error('Please select a facility for this resident'); return }
    setSaving(true)
    try {
      const payload = { ...form, bedId: form.bedId || null, roomId: form.bedId ? undefined : (form.roomId || null), dateOfBirth: dob ? new Date(dob) : null, admissionDate: new Date(), status: 'ACTIVE' }
      const r = await apiPost(withFacility('/api/data?type=residents', selectedFacilityId), payload)
      // Save custom field values (only if we got a valid resident ID back)
      if (r && r.id) {
        try {
          await saveCustomFieldValues(r.id, customValues)
        } catch (e: any) {
          console.log('Custom field save failed (non-critical):', e.message)
        }
      }
      toast.success('Customer added')
      onCreated(r.id)
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title="Add New Resident" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        {/* Facility picker — shown when no facility is selected in the top-right filter */}
        {showFacilityPicker && (
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Facility *</label>
            <select
              className="w-full border rounded px-2 py-1.5"
              value={selectedFacilityId}
              onChange={e => setSelectedFacilityId(e.target.value)}
            >
              <option value="">— Select Facility —</option>
              {userOrgFacilities.map((f: any) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <p className="text-[10px] text-muted-foreground mt-0.5">This resident will be assigned to the selected facility.</p>
          </div>
        )}
        <Field label="First Name *"><Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} /></Field>
        <Field label="Last Name *"><Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} /></Field>
        <Field label="Date of Birth"><Input type="date" value={dob} onChange={e => setDob(e.target.value)} /></Field>
        <Field label="Gender">
          <select className="w-full border rounded px-2 py-1.5" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value })}>
            <option>Male</option><option>Female</option><option>Other</option>
          </select>
        </Field>
        <Field label="IC / Passport No."><Input value={form.icPassportNumber} onChange={e => setForm({ ...form, icPassportNumber: e.target.value })} placeholder="e.g., 800101-14-5678" /></Field>
        {isFieldVisible(businessType, 'allergies') && <Field label="Allergies"><Input value={form.allergies} onChange={e => setForm({ ...form, allergies: e.target.value })} placeholder="Penicillin, Peanuts" /></Field>}
        {isFieldVisible(businessType, 'conditions') && <Field label="Conditions"><Input value={form.conditions} onChange={e => setForm({ ...form, conditions: e.target.value })} placeholder="Hypertension, Diabetes" /></Field>}
        {isFieldVisible(businessType, 'dietaryNeeds') && <Field label="Dietary Needs">
          <select className="w-full border rounded px-2 py-1.5" value={form.dietaryNeeds} onChange={e => setForm({ ...form, dietaryNeeds: e.target.value })}>
            {dietaryNeeds.map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>}
        {/* Bed assignment — shows available beds grouped by room */}
        {isFieldVisible(businessType, 'roomId') && (
          <Field label="Bed (Room)">
            <select className="w-full border rounded px-2 py-1.5" value={form.bedId} onChange={e => setForm({ ...form, bedId: e.target.value })}>
              <option value="">— Unassigned —</option>
              {(roomsData || []).map((r: any) => (
                <optgroup key={r.id} label={`Room ${r.roomNumber} (${r.type.replace(/_/g, ' ')}, ${r.residents?.length || 0}/${r.capacity})`}>
                  {(r.beds || []).filter((b: any) => b.status === 'AVAILABLE').map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.label || b.code} ({b.status})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        )}
        <Field label="Emergency Contact"><Input value={form.emergencyContactName} onChange={e => setForm({ ...form, emergencyContactName: e.target.value })} /></Field>
        <Field label="Emergency Phone"><Input value={form.emergencyContactPhone} onChange={e => setForm({ ...form, emergencyContactPhone: e.target.value })} /></Field>
        <Field label="Emergency Relationship"><Input value={form.emergencyContactRelation} onChange={e => setForm({ ...form, emergencyContactRelation: e.target.value })} /></Field>
        <div className="sm:col-span-2">
          <Field label="Notes"><textarea className="w-full border rounded px-2 py-1.5" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
        {/* Custom fields (e.g. body measurements for tailor) */}
        <CustomFieldsSection orgId={orgId} values={customValues} setValues={setCustomValues} />
      </div>
      {userOrgFacilities.length === 0 && (
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
          ⚠ You have no facilities yet. Please ask the App Developer or Owner to create a facility in Settings → Facility first, then come back to add a resident.
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving || !selectedFacilityId}>{saving ? 'Saving...' : 'Add Customer'}</Button>
      </div>
    </Modal>
  )
}

function EditResidentDialog({ resident, businessType, onClose, onSaved }: any) {
  useEscClose(onClose)
  const { dietaryNeeds } = useAppDropdowns()
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const orgId = currentUser?.user?.organizationId
  const [form, setForm] = useState<any>({ ...resident, dateOfBirth: resident.dateOfBirth ? resident.dateOfBirth.slice(0, 10) : '' })
  const [customValues, setCustomValues] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Fetch rooms (with beds) for the resident's facility — used in the Bed dropdown
  const { data: roomsData } = useFetch<any[]>(resident.facilityId ? `/api/data?type=rooms&facilityId=${resident.facilityId}` : null)

  const submit = async () => {
    setSaving(true)
    try {
      const { room, medications, vitals, careLogs, visits, incidents, medAdmins, invoiceItems, createdAt, updatedAt, customFieldValues, ...payload } = form
      await apiPatch(`/api/data?type=residents&id=${resident.id}`, {
        ...payload,
        dateOfBirth: form.dateOfBirth ? new Date(form.dateOfBirth) : null,
      })
      // Save custom field values (non-critical — don't fail the update if this fails)
      try {
        await saveCustomFieldValues(resident.id, customValues)
      } catch (e: any) {
        console.log('Custom field save failed (non-critical):', e.message)
      }
      toast.success('Customer updated')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title="Edit Resident" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Field label="First Name"><Input value={form.firstName || ''} onChange={e => setForm({ ...form, firstName: e.target.value })} /></Field>
        <Field label="Last Name"><Input value={form.lastName || ''} onChange={e => setForm({ ...form, lastName: e.target.value })} /></Field>
        <Field label="Date of Birth"><Input type="date" value={form.dateOfBirth || ''} onChange={e => setForm({ ...form, dateOfBirth: e.target.value })} /></Field>
        <Field label="Gender">
          <select className="w-full border rounded px-2 py-1.5" value={form.gender || 'Male'} onChange={e => setForm({ ...form, gender: e.target.value })}>
            <option>Male</option><option>Female</option><option>Other</option>
          </select>
        </Field>
        <Field label="IC / Passport No."><Input value={form.icPassportNumber || ''} onChange={e => setForm({ ...form, icPassportNumber: e.target.value })} placeholder="e.g., 800101-14-5678" /></Field>
        {isFieldVisible(businessType, 'allergies') && <Field label="Allergies"><Input value={form.allergies || ''} onChange={e => setForm({ ...form, allergies: e.target.value })} /></Field>}
        {isFieldVisible(businessType, 'conditions') && <Field label="Conditions"><Input value={form.conditions || ''} onChange={e => setForm({ ...form, conditions: e.target.value })} /></Field>}
        {isFieldVisible(businessType, 'dietaryNeeds') && <Field label="Dietary Needs">
          <select className="w-full border rounded px-2 py-1.5" value={form.dietaryNeeds || 'Regular'} onChange={e => setForm({ ...form, dietaryNeeds: e.target.value })}>
            {dietaryNeeds.map(o => <option key={o}>{o}</option>)}
          </select>
        </Field>}
        {/* Bed assignment — shows all beds grouped by room (resident's current bed + available beds) */}
        {isFieldVisible(businessType, 'roomId') && (
          <Field label="Bed (Room)">
            <select className="w-full border rounded px-2 py-1.5" value={form.bedId || ''} onChange={e => setForm({ ...form, bedId: e.target.value || null })}>
              <option value="">— Unassigned —</option>
              {(roomsData || []).map((r: any) => (
                <optgroup key={r.id} label={`Room ${r.roomNumber} (${r.type.replace(/_/g, ' ')}, ${r.residents?.length || 0}/${r.capacity})`}>
                  {(r.beds || []).filter((b: any) => b.status === 'AVAILABLE' || b.id === form.bedId).map((b: any) => (
                    <option key={b.id} value={b.id}>
                      {b.label || b.code} ({b.status === 'OCCUPIED' && b.id === form.bedId ? 'CURRENT' : b.status})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
        )}
        <Field label="Emergency Contact"><Input value={form.emergencyContactName || ''} onChange={e => setForm({ ...form, emergencyContactName: e.target.value })} /></Field>
        <Field label="Emergency Phone"><Input value={form.emergencyContactPhone || ''} onChange={e => setForm({ ...form, emergencyContactPhone: e.target.value })} /></Field>
        <Field label="Relationship"><Input value={form.emergencyContactRelation || ''} onChange={e => setForm({ ...form, emergencyContactRelation: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Notes"><textarea className="w-full border rounded px-2 py-1.5" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
        {/* Custom fields (e.g. body measurements for tailor) */}
        <CustomFieldsSection orgId={orgId} entityId={resident.id} values={customValues} setValues={setCustomValues} />
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
      </div>
    </Modal>
  )
}

function AddMedicationDialog({ residentId, facilityId, onClose, onSaved }: any) {
  useEscClose(onClose)
  const { frequencies, routes, prescribers, loading: settingsLoading } = useMedSettings(facilityId)
  const { medDurations } = useAppDropdowns(facilityId)
  const [form, setForm] = useState<any>({ name: '', dosage: '', frequency: '', route: '', duration: '', prescribedBy: '' })
  const [scheduleTimes, setScheduleTimes] = useState<string[]>([])

  useEffect(() => {
    setForm(prev => ({
      ...prev,
      frequency: prev.frequency || frequencies[0] || 'Once daily',
      route: prev.route || routes[0] || 'Oral Tablet',
    }))
  }, [frequencies, routes])

  // Auto-derive suggested times when frequency changes
  useEffect(() => {
    if (!form.frequency) return
    const freq = form.frequency.toLowerCase()
    let suggested: string[] = []
    if (freq.includes('bedtime') || freq.includes('night')) suggested = ['22:00']
    else if (freq.includes('morning') || freq.includes('breakfast')) suggested = ['08:00']
    else if (freq.includes('evening')) suggested = ['18:00']
    else if (freq.includes('four times') || freq.includes('4 times')) suggested = ['08:00', '12:00', '16:00', '20:00']
    else if (freq.includes('three times') || freq.includes('3 times')) suggested = ['08:00', '14:00', '20:00']
    else if (freq.includes('twice') || freq.includes('2 times')) suggested = ['08:00', '20:00']
    else if (freq.includes('every 4')) suggested = ['08:00', '12:00', '16:00', '20:00']
    else if (freq.includes('every 6')) suggested = ['08:00', '14:00', '20:00']
    else if (freq.includes('every 8')) suggested = ['08:00', '16:00']
    else if (freq.includes('weekly')) suggested = ['08:00']
    else if (freq.includes('prn') || freq.includes('as needed')) suggested = ['08:00']
    else suggested = ['08:00']
    setScheduleTimes(suggested)
  }, [form.frequency])

  const [saving, setSaving] = useState(false)
  const [customFreq, setCustomFreq] = useState(false)
  const [customRoute, setCustomRoute] = useState(false)
  const [customPrescriber, setCustomPrescriber] = useState(false)

  const DURATION_OPTIONS = medDurations.length > 0 ? medDurations : ['Ongoing', '7 days', '14 days', '30 days', '60 days', '90 days', '6 months', '1 year']
  const [customDuration, setCustomDuration] = useState(false)

  const updateTime = (idx: number, value: string) => {
    setScheduleTimes(prev => prev.map((t, i) => i === idx ? value : t))
  }
  const addTimeSlot = () => setScheduleTimes(prev => [...prev, '12:00'])
  const removeTimeSlot = (idx: number) => setScheduleTimes(prev => prev.filter((_, i) => i !== idx))

  const submit = async () => {
    if (!form.name) { toast.error('Medication name required'); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=medications', {
        ...form,
        residentId,
        startDate: new Date(),
        active: true,
        scheduleTimes: scheduleTimes.length > 0 ? JSON.stringify(scheduleTimes) : null,
      })
      toast.success('Medication added')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }
  return (
    <Modal title="Add Medication" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Field label="Name *"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Lisinopril" /></Field>
        <Field label="Dosage"><Input value={form.dosage} onChange={e => setForm({ ...form, dosage: e.target.value })} placeholder="10mg" /></Field>

        {/* Frequency */}
        <Field label="Frequency">
          {customFreq ? (
            <div className="flex gap-1">
              <Input value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} placeholder="Custom frequency" autoFocus />
              <Button type="button" size="sm" variant="outline" onClick={() => { setCustomFreq(false); setForm({ ...form, frequency: frequencies[0] || 'Once daily' }) }}>List</Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <select className="w-full border rounded px-2 py-1.5 flex-1" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} disabled={settingsLoading}>
                {settingsLoading && <option>Loading…</option>}
                {frequencies.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" onClick={() => setCustomFreq(true)}>Custom</Button>
            </div>
          )}
        </Field>

        {/* Route */}
        <Field label="Route">
          {customRoute ? (
            <div className="flex gap-1">
              <Input value={form.route} onChange={e => setForm({ ...form, route: e.target.value })} placeholder="Custom route" autoFocus />
              <Button type="button" size="sm" variant="outline" onClick={() => { setCustomRoute(false); setForm({ ...form, route: routes[0] || 'Oral Tablet' }) }}>List</Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <select className="w-full border rounded px-2 py-1.5 flex-1" value={form.route} onChange={e => setForm({ ...form, route: e.target.value })} disabled={settingsLoading}>
                {settingsLoading && <option>Loading…</option>}
                {routes.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" onClick={() => setCustomRoute(true)}>Custom</Button>
            </div>
          )}
        </Field>

        {/* Duration */}
        <Field label="Duration">
          {customDuration ? (
            <div className="flex gap-1">
              <Input value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 3 weeks" autoFocus />
              <Button type="button" size="sm" variant="outline" onClick={() => { setCustomDuration(false); setForm({ ...form, duration: 'Ongoing' }) }}>List</Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <select className="w-full border rounded px-2 py-1.5 flex-1" value={form.duration || 'Ongoing'} onChange={e => setForm({ ...form, duration: e.target.value })}>
                {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" onClick={() => setCustomDuration(true)}>Custom</Button>
            </div>
          )}
        </Field>

        {/* Prescribed By */}
        <Field label="Prescribed By">
          {customPrescriber ? (
            <div className="flex gap-1">
              <Input value={form.prescribedBy} onChange={e => setForm({ ...form, prescribedBy: e.target.value })} placeholder="Custom prescriber name" autoFocus />
              <Button type="button" size="sm" variant="outline" onClick={() => { setCustomPrescriber(false); setForm({ ...form, prescribedBy: '' }) }}>List</Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <select className="w-full border rounded px-2 py-1.5 flex-1" value={form.prescribedBy} onChange={e => setForm({ ...form, prescribedBy: e.target.value })} disabled={settingsLoading}>
                <option value="">— Select prescriber —</option>
                {prescribers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" onClick={() => setCustomPrescriber(true)}>Custom</Button>
            </div>
          )}
        </Field>

        {/* Schedule Times — staff can set/override the times for each dose */}
        <div className="sm:col-span-2">
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-muted-foreground">Schedule Times (when to give each dose)</label>
            <Button type="button" size="sm" variant="ghost" className="h-6 text-xs" onClick={addTimeSlot}>
              <Plus className="h-3 w-3 mr-1" /> Add Time
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {scheduleTimes.map((time, idx) => (
              <div key={idx} className="flex items-center gap-1">
                <Input
                  type="time"
                  value={time}
                  onChange={e => updateTime(idx, e.target.value)}
                  className="w-28 text-sm"
                />
                {scheduleTimes.length > 1 && (
                  <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => removeTimeSlot(idx)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1">
            Times auto-filled from frequency. Adjust to match your facility's schedule. These times repeat every day at the same time.
          </p>
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <Field label="Notes"><textarea className="w-full border rounded px-2 py-1.5" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="e.g. Take with food, monitor for side effects..." /></Field>
        </div>
      </div>
      <p className="text-xs text-muted-foreground mt-2">
        Frequency, Route, and Prescriber options come from Settings → Medications.
      </p>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>Add Medication</Button>
      </div>
    </Modal>
  )
}

// ============ EDIT MEDICATION DIALOG ============
function EditMedicationDialog({ medication, facilityId, onClose, onSaved }: any) {
  useEscClose(onClose)
  const { frequencies, routes, prescribers, loading: settingsLoading } = useMedSettings(facilityId)
  const { medDurations } = useAppDropdowns(facilityId)
  const [form, setForm] = useState<any>({
    name: medication.name || '',
    dosage: medication.dosage || '',
    frequency: medication.frequency || '',
    route: medication.route || '',
    duration: medication.duration || 'Ongoing',
    prescribedBy: medication.prescribedBy || '',
    notes: medication.notes || '',
    active: medication.active ?? true,
  })
  const [saving, setSaving] = useState(false)
  const [customFreq, setCustomFreq] = useState(false)
  const [customRoute, setCustomRoute] = useState(false)
  const [customPrescriber, setCustomPrescriber] = useState(false)
  const [customDuration, setCustomDuration] = useState(false)

  const DURATION_OPTIONS = medDurations.length > 0 ? medDurations : ['Ongoing', '7 days', '14 days', '30 days', '60 days', '90 days', '6 months', '1 year']

  const submit = async () => {
    if (!form.name) { toast.error('Medication name required'); return }
    setSaving(true)
    try {
      await apiPatch(`/api/data?type=medications&id=${medication.id}`, form)
      toast.success('Medication updated')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title="Edit Medication" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Field label="Name *"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Dosage"><Input value={form.dosage} onChange={e => setForm({ ...form, dosage: e.target.value })} /></Field>

        <Field label="Frequency">
          {customFreq ? (
            <div className="flex gap-1">
              <Input value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} autoFocus />
              <Button type="button" size="sm" variant="outline" onClick={() => { setCustomFreq(false); setForm({ ...form, frequency: frequencies[0] || 'Once daily' }) }}>List</Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <select className="w-full border rounded px-2 py-1.5 flex-1" value={form.frequency} onChange={e => setForm({ ...form, frequency: e.target.value })} disabled={settingsLoading}>
                {frequencies.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" onClick={() => setCustomFreq(true)}>Custom</Button>
            </div>
          )}
        </Field>

        <Field label="Route">
          {customRoute ? (
            <div className="flex gap-1">
              <Input value={form.route} onChange={e => setForm({ ...form, route: e.target.value })} autoFocus />
              <Button type="button" size="sm" variant="outline" onClick={() => { setCustomRoute(false); setForm({ ...form, route: routes[0] || 'Oral Tablet' }) }}>List</Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <select className="w-full border rounded px-2 py-1.5 flex-1" value={form.route} onChange={e => setForm({ ...form, route: e.target.value })} disabled={settingsLoading}>
                {routes.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" onClick={() => setCustomRoute(true)}>Custom</Button>
            </div>
          )}
        </Field>

        <Field label="Duration">
          {customDuration ? (
            <div className="flex gap-1">
              <Input value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })} placeholder="e.g. 3 weeks" autoFocus />
              <Button type="button" size="sm" variant="outline" onClick={() => { setCustomDuration(false); setForm({ ...form, duration: 'Ongoing' }) }}>List</Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <select className="w-full border rounded px-2 py-1.5 flex-1" value={form.duration || 'Ongoing'} onChange={e => setForm({ ...form, duration: e.target.value })}>
                {DURATION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" onClick={() => setCustomDuration(true)}>Custom</Button>
            </div>
          )}
        </Field>

        <Field label="Prescribed By">
          {customPrescriber ? (
            <div className="flex gap-1">
              <Input value={form.prescribedBy} onChange={e => setForm({ ...form, prescribedBy: e.target.value })} autoFocus />
              <Button type="button" size="sm" variant="outline" onClick={() => { setCustomPrescriber(false); setForm({ ...form, prescribedBy: '' }) }}>List</Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <select className="w-full border rounded px-2 py-1.5 flex-1" value={form.prescribedBy} onChange={e => setForm({ ...form, prescribedBy: e.target.value })} disabled={settingsLoading}>
                <option value="">— Select prescriber —</option>
                {prescribers.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <Button type="button" size="sm" variant="outline" onClick={() => setCustomPrescriber(true)}>Custom</Button>
            </div>
          )}
        </Field>

        <Field label="Active">
          <select className="w-full border rounded px-2 py-1.5" value={form.active ? '1' : '0'} onChange={e => setForm({ ...form, active: e.target.value === '1' })}>
            <option value="1">Active</option>
            <option value="0">Inactive</option>
          </select>
        </Field>

        <div className="sm:col-span-2">
          <Field label="Notes"><textarea className="w-full border rounded px-2 py-1.5" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
      </div>
    </Modal>
  )
}

function AddVitalDialog({ residentId, onClose, onSaved }: any) {
  useEscClose(onClose)
  const [form, setForm] = useState<any>({})
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    setSaving(true)
    try {
      const payload = {
        residentId,
        temperature: form.temperature ? parseFloat(form.temperature) : null,
        bloodPressureSystolic: form.bpSys ? parseInt(form.bpSys) : null,
        bloodPressureDiastolic: form.bpDia ? parseInt(form.bpDia) : null,
        heartRate: form.heartRate ? parseInt(form.heartRate) : null,
        respiratoryRate: form.respRate ? parseInt(form.respRate) : null,
        oxygenSaturation: form.o2 ? parseInt(form.o2) : null,
        bloodSugar: form.glucose ? parseFloat(form.glucose) : null,
        weight: form.weight ? parseFloat(form.weight) : null,
        notes: form.notes || null,
        recordedAt: new Date(),
      }
      await apiPost('/api/data?type=vitals', payload)
      toast.success('Vitals recorded')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }
  return (
    <Modal title="Record Vital Signs" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Field label="Temperature (°C)"><Input type="number" step="0.1" value={form.temperature || ''} onChange={e => setForm({ ...form, temperature: e.target.value })} /></Field>
        <Field label="Blood Pressure"><div className="flex gap-1"><Input type="number" placeholder="Sys" value={form.bpSys || ''} onChange={e => setForm({ ...form, bpSys: e.target.value })} /><Input type="number" placeholder="Dia" value={form.bpDia || ''} onChange={e => setForm({ ...form, bpDia: e.target.value })} /></div></Field>
        <Field label="Heart Rate (bpm)"><Input type="number" value={form.heartRate || ''} onChange={e => setForm({ ...form, heartRate: e.target.value })} /></Field>
        <Field label="Respiratory Rate"><Input type="number" value={form.respRate || ''} onChange={e => setForm({ ...form, respRate: e.target.value })} /></Field>
        <Field label="O₂ Saturation (%)"><Input type="number" value={form.o2 || ''} onChange={e => setForm({ ...form, o2: e.target.value })} /></Field>
        <Field label="Blood Sugar (mmol/L)"><Input type="number" step="0.1" value={form.glucose || ''} onChange={e => setForm({ ...form, glucose: e.target.value })} /></Field>
        <Field label="Weight (kg)"><Input type="number" step="0.1" value={form.weight || ''} onChange={e => setForm({ ...form, weight: e.target.value })} /></Field>
        <div className="sm:col-span-2"><Field label="Notes"><textarea className="w-full border rounded px-2 py-1.5" rows={2} value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field></div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>Record Vitals</Button>
      </div>
    </Modal>
  )
}

function AddVisitDialog({ residentId, facilityId, onClose, onSaved }: any) {
  useEscClose(onClose)
  const { visitTypes } = useAppDropdowns(facilityId)
  const [form, setForm] = useState<any>({ visitType: 'DOCTOR', scheduledAt: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!form.scheduledAt) { toast.error('Date/time required'); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=visits', {
        residentId,
        visitType: form.visitType,
        scheduledAt: new Date(form.scheduledAt),
        status: 'SCHEDULED',
        findings: form.notes || null,
      })
      toast.success('Visit scheduled')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }
  return (
    <Modal title="Schedule Visit" onClose={onClose}>
      <div className="grid gap-3 text-sm">
        <Field label="Visit Type">
          <select className="w-full border rounded px-2 py-1.5" value={form.visitType} onChange={e => setForm({ ...form, visitType: e.target.value })}>
            {visitTypes.map(o => <option key={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        </Field>
        <Field label="Scheduled Date/Time *">
          <Input type="datetime-local" value={form.scheduledAt} onChange={e => setForm({ ...form, scheduledAt: e.target.value })} />
        </Field>
        <Field label="Notes"><textarea className="w-full border rounded px-2 py-1.5" rows={2} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>Schedule</Button>
      </div>
    </Modal>
  )
}

function AddIncidentDialog({ residentId, facilityId, onClose, onSaved }: any) {
  useEscClose(onClose)
  const { incidentTypes, incidentSeverities } = useAppDropdowns(facilityId)
  const [form, setForm] = useState<any>({ incidentType: 'FALL', severity: 'LOW', description: '', actionTaken: '', followUp: '' })
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!form.description) { toast.error('Description required'); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=incidents', {
        residentId,
        incidentType: form.incidentType,
        severity: form.severity,
        description: form.description,
        actionTaken: form.actionTaken || null,
        followUp: form.followUp || null,
        occurredAt: new Date(),
      })
      toast.success('Incident reported')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }
  return (
    <Modal title="Report Incident" onClose={onClose}>
      <div className="grid gap-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Type">
            <select className="w-full border rounded px-2 py-1.5" value={form.incidentType} onChange={e => setForm({ ...form, incidentType: e.target.value })}>
              {incidentTypes.map(o => <option key={o}>{o.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Severity">
            <select className="w-full border rounded px-2 py-1.5" value={form.severity} onChange={e => setForm({ ...form, severity: e.target.value })}>
              {incidentSeverities.map(o => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Description *"><textarea className="w-full border rounded px-2 py-1.5" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field>
        <Field label="Action Taken"><textarea className="w-full border rounded px-2 py-1.5" rows={2} value={form.actionTaken} onChange={e => setForm({ ...form, actionTaken: e.target.value })} /></Field>
        <Field label="Follow-up"><textarea className="w-full border rounded px-2 py-1.5" rows={2} value={form.followUp} onChange={e => setForm({ ...form, followUp: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>Report</Button>
      </div>
    </Modal>
  )
}

function AddCareLogDialog({ residentId, facilityId, onClose, onSaved }: any) {
  useEscClose(onClose)
  const { careLogCategories } = useAppDropdowns(facilityId)
  const [form, setForm] = useState<any>({ category: 'HYGIENE', description: '' })
  const [saving, setSaving] = useState(false)
  const submit = async () => {
    if (!form.description) { toast.error('Description required'); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=careLogs', {
        residentId,
        category: form.category,
        description: form.description,
        recordedAt: new Date(),
      })
      toast.success('Care log added')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }
  return (
    <Modal title="Add Care Log Entry" onClose={onClose}>
      <div className="grid gap-3 text-sm">
        <Field label="Category">
          <select className="w-full border rounded px-2 py-1.5" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {careLogCategories.map(o => <option key={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        </Field>
        <Field label="Description *"><textarea className="w-full border rounded px-2 py-1.5" rows={3} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="What did you observe or do?" /></Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>Add Log</Button>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
      {children}
    </div>
  )
}
