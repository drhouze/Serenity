'use client'

import { useState, useEffect, useCallback } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch } from './api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Settings, Pill, Users, Stethoscope, Building2, DollarSign,
  Save, Plus, Trash2, AlertTriangle, RotateCcw, Check, Edit, ListChecks, Package,
  BookOpen, Calendar, Mail, Cloud, FileText, Download, Database,
  GripVertical, ChevronUp, ChevronDown as ChevronDownIcon, Loader2, Pencil,
  CloudUpload, CloudDownload, Link2, Unlink, CheckCircle, XCircle, X, RefreshCw, ExternalLink,
  KeyRound, UserPlus, Receipt, Settings as SettingsIcon, Sparkles, Copy, Activity, Wallet, Banknote
} from 'lucide-react'
import { toast } from 'sonner'
import { ROLES, ROLE_LEVELS } from '@/lib/types'
import { BulkImports } from './BulkImports'

async function apiPost(url: string, body: any) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
  return r.json()
}

/**
 * Modules a custom tab can be placed under. The values match what the
 * GET /api/org-custom-tabs endpoint's `module` query param accepts (which
 * also normalises singular/plural — see the `norm` helper there).
 *
 * Used by:
 *   - The Custom Tabs sub-tab in Settings → Customization (so the org
 *     owner/manager can override the developer's default module).
 *   - The audit toast messages (to render a human-friendly label).
 */
const MODULE_OPTIONS: { value: string; label: string }[] = [
  { value: 'residents', label: 'Customers / Residents' },
  { value: 'clinical', label: 'Clinical' },
  { value: 'staff', label: 'Staff' },
]
const MODULE_LABELS: Record<string, string> = MODULE_OPTIONS.reduce((acc, m) => {
  acc[m.value] = m.label
  // Also map singular forms for display when reading from GlobalCustomTab.module
  acc[m.value.replace(/s$/, '')] = m.label
  return acc
}, {} as Record<string, string>)

export function SettingsModule({ facilityId, role }: { facilityId?: string; role?: string }) {
  const [activeSection, setActiveSection] = useState<string>('facility')
  const [settings, setSettings] = useState<any>(null)
  const [facilities, setFacilities] = useState<any[]>([])
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>(facilityId || '')
  const [selectedOrgId, setSelectedOrgId] = useState<string>('')  // developer-only org filter
  const [organizations, setOrganizations] = useState<any[]>([])
  // Tab reordering
  const [tabOrder, setTabOrder] = useState<string[] | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)

  // Keep local selected facility in sync with parent prop
  useEffect(() => {
    if (facilityId !== undefined) setSelectedFacilityId(facilityId)
  }, [facilityId])

  // For non-developers: auto-select the first accessible facility (no "Global Defaults" for them)
  useEffect(() => {
    if (role !== 'APP_DEVELOPER' && !selectedFacilityId && facilities.length > 0) {
      setSelectedFacilityId(facilities[0].id)
    }
  }, [role, facilities, selectedFacilityId])

  // Load facilities list (so Owner can pick which facility to edit settings for)
  useEffect(() => {
    fetch('/api/facilities/accessible')
      .then(r => r.json())
      .then(data => setFacilities(data.facilities || []))
      .catch(() => {})
  }, [])

  // Load organizations list (developer only — for org switching)
  useEffect(() => {
    if (role === 'APP_DEVELOPER') {
      fetch('/api/organizations')
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) setOrganizations(data)
        })
        .catch(() => {})
    }
  }, [role])

  const loadSettings = useCallback(async () => {
    try {
      const url = selectedFacilityId
        ? `/api/settings?facilityId=${encodeURIComponent(selectedFacilityId)}`
        : '/api/settings'
      const r = await fetch(url)
      const data = await r.json()
      setSettings(data)
    } catch (e: any) {
      toast.error('Failed to load settings')
    }
  }, [selectedFacilityId])

  useEffect(() => { loadSettings() }, [loadSettings])

  const saveSetting = async (key: string, value: any, options?: { silent?: boolean }) => {
    // Only Developer can save global defaults; Owner/Manager must have a facility selected
    if (role !== 'APP_DEVELOPER' && !selectedFacilityId) {
      toast.error('Select a specific facility to create an override. Only the App Developer can modify global defaults.')
      throw new Error('Only the App Developer can modify global defaults')
    }
    try {
      const r = await apiPost('/api/settings', { key, value, facilityId: selectedFacilityId || null })
      if (!options?.silent) toast.success('Setting saved')
      setSettings({ ...settings, [key]: r.value })
      return r.value
    } catch (e: any) {
      toast.error(e.message)
      throw e
    }
  }

  // Load saved tab order from settings (per-user)
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  useEffect(() => {
    // Load per-user settings tab order
    if (currentUser?.user?.id) {
      const key = `user:${currentUser.user.id}:settingsTabOrder`
      fetch('/api/settings')
        .then(r => r.json())
        .then(data => {
          const order = data[key]
          if (Array.isArray(order)) {
            setTabOrder(order)
          }
        })
        .catch(() => {})
    }
  }, [currentUser?.user?.id])

  // Tab reorder handlers
  const defaultSections = [
    { id: 'facility', label: 'Facility & Org', icon: Building2 },
    { id: 'users', label: 'Users & Levels', icon: Users },
    { id: 'staffSalary', label: 'Staff Salary Presets', icon: Wallet },
    { id: 'customFields', label: 'Customization', icon: ListChecks },
    { id: 'prefixes', label: 'Code Prefixes', icon: FileText },
    { id: 'backup', label: 'Backup & Restore', icon: Database },
    { id: 'dropdowns', label: 'Dropdowns', icon: ListChecks },
    { id: 'accounting', label: 'Accounting & Billing', icon: DollarSign },
    { id: 'ai', label: 'AI Assistant', icon: Sparkles },
    { id: 'external', label: 'External Integration', icon: Link2 },
  ]

  const sections = tabOrder
    ? [
        ...tabOrder.filter(id => defaultSections.find(s => s.id === id)).map(id => defaultSections.find(s => s.id === id)!),
        ...defaultSections.filter(s => !tabOrder.includes(s.id)),
      ]
    : defaultSections

  const moveTab = (id: string, direction: 'up' | 'down') => {
    const ids = sections.map(s => s.id)
    const idx = ids.indexOf(id)
    if (idx === -1) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= ids.length) return
    ;[ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]]
    setTabOrder(ids)
  }

  const handleDragStart = (id: string) => setDraggedId(id)
  const handleDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault()
    if (!draggedId || draggedId === overId) return
    const ids = sections.map(s => s.id)
    const fromIdx = ids.indexOf(draggedId)
    const toIdx = ids.indexOf(overId)
    if (fromIdx === -1 || toIdx === -1) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, draggedId)
    setTabOrder(ids)
  }
  const handleDragEnd = () => setDraggedId(null)

  const saveTabOrder = async () => {
    setSavingOrder(true)
    const order = sections.map(s => s.id)
    // Save per-user (not global) — key: user:<userId>:settingsTabOrder
    const userId = currentUser?.user?.id
    if (userId) {
      const key = `user:${userId}:settingsTabOrder`
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: order }),
        })
        toast.success('Tab order saved')
      } catch (e: any) {
        toast.error(e.message)
      }
    }
    setTabOrder(order)
    setEditMode(false)
    setSavingOrder(false)
  }

  const resetTabOrder = async () => {
    setSavingOrder(true)
    // Delete per-user settings tab order
    const userId = currentUser?.user?.id
    if (userId) {
      const key = `user:${userId}:settingsTabOrder`
      try {
        await fetch(`/api/settings?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
        toast.success('Reset to default order')
      } catch (e: any) {
        toast.error(e.message)
      }
    }
    setTabOrder(null)
    setEditMode(false)
    setSavingOrder(false)
  }

  if (!settings) return <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-32 bg-muted animate-pulse rounded" />)}</div>

  const selectedFacility = facilities.find(f => f.id === selectedFacilityId)
  const isOwnerAllFacilities = !selectedFacilityId

  // For developer: filter facilities by selected org (if any)
  const visibleFacilities = role === 'APP_DEVELOPER' && selectedOrgId
    ? facilities.filter(f => f.organizationId === selectedOrgId)
    : facilities

  const selectedOrg = organizations.find(o => o.id === selectedOrgId)

  return (
    <div className="space-y-4">
      {/* Facility scope banner */}
      <Card className={isOwnerAllFacilities ? 'border-amber-300 bg-amber-50' : 'border-sky-200 bg-sky-50'}>
        <CardContent className="p-3 space-y-2">
          <div className="flex items-start gap-3">
          <Building2 className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium break-words">
              {isOwnerAllFacilities
                ? role === 'APP_DEVELOPER' && selectedOrgId
                  ? `Editing Global Defaults — ${selectedOrg?.name || 'Organization'}`
                  : role === 'APP_DEVELOPER'
                    ? 'Editing Global Default Settings'
                    : 'Viewing Global Defaults (Read-Only)'
                : `Editing Settings for: ${selectedFacility?.name || 'Facility'}`}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5 break-words">
              {isOwnerAllFacilities
                ? role === 'APP_DEVELOPER'
                  ? selectedOrgId
                    ? `Editing defaults scoped to ${selectedOrg?.name}. Facilities in this org without their own override will use these values.`
                    : 'Editing global defaults. These apply to all facilities that do not have their own override. Select an organization above to scope your view.'
                  : 'Viewing global defaults (read-only). Select a specific facility above to create overrides for that facility. Only the App Developer can modify global defaults.'
                : 'These settings apply only to this facility. Other facilities keep their own settings or fall back to global defaults.'}
            </div>
          </div>
          </div>
          {/* Dropdowns row — full width on mobile, wraps below the text */}
          <div className="flex gap-2 flex-wrap items-center">
            {/* Organization selector — developer only */}
            {role === 'APP_DEVELOPER' && organizations.length > 0 && (
              <select
                className="border rounded px-2 py-1 text-sm bg-background"
                value={selectedOrgId}
                onChange={e => {
                  setSelectedOrgId(e.target.value)
                  setSelectedFacilityId('') // reset facility selection when org changes
                }}
                title="Switch organization"
              >
                <option value="">All Organizations</option>
                {organizations.map(org => (
                  <option key={org.id} value={org.id}>
                    {org.name}{org.blocked ? ' (Blocked)' : ''}
                  </option>
                ))}
              </select>
            )}
            {/* Facility selector */}
            {visibleFacilities.length > 0 && (
              <select
                className="border rounded px-2 py-1 text-sm bg-background"
                value={selectedFacilityId}
                onChange={e => setSelectedFacilityId(e.target.value)}
              >
                {/* "Global Defaults" option only for Developer */}
                {role === 'APP_DEVELOPER' && <option value="">Global Defaults</option>}
                {visibleFacilities.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit mode toolbar — only for Developer, Org Owner, Manager */}
      {editMode && (role === 'APP_DEVELOPER' || role === 'OWNER' || role === 'MANAGER') && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
          <Pencil className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-primary font-medium">Rearrange tabs — drag the grip handle or use arrows</span>
          <div className="ml-auto flex gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={saveTabOrder} disabled={savingOrder}>
              {savingOrder ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={resetTabOrder} disabled={savingOrder}>
              <RotateCcw className="h-3 w-3 mr-1" /> Reset
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b pb-px items-center scrollbar-thin">
        {sections.map((s, idx) => (
          <div
            key={s.id}
            draggable={editMode}
            onDragStart={() => editMode && handleDragStart(s.id)}
            onDragOver={(e) => editMode && handleDragOver(e, s.id)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-1 flex-shrink-0 ${editMode ? 'cursor-grab active:cursor-grabbing' : ''} ${draggedId === s.id ? 'opacity-50' : ''}`}
          >
            {editMode && <GripVertical className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />}
            <button
              onClick={() => { if (!editMode) setActiveSection(s.id) }}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                !editMode && activeSection === s.id
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              } ${editMode ? 'cursor-default' : ''}`}
            >
              <s.icon className="h-3.5 w-3.5" /> {s.label}
            </button>
            {editMode && (
              <div className="flex flex-col flex-shrink-0">
                <button onClick={() => moveTab(s.id, 'up')} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button onClick={() => moveTab(s.id, 'down')} disabled={idx === sections.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                  <ChevronDownIcon className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
        {!editMode && (role === 'APP_DEVELOPER' || role === 'OWNER' || role === 'MANAGER') && (
          <button
            onClick={() => setEditMode(true)}
            className="ml-auto flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 rounded-md whitespace-nowrap"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>

      {activeSection === 'dropdowns' && <DropdownSettings settings={settings} saveSetting={saveSetting} isGlobal={isOwnerAllFacilities} />}
      {activeSection === 'accounting' && <AccountingSettings settings={settings} saveSetting={saveSetting} isGlobal={isOwnerAllFacilities} />}
      {activeSection === 'customFields' && <CustomFieldsSettings selectedOrgId={selectedOrgId} settings={settings} />}
      {activeSection === 'prefixes' && <PrefixSettings settings={settings} saveSetting={saveSetting} isGlobal={isOwnerAllFacilities} />}
      {activeSection === 'users' && <UserLevelSettings settings={settings} saveSetting={saveSetting} />}
      {activeSection === 'staffSalary' && <StaffSalaryPresets role={role} facilityId={selectedFacilityId || facilityId} />}
      {activeSection === 'facility' && <FacilitySettings settings={settings} saveSetting={saveSetting} isGlobal={isOwnerAllFacilities} role={role} />}
      {activeSection === 'backup' && <BackupRestoreSettings settings={settings} saveSetting={saveSetting} role={role} facilityId={selectedFacilityId || facilityId} />}
      {activeSection === 'ai' && <AISettings role={role} />}
      {activeSection === 'external' && <ExternalIntegrationSettings role={role} facilityId={selectedFacilityId || facilityId} />}
    </div>
  )
}

// ============ MEDICATION SETTINGS ============
function MedicationSettings({ settings, saveSetting, isGlobal }: { settings: any; saveSetting: (k: string, v: any, options?: { silent?: boolean }) => Promise<any>; isGlobal: boolean }) {
  const [frequencies, setFrequencies] = useState<string[]>(settings.medFrequencies || [])
  const [routes, setRoutes] = useState<string[]>(settings.medRoutes || [])
  const [prescribers, setPrescribers] = useState<string[]>(settings.medPrescribers || [])
  const [newFreq, setNewFreq] = useState('')
  const [newRoute, setNewRoute] = useState('')
  const [newPrescriber, setNewPrescriber] = useState('')
  const [savingFreq, setSavingFreq] = useState(false)
  const [savingRoute, setSavingRoute] = useState(false)
  const [savingPrescriber, setSavingPrescriber] = useState(false)

  // Sync local state when settings reload (e.g. after facility switch)
  useEffect(() => {
    setFrequencies(settings.medFrequencies || [])
    setRoutes(settings.medRoutes || [])
    setPrescribers(settings.medPrescribers || [])
  }, [settings.medFrequencies, settings.medRoutes, settings.medPrescribers])

  const medStatuses = settings.medStatuses || []

  const saveFreqs = async () => {
    setSavingFreq(true)
    await saveSetting('medFrequencies', frequencies)
    setSavingFreq(false)
  }
  const saveRoutes = async () => {
    setSavingRoute(true)
    await saveSetting('medRoutes', routes)
    setSavingRoute(false)
  }
  const savePrescribers = async () => {
    setSavingPrescriber(true)
    await saveSetting('medPrescribers', prescribers)
    setSavingPrescriber(false)
  }

  return (
    <div className="space-y-4">
      {/* Facility scope indicator */}
      <div className={`text-xs px-3 py-2 rounded-md border ${isGlobal ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-sky-50 border-sky-200 text-sky-800'}`}>
        {isGlobal
          ? '⚠ These are GLOBAL defaults. They apply to all facilities that do not have their own override.'
          : '✓ These settings apply to the currently selected facility only.'}
      </div>

      {/* Frequencies */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Pill className="h-4 w-4" /> Medication Frequencies</CardTitle>
          <CardDescription>Add, edit, or remove frequency options. These appear as a dropdown when adding new medications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {frequencies.map((f, i) => (
              <Badge key={i} variant="outline" className="text-xs pr-1 group">
                {f}
                <button
                  onClick={() => setFrequencies(frequencies.filter((_, idx) => idx !== i))}
                  className="ml-1 text-red-400 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {frequencies.length === 0 && <p className="text-sm text-muted-foreground italic">No frequencies configured</p>}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add new frequency (e.g., Every other day)..."
              value={newFreq}
              onChange={e => setNewFreq(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newFreq.trim()) { setFrequencies([...frequencies, newFreq.trim()]); setNewFreq('') } }}
              className="flex-1"
            />
            <Button size="sm" onClick={() => {
              if (newFreq.trim() && !frequencies.includes(newFreq.trim())) {
                setFrequencies([...frequencies, newFreq.trim()])
                setNewFreq('')
              }
            }}><Plus className="h-3 w-3 mr-1" /> Add</Button>
          </div>
          <Button size="sm" variant="outline" onClick={saveFreqs} disabled={savingFreq}>
            {savingFreq ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            {savingFreq ? 'Saved!' : 'Save Frequencies'}
          </Button>
        </CardContent>
      </Card>

      {/* Routes */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Administration Routes</CardTitle>
          <CardDescription>How medications are administered. Appears as a dropdown in the MAR and Add Medication dialog.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {routes.map((r, i) => (
              <Badge key={i} variant="outline" className="text-xs pr-1 group">
                {r}
                <button
                  onClick={() => setRoutes(routes.filter((_, idx) => idx !== i))}
                  className="ml-1 text-red-400 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {routes.length === 0 && <p className="text-sm text-muted-foreground italic">No routes configured</p>}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add new route (e.g., Intramuscular)..."
              value={newRoute}
              onChange={e => setNewRoute(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newRoute.trim()) { setRoutes([...routes, newRoute.trim()]); setNewRoute('') } }}
              className="flex-1"
            />
            <Button size="sm" onClick={() => {
              if (newRoute.trim() && !routes.includes(newRoute.trim())) {
                setRoutes([...routes, newRoute.trim()])
                setNewRoute('')
              }
            }}><Plus className="h-3 w-3 mr-1" /> Add</Button>
          </div>
          <Button size="sm" variant="outline" onClick={saveRoutes} disabled={savingRoute}>
            {savingRoute ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            {savingRoute ? 'Saved!' : 'Save Routes'}
          </Button>
        </CardContent>
      </Card>

      {/* Prescribers */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Prescribers / Doctors</CardTitle>
          <CardDescription>Common prescribers for the "Prescribed By" dropdown in the Add Medication dialog.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {prescribers.map((p, i) => (
              <Badge key={i} variant="outline" className="text-xs pr-1 group">
                {p}
                <button
                  onClick={() => setPrescribers(prescribers.filter((_, idx) => idx !== i))}
                  className="ml-1 text-red-400 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {prescribers.length === 0 && <p className="text-sm text-muted-foreground italic">No prescribers configured — users will type freely</p>}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add new prescriber (e.g., Dr. Raj — Cardiologist)..."
              value={newPrescriber}
              onChange={e => setNewPrescriber(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newPrescriber.trim()) { setPrescribers([...prescribers, newPrescriber.trim()]); setNewPrescriber('') } }}
              className="flex-1"
            />
            <Button size="sm" onClick={() => {
              if (newPrescriber.trim() && !prescribers.includes(newPrescriber.trim())) {
                setPrescribers([...prescribers, newPrescriber.trim()])
                setNewPrescriber('')
              }
            }}><Plus className="h-3 w-3 mr-1" /> Add</Button>
          </div>
          <Button size="sm" variant="outline" onClick={savePrescribers} disabled={savingPrescriber}>
            {savingPrescriber ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            {savingPrescriber ? 'Saved!' : 'Save Prescribers'}
          </Button>
        </CardContent>
      </Card>

      {/* Statuses (read-only system config) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Medication Administration Statuses</CardTitle>
          <CardDescription>System statuses for medication administration (read-only — applies globally to all facilities)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {medStatuses.map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 p-2 border rounded-md">
                <Badge variant="outline" className="text-xs">{s.label}</Badge>
                <span className="text-xs text-muted-foreground">{s.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Auto-generation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Auto-Generation Settings</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>✅ Auto-generate tomorrow's meds on dashboard load: <span className="text-emerald-600 font-medium">Enabled</span></p>
          <p className="mt-1">✅ Smart scheduling: bedtime meds at 10 PM, morning meds at 8 AM, twice daily at 8 AM + 8 PM</p>
          <p className="mt-1">✅ Idempotent: safe to run multiple times</p>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ REUSABLE STRING-LIST EDITOR (for simple dropdown option lists) ============
// Used by DropdownSettings to edit arrays like roomTypes, expenseCategories, visitTypes, etc.
function StringListEditor({
  title,
  description,
  items,
  onSave,
  placeholder,
}: {
  title: string
  description?: string
  items: string[]
  onSave: (items: string[]) => Promise<void>
  placeholder?: string
}) {
  const [list, setList] = useState<string[]>(items)
  const [newItem, setNewItem] = useState('')
  const [saving, setSaving] = useState(false)

  // Sync when parent items change (e.g. after facility switch)
  useEffect(() => { setList(items) }, [items])

  const add = () => {
    const v = newItem.trim()
    if (v && !list.includes(v)) {
      setList([...list, v])
      setNewItem('')
    }
  }
  const remove = (i: number) => setList(list.filter((_, idx) => idx !== i))

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {list.map((item, i) => (
            <Badge key={i} variant="outline" className="text-xs pr-1 group">
              {item}
              <button
                onClick={() => remove(i)}
                className="ml-1 text-red-400 hover:text-red-600"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          {list.length === 0 && <p className="text-sm text-muted-foreground italic">No options configured</p>}
        </div>
        <div className="flex gap-2">
          <Input
            placeholder={placeholder || 'Add new option...'}
            value={newItem}
            onChange={e => setNewItem(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
            className="flex-1"
          />
          <Button size="sm" onClick={add}><Plus className="h-3 w-3 mr-1" /> Add</Button>
        </div>
        <Button size="sm" variant="outline" onClick={async () => { setSaving(true); await onSave(list); setSaving(false) }} disabled={saving}>
          {saving ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
          {saving ? 'Saved!' : 'Save'}
        </Button>
      </CardContent>
    </Card>
  )
}

// ============ DROPDOWN SETTINGS ============
// All configurable dropdowns across the app (rooms, finance, inventory, care, staff).
// Medication-related dropdowns (frequencies/routes/prescribers) are in the Medications tab.
function DropdownSettings({ settings, saveSetting, isGlobal }: { settings: any; saveSetting: (k: string, v: any, options?: { silent?: boolean }) => Promise<any>; isGlobal: boolean }) {
  const [shiftTypes, setShiftTypes] = useState<any[]>(settings.shiftTypes || [])
  const [newShift, setNewShift] = useState({ type: '', start: '07:00', end: '15:00' })
  const [savingShifts, setSavingShifts] = useState(false)

  // Medication settings state (moved here from Medications tab)
  const [frequencies, setFrequencies] = useState<string[]>(settings.medFrequencies || [])
  const [routes, setRoutes] = useState<string[]>(settings.medRoutes || [])
  const [prescribers, setPrescribers] = useState<string[]>(settings.medPrescribers || [])
  const [newFreq, setNewFreq] = useState('')
  const [newRoute, setNewRoute] = useState('')
  const [newPrescriber, setNewPrescriber] = useState('')
  const [savingFreq, setSavingFreq] = useState(false)
  const [savingRoute, setSavingRoute] = useState(false)
  const [savingPrescriber, setSavingPrescriber] = useState(false)

  // Resident status settings state (moved here from Resident Statuses tab)
  const residentStatuses = settings.residentStatuses || []
  const [editingStatus, setEditingStatus] = useState<number | null>(null)
  const [editStatusLabel, setEditStatusLabel] = useState('')
  const [editStatusDesc, setEditStatusDesc] = useState('')
  const [newStatusLabel, setNewStatusLabel] = useState('')
  const [newStatusDesc, setNewStatusDesc] = useState('')

  useEffect(() => { setShiftTypes(settings.shiftTypes || []) }, [settings.shiftTypes])
  useEffect(() => {
    setFrequencies(settings.medFrequencies || [])
    setRoutes(settings.medRoutes || [])
    setPrescribers(settings.medPrescribers || [])
  }, [settings.medFrequencies, settings.medRoutes, settings.medPrescribers])

  const medStatuses = settings.medStatuses || []

  const saveShiftTypes = async () => {
    setSavingShifts(true)
    await saveSetting('shiftTypes', shiftTypes)
    setSavingShifts(false)
  }

  const saveFreqs = async () => {
    setSavingFreq(true)
    await saveSetting('medFrequencies', frequencies)
    setSavingFreq(false)
  }
  const saveRoutes = async () => {
    setSavingRoute(true)
    await saveSetting('medRoutes', routes)
    setSavingRoute(false)
  }
  const savePrescribers = async () => {
    setSavingPrescriber(true)
    await saveSetting('medPrescribers', prescribers)
    setSavingPrescriber(false)
  }

  const updateResidentStatus = (index: number, label: string, desc: string) => {
    const updated = [...residentStatuses]
    updated[index] = { ...updated[index], label, desc }
    saveSetting('residentStatuses', updated)
    setEditingStatus(null)
  }
  const addResidentStatus = () => {
    if (!newStatusLabel.trim()) { toast.error('Label required'); return }
    const id = newStatusLabel.trim().toUpperCase().replace(/\s+/g, '_')
    if (residentStatuses.some((s: any) => s.id === id)) { toast.error('Status already exists'); return }
    const updated = [...residentStatuses, { id, label: newStatusLabel.trim(), desc: newStatusDesc.trim() }]
    saveSetting('residentStatuses', updated)
    setNewStatusLabel('')
    setNewStatusDesc('')
    toast.success('Status added')
  }
  const deleteResidentStatus = (index: number) => {
    if (!confirm('Delete this status? Existing records with this status will not be affected.')) return
    const updated = residentStatuses.filter((_: any, i: number) => i !== index)
    saveSetting('residentStatuses', updated)
    toast.success('Status deleted')
  }

  return (
    <div className="space-y-4">
      {/* Facility scope indicator */}
      <div className={`text-xs px-3 py-2 rounded-md border ${isGlobal ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-sky-50 border-sky-200 text-sky-800'}`}>
        {isGlobal
          ? '⚠ These are GLOBAL defaults. They apply to all facilities that do not have their own override.'
          : '✓ These dropdown options apply to the currently selected facility only.'}
      </div>

      {/* Rooms */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Rooms</CardTitle>
          <CardDescription>Options shown in the Rooms module dropdowns.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StringListEditor
            title="Room Types"
            description="e.g. Private, Semi-Private, Ward"
            items={settings.roomTypes || []}
            placeholder="e.g. DELUXE"
            onSave={async (items) => saveSetting('roomTypes', items)}
          />
          <StringListEditor
            title="Room Statuses"
            description="e.g. Available, Occupied, Maintenance"
            items={settings.roomStatuses || []}
            placeholder="e.g. CLEANING"
            onSave={async (items) => saveSetting('roomStatuses', items)}
          />
        </CardContent>
      </Card>

      {/* Finance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" /> Finance & Billing</CardTitle>
          <CardDescription>Options shown in the Finance, Product Catalog, and Unbilled Items dropdowns.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StringListEditor
            title="Expense Categories"
            description="e.g. Salary, Supplies, Food, Utilities"
            items={settings.expenseCategories || []}
            placeholder="e.g. TRANSPORT"
            onSave={async (items) => saveSetting('expenseCategories', items)}
          />
          <StringListEditor
            title="Product Categories"
            description="e.g. Room, Care, Medication, Therapy"
            items={settings.productCategories || []}
            placeholder="e.g. EQUIPMENT"
            onSave={async (items) => saveSetting('productCategories', items)}
          />
          <StringListEditor
            title="Product Units"
            description="e.g. each, day, session, month, hour"
            items={settings.productUnits || []}
            placeholder="e.g. visit"
            onSave={async (items) => saveSetting('productUnits', items)}
          />
        </CardContent>
      </Card>

      {/* Inventory */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Package className="h-4 w-4" /> Inventory</CardTitle>
          <CardDescription>Options shown in the Inventory module dropdowns.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StringListEditor
            title="Inventory Categories"
            description="e.g. Medical, Food, Cleaning, Office"
            items={settings.inventoryCategories || []}
            placeholder="e.g. PPE"
            onSave={async (items) => saveSetting('inventoryCategories', items)}
          />
          <StringListEditor
            title="Inventory Units"
            description="e.g. each, box, pack, bottle, kg, L"
            items={settings.inventoryUnits || []}
            placeholder="e.g. case"
            onSave={async (items) => saveSetting('inventoryUnits', items)}
          />
        </CardContent>
      </Card>

      {/* Care & Clinical */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Care & Clinical</CardTitle>
          <CardDescription>Options shown when scheduling visits, reporting incidents, and logging care.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StringListEditor
            title="Visit Types"
            description="e.g. Doctor, Physio, Dietitian, Nurse Assessment"
            items={settings.visitTypes || []}
            placeholder="e.g. OT_ASSESSMENT"
            onSave={async (items) => saveSetting('visitTypes', items)}
          />
          <StringListEditor
            title="Incident Types"
            description="e.g. Fall, Medication Error, Behavior, Injury"
            items={settings.incidentTypes || []}
            placeholder="e.g. WANDERING"
            onSave={async (items) => saveSetting('incidentTypes', items)}
          />
          <StringListEditor
            title="Incident Severities"
            description="e.g. Low, Moderate, High, Critical"
            items={settings.incidentSeverities || []}
            placeholder="e.g. NEAR_MISS"
            onSave={async (items) => saveSetting('incidentSeverities', items)}
          />
          <StringListEditor
            title="Care Log Categories"
            description="e.g. Hygiene, Meals, Mobility, Toileting, Behavior"
            items={settings.careLogCategories || []}
            placeholder="e.g. SOCIAL"
            onSave={async (items) => saveSetting('careLogCategories', items)}
          />
        </CardContent>
      </Card>

      {/* Staff */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Staff & Shifts</CardTitle>
          <CardDescription>Options shown in the Staff module (leave requests, shift scheduling).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <StringListEditor
            title="Leave Types"
            description="e.g. Annual, Sick, Emergency, Unpaid"
            items={settings.leaveTypes || []}
            placeholder="e.g. MATERNITY"
            onSave={async (items) => saveSetting('leaveTypes', items)}
          />

          {/* Shift types — these have start/end times so they get a custom editor */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>Shift Types</span>
                  <Badge variant="outline" className="text-xs">{shiftTypes.length} shift{shiftTypes.length !== 1 ? 's' : ''} configured</Badge>
                </CardTitle>
                <CardDescription>
                  Shift types with default start/end times. Used by the schedule auto-generator and Add Shift dialog.
                  Total shifts per day = {shiftTypes.length}.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Quick presets — apply common shift configurations in one click */}
                <div className="bg-muted/30 rounded-md p-2.5">
                  <div className="text-xs font-semibold text-muted-foreground mb-1.5">QUICK PRESETS</div>
                  <div className="flex flex-wrap gap-1.5">
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      if (!confirm('Replace current shift types with the Standard 3-Shift Day preset?')) return
                      setShiftTypes([
                        { type: 'DAY', start: '07:00', end: '15:00' },
                        { type: 'EVENING', start: '15:00', end: '23:00' },
                        { type: 'NIGHT', start: '23:00', end: '07:00' },
                      ])
                    }}>
                      Standard 3-Shift (8h each)
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      if (!confirm('Replace current shift types with the 2-Shift 12-Hour preset?')) return
                      setShiftTypes([
                        { type: 'DAY', start: '07:00', end: '19:00' },
                        { type: 'NIGHT', start: '19:00', end: '07:00' },
                      ])
                    }}>
                      2-Shift 12-Hour
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      if (!confirm('Replace current shift types with the Morning + Evening preset?')) return
                      setShiftTypes([
                        { type: 'MORNING', start: '06:00', end: '14:00' },
                        { type: 'EVENING', start: '14:00', end: '22:00' },
                      ])
                    }}>
                      Morning + Evening
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      if (!confirm('Replace current shift types with the 4-Shift 6-Hour preset?')) return
                      setShiftTypes([
                        { type: 'EARLY', start: '06:00', end: '12:00' },
                        { type: 'LATE', start: '12:00', end: '18:00' },
                        { type: 'EVENING', start: '18:00', end: '00:00' },
                        { type: 'NIGHT', start: '00:00', end: '06:00' },
                      ])
                    }}>
                      4-Shift 6-Hour
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      if (!confirm('Clear all shift types?')) return
                      setShiftTypes([])
                    }}>
                      Clear All
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  {shiftTypes.map((st, i) => (
                    <div key={i} className="flex items-center gap-2 p-2 border rounded-md">
                      <Input
                        value={st.type}
                        onChange={e => { const next = [...shiftTypes]; next[i] = { ...st, type: e.target.value.toUpperCase() }; setShiftTypes(next) }}
                        className="flex-1 text-sm"
                        placeholder="e.g. DAY"
                      />
                      <Input type="time" value={st.start} onChange={e => { const next = [...shiftTypes]; next[i] = { ...st, start: e.target.value }; setShiftTypes(next) }} className="w-28 text-sm" />
                      <span className="text-xs text-muted-foreground">→</span>
                      <Input type="time" value={st.end} onChange={e => { const next = [...shiftTypes]; next[i] = { ...st, end: e.target.value }; setShiftTypes(next) }} className="w-28 text-sm" />
                      <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => setShiftTypes(shiftTypes.filter((_, idx) => idx !== i))}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                  {shiftTypes.length === 0 && <p className="text-sm text-muted-foreground italic">No shift types configured</p>}
                </div>
                <div className="pt-2 border-t">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Add New Shift Type</div>
                  <div className="flex items-center gap-2">
                    <Input
                      value={newShift.type}
                      onChange={e => setNewShift({ ...newShift, type: e.target.value.toUpperCase() })}
                      className="flex-1 text-sm"
                      placeholder="e.g. ON_CALL"
                    />
                    <Input type="time" value={newShift.start} onChange={e => setNewShift({ ...newShift, start: e.target.value })} className="w-28 text-sm" />
                    <span className="text-xs text-muted-foreground">→</span>
                    <Input type="time" value={newShift.end} onChange={e => setNewShift({ ...newShift, end: e.target.value })} className="w-28 text-sm" />
                    <Button size="sm" onClick={() => {
                      if (newShift.type && !shiftTypes.some(s => s.type === newShift.type)) {
                        setShiftTypes([...shiftTypes, { ...newShift }])
                        setNewShift({ type: '', start: '07:00', end: '15:00' })
                      }
                    }}><Plus className="h-3 w-3 mr-1" /> Add</Button>
                  </div>
                </div>
                <Button size="sm" variant="outline" onClick={saveShiftTypes} disabled={savingShifts}>
                  {savingShifts ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
                  {savingShifts ? 'Saved!' : 'Save Shift Types'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </CardContent>
      </Card>

      {/* New ERP Dropdowns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" /> Finance & Accounting Dropdowns</CardTitle>
          <CardDescription>Options shown in payment dialogs, invoice editing, deposits, and bank account creation.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StringListEditor
            title="Payment Methods"
            description="e.g. Cash, Bank Transfer, Cheque, Card, Insurance"
            items={settings.paymentMethods || []}
            placeholder="e.g. E_WALLET"
            onSave={async (items) => saveSetting('paymentMethods', items)}
          />
          <StringListEditor
            title="Payment Statuses"
            description="e.g. Pending, Cleared, Bounced, Refunded"
            items={settings.paymentStatuses || []}
            placeholder="e.g. VOIDED"
            onSave={async (items) => saveSetting('paymentStatuses', items)}
          />
          <StringListEditor
            title="Invoice Statuses"
            description="e.g. Unpaid, Partial, Paid, Overdue, Cancelled"
            items={settings.invoiceStatuses || []}
            placeholder="e.g. WRITE_OFF"
            onSave={async (items) => saveSetting('invoiceStatuses', items)}
          />
          <StringListEditor
            title="Bank Account Types"
            description="e.g. Bank, Cash, Savings"
            items={settings.bankAccountTypes || []}
            placeholder="e.g. MERCHANT"
            onSave={async (items) => saveSetting('bankAccountTypes', items)}
          />
          <StringListEditor
            title="Deposit Types"
            description="e.g. Admission, Security, Advance"
            items={settings.depositTypes || []}
            placeholder="e.g. DAMAGE"
            onSave={async (items) => saveSetting('depositTypes', items)}
          />
        </CardContent>
      </Card>

      {/* Clinical / Resident Dropdowns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Clinical & Resident</CardTitle>
          <CardDescription>Options shown in resident dialogs and medication management.</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <StringListEditor
            title="Dietary Needs"
            description="e.g. Regular, Low Sodium, Diabetic, Soft, Vegetarian"
            items={settings.dietaryNeeds || []}
            placeholder="e.g. HALAL"
            onSave={async (items) => saveSetting('dietaryNeeds', items)}
          />
          <StringListEditor
            title="Medication Durations"
            description="e.g. Ongoing, 7 days, 30 days, 6 months"
            items={settings.medDurations || []}
            placeholder="e.g. 3 months"
            onSave={async (items) => saveSetting('medDurations', items)}
          />
        </CardContent>
      </Card>

      {/* Staff Dropdowns */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> Staff Role Options</CardTitle>
          <CardDescription>Roles shown in the Add Staff dialog (does not affect user login roles).</CardDescription>
        </CardHeader>
        <CardContent>
          <StringListEditor
            title="Staff Roles"
            description="e.g. Nurse, Care Staff, Doctor, Physio, Dietitian, Reception"
            items={settings.staffRoles || []}
            placeholder="e.g. THERAPIST"
            onSave={async (items) => saveSetting('staffRoles', items)}
          />
        </CardContent>
      </Card>

      {/* Medication Frequencies (moved from Medications tab) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Pill className="h-4 w-4" /> Medication Frequencies</CardTitle>
          <CardDescription>Add, edit, or remove frequency options. These appear as a dropdown when adding new medications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {frequencies.map((f, i) => (
              <Badge key={i} variant="outline" className="text-xs pr-1 group">
                {f}
                <button
                  onClick={() => setFrequencies(frequencies.filter((_, idx) => idx !== i))}
                  className="ml-1 text-red-400 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {frequencies.length === 0 && <p className="text-sm text-muted-foreground italic">No frequencies configured</p>}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add new frequency (e.g., Every other day)..."
              value={newFreq}
              onChange={e => setNewFreq(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newFreq.trim()) { setFrequencies([...frequencies, newFreq.trim()]); setNewFreq('') } }}
              className="flex-1"
            />
            <Button size="sm" onClick={() => {
              if (newFreq.trim() && !frequencies.includes(newFreq.trim())) {
                setFrequencies([...frequencies, newFreq.trim()])
                setNewFreq('')
              }
            }}><Plus className="h-3 w-3 mr-1" /> Add</Button>
          </div>
          <Button size="sm" variant="outline" onClick={saveFreqs} disabled={savingFreq}>
            {savingFreq ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            {savingFreq ? 'Saved!' : 'Save Frequencies'}
          </Button>
        </CardContent>
      </Card>

      {/* Medication Routes (moved from Medications tab) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Administration Routes</CardTitle>
          <CardDescription>How medications are administered. Appears as a dropdown in the MAR and Add Medication dialog.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {routes.map((r, i) => (
              <Badge key={i} variant="outline" className="text-xs pr-1 group">
                {r}
                <button
                  onClick={() => setRoutes(routes.filter((_, idx) => idx !== i))}
                  className="ml-1 text-red-400 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {routes.length === 0 && <p className="text-sm text-muted-foreground italic">No routes configured</p>}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add new route (e.g., Intramuscular)..."
              value={newRoute}
              onChange={e => setNewRoute(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newRoute.trim()) { setRoutes([...routes, newRoute.trim()]); setNewRoute('') } }}
              className="flex-1"
            />
            <Button size="sm" onClick={() => {
              if (newRoute.trim() && !routes.includes(newRoute.trim())) {
                setRoutes([...routes, newRoute.trim()])
                setNewRoute('')
              }
            }}><Plus className="h-3 w-3 mr-1" /> Add</Button>
          </div>
          <Button size="sm" variant="outline" onClick={saveRoutes} disabled={savingRoute}>
            {savingRoute ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            {savingRoute ? 'Saved!' : 'Save Routes'}
          </Button>
        </CardContent>
      </Card>

      {/* Medication Prescribers (moved from Medications tab) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Prescribers / Doctors</CardTitle>
          <CardDescription>Common prescribers for the "Prescribed By" dropdown in the Add Medication dialog.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {prescribers.map((p, i) => (
              <Badge key={i} variant="outline" className="text-xs pr-1 group">
                {p}
                <button
                  onClick={() => setPrescribers(prescribers.filter((_, idx) => idx !== i))}
                  className="ml-1 text-red-400 hover:text-red-600"
                  title="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </Badge>
            ))}
            {prescribers.length === 0 && <p className="text-sm text-muted-foreground italic">No prescribers configured — users will type freely</p>}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="Add new prescriber (e.g., Dr. Raj — Cardiologist)..."
              value={newPrescriber}
              onChange={e => setNewPrescriber(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && newPrescriber.trim()) { setPrescribers([...prescribers, newPrescriber.trim()]); setNewPrescriber('') } }}
              className="flex-1"
            />
            <Button size="sm" onClick={() => {
              if (newPrescriber.trim() && !prescribers.includes(newPrescriber.trim())) {
                setPrescribers([...prescribers, newPrescriber.trim()])
                setNewPrescriber('')
              }
            }}><Plus className="h-3 w-3 mr-1" /> Add</Button>
          </div>
          <Button size="sm" variant="outline" onClick={savePrescribers} disabled={savingPrescriber}>
            {savingPrescriber ? <Check className="h-3 w-3 mr-1" /> : <Save className="h-3 w-3 mr-1" />}
            {savingPrescriber ? 'Saved!' : 'Save Prescribers'}
          </Button>
        </CardContent>
      </Card>

      {/* Resident Statuses (moved from Resident Statuses tab) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Resident Statuses</CardTitle>
          <CardDescription>Edit, add, or remove resident statuses. Changing status affects medication scheduling.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {residentStatuses.map((s: any, i: number) => (
              <div key={s.id} className="flex items-center gap-3 p-3 border rounded-md">
                {editingStatus === i ? (
                  <>
                    <Input value={editStatusLabel} onChange={e => setEditStatusLabel(e.target.value)} className="flex-1 text-sm" />
                    <Input value={editStatusDesc} onChange={e => setEditStatusDesc(e.target.value)} className="flex-[2] text-sm" placeholder="Description" />
                    <Button size="sm" onClick={() => updateResidentStatus(i, editStatusLabel, editStatusDesc)}><Check className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => setEditingStatus(null)}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="bg-primary/5">{s.label}</Badge>
                    <span className="text-sm text-muted-foreground flex-1">{s.desc}</span>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditingStatus(i); setEditStatusLabel(s.label); setEditStatusDesc(s.desc) }}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => deleteResidentStatus(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new status */}
          <div className="mt-4 pt-3 border-t">
            <div className="text-xs font-medium text-muted-foreground mb-2">Add New Status</div>
            <div className="flex gap-2">
              <Input placeholder="Status label (e.g., On Leave)" value={newStatusLabel} onChange={e => setNewStatusLabel(e.target.value)} className="flex-1 text-sm" />
              <Input placeholder="Description" value={newStatusDesc} onChange={e => setNewStatusDesc(e.target.value)} className="flex-[2] text-sm" />
              <Button size="sm" onClick={addResidentStatus}><Plus className="h-3 w-3 mr-1" /> Add</Button>
            </div>
          </div>

          {/* Status change effects info */}
          <div className="mt-4 pt-3 border-t">
            <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Status Change Effects
            </div>
            <div className="text-xs space-y-1.5 text-muted-foreground">
              <div className="flex items-start gap-2">
                <span className="text-red-600 font-bold">→</span>
                <span>When a resident is marked <strong>Hospitalized</strong> or <strong>Out with Family</strong>, all pending meds are auto-marked as <strong>Resident Out</strong>.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-emerald-600 font-bold">→</span>
                <span>When a resident returns (marked <strong>Active</strong>), new meds will be generated on next dashboard load.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-slate-600 font-bold">→</span>
                <span>When a resident is <strong>Discharged</strong> or <strong>Deceased</strong>, medications are deactivated.</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Medication Administration Statuses (read-only system config) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Medication Administration Statuses</CardTitle>
          <CardDescription>System statuses for medication administration (read-only — applies globally to all facilities)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {medStatuses.map((s: any) => (
              <div key={s.id} className="flex items-center gap-2 p-2 border rounded-md">
                <Badge variant="outline" className="text-xs">{s.label}</Badge>
                <span className="text-xs text-muted-foreground">{s.desc}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Auto-generation info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Medication Auto-Generation</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>✅ Auto-generate tomorrow's meds on dashboard load: <span className="text-emerald-600 font-medium">Enabled</span></p>
          <p className="mt-1">✅ Smart scheduling: bedtime meds at 10 PM, morning meds at 8 AM, twice daily at 8 AM + 8 PM</p>
          <p className="mt-1">✅ Idempotent: safe to run multiple times</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How Dropdowns Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1 text-muted-foreground">
          <p>• Every dropdown in the app pulls its options from these settings.</p>
          <p>• Options are facility-scoped — switching facility in the header reloads this page with that facility's options.</p>
          <p>• If a facility has no override, it falls back to the global defaults (shown when "Global Defaults" is selected).</p>
          <p>• Existing records with a removed option are not affected — they keep their original value.</p>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ ACCOUNTING SETTINGS ============
function AccountingSettings({ settings, saveSetting, isGlobal }: { settings: any; saveSetting: (k: string, v: any, options?: { silent?: boolean }) => Promise<any>; isGlobal: boolean }) {
  const [taxRate, setTaxRate] = useState(String(settings.taxRate ?? 5))
  const [taxMode, setTaxMode] = useState(settings.taxMode || 'EXCLUSIVE')
  const [taxExemptCategories, setTaxExemptCategories] = useState<string[]>(settings.taxExemptCategories || [])
  const [fiscalYearStart, setFiscalYearStart] = useState(String(settings.fiscalYearStart ?? 1))
  const [defaultRevenueAccount, setDefaultRevenueAccount] = useState(settings.defaultRevenueAccountCode || '4000')
  const [defaultCashAccount, setDefaultCashAccount] = useState(settings.defaultCashAccountCode || '1010')
  const [defaultARAccount, setDefaultARAccount] = useState(settings.defaultARAccountCode || '1100')
  const [defaultTaxAccount, setDefaultTaxAccount] = useState(settings.defaultTaxAccountCode || '2100')
  const [autoPostEnabled, setAutoPostEnabled] = useState(settings.autoPostEnabled !== false)
  const [periodLockEnabled, setPeriodLockEnabled] = useState(settings.periodLockEnabled || false)
  const [lockedPeriods, setLockedPeriods] = useState<string[]>(settings.lockedPeriods || [])
  // Billing fields (merged from former BillingSettings)
  const [currency, setCurrency] = useState(settings.currency || 'RM (Malaysian Ringgit)')
  const [invoiceDueDays, setInvoiceDueDays] = useState(String(settings.invoiceDueDays ?? 30))
  const [invoicePrefix, setInvoicePrefix] = useState(settings.invoicePrefix || 'INV-')
  // Receipt settings
  const [receiptHeader, setReceiptHeader] = useState(settings.receiptHeaderText || 'Official Receipt')
  const [receiptFooter, setReceiptFooter] = useState(settings.receiptFooterText || 'This is a computer-generated receipt. No signature required.')
  // Invoice customization (moved here from Facility & Org tab)
  const [invoiceHeader, setInvoiceHeader] = useState(settings.invoiceHeaderText || '')
  const [invoiceFooter, setInvoiceFooter] = useState(settings.invoiceFooterText || '')
  // E-Invoice (LHDN MyInvois) settings
  const [lhdnEnabled, setLhdnEnabled] = useState(settings.lhdnEnabled || false)
  const [lhdnEnvironment, setLhdnEnvironment] = useState(settings.lhdnEnvironment || 'sandbox')
  const [lhdnClientId, setLhdnClientId] = useState(settings.lhdnClientId || '')
  const [lhdnClientSecret, setLhdnClientSecret] = useState(settings.lhdnClientSecret || '')
  const [orgTIN, setOrgTIN] = useState(settings.organizationTIN || '')
  const [orgMSIC, setOrgMSIC] = useState(settings.organizationMSIC || '86901')
  const [orgSSTNumber, setOrgSSTNumber] = useState(settings.organizationSSTNumber || '')
  const [orgSSTRegistered, setOrgSSTRegistered] = useState(settings.organizationSSTRegistered || false)
  const [orgBusinessActivity, setOrgBusinessActivity] = useState(settings.organizationBusinessActivity || 'Residential care activities for the elderly and disabled')

  return (
    <div className="space-y-4">
      <div className={`text-xs px-3 py-2 rounded-md border ${isGlobal ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-sky-50 border-sky-200 text-sky-800'}`}>
        {isGlobal ? '⚠ These are GLOBAL defaults.' : '✓ These settings apply to the selected facility.'}
      </div>

      {/* Billing Configuration (merged from former Billing tab) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" /> Billing Configuration</CardTitle>
          <CardDescription>Currency, invoice numbering, and due date defaults.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Currency</label>
            <Input value={currency} onChange={e => setCurrency(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Invoice Due (days)</label>
              <Input type="number" value={invoiceDueDays} onChange={e => setInvoiceDueDays(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Invoice Number Prefix</label>
              <Input value={invoicePrefix} onChange={e => setInvoicePrefix(e.target.value)} />
            </div>
          </div>
          <Button size="sm" onClick={async () => {
            try {
              await saveSetting('currency', currency, { silent: true })
              await saveSetting('invoiceDueDays', parseInt(invoiceDueDays) || 30, { silent: true })
              await saveSetting('invoicePrefix', invoicePrefix, { silent: true })
              toast.success('Billing settings saved')
            } catch {}
          }}><Save className="h-3 w-3 mr-1" /> Save Billing Settings</Button>
        </CardContent>
      </Card>

      {/* Tax Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><DollarSign className="h-4 w-4" /> Tax Configuration</CardTitle>
          <CardDescription>Configure SST/tax settings for invoices and billing.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Tax Rate (%)</label>
              <Input type="number" step="0.01" min="0" max="100" value={taxRate} onChange={e => setTaxRate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tax Mode</label>
              <select className="w-full border rounded px-2 py-1.5" value={taxMode} onChange={e => setTaxMode(e.target.value)}>
                <option value="EXCLUSIVE">Exclusive (tax added on top of price)</option>
                <option value="INCLUSIVE">Inclusive (tax included in price)</option>
                <option value="NONE">None (no tax)</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Tax-Exempt Categories (no tax applied)</label>
            <Input value={taxExemptCategories.join(', ')} onChange={e => setTaxExemptCategories(e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="e.g. MEDICATION, FOOD" />
            <div className="text-[10px] text-muted-foreground mt-0.5">Comma-separated list of product/expense categories that should not have tax applied.</div>
          </div>
          <Button size="sm" onClick={async () => {
            try {
              await saveSetting('taxRate', parseFloat(taxRate) || 0, { silent: true })
              await saveSetting('taxMode', taxMode, { silent: true })
              await saveSetting('taxExemptCategories', taxExemptCategories, { silent: true })
              toast.success('Tax settings saved')
            } catch {}
          }}><Save className="h-3 w-3 mr-1" /> Save Tax Settings</Button>
        </CardContent>
      </Card>

      {/* Default GL Accounts */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><BookOpen className="h-4 w-4" /> Default GL Account Mappings</CardTitle>
          <CardDescription>Which GL accounts to use by default when auto-posting journal entries.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Cash/Bank Account</label>
              <Input value={defaultCashAccount} onChange={e => setDefaultCashAccount(e.target.value)} placeholder="1010" className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Accounts Receivable</label>
              <Input value={defaultARAccount} onChange={e => setDefaultARAccount(e.target.value)} placeholder="1100" className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Revenue Account</label>
              <Input value={defaultRevenueAccount} onChange={e => setDefaultRevenueAccount(e.target.value)} placeholder="4000" className="font-mono" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Tax Payable Account</label>
              <Input value={defaultTaxAccount} onChange={e => setDefaultTaxAccount(e.target.value)} placeholder="2100" className="font-mono" />
            </div>
          </div>
          <Button size="sm" onClick={async () => {
            try {
              await saveSetting('defaultCashAccountCode', defaultCashAccount, { silent: true })
              await saveSetting('defaultARAccountCode', defaultARAccount, { silent: true })
              await saveSetting('defaultRevenueAccountCode', defaultRevenueAccount, { silent: true })
              await saveSetting('defaultTaxAccountCode', defaultTaxAccount, { silent: true })
              toast.success('GL mappings saved')
            } catch {}
          }}><Save className="h-3 w-3 mr-1" /> Save GL Mappings</Button>
        </CardContent>
      </Card>

      {/* Auto-Posting */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Check className="h-4 w-4" /> Auto-Posting</CardTitle>
          <CardDescription>Control whether transactions automatically create journal entries.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={autoPostEnabled} onChange={e => { setAutoPostEnabled(e.target.checked); saveSetting('autoPostEnabled', e.target.checked) }} className="h-4 w-4" />
            <span>Auto-post journal entries for invoices, expenses, payments, and deposits</span>
          </label>
          <div className="text-xs text-muted-foreground">
            When enabled, every invoice/expense/payment/deposit automatically creates a balanced journal entry in the background.
            Disable only if you prefer to post entries manually.
          </div>
        </CardContent>
      </Card>

      {/* Fiscal Year & Period Lock */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4" /> Fiscal Year & Period Lock</CardTitle>
          <CardDescription>Configure fiscal year start and lock closed periods.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Fiscal Year Start Month</label>
              <select className="w-full border rounded px-2 py-1.5" value={fiscalYearStart} onChange={e => setFiscalYearStart(e.target.value)}>
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{new Date(2024, m - 1, 1).toLocaleString('en', { month: 'long' })}</option>)}
              </select>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={async () => await saveSetting('fiscalYearStart', parseInt(fiscalYearStart))}>
            <Save className="h-3 w-3 mr-1" /> Save Fiscal Year
          </Button>

          <div className="border-t pt-3">
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" checked={periodLockEnabled} onChange={e => { setPeriodLockEnabled(e.target.checked); saveSetting('periodLockEnabled', e.target.checked) }} className="h-4 w-4" />
              <span className="font-medium">Enable Period Locking</span>
            </label>
            <div className="text-xs text-muted-foreground mb-2">
              When enabled, locked periods cannot have new journal entries posted to them. Enter periods as YYYY-MM (comma-separated).
            </div>
            <Input value={lockedPeriods.join(', ')} onChange={e => setLockedPeriods(e.target.value.split(',').map(s => s.trim()).filter(Boolean))} placeholder="e.g. 2026-01, 2026-02, 2026-03" />
            <Button size="sm" variant="outline" className="mt-2" onClick={async () => await saveSetting('lockedPeriods', lockedPeriods)}>
              <Save className="h-3 w-3 mr-1" /> Save Locked Periods
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Invoice Customization (moved from Facility & Org tab) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Invoice Customization</CardTitle>
          <CardDescription>Custom text shown at the top and bottom of printed invoices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Invoice Header Text (shown below logo)</label>
            <Input value={invoiceHeader} onChange={e => setInvoiceHeader(e.target.value)} placeholder="e.g. Thank you for your business" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Invoice Footer Text (shown at bottom)</label>
            <Input value={invoiceFooter} onChange={e => setInvoiceFooter(e.target.value)} placeholder="e.g. Payment due within 30 days. Late payments subject to 1.5% monthly interest." />
          </div>
          <Button size="sm" onClick={async () => {
            try {
              await saveSetting('invoiceHeaderText', invoiceHeader, { silent: true })
              await saveSetting('invoiceFooterText', invoiceFooter, { silent: true })
              toast.success('Invoice text saved')
            } catch {}
          }}><Save className="h-3 w-3 mr-1" /> Save Invoice Text</Button>
        </CardContent>
      </Card>

      {/* Receipt Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Receipt Settings
          </CardTitle>
          <CardDescription>
            Customize the text shown on receipts. Receipts are generated from payments — each payment automatically gets a receipt number (= payment code). The receipt prefix is controlled by the Payment Code Prefix in Settings → Code Prefixes.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Receipt Header Text (shown below logo)</label>
            <Input value={receiptHeader} onChange={e => setReceiptHeader(e.target.value)} placeholder="e.g. Official Receipt" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Receipt Footer Text (shown at bottom)</label>
            <Input value={receiptFooter} onChange={e => setReceiptFooter(e.target.value)} placeholder="e.g. This is a computer-generated receipt." />
          </div>
          <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            <strong>Note:</strong> Receipts are viewed in the Finance → Receipts tab. Each receipt links to its payment, linked invoices, and the auto-posted journal entry. The receipt number format (e.g. RCP-0001 or RCP-250708-0001) is controlled by the Payment Code Prefix + date settings in Code Prefixes.
          </div>
          <Button size="sm" onClick={async () => {
            try {
              await saveSetting('receiptHeaderText', receiptHeader, { silent: true })
              await saveSetting('receiptFooterText', receiptFooter, { silent: true })
              toast.success('Receipt text saved')
            } catch {}
          }}><Save className="h-3 w-3 mr-1" /> Save Receipt Text</Button>
        </CardContent>
      </Card>

      {/* E-Invoice (LHDN MyInvois) Configuration */}
      <Card className="border-sky-200">
        <CardHeader className="bg-sky-50/50 rounded-t-lg">
          <CardTitle className="text-sm flex items-center gap-2 text-sky-700">
            <FileText className="h-4 w-4" /> E-Invoice (LHDN MyInvois) — Malaysia
          </CardTitle>
          <CardDescription>
            Configure electronic invoice submission to LHDN (Inland Revenue Board of Malaysia). Required for Malaysian businesses under the phased e-invoice rollout.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          {/* What is E-Invoice? — layman explanation */}
          <div className="text-xs text-muted-foreground bg-muted/30 border rounded-md p-3 space-y-1.5">
            <div className="font-medium text-foreground">📖 What is E-Invoicing?</div>
            <p><strong>E-Invoice</strong> is a digital invoice that you send to the government (LHDN) for validation before giving it to your customer. Think of it like getting your invoice "stamped" by the tax office — it proves the invoice is real and tax-compliant.</p>
            <p><strong>MyInvois</strong> is LHDN's online portal where you submit these invoices. Each invoice gets a unique ID (UUID) and a QR code after validation.</p>
            <p><strong>Who needs this?</strong> All Malaysian businesses, phased by annual revenue. Care homes typically fall under the July 2026 phase (all businesses).</p>
          </div>

          {/* Enable toggle */}
          <label className="flex items-start gap-2 cursor-pointer p-2 rounded-md hover:bg-muted/30">
            <input type="checkbox" checked={lhdnEnabled} onChange={e => { setLhdnEnabled(e.target.checked); saveSetting('lhdnEnabled', e.target.checked, { silent: true }) }} className="h-4 w-4 mt-0.5" />
            <div>
              <div className="font-medium">Enable E-Invoice submission</div>
              <div className="text-xs text-muted-foreground">When enabled, invoices will have a "Submit to LHDN" button and status tracking.</div>
            </div>
          </label>

          {lhdnEnabled && (
            <div className="space-y-4 border-t pt-3">
              {/* Environment */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Environment
                  <span className="ml-1 text-[10px] text-muted-foreground/70">(Test = practice without real submissions; Production = real invoices sent to LHDN)</span>
                </label>
                <select className="w-full border rounded px-2 py-1.5 text-sm bg-background" value={lhdnEnvironment} onChange={e => { setLhdnEnvironment(e.target.value); saveSetting('lhdnEnvironment', e.target.value, { silent: true }) }}>
                  <option value="sandbox">🧪 Sandbox (Testing — use this first to practice)</option>
                  <option value="production">🔴 Production (Real — invoices are actually submitted to LHDN)</option>
                </select>
              </div>

              {/* LHDN API Credentials */}
              <div className="border-t pt-3">
                <div className="text-xs font-semibold text-muted-foreground mb-2">LHDN API CREDENTIALS</div>
                <div className="text-[10px] text-muted-foreground mb-2">
                  These are obtained from the <a href="https://myinvois.hasil.gov.my" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">MyInvois Portal</a> →
                  log in with your business tax account → Settings → API Settings → Generate credentials.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Client ID
                      <span className="ml-1 text-[10px] text-muted-foreground/70">(A unique ID from LHDN that identifies your business)</span>
                    </label>
                    <Input value={lhdnClientId} onChange={e => setLhdnClientId(e.target.value)} placeholder="e.g. a1b2c3d4-e5f6-..." className="font-mono text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Client Secret
                      <span className="ml-1 text-[10px] text-muted-foreground/70">(A password from LHDN — keep this private, like a bank PIN)</span>
                    </label>
                    <Input type="password" value={lhdnClientSecret} onChange={e => setLhdnClientSecret(e.target.value)} placeholder="••••••••••••" className="font-mono text-xs" />
                  </div>
                </div>
              </div>

              {/* Business Tax Info */}
              <div className="border-t pt-3">
                <div className="text-xs font-semibold text-muted-foreground mb-2">BUSINESS TAX INFORMATION</div>
                <div className="text-[10px] text-muted-foreground mb-2">
                  These details appear on every e-invoice you submit. They identify your care home to LHDN.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      TIN (Tax Identification Number) *
                      <span className="ml-1 text-[10px] text-muted-foreground/70">(Your business income tax number, e.g. C1234567890 — found on your tax assessment letter)</span>
                    </label>
                    <Input value={orgTIN} onChange={e => setOrgTIN(e.target.value)} placeholder="e.g. C1234567890" className="font-mono text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      MSIC Code *
                      <span className="ml-1 text-[10px] text-muted-foreground/70">(Malaysian Standard Industrial Classification — identifies your type of business. 86901 = residential care for elderly)</span>
                    </label>
                    <Input value={orgMSIC} onChange={e => setOrgMSIC(e.target.value)} placeholder="86901" className="font-mono text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      Business Activity Description
                      <span className="ml-1 text-[10px] text-muted-foreground/70">(A short description of what your business does)</span>
                    </label>
                    <Input value={orgBusinessActivity} onChange={e => setOrgBusinessActivity(e.target.value)} placeholder="Residential care activities for the elderly and disabled" className="text-xs" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1 block">
                      SST Number
                      <span className="ml-1 text-[10px] text-muted-foreground/70">(Sales &amp; Service Tax registration number — only if your care home is registered for SST. Most care homes are exempt.)</span>
                    </label>
                    <Input value={orgSSTNumber} onChange={e => setOrgSSTNumber(e.target.value)} placeholder="e.g. A01-1234-567890 (leave blank if not registered)" className="font-mono text-xs" />
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer mt-2">
                  <input type="checkbox" checked={orgSSTRegistered} onChange={e => { setOrgSSTRegistered(e.target.checked); saveSetting('organizationSSTRegistered', e.target.checked, { silent: true }) }} className="h-4 w-4" />
                  <span className="text-xs">My care home is registered for SST (Sales &amp; Service Tax)</span>
                </label>
              </div>

              {/* Save button */}
              <Button size="sm" onClick={async () => {
                try {
                  await saveSetting('lhdnClientId', lhdnClientId, { silent: true })
                  await saveSetting('lhdnClientSecret', lhdnClientSecret, { silent: true })
                  await saveSetting('organizationTIN', orgTIN, { silent: true })
                  await saveSetting('organizationMSIC', orgMSIC, { silent: true })
                  await saveSetting('organizationSSTNumber', orgSSTNumber, { silent: true })
                  await saveSetting('organizationBusinessActivity', orgBusinessActivity, { silent: true })
                  toast.success('E-Invoice settings saved')
                } catch {}
              }}><Save className="h-3 w-3 mr-1" /> Save E-Invoice Settings</Button>

              {/* Help note */}
              <div className="text-[10px] text-muted-foreground border-t pt-2 space-y-1">
                <div><strong>📌 How to get LHDN credentials:</strong></div>
                <ol className="list-decimal pl-4 space-y-0.5">
                  <li>Go to <a href="https://myinvois.hasil.gov.my" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">myinvois.hasil.gov.my</a></li>
                  <li>Log in with your business MyTax account (use your TIN and password)</li>
                  <li>Go to <strong>Settings → API Settings</strong></li>
                  <li>Click <strong>"Generate New Credential"</strong></li>
                  <li>Copy the <strong>Client ID</strong> and <strong>Client Secret</strong></li>
                  <li>Paste them above and click Save</li>
                </ol>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// ============ CUSTOM FIELDS SETTINGS ============
function CustomFieldsSettings({ selectedOrgId, settings }: { selectedOrgId?: string; settings?: any }) {
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const userOrgId = currentUser?.user?.organizationId
  // Developer-selected org takes priority; otherwise fall back to the user's own org
  const orgId = selectedOrgId || userOrgId
  // Fetch the org's ENABLED custom fields (merged from global library + legacy)
  const { data: fields, loading, refetch } = useFetch<any[]>(orgId ? `/api/custom-fields?orgId=${orgId}` : null)
  // Fetch the GLOBAL field library (all available fields, with org selection status)
  const { data: globalLibrary, refetch: refetchGlobal } = useFetch<any[]>(orgId ? `/api/org-custom-fields?orgId=${orgId}&enabledOnly=false` : null)
  // Also fetch the org's businessType (so we can show + seed the right defaults)
  const { data: orgData } = useFetch<any>(orgId ? `/api/organizations` : null)
  const currentOrg = (orgData || []).find((o: any) => o.id === orgId)
  const businessType = currentOrg?.businessType || 'nursing_home'
  const [showAdd, setShowAdd] = useState(false)
  const [editField, setEditField] = useState<any | null>(null)
  const [form, setForm] = useState<any>({ label: '', type: 'TEXT', options: '', unit: '', required: false, referenceEntity: '', orgLabelOverride: '' })
  const [saving, setSaving] = useState(false)
  const [seeding, setSeeding] = useState(false)
  const [subTab, setSubTab] = useState<'fields' | 'tabs' | 'modules'>('fields')
  // Fetch org's custom tabs (with show/hide status)
  const { data: orgCustomTabs, refetch: refetchTabs } = useFetch<any[]>(orgId ? `/api/org-custom-tabs?orgId=${orgId}` : null)

  const seedDefaults = async () => {
    if (!orgId) { toast.error('No organization selected'); return }
    if (!confirm(`Load default custom fields for business type "${businessType}"?\n\nOnly fields that don't already exist will be added — your existing fields won't be touched.`)) return
    setSeeding(true)
    try {
      const r = await fetch('/api/custom-fields/seed-defaults', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orgId }),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${r.status}`)
      }
      const result = await r.json()
      if (result.inserted > 0) {
        toast.success(`Loaded ${result.inserted} default field(s) for ${businessType}`)
      } else {
        toast.info(`No new fields added — all ${result.skipped} default field(s) already exist`)
      }
      refetch()
    } catch (e: any) { toast.error(e.message) }
    setSeeding(false)
  }

  const submit = async () => {
    if (!form.label.trim()) { toast.error('Label required'); return }
    if (!orgId) { toast.error('No organization selected — cannot create field.'); return }
    setSaving(true)
    try {
      const payload: any = {
        label: form.label.trim(),
        type: form.type,
        unit: form.unit || null,
        required: form.required,
        orgId,
      }
      if (form.type === 'SELECT' && form.options) {
        payload.options = form.options.split(',').map((s: string) => s.trim()).filter(Boolean)
      }
      if (form.type === 'REFERENCE') {
        payload.referenceEntity = form.referenceEntity || null
      }
      if (editField) {
        const r = await fetch(`/api/custom-fields?id=${editField.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.error || `HTTP ${r.status}`)
        }
        // Save org-level label override (rename for this org only)
        if (form.orgLabelOverride !== undefined) {
          const globalFieldId = editField.globalFieldId || editField.id
          const orgSelection = (globalLibrary || []).find((g: any) => g.globalFieldId === globalFieldId)
          if (orgSelection?.orgSelectionId) {
            await fetch(`/api/org-custom-fields?id=${orgSelection.orgSelectionId}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ labelOverride: form.orgLabelOverride.trim() || null }),
            })
          } else {
            await fetch('/api/org-custom-fields', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ orgId, globalFieldId, labelOverride: form.orgLabelOverride.trim() || null, enabled: true }),
            })
          }
        }
        toast.success('Field updated')
      } else {
        const r = await fetch('/api/custom-fields', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!r.ok) {
          const err = await r.json().catch(() => ({}))
          throw new Error(err.error || `HTTP ${r.status}`)
        }
        toast.success('Field created')
      }
      setShowAdd(false); setEditField(null)
      setForm({ label: '', type: 'TEXT', options: '', unit: '', required: false, referenceEntity: '', orgLabelOverride: '' })
      refetch()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const deleteField = async (id: string, label: string) => {
    if (!confirm(`Delete custom field "${label}"? All values stored for this field will be lost.`)) return
    try {
      const r = await fetch(`/api/custom-fields?id=${id}`, { method: 'DELETE' })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${r.status}`)
      }
      toast.success('Field deleted')
      refetch()
    } catch (e: any) { toast.error(e.message) }
  }

  if (!orgId) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          {selectedOrgId === '' && currentUser?.user?.role === 'APP_DEVELOPER'
            ? 'Select an organization from the dropdown above to view and manage its custom fields.'
            : 'Custom fields are organization-specific. Your account is not linked to an organization.'}
        </CardContent>
      </Card>
    )
  }

  const TYPE_LABELS: Record<string, string> = {
    TEXT: 'Text', NUMBER: 'Number', DATE: 'Date', SELECT: 'Dropdown', TEXTAREA: 'Long Text', REFERENCE: 'Reference (link to another record)',
  }

  const ENTITY_LABELS: Record<string, string> = {
    resident: 'Customer / Resident',
    invoice: 'Invoice',
    product: 'Product',
    staff: 'Staff',
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <ListChecks className="h-4 w-4" /> Customization
          </CardTitle>
          <CardDescription>
            Manage custom fields and custom tabs for your organization. Enable fields from the global library, rename them locally, and control which custom tabs appear in the customer detail view.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* Sub-tab bar: Custom Fields | Custom Tabs | Module Names */}
          <div className="flex gap-1 border-b pb-px">
            <button onClick={() => setSubTab('fields')} className={`px-3 py-1.5 text-sm border-b-2 ${subTab === 'fields' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
              Custom Fields
            </button>
            <button onClick={() => setSubTab('tabs')} className={`px-3 py-1.5 text-sm border-b-2 ${subTab === 'tabs' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
              Custom Tabs
            </button>
            <button onClick={() => setSubTab('modules')} className={`px-3 py-1.5 text-sm border-b-2 ${subTab === 'modules' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
              Module Names
            </button>
          </div>

          {subTab === 'fields' && (
            <>
          {/* Scope indicator — show which org's fields are being displayed */}
          <div className="text-xs px-3 py-2 rounded-md border bg-muted/30 text-muted-foreground flex items-center gap-2 flex-wrap">
            <span className="font-medium">Showing fields for org:</span>
            <code className="text-[10px] bg-background px-1.5 py-0.5 rounded border">{orgId}</code>
            <span className="text-[10px]">•</span>
            <span>Business type: <span className="font-medium">{businessType}</span></span>
            {currentUser?.user?.role === 'APP_DEVELOPER' && (
              <span className="ml-auto text-[10px]">Developer view — change via the org dropdown above</span>
            )}
          </div>

          {loading ? (
            <Skeleton className="h-20" />
          ) : (fields || []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <ListChecks className="h-10 w-10 mx-auto mb-2 opacity-30" />
              <p>No custom fields defined yet.</p>
              <p className="text-xs mt-1">Click "Add Field" to create your first custom field.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {(fields || []).map((f: any) => (
                <div key={f.id} className="flex items-center gap-3 p-2 border rounded-md">
                  <div className="flex-1">
                    <div className="font-medium text-sm flex items-center gap-2">
                      {f.label}
                      {f.unit && <Badge variant="outline" className="text-[10px]">{f.unit}</Badge>}
                      {f.required && <Badge variant="outline" className="text-[10px] text-amber-700">Required</Badge>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {TYPE_LABELS[f.type] || f.type}
                      {f.type === 'REFERENCE' && f.referenceEntity && <span> → {ENTITY_LABELS[f.referenceEntity] || f.referenceEntity}</span>}
                      {' • '}key: <code className="text-[10px]">{f.key}</code>
                      {f.options && <span> • Options: {JSON.parse(f.options).join(', ')}</span>}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => {
                    setEditField(f)
                    setForm({ label: f.label, type: f.type, options: f.options ? JSON.parse(f.options).join(', ') : '', unit: f.unit || '', required: f.required, referenceEntity: f.referenceEntity || '', orgLabelOverride: (globalLibrary || []).find((g: any) => g.globalFieldId === (f.globalFieldId || f.id))?.labelOverride || '' })
                    setShowAdd(true)
                  }}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => deleteField(f.id, f.label)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {showAdd ? (
            <div className="border rounded-md p-3 space-y-2 bg-muted/30">
              <div className="text-xs font-semibold text-muted-foreground">{editField ? 'EDIT FIELD' : 'NEW FIELD'}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Label *</label>
                  <Input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Chest" className="text-sm h-8" />
                </div>
                {editField && (
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Org Name Override <span className="text-[9px] text-amber-600">(rename for this org only)</span></label>
                    <Input value={form.orgLabelOverride} onChange={e => setForm({ ...form, orgLabelOverride: e.target.value })} placeholder={form.label} className="text-sm h-8" />
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Type</label>
                  <select className="w-full border rounded px-2 py-1.5 text-sm h-8" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                    <option value="TEXT">Text</option>
                    <option value="NUMBER">Number</option>
                    <option value="DATE">Date</option>
                    <option value="SELECT">Dropdown</option>
                    <option value="TEXTAREA">Long Text</option>
                    <option value="REFERENCE">Reference (link to another record)</option>
                  </select>
                </div>
                {form.type === 'SELECT' && (
                  <div className="col-span-2">
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Options (comma-separated)</label>
                    <Input value={form.options} onChange={e => setForm({ ...form, options: e.target.value })} placeholder="Cotton, Silk, Wool" className="text-sm h-8" />
                  </div>
                )}
                {form.type === 'REFERENCE' && (
                  <div className="col-span-2">
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Links To (which entity this references) *</label>
                    <select className="w-full border rounded px-2 py-1.5 text-sm h-8" value={form.referenceEntity} onChange={e => setForm({ ...form, referenceEntity: e.target.value })}>
                      <option value="">— Select —</option>
                      <option value="product">Product</option>
                      <option value="staff">Staff</option>
                      <option value="resident">Customer / Resident</option>
                      <option value="invoice">Invoice</option>
                    </select>
                    <p className="text-[10px] text-muted-foreground mt-0.5">This field will show a dropdown of all records of the selected type. The selected record's ID is stored as the value.</p>
                  </div>
                )}
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Unit (optional)</label>
                  <Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} placeholder="cm, kg, inch" className="text-sm h-8" />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" checked={form.required} onChange={e => setForm({ ...form, required: e.target.checked })} className="h-4 w-4" />
                    <span className="text-xs">Required</span>
                  </label>
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={submit} disabled={saving || !form.label.trim() || (form.type === 'REFERENCE' && !form.referenceEntity)}>
                  {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</> : <><Check className="h-3.5 w-3.5 mr-1" /> {editField ? 'Update' : 'Create'} Field</>}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowAdd(false); setEditField(null); setForm({ label: '', type: 'TEXT', options: '', unit: '', required: false, referenceEntity: '' }) }}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <Button size="sm" variant="outline" onClick={() => setShowAdd(true)}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Field
              </Button>
              <Button size="sm" variant="outline" onClick={seedDefaults} disabled={seeding || !orgId}
                title={`Insert default fields for the ${businessType} business type. Only adds fields that don't already exist.`}>
                {seeding
                  ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Loading...</>
                  : <><RotateCcw className="h-3.5 w-3.5 mr-1" /> Load Defaults ({businessType})</>}
              </Button>
            </div>
          )}
            </>
          )}

          {/* Custom Tabs sub-tab — show/hide tabs + rename + pick module */}
          {subTab === 'tabs' && (
            <div className="space-y-3">
              <div className="text-xs px-3 py-2 rounded-md border bg-muted/30 text-muted-foreground flex items-center gap-2 flex-wrap">
                <span className="font-medium">Custom tabs for org:</span>
                <code className="text-[10px] bg-background px-1.5 py-0.5 rounded border">{orgId}</code>
                <span className="text-[10px]">•</span>
                <span>Tabs are created by the Developer. Toggle them on/off, rename them, or move them to a different module for this org.</span>
              </div>

              {(orgCustomTabs || []).length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <ListChecks className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  <p>No custom tabs available.</p>
                  <p className="text-xs mt-1">The Developer can create custom tabs in Developer → Customization → Custom Tabs.</p>
                </div>
              ) : (
                <div className="space-y-1.5">
                  {(orgCustomTabs || []).map((t: any) => {
                    const fieldIds = JSON.parse(t.fields || '[]')
                    const devModule = t.module || 'resident'
                    const currentOverride = t.moduleOverride || null
                    // What the effective module currently is (override if set, else dev default)
                    const effectiveModule = currentOverride || devModule
                    return (
                      <div key={t.id} className="flex items-start gap-3 p-2 border rounded-md">
                        <input
                          type="checkbox"
                          checked={t.active}
                          onChange={async (e) => {
                            try {
                              if (t.orgSelectionId) {
                                await fetch(`/api/org-custom-tabs?id=${t.orgSelectionId}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ enabled: e.target.checked }),
                                })
                              } else {
                                await fetch('/api/org-custom-tabs', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ orgId, globalTabId: t.globalTabId, enabled: e.target.checked }),
                                })
                              }
                              toast.success(`${t.label} ${e.target.checked ? 'enabled — will show in modules after refresh' : 'disabled — hidden from modules after refresh'}`)
                              refetchTabs()
                            } catch (e: any) { toast.error(e.message) }
                          }}
                          className="h-3.5 w-3.5 flex-shrink-0 mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          {/* Row 1: tab name (editable) */}
                          <input
                            type="text"
                            defaultValue={t.labelOverride || ''}
                            placeholder={t.globalLabel}
                            onBlur={async (e) => {
                              const val = e.target.value.trim()
                              if (val === (t.labelOverride || '')) return
                              try {
                                if (t.orgSelectionId) {
                                  await fetch(`/api/org-custom-tabs?id=${t.orgSelectionId}`, {
                                    method: 'PATCH',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ labelOverride: val || null }),
                                  })
                                } else {
                                  await fetch('/api/org-custom-tabs', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ orgId, globalTabId: t.globalTabId, labelOverride: val || null, enabled: true }),
                                  })
                                }
                                toast.success(`Renamed to "${val || t.globalLabel}"`)
                                refetchTabs()
                              } catch (e: any) { toast.error(e.message) }
                            }}
                            className="w-full border rounded px-1.5 py-0.5 text-sm h-7 font-medium"
                            title="Click to rename this tab for this org"
                          />
                          {/* Row 2: meta — fields count, description, rename badge */}
                          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1 flex-wrap">
                            {fieldIds.length} field{fieldIds.length === 1 ? '' : 's'}
                            {t.description && <span> • {t.description}</span>}
                            {t.labelOverride && <Badge variant="outline" className="text-[9px] text-amber-700 border-amber-300">Renamed</Badge>}
                            {currentOverride && <Badge variant="outline" className="text-[9px] text-violet-700 border-violet-300">Moved to {currentOverride}</Badge>}
                          </div>
                          {/* Row 3: Module picker — org owner/manager can override the developer's default module */}
                          <div className="flex items-center gap-2 mt-1.5">
                            <label className="text-[10px] text-muted-foreground font-medium whitespace-nowrap flex items-center gap-1">
                              <ListChecks className="h-3 w-3" /> Show under module:
                            </label>
                            <select
                              value={currentOverride || ''}
                              onChange={async (e) => {
                                const val = e.target.value  // empty string = use developer default
                                try {
                                  if (t.orgSelectionId) {
                                    await fetch(`/api/org-custom-tabs?id=${t.orgSelectionId}`, {
                                      method: 'PATCH',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ moduleOverride: val || null }),
                                    })
                                  } else {
                                    await fetch('/api/org-custom-tabs', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      body: JSON.stringify({ orgId, globalTabId: t.globalTabId, moduleOverride: val || null, enabled: true }),
                                    })
                                  }
                                  toast.success(val
                                    ? `"${t.label}" moved to "${MODULE_LABELS[val] || val}" module — will appear there after refresh`
                                    : `"${t.label}" reset to developer default ("${MODULE_LABELS[devModule] || devModule}")`)
                                  refetchTabs()
                                } catch (e: any) { toast.error(e.message) }
                              }}
                              className="text-xs border rounded px-1.5 py-0.5 h-7 bg-background"
                              title="Pick which module this tab appears under. Default = the developer's original choice."
                            >
                              <option value="">Default ({MODULE_LABELS[devModule] || devModule})</option>
                              {MODULE_OPTIONS.map(m => (
                                <option key={m.value} value={m.value}>{m.label}</option>
                              ))}
                            </select>
                            {currentOverride && (
                              <span className="text-[10px] text-muted-foreground">
                                (dev default: {MODULE_LABELS[devModule] || devModule})
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* Module Names sub-tab — rename sidebar modules for this org */}
          {subTab === 'modules' && (
            <ModuleNamesEditor orgId={orgId || ''} settings={settings} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/**
 * ModuleNamesEditor — lets the org owner rename sidebar modules locally.
 * Saved as orgModuleLabels:<orgId> → { moduleId: "custom label" }.
 * Takes priority over business-type-level labels in page.tsx.
 */
function ModuleNamesEditor({ orgId, settings }: { orgId: string; settings: any }) {
  const MODULES = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'rounds', label: 'Care Rounds (Mobile)' },
    { id: 'residents', label: 'Residents' },
    { id: 'rooms', label: 'Rooms & Beds' },
    { id: 'staff', label: 'Staff & Shifts' },
    { id: 'clinical', label: 'Clinical' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'users', label: 'User Accounts' },
    { id: 'messages', label: 'Family Messages' },
    { id: 'products', label: 'Product Catalog' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'finance', label: 'Accounting' },
    { id: 'audit', label: 'Audit Log' },
    { id: 'profile', label: 'My Profile' },
  ]

  const orgLabelsKey = `orgModuleLabels:${orgId}`
  const orgLabels = settings?.[orgLabelsKey] || {}

  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const userOrgId = currentUser?.user?.organizationId
  const businessType = (userOrgId && settings?.[`businessType:${userOrgId}`]) || 'nursing_home'
  const btLabelsKey = `businessTypeModuleLabels:${businessType}`
  const btLabels = settings?.[btLabelsKey] || {}

  const [localLabels, setLocalLabels] = useState<Record<string, string>>(orgLabels)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setLocalLabels(orgLabels || {})
  }, [JSON.stringify(orgLabels)])

  const save = async () => {
    setSaving(true)
    try {
      const cleaned: Record<string, string> = {}
      for (const [k, v] of Object.entries(localLabels)) {
        if (v && v.trim()) cleaned[k] = v.trim()
      }
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: orgLabelsKey, value: cleaned }),
      })
      toast.success('Module names saved — sidebar will update on next page load')
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const reset = async () => {
    if (!confirm('Reset all module names to their defaults?')) return
    setLocalLabels({})
    try {
      await fetch(`/api/settings?key=${encodeURIComponent(orgLabelsKey)}`, { method: 'DELETE' })
      toast.success('Module names reset to defaults')
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-3">
      <div className="text-xs px-3 py-2 rounded-md border bg-muted/30 text-muted-foreground">
        Rename sidebar modules for your organization. These override the global default names and the business-type-level names. Changes take effect on next page load.
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {MODULES.map(m => {
          const btLabel = btLabels[m.id] || m.label
          const orgLabel = localLabels[m.id] || ''
          const hasOverride = !!orgLabel && orgLabel !== btLabel
          return (
            <div key={m.id} className="flex items-center gap-2 p-2 border rounded-md">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium">{m.label}</div>
                <div className="text-[10px] text-muted-foreground">
                  Default: {btLabel}
                  {hasOverride && <Badge variant="outline" className="text-[9px] text-amber-700 border-amber-300 ml-1">Renamed</Badge>}
                </div>
              </div>
              <input
                type="text"
                value={orgLabel}
                placeholder={btLabel}
                onChange={e => {
                  const next = { ...localLabels }
                  if (e.target.value && e.target.value !== btLabel) {
                    next[m.id] = e.target.value
                  } else {
                    delete next[m.id]
                  }
                  setLocalLabels(next)
                }}
                className="w-32 border rounded px-1.5 py-1 text-xs h-7 flex-shrink-0"
                title="Type a custom name (leave blank to use default)"
              />
            </div>
          )
        })}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={save} disabled={saving}>
          {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</> : <><Check className="h-3.5 w-3.5 mr-1" /> Save Module Names</>}
        </Button>
        <Button size="sm" variant="outline" onClick={reset}>Reset to Defaults</Button>
      </div>
    </div>
  )
}

// ============ CODE PREFIX SETTINGS ============
function PrefixSettings({ settings, saveSetting, isGlobal }: { settings: any; saveSetting: (k: string, v: any, options?: { silent?: boolean }) => Promise<any>; isGlobal: boolean }) {
  const prefixes = [
    { key: 'prefixResident', label: 'Resident Code', default: 'RES' },
    { key: 'prefixStaff', label: 'Staff Code', default: 'STF' },
    { key: 'prefixRoom', label: 'Room Code', default: 'ROM' },
    { key: 'prefixProduct', label: 'Product Code', default: 'PRD' },
    { key: 'prefixInventory', label: 'Inventory Item', default: 'ITM' },
    { key: 'prefixUser', label: 'User Code', default: 'USR' },
    { key: 'prefixInvoice', label: 'Invoice Number', default: 'INV' },
    { key: 'prefixPayment', label: 'Payment Code', default: 'PMT' },
    { key: 'prefixJournalEntry', label: 'Journal Entry', default: 'JE' },
    { key: 'prefixVendor', label: 'Vendor Code', default: 'VEN' },
    { key: 'prefixBankAccount', label: 'Bank Account', default: 'BNK' },
    { key: 'prefixDeposit', label: 'Deposit Code', default: 'DEP' },
  ]

  const [values, setValues] = useState<Record<string, string>>({})
  const [dateToggles, setDateToggles] = useState<Record<string, boolean>>({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    const initVals: Record<string, string> = {}
    const initDates: Record<string, boolean> = {}
    for (const p of prefixes) {
      initVals[p.key] = settings[p.key] || p.default
      // Per-prefix date toggle: <prefixKey>Date (e.g. prefixResidentDate)
      // Falls back to the global codeIncludeDate if not set
      initDates[p.key] = settings[`${p.key}Date`] ?? settings.codeIncludeDate ?? false
    }
    setValues(initVals)
    setDateToggles(initDates)
  }, [settings])

  const todayYYMMDD = (() => {
    const d = new Date()
    return `${String(d.getFullYear()).slice(-2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  })()

  const save = async () => {
    setSaving(true)
    for (const p of prefixes) {
      const val = (values[p.key] || p.default).toUpperCase().replace(/[^A-Z0-9]/g, '')
      await saveSetting(p.key, val, { silent: true })
      // Save the per-prefix date toggle
      await saveSetting(`${p.key}Date`, dateToggles[p.key] || false, { silent: true })
    }
    setSaving(false)
    toast.success('Code prefixes saved')
  }

  return (
    <div className="space-y-4">
      <div className={`text-xs px-3 py-2 rounded-md border ${isGlobal ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-sky-50 border-sky-200 text-sky-800'}`}>
        {isGlobal
          ? '⚠ These are GLOBAL defaults. Only the App Developer can change global prefixes. Select a facility to override.'
          : '✓ These prefixes apply to the selected facility only. Toggle the date checkbox per code type to include YYMMDD.'}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><FileText className="h-4 w-4" /> Code Prefixes</CardTitle>
          <CardDescription>
            Customize the prefix and date format for each auto-generated code. All codes use 4-digit sequential numbers (0001–9999). When date is enabled, the number resets daily.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {prefixes.map(p => {
              const prefix = (values[p.key] || p.default).toUpperCase().replace(/[^A-Z0-9]/g, '')
              const hasDate = dateToggles[p.key] || false
              const preview = hasDate ? `${prefix}-${todayYYMMDD}-0001` : `${prefix}-0001`
              return (
                <div key={p.key} className="rounded-md border p-2.5 space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">{p.label}</label>
                  <div className="flex items-center gap-1">
                    <Input
                      value={values[p.key] || ''}
                      onChange={e => setValues({ ...values, [p.key]: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })}
                      placeholder={p.default}
                      className="font-mono text-sm w-20"
                      maxLength={6}
                    />
                    <span className="text-xs text-muted-foreground font-mono">-0001</span>
                  </div>
                  {/* Per-prefix date toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hasDate}
                      onChange={e => setDateToggles({ ...dateToggles, [p.key]: e.target.checked })}
                      className="h-3.5 w-3.5"
                    />
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Calendar className="h-2.5 w-2.5" />
                      Include date (YYMMDD)
                    </span>
                  </label>
                  <div className="text-[10px] font-mono text-primary bg-primary/5 rounded px-1.5 py-0.5 truncate">
                    {preview}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠ Changing a prefix only affects <strong>new</strong> records. Existing codes keep their original format.
            All codes use 4-digit sequential numbers. When date is enabled, the number resets daily (e.g. {`RES-${todayYYMMDD}-0001`} → {`RES-${todayYYMMDD}-0002`}).
          </div>

          <Button onClick={save} disabled={saving}>
            {saving ? <><Check className="h-4 w-4 mr-1" /> Saved!</> : <><Save className="h-4 w-4 mr-1" /> Save All Prefixes</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ LEVEL MODULE EDITOR ============
function LevelModuleEditor({ settings, saveSetting }: { settings: any; saveSetting: (k: string, v: any, options?: { silent?: boolean }) => Promise<any> }) {
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const myRole = currentUser?.user?.role
  const myOrgId = currentUser?.user?.organizationId

  // All modules (excluding developer — only level 0 has that)
  const ALL_MODULES = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'rounds', label: 'Care Rounds' },
    { id: 'residents', label: 'Residents' },
    { id: 'rooms', label: 'Rooms & Beds' },
    { id: 'staff', label: 'Staff & Shifts' },
    { id: 'clinical', label: 'Clinical' },
    { id: 'incidents', label: 'Incidents' },
    { id: 'users', label: 'User Accounts' },
    { id: 'messages', label: 'Family Messages' },
    { id: 'products', label: 'Product Catalog' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'finance', label: 'Accounting' },
    { id: 'audit', label: 'Audit Log' },
    { id: 'settings', label: 'Settings' },
    { id: 'profile', label: 'My Profile' },
  ]

  const LEVELS = [
    { level: 1, label: 'L1 — Org Owner', roles: 'OWNER' },
    { level: 2, label: 'L2 — Manager', roles: 'MANAGER' },
    { level: 3, label: 'L3 — Clinical', roles: 'DOCTOR, NURSE, PHYSIO, DIETITIAN' },
    { level: 4, label: 'L4 — Support', roles: 'CARE_STAFF, RECEPTION' },
    { level: 5, label: 'L5 — Family', roles: 'FAMILY' },
  ]

  const DEFAULT_LEVEL_MODULES: Record<number, string[]> = {
    1: ['dashboard', 'residents', 'rooms', 'staff', 'clinical', 'incidents', 'finance', 'messages', 'users', 'products', 'inventory', 'audit', 'rounds', 'settings', 'profile'],
    2: ['dashboard', 'residents', 'rooms', 'staff', 'clinical', 'incidents', 'finance', 'messages', 'users', 'products', 'inventory', 'audit', 'rounds', 'settings', 'profile'],
    3: ['dashboard', 'residents', 'clinical', 'incidents', 'messages', 'inventory', 'rounds', 'profile'],
    4: ['dashboard', 'residents', 'medications', 'vitals', 'incidents', 'inventory', 'rounds', 'profile'],
    5: ['dashboard', 'residents', 'messages', 'profile'],
  }

  // Build the settings key: org-scoped for Owner, global for Developer
  const getKey = (level: number) => {
    if (myRole === 'APP_DEVELOPER') return `levelModules:${level}`  // Developer = global default
    return `levelModules:${myOrgId}:${level}`  // Owner = org-scoped
  }

  const getLevelModules = (level: number): string[] => {
    const key = getKey(level)
    const stored = settings[key]
    if (Array.isArray(stored)) return stored
    return DEFAULT_LEVEL_MODULES[level] || []
  }

  const [expandedLevel, setExpandedLevel] = useState<number | null>(null)

  const toggleModule = async (level: number, moduleId: string) => {
    const current = getLevelModules(level)
    const next = current.includes(moduleId)
      ? current.filter(id => id !== moduleId)
      : [...current, moduleId]
    await saveSetting(getKey(level), next, { silent: true })
    toast.success(`Module access updated for Level ${level}`)
  }

  return (
    <div className="space-y-2">
      {myRole === 'APP_DEVELOPER' && (
        <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded p-1.5">
          As Developer, you are editing <strong>global defaults</strong> that apply to all organizations without their own override.
        </div>
      )}
      {myRole === 'OWNER' && (
        <div className="text-[10px] text-sky-700 bg-sky-50 border border-sky-200 rounded p-1.5">
          You are editing module access for <strong>your organization only</strong>. Other organizations are not affected.
        </div>
      )}
      {LEVELS.map(l => {
        const modules = getLevelModules(l.level)
        const isExpanded = expandedLevel === l.level
        return (
          <div key={l.level} className="border rounded-md">
            <div
              className="flex items-center gap-2 p-2 cursor-pointer hover:bg-muted/50"
              onClick={() => setExpandedLevel(isExpanded ? null : l.level)}
            >
              <Badge variant="outline" className={`font-bold ${l.level === 1 ? 'bg-rose-100 text-rose-700' : l.level === 2 ? 'bg-orange-100 text-orange-700' : l.level === 3 ? 'bg-sky-100 text-sky-700' : l.level === 4 ? 'bg-emerald-100 text-emerald-700' : 'bg-violet-100 text-violet-700'}`}>
                L{l.level}
              </Badge>
              <div className="flex-1">
                <div className="font-medium text-sm">{l.label}</div>
                <div className="text-[10px] text-muted-foreground">{modules.length} modules accessible</div>
              </div>
              <ChevronDownIcon className={`h-4 w-4 text-muted-foreground transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </div>

            {isExpanded && (
              <div className="border-t p-2 space-y-1">
                <div className="text-[10px] text-muted-foreground mb-1">Tick modules this level can access:</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-1">
                  {ALL_MODULES.map(m => {
                    const checked = modules.includes(m.id)
                    return (
                      <label key={m.id} className="flex items-center gap-1.5 cursor-pointer p-1 rounded hover:bg-muted/50 text-xs">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModule(l.level, m.id)}
                          className="h-3 w-3"
                        />
                        <span className={checked ? 'font-medium' : 'text-muted-foreground'}>{m.label}</span>
                      </label>
                    )
                  })}
                </div>
                <div className="flex gap-2 pt-1">
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={async () => {
                    await saveSetting(getKey(l.level), ALL_MODULES.map(m => m.id), { silent: true })
                    toast.success(`All modules enabled for Level ${l.level}`)
                  }}>
                    Select All
                  </Button>
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={async () => {
                    await saveSetting(getKey(l.level), ['dashboard', 'profile'], { silent: true })
                    toast.success(`Reset to minimal for Level ${l.level}`)
                  }}>
                    Minimal
                  </Button>
                  <Button size="sm" variant="ghost" className="h-6 text-[10px] text-red-600" onClick={async () => {
                    await saveSetting(getKey(l.level), DEFAULT_LEVEL_MODULES[l.level] || [], { silent: true })
                    toast.success(`Reset to default for Level ${l.level}`)
                  }}>
                    Reset to Default
                  </Button>
                </div>
              </div>
            )}
          </div>
        )
      })}
      <div className="text-[10px] text-muted-foreground pt-1">
        Changes take effect when users at each level next load the page. Individual users can still be customized via User Accounts → Modules button.
      </div>
    </div>
  )
}

// ============ USER LEVEL SETTINGS ============
function UserLevelSettings({ settings, saveSetting }: { settings: any; saveSetting: (k: string, v: any, options?: { silent?: boolean }) => Promise<any> }) {
  const allLevels: any[] = settings.userLevels || []
  // Hide Level 0 (App Developer) from everyone — it's a system level
  const levels: any[] = allLevels.filter((l: any) => l.level > 0)
  const [editing, setEditing] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editRoles, setEditRoles] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newRoles, setNewRoles] = useState('')

  // Create New User form state
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState(settings.defaultNewUserPassword || '')
  const [newUserRole, setNewUserRole] = useState('CARE_STAFF')
  const [newUserLevel, setNewUserLevel] = useState(4)
  const [newUserPhone, setNewUserPhone] = useState('')
  const [newUserFacilityIds, setNewUserFacilityIds] = useState<string[]>([])
  const [newUserOrgId, setNewUserOrgId] = useState<string>('')
  const [creatingUser, setCreatingUser] = useState(false)
  const { data: facilitiesData } = useFetch<any>('/api/facilities/accessible')
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const { data: organizationsData } = useFetch<any[]>('/api/organizations')
  const allFacilities = facilitiesData?.facilities || []
  const myLevel = currentUser?.user?.level ?? 99
  const myRole = currentUser?.user?.role
  const myOrgId = currentUser?.user?.organizationId
  const allOrganizations = organizationsData || []

  // Sync default password when setting loads or changes
  useEffect(() => {
    if (settings.defaultNewUserPassword && !newUserPassword) {
      setNewUserPassword(settings.defaultNewUserPassword)
    }
  }, [settings.defaultNewUserPassword])

  // For Owner: filter facilities to their org only
  // For Developer: show all facilities (or filter by selected org)
  const visibleFacilities = myRole === 'OWNER'
    ? allFacilities.filter((f: any) => f.organizationId === myOrgId)
    : newUserOrgId
      ? allFacilities.filter((f: any) => f.organizationId === newUserOrgId)
      : allFacilities

  // Build available roles based on who is creating the user
  // - Developer CAN create other Developers (level 0) — full system access
  // - Owner/Manager CANNOT see or create Developers (hidden from lower levels)
  const availableRoles = ROLES.filter(r => {
    if (myRole !== 'APP_DEVELOPER' && r.id === 'APP_DEVELOPER') return false
    if (myRole === 'MANAGER' && (r.id === 'OWNER' || r.id === 'MANAGER')) return false
    if (myRole === 'OWNER' && r.id === 'OWNER') return false
    return true
  })

  const handleCreateUser = async () => {
    if (!newUserName.trim()) { toast.error('Name is required'); return }
    if (!newUserEmail.trim()) { toast.error('Email is required'); return }
    if (!newUserPassword.trim()) { toast.error('Password is required'); return }
    if (newUserPassword.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (newUserLevel < myLevel) { toast.error(`You cannot create a user with a higher level than your own (Level ${myLevel})`); return }
    setCreatingUser(true)
    try {
      const body: any = {
        name: newUserName.trim(),
        email: newUserEmail.trim().toLowerCase(),
        password: newUserPassword,
        role: newUserRole,
        level: newUserLevel,
        phone: newUserPhone || undefined,
        facilityIds: newUserFacilityIds.length > 0 ? newUserFacilityIds.join(',') : undefined,
      }
      // Only Developer can assign org explicitly; Owner is auto-scoped by API
      if (myRole === 'APP_DEVELOPER' && newUserOrgId) {
        body.organizationId = newUserOrgId
      }
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(`User created: ${data.name} (${data.email})`)
      // Reset form
      setNewUserName('')
      setNewUserEmail('')
      setNewUserPassword(settings.defaultNewUserPassword || '')
      setNewUserRole('CARE_STAFF')
      setNewUserLevel(4)
      setNewUserPhone('')
      setNewUserFacilityIds([])
      setNewUserOrgId('')
    } catch (e: any) {
      toast.error(e.message)
    }
    setCreatingUser(false)
  }

  const levelColors: Record<number, string> = {
    0: 'bg-fuchsia-100 text-fuchsia-700',
    1: 'bg-rose-100 text-rose-700',
    2: 'bg-orange-100 text-orange-700',
    3: 'bg-sky-100 text-sky-700',
    4: 'bg-emerald-100 text-emerald-700',
    5: 'bg-violet-100 text-violet-700',
    6: 'bg-amber-100 text-amber-700',
    7: 'bg-teal-100 text-teal-700',
    8: 'bg-pink-100 text-pink-700',
  }

  const updateLevel = (index: number, label: string, desc: string, rolesStr: string) => {
    const updated = [...levels]
    const roles = rolesStr.split(',').map((r: string) => r.trim().toUpperCase()).filter(Boolean)
    updated[index] = { ...updated[index], label, desc, roles }
    saveSetting('userLevels', updated)
    setEditing(null)
  }

  const addLevel = () => {
    if (!newLabel.trim()) { toast.error('Label required'); return }
    const nextLevel = Math.max(...levels.map((l: any) => l.level), 1) + 1
    const roles = newRoles.split(',').map(r => r.trim().toUpperCase()).filter(Boolean)
    const updated = [...levels, { level: nextLevel, label: newLabel.trim(), desc: newDesc.trim(), roles }]
    saveSetting('userLevels', updated)
    setNewLabel(''); setNewDesc(''); setNewRoles('')
    toast.success(`Level ${nextLevel} added`)
  }

  const deleteLevel = (index: number) => {
    const level = levels[index]
    if (level.level <= 2) { toast.error('Cannot delete Level 1 (Owner) or Level 2 (Manager)'); return }
    if (!confirm(`Delete Level ${level.level} (${level.label})? Users at this level will need to be reassigned.`)) return
    const updated = levels.filter((_: any, i: number) => i !== index)
    saveSetting('userLevels', updated)
    toast.success('Level deleted')
  }

  return (
    <div className="space-y-4">
      {/* Create New User — moved to User Accounts module */}

      {/* User Hierarchy Levels */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Users className="h-4 w-4" /> User Hierarchy Levels</CardTitle>
          <CardDescription>Edit, add, or remove user levels. Level 1 (Owner) is highest — can see all. Lower levels can only see users at their level or below.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {levels.map((l: any, i: number) => (
              <div key={l.level} className="flex items-center gap-3 p-3 border rounded-md">
                {editing === i ? (
                  <>
                    <Badge variant="outline" className={`font-bold ${levelColors[l.level] || 'bg-muted'}`}>L{l.level}</Badge>
                    <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} placeholder="Label" className="text-sm" />
                      <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} placeholder="Description" className="text-sm" />
                      <Input value={editRoles} onChange={e => setEditRoles(e.target.value)} placeholder="Roles (comma-sep)" className="text-sm" />
                    </div>
                    <Button size="sm" onClick={() => updateLevel(i, editLabel, editDesc, editRoles)}><Check className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className={`font-bold ${levelColors[l.level] || 'bg-muted'}`}>L{l.level}</Badge>
                    <div className="flex-1">
                      <div className="font-medium text-sm">{l.label}</div>
                      <div className="text-xs text-muted-foreground">{l.desc}</div>
                      {l.roles && l.roles.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {l.roles.map((r: string) => <Badge key={r} variant="outline" className="text-[10px] px-1 py-0">{r}</Badge>)}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditing(i); setEditLabel(l.label); setEditDesc(l.desc); setEditRoles((l.roles || []).join(', ')) }}>
                      Edit
                    </Button>
                    {l.level > 2 && (
                      <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => deleteLevel(i)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new level */}
          <div className="mt-4 pt-3 border-t">
            <div className="text-xs font-medium text-muted-foreground mb-2">Add New Level</div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
              <Input placeholder="Label (e.g., Volunteer)" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="text-sm" />
              <Input placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)} className="text-sm" />
              <Input placeholder="Roles (e.g., VOLUNTEER, INTERN)" value={newRoles} onChange={e => setNewRoles(e.target.value)} className="text-sm" />
            </div>
            <Button size="sm" onClick={addLevel}><Plus className="h-3 w-3 mr-1" /> Add Level</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><ListChecks className="h-4 w-4" /> Module Access by Level</CardTitle>
          <CardDescription>
            Control which modules each user level can access. Tick/untick modules per level — changes apply to all users at that level (unless individually overridden via User Accounts → Modules).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <LevelModuleEditor settings={settings} saveSetting={saveSetting} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How Levels Work</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1 text-muted-foreground">
          <p>• <strong className="text-foreground">Level 0 (App Developer)</strong> — hidden from Owners/Managers. Only developers can see + create other developers. Has access to ALL facilities + organizations.</p>
          <p>• Level 1 (Owner) can see and manage ALL users at any level within their organization.</p>
          <p>• Level 2 (Manager) can see users at Level 2 and below — cannot see Owner.</p>
          <p>• Level 3+ can only see users at their own level or below.</p>
          <p>• When creating a user, you cannot assign a level higher than your own.</p>
          <p className="mt-2 text-amber-600">⚠ Levels 1 and 2 cannot be deleted. They are essential for system operation.</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Module Access</CardTitle>
          <CardDescription>Each user's module access can be customized individually via User Accounts → Modules button</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          <p>The Owner can override any user's module access at any time, regardless of their role or level.</p>
          <p className="mt-1">Default module access is based on role, but can be fully customized per user.</p>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ RESIDENT STATUS SETTINGS ============
function ResidentStatusSettings({ settings, saveSetting }: { settings: any; saveSetting: (k: string, v: any, options?: { silent?: boolean }) => Promise<any> }) {
  const statuses = settings.residentStatuses || []
  const [editing, setEditing] = useState<number | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newDesc, setNewDesc] = useState('')

  const updateStatus = (index: number, label: string, desc: string) => {
    const updated = [...statuses]
    updated[index] = { ...updated[index], label, desc }
    saveSetting('residentStatuses', updated)
    setEditing(null)
  }

  const addStatus = () => {
    if (!newLabel.trim()) { toast.error('Label required'); return }
    const id = newLabel.trim().toUpperCase().replace(/\s+/g, '_')
    if (statuses.some((s: any) => s.id === id)) { toast.error('Status already exists'); return }
    const updated = [...statuses, { id, label: newLabel.trim(), desc: newDesc.trim() }]
    saveSetting('residentStatuses', updated)
    setNewLabel('')
    setNewDesc('')
    toast.success('Status added')
  }

  const deleteStatus = (index: number) => {
    if (!confirm('Delete this status? Existing records with this status will not be affected.')) return
    const updated = statuses.filter((_: any, i: number) => i !== index)
    saveSetting('residentStatuses', updated)
    toast.success('Status deleted')
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Stethoscope className="h-4 w-4" /> Resident Statuses</CardTitle>
          <CardDescription>Edit, add, or remove resident statuses. Changing status affects medication scheduling.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {statuses.map((s: any, i: number) => (
              <div key={s.id} className="flex items-center gap-3 p-3 border rounded-md">
                {editing === i ? (
                  <>
                    <Input value={editLabel} onChange={e => setEditLabel(e.target.value)} className="flex-1 text-sm" />
                    <Input value={editDesc} onChange={e => setEditDesc(e.target.value)} className="flex-[2] text-sm" placeholder="Description" />
                    <Button size="sm" onClick={() => updateStatus(i, editLabel, editDesc)}><Check className="h-3 w-3" /></Button>
                    <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <Badge variant="outline" className="bg-primary/5">{s.label}</Badge>
                    <span className="text-sm text-muted-foreground flex-1">{s.desc}</span>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => { setEditing(i); setEditLabel(s.label); setEditDesc(s.desc) }}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => deleteStatus(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Add new status */}
          <div className="mt-4 pt-3 border-t">
            <div className="text-xs font-medium text-muted-foreground mb-2">Add New Status</div>
            <div className="flex gap-2">
              <Input placeholder="Status label (e.g., On Leave)" value={newLabel} onChange={e => setNewLabel(e.target.value)} className="flex-1 text-sm" />
              <Input placeholder="Description" value={newDesc} onChange={e => setNewDesc(e.target.value)} className="flex-[2] text-sm" />
              <Button size="sm" onClick={addStatus}><Plus className="h-3 w-3 mr-1" /> Add</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Status Change Effects</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-red-600 font-bold">→</span>
            <span>When a resident is marked <strong>Hospitalized</strong> or <strong>Out with Family</strong>, all pending meds are auto-marked as <strong>Resident Out</strong>.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-600 font-bold">→</span>
            <span>When a resident returns (marked <strong>Active</strong>), new meds will be generated on next dashboard load.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-slate-600 font-bold">→</span>
            <span>When a resident is <strong>Discharged</strong> or <strong>Deceased</strong>, medications are deactivated.</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ FACILITY SETTINGS ============
function FacilitySettings({ settings, saveSetting, isGlobal, role }: { settings: any; saveSetting: (k: string, v: any, options?: { silent?: boolean }) => Promise<any>; isGlobal: boolean; role?: string }) {
  // Use /api/facilities (not /api/facilities/accessible) because this table needs
  // _count.residents/staff/rooms and the `active` field — both omitted by the
  // minimal `select` in /api/facilities/accessible. /api/facilities is org-scoped
  // for Owner and unscoped for Developer, exactly what this admin table needs.
  const { data: facilitiesResponse, loading, refetch } = useFetch<any>('/api/facilities')
  const facilities = facilitiesResponse?.facilities || facilitiesResponse || []
  // Fetch organizations (Developer sees all; Owner only sees their own). Used to
  // display the Organization column in the facilities table.
  const { data: orgsData } = useFetch<any[]>('/api/organizations')
  const orgsById: Record<string, string> = {}
  for (const o of orgsData || []) {
    orgsById[o.id] = o.name
  }
  const [editing, setEditing] = useState<any | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const triggerRefresh = () => { setRefreshKey(k => k + 1); refetch() }

  // Organization-level settings (merged from former OrganizationSettings)
  const [orgName, setOrgName] = useState(settings.organizationName || settings.facilityName || 'Serenity Care Home')
  const [orgLogoUrl, setOrgLogoUrl] = useState(settings.organizationLogoUrl || '')
  const [orgRegNumber, setOrgRegNumber] = useState(settings.organizationRegistrationNumber || '')
  const [orgAddress, setOrgAddress] = useState(settings.organizationAddress || '')
  const [orgAddress2, setOrgAddress2] = useState(settings.organizationAddress2 || '')
  const [orgCity, setOrgCity] = useState(settings.organizationCity || '')
  const [orgState, setOrgState] = useState(settings.organizationState || '')
  const [orgPostal, setOrgPostal] = useState(settings.organizationPostalCode || '')
  const [orgCountry, setOrgCountry] = useState(settings.organizationCountry || 'Malaysia')
  const [uploadingLogo, setUploadingLogo] = useState(false)
  const [primaryColor, setPrimaryColor] = useState(settings.primaryColor || '#e11d48')
  const [emailFrom, setEmailFrom] = useState(settings.emailFromAddress || '')
  const [emailEnabled, setEmailEnabled] = useState(settings.emailNotificationsEnabled || false)
  const [notifyEvents, setNotifyEvents] = useState<string[]>(settings.notificationEvents || [])

  const allEvents = [
    { id: 'INVOICE_CREATED', label: 'Invoice Created' },
    { id: 'PAYMENT_RECEIVED', label: 'Payment Received' },
    { id: 'PAYMENT_OVERDUE', label: 'Payment Overdue' },
    { id: 'INCIDENT_REPORTED', label: 'Incident Reported' },
    { id: 'LOW_STOCK', label: 'Inventory Low Stock' },
    { id: 'RESIDENT_ADMITTED', label: 'Resident Admitted' },
    { id: 'RESIDENT_DISCHARGED', label: 'Resident Discharged' },
    { id: 'SHIFT_CHANGED', label: 'Shift Schedule Changed' },
    { id: 'MESSAGE_RECEIVED', label: 'Family Message Received' },
  ]

  if (loading && !facilities) return <Skeleton className="h-96" />

  const handleSave = async (facility: any) => {
    try {
      if (facility.id) {
        await fetch(`/api/facilities?id=${facility.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(facility),
        })
        toast.success('Facility updated')
      } else {
        await fetch('/api/facilities', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(facility),
        })
        toast.success('Facility added')
      }
      setEditing(null)
      setShowAdd(false)
      triggerRefresh()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this facility? All data must be reassigned first.')) return
    try {
      const r = await fetch(`/api/facilities?id=${id}`, { method: 'DELETE' })
      const d = await r.json()
      if (!r.ok) { toast.error(d.error); return }
      toast.success('Facility deleted')
      triggerRefresh()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      <div className={`text-xs px-3 py-2 rounded-md border ${isGlobal ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-sky-50 border-sky-200 text-sky-800'}`}>
        {isGlobal ? '⚠ Organization-level settings (branding, notifications, backup) apply globally. Facility-specific details are edited per facility below.' : '✓ Branding and org settings apply globally. Edit facility details for the selected facility.'}
      </div>

      {/* Organization Identity & Branding */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Organization Identity & Branding</CardTitle>
          <CardDescription>Organization name, registration number, address, and logo — shown on invoices, emails, and the app header.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {/* Organization Name + Registration Number */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Organization Name *</label>
              <Input value={orgName} onChange={e => setOrgName(e.target.value)} placeholder="e.g. Serenity Care Home Sdn Bhd" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Registration Number</label>
              <Input value={orgRegNumber} onChange={e => setOrgRegNumber(e.target.value)} placeholder="e.g. 202001012345 (SSM)" />
            </div>
          </div>

          {/* Address */}
          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">REGISTERED ADDRESS</div>
            <div className="space-y-2">
              <Input value={orgAddress} onChange={e => setOrgAddress(e.target.value)} placeholder="Street address (e.g. No. 15, Jalan Ampang)" />
              <Input value={orgAddress2} onChange={e => setOrgAddress2(e.target.value)} placeholder="Address line 2 (optional)" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <Input value={orgCity} onChange={e => setOrgCity(e.target.value)} placeholder="City" />
                <Input value={orgState} onChange={e => setOrgState(e.target.value)} placeholder="State" />
                <Input value={orgPostal} onChange={e => setOrgPostal(e.target.value)} placeholder="Postal code" />
                <Input value={orgCountry} onChange={e => setOrgCountry(e.target.value)} placeholder="Country" />
              </div>
            </div>
          </div>

          {/* Logo Upload */}
          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">LOGO</div>
            <div className="flex items-start gap-4 flex-wrap">
              {/* Logo preview */}
              {orgLogoUrl && (
                <div className="border rounded-lg p-2 bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={orgLogoUrl} alt="Logo" className="h-16 w-auto max-w-[200px] object-contain" />
                </div>
              )}
              <div className="flex-1 min-w-[200px] space-y-2">
                <div className="flex gap-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                    onChange={async (e) => {
                      const file = e.target.files?.[0]
                      if (!file) return
                      if (file.size > 2 * 1024 * 1024) { toast.error('File too large (max 2MB)'); return }
                      setUploadingLogo(true)
                      try {
                        const formData = new FormData()
                        formData.append('logo', file)
                        const res = await fetch('/api/upload-logo', { method: 'POST', body: formData })
                        const data = await res.json()
                        if (!res.ok) throw new Error(data.error)
                        setOrgLogoUrl(data.url)
                        toast.success('Logo uploaded')
                      } catch (err: any) { toast.error(err.message) }
                      setUploadingLogo(false)
                    }}
                    className="text-xs border rounded px-2 py-1.5 cursor-pointer file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground"
                  />
                  {uploadingLogo && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                </div>
                <div className="flex gap-2 items-center">
                  <Input value={orgLogoUrl} onChange={e => setOrgLogoUrl(e.target.value)} placeholder="Or paste URL manually" className="text-xs" />
                  {orgLogoUrl && (
                    <Button size="sm" variant="ghost" className="text-red-500 h-7 px-2" onClick={() => setOrgLogoUrl('')} title="Remove logo">
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  )}
                </div>
                <div className="text-[10px] text-muted-foreground">PNG, JPEG, SVG, WebP, GIF. Max 2MB. Uploaded files are stored in /public/uploads/.</div>
              </div>
            </div>
          </div>

          {/* Primary Color */}
          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">THEME COLOR</div>
            <div className="flex items-center gap-2">
              <input type="color" value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="h-8 w-12 border rounded" />
              <Input value={primaryColor} onChange={e => setPrimaryColor(e.target.value)} className="font-mono w-32" />
            </div>
          </div>

          {/* Save button */}
          <Button size="sm" onClick={async () => {
            try {
              await saveSetting('organizationName', orgName, { silent: true })
              await saveSetting('organizationRegistrationNumber', orgRegNumber, { silent: true })
              await saveSetting('organizationAddress', orgAddress, { silent: true })
              await saveSetting('organizationAddress2', orgAddress2, { silent: true })
              await saveSetting('organizationCity', orgCity, { silent: true })
              await saveSetting('organizationState', orgState, { silent: true })
              await saveSetting('organizationPostalCode', orgPostal, { silent: true })
              await saveSetting('organizationCountry', orgCountry, { silent: true })
              await saveSetting('organizationLogoUrl', orgLogoUrl, { silent: true })
              await saveSetting('primaryColor', primaryColor, { silent: true })
              toast.success('Organization details saved')
              // Bump data version so other tabs/components pick up the new branding
              try { await fetch('/api/data-version', { method: 'POST' }) } catch {}
              // Reload the page so the top-left branding updates
              setTimeout(() => window.location.reload(), 600)
            } catch {
              // toast.error already shown by saveSetting
            }
          }} disabled={role !== 'APP_DEVELOPER' && !isGlobal ? false : (role !== 'APP_DEVELOPER' && isGlobal)}><Save className="h-3 w-3 mr-1" /> Save Organization Details</Button>
          {role !== 'APP_DEVELOPER' && isGlobal && (
            <div className="text-[10px] text-amber-700 mt-1">Only the App Developer can modify global organization details. Select a facility to set facility-specific overrides.</div>
          )}
        </CardContent>
      </Card>

      {/* Invoice Customization — moved to Accounting & Billing tab */}

      {/* Email Notifications */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> Email Notifications</CardTitle>
          <CardDescription>Configure which events trigger email notifications.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={emailEnabled} onChange={e => { setEmailEnabled(e.target.checked); saveSetting('emailNotificationsEnabled', e.target.checked) }} className="h-4 w-4" />
            <span>Enable email notifications</span>
          </label>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">From Email Address</label>
            <Input type="email" value={emailFrom} onChange={e => setEmailFrom(e.target.value)} placeholder="noreply@serenitycare.com" />
            <div className="text-[10px] text-muted-foreground mt-0.5">SMTP configuration is set via environment variables on the server.</div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notification Events</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {allEvents.map(ev => (
                <label key={ev.id} className="flex items-center gap-2 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={notifyEvents.includes(ev.id)}
                    onChange={e => {
                      const next = e.target.checked ? [...notifyEvents, ev.id] : notifyEvents.filter(x => x !== ev.id)
                      setNotifyEvents(next)
                    }}
                    className="h-3.5 w-3.5"
                  />
                  {ev.label}
                </label>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={async () => {
            try {
              await saveSetting('emailFromAddress', emailFrom, { silent: true })
              await saveSetting('notificationEvents', notifyEvents, { silent: true })
              toast.success('Notification settings saved')
            } catch {}
          }}><Save className="h-3 w-3 mr-1" /> Save Notification Settings</Button>
        </CardContent>
      </Card>

      {/* Auto-Backup Schedule — moved to "Backup & Restore" tab */}

      {/* Facility List — Owner can add/edit facilities within their org */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4" /> Facilities</CardTitle>
          <CardDescription>
            Manage your organization's facilities (branches). Each facility has its own residents, rooms, staff, and financial data.
            {role === 'OWNER' && ' As Org Owner, you can add new facilities to your organization.'}
            {role === 'MANAGER' && ' You can view facilities but cannot add or delete them.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Name</th>
                  <th className="text-left p-2 font-medium hidden lg:table-cell">Organization</th>
                  <th className="text-left p-2 font-medium hidden md:table-cell">Address</th>
                  <th className="text-left p-2 font-medium hidden lg:table-cell">Director</th>
                  <th className="text-center p-2 font-medium">Residents</th>
                  <th className="text-center p-2 font-medium">Staff</th>
                  <th className="text-center p-2 font-medium">Rooms</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {(facilities || []).map(f => (
                  <tr key={f.id} className="border-t hover:bg-muted/30">
                    <td className="p-2 font-medium">{f.name}</td>
                    <td className="p-2 text-xs hidden lg:table-cell">
                      {f.organizationId
                        ? (orgsById[f.organizationId] || <span className="text-muted-foreground/60">{f.organizationId.slice(0, 8)}…</span>)
                        : <span className="text-muted-foreground/60">—</span>}
                    </td>
                    <td className="p-2 text-xs hidden md:table-cell">{f.address || '—'}</td>
                    <td className="p-2 text-xs hidden lg:table-cell">{f.director || '—'}</td>
                    <td className="p-2 text-center">{f._count?.residents || 0}</td>
                    <td className="p-2 text-center">{f._count?.staff || 0}</td>
                    <td className="p-2 text-center">{f._count?.rooms || 0}</td>
                    <td className="p-2">
                      {f.active ? <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Active</Badge> : <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      {(role === 'OWNER' || role === 'APP_DEVELOPER') && (
                        <>
                          <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(f)}><Edit className="h-3 w-3" /></Button>
                          <Button size="sm" variant="ghost" className="h-7 text-red-600" onClick={() => handleDelete(f.id)}><Trash2 className="h-3 w-3" /></Button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(facilities || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No facilities yet. Click "Add Facility" to create one.</p>}
        </CardContent>
      </Card>

      {(role === 'OWNER' || role === 'APP_DEVELOPER') && (
        <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Add Facility</Button>
      )}

      {/* Multi-facility info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">How Multi-Facility Works</CardTitle>
        </CardHeader>
        <CardContent className="text-sm space-y-1 text-muted-foreground">
          <p>• Each facility has its own residents, rooms, staff, inventory, financial data, and settings.</p>
          <p>• Owner (Level 1) can access ALL facilities — use the facility switcher in the header to switch.</p>
          <p>• Staff and managers can be assigned to specific facilities via User Accounts.</p>
          <p>• When adding residents, rooms, or staff, they are assigned to the currently selected facility in the header.</p>
          <p>• Per-facility settings (med routes, frequencies, prescribers, billing) override global defaults.</p>
        </CardContent>
      </Card>

      {/* Edit/Add dialog */}
      {(editing || showAdd) && (
        <FacilityDialog
          facility={editing}
          onClose={() => { setEditing(null); setShowAdd(false) }}
          onSave={handleSave}
        />
      )}
    </div>
  )
}

function FacilityDialog({ facility, onClose, onSave }: { facility: any | null; onClose: () => void; onSave: (f: any) => void }) {
  useEscClose(onClose)
  const [form, setForm] = useState({
    name: facility?.name || '',
    address: facility?.address || '',
    phone: facility?.phone || '',
    email: facility?.email || '',
    director: facility?.director || '',
    active: facility?.active ?? true,
  })
  const [saving, setSaving] = useState(false)

  const submit = () => {
    if (!form.name) { toast.error('Facility name required'); return }
    setSaving(true)
    onSave({ ...facility, ...form })
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><Building2 className="h-4 w-4" /> {facility ? 'Edit Facility' : 'Add Facility'}</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Facility Name *</label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g., Sunrise Care Home — KL Branch" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Address</label>
            <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Full address" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Director</label>
            <Input value={form.director} onChange={e => setForm({ ...form, director: e.target.value })} placeholder="Facility director name" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+60-3-XXXX XXXX" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="info@facility.my" />
            </div>
          </div>
          {facility && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.active ? '1' : '0'} onChange={e => setForm({ ...form, active: e.target.value === '1' })}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.name}>{saving ? 'Saving...' : (facility ? 'Save Changes' : 'Add Facility')}</Button>
        </div>
      </div>
    </div>
  )
}

// ============ BACKUP & RESTORE SETTINGS ============
function BackupRestoreSettings({ settings, saveSetting, role, facilityId }: { settings: any; saveSetting: (k: string, v: any, options?: { silent?: boolean }) => Promise<any>; role?: string; facilityId?: string }) {
  const [backingUp, setBackingUp] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [restoreResult, setRestoreResult] = useState<any>(null)

  // Auto-backup settings (kept here too for visibility)
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(settings.autoBackupEnabled || false)
  const [autoBackupFreq, setAutoBackupFreq] = useState(settings.autoBackupFrequency || 'WEEKLY')
  const [autoBackupDay, setAutoBackupDay] = useState(settings.autoBackupDay || 'SUNDAY')
  const [autoBackupRetain, setAutoBackupRetain] = useState(String(settings.autoBackupRetentionDays ?? 30))

  useEffect(() => {
    // Keep auto-backup form state in sync when settings load
    if (settings) {
      setAutoBackupEnabled(settings.autoBackupEnabled || false)
      setAutoBackupFreq(settings.autoBackupFrequency || 'WEEKLY')
      setAutoBackupDay(settings.autoBackupDay || 'SUNDAY')
      setAutoBackupRetain(String(settings.autoBackupRetentionDays ?? 30))
    }
  }, [settings])

  const handleBackup = async () => {
    setBackingUp(true)
    setRestoreResult(null)
    try {
      const response = await fetch('/api/backup')
      if (!response.ok) {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${response.status}`)
      }
      const blob = await response.blob()
      const cd = response.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      const filename = match ? match[1] : `serenity-backup-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.db`
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`Backup downloaded: ${filename}`)
    } catch (e: any) {
      toast.error(`Backup failed: ${e.message}`)
    }
    setBackingUp(false)
  }

  const handleRestore = async () => {
    if (!selectedFile) { toast.error('Please select a backup file first'); return }
    if (!confirm(
      '⚠️ FULL RESTORE\n\nThis will OVERWRITE ALL current data across ALL organizations with the backup file.\n\nThis action CANNOT be undone. Are you sure?'
    )) return
    if (!confirm('Final confirmation: This will replace ALL residents, staff, invoices, medications, etc. across ALL organizations. Continue?')) return
    setRestoring(true)
    setRestoreResult(null)
    try {
      const formData = new FormData()
      formData.append('file', selectedFile)
      const res = await fetch('/api/restore', { method: 'POST', body: formData })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setRestoreResult(data)
      toast.success('Database restored successfully. Reloading...')
      setTimeout(() => window.location.reload(), 2000)
    } catch (e: any) {
      toast.error(`Restore failed: ${e.message}`)
      setRestoreResult({ error: e.message })
    }
    setRestoring(false)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex items-start gap-3">
        <Database className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-medium">Data Backup &amp; Restore</p>
          <p className="text-xs text-blue-800 mt-0.5">
            Download a complete copy of all your data. Keep backup files in a safe location.
            {role === 'APP_DEVELOPER' ? ' As App Developer, your backup includes ALL facilities.' : ' Your backup includes only the facilities you have access to.'}
          </p>
        </div>
      </div>
      <BulkImports facilityId={facilityId} role={role} />
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2"><Download className="h-4 w-4" /> Download Backup</CardTitle>
          <CardDescription>Generate and download a complete database snapshot.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center gap-3 flex-wrap">
            <Button onClick={handleBackup} disabled={backingUp}>
              {backingUp ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Backing up...</> : <><Download className="h-4 w-4 mr-2" /> Backup Database</>}
            </Button>
            <span className="text-xs text-muted-foreground">Save the .json file in a safe location.</span>
          </div>
        </CardContent>
      </Card>
      {role === 'APP_DEVELOPER' && (
        <Card className="border-amber-300">
          <CardHeader className="bg-amber-50/50 rounded-t-lg">
            <CardTitle className="text-sm flex items-center gap-2 text-amber-700"><AlertTriangle className="h-4 w-4" /> Restore from Backup (Developer Only)</CardTitle>
            <CardDescription>Upload a .json backup file. <strong>This will overwrite ALL data.</strong></CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Select backup file (.json)</label>
              <input type="file" accept=".json,application/json" onChange={(e) => { setSelectedFile(e.target.files?.[0] || null); setRestoreResult(null) }} className="text-xs border rounded px-2 py-1.5 w-full cursor-pointer file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-primary file:text-primary-foreground" />
              {selectedFile && <div className="text-xs text-muted-foreground mt-1">Selected: <strong>{selectedFile.name}</strong> ({(selectedFile.size / 1024).toFixed(1)} KB)</div>}
            </div>
            <Button onClick={handleRestore} disabled={restoring || !selectedFile} variant="destructive">
              {restoring ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Restoring...</> : <><RotateCcw className="h-4 w-4 mr-2" /> Restore Database</>}
            </Button>
            {restoreResult && (
              <div className={`rounded-md p-2 text-xs ${restoreResult.error ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                {restoreResult.error ? `Failed: ${restoreResult.error}` : `Success: ${(restoreResult.imported || 0)} records imported.`}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ============ EXTERNAL INTEGRATION SETTINGS ============
function ExternalIntegrationSettings({ role, facilityId }: { role: string; facilityId?: string }) {
  const { data: facilities } = useFetch<any[]>('/api/facilities')
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>(facilityId || '')
  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [newlyGeneratedKey, setNewlyGeneratedKey] = useState<string | null>(null)
  const [showMappings, setShowMappings] = useState<string | null>(null)
  const [mappings, setMappings] = useState<any[]>([])
  const [residents, setResidents] = useState<any[]>([])
  const canEdit = role === 'APP_DEVELOPER' || role === 'OWNER' || role === 'MANAGER'

  useEffect(() => {
    if (!selectedFacilityId && facilities && facilities.length > 0) {
      setSelectedFacilityId(facilities[0].id)
    }
  }, [facilities])

  const fetchApiKeys = useCallback(async () => {
    if (!selectedFacilityId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/settings?facilityId=${selectedFacilityId}`)
      const data = await res.json()
      const keys = []
      for (const key of Object.keys(data)) {
        if (key.startsWith('externalApiKey:')) {
          try {
            const config = JSON.parse(typeof data[key] === 'string' ? data[key] : JSON.stringify(data[key]))
            keys.push({ ...config, settingKey: key })
          } catch {}
        }
      }
      setApiKeys(keys)
    } catch (e: any) {
      toast.error('Failed to load API keys')
    }
    setLoading(false)
  }, [selectedFacilityId])

  useEffect(() => { fetchApiKeys() }, [fetchApiKeys])

  useEffect(() => {
    if (selectedFacilityId) {
      fetch(`/api/data?type=residents&facilityId=${selectedFacilityId}`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setResidents(data) })
        .catch(() => {})
    }
  }, [selectedFacilityId])

  const generateApiKey = async (appName: string, appUrl: string) => {
    if (!selectedFacilityId || !appName.trim()) { toast.error('App name is required'); return }
    setGenerating(true)
    const crypto = await import('crypto')
    const newKey = 'ext_' + crypto.randomBytes(16).toString('hex')
    try {
      await fetch('/api/settings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `externalApiKey:${selectedFacilityId}`, value: JSON.stringify({ key: newKey, appName: appName.trim(), appUrl: appUrl.trim() || null, facilityId: selectedFacilityId, createdAt: new Date().toISOString() }), facilityId: selectedFacilityId }),
      })
      toast.success(`API key generated for "${appName}"`)
      setNewlyGeneratedKey(newKey)
      fetchApiKeys()
    } catch (e: any) { toast.error(e.message) }
    setGenerating(false)
  }

  const deleteApiKey = async (settingKey: string) => {
    if (!confirm('Delete this API key? The external app will no longer be able to sync data.')) return
    try { await fetch(`/api/settings?key=${encodeURIComponent(settingKey)}&facilityId=${selectedFacilityId}`, { method: 'DELETE' }); toast.success('API key deleted'); fetchApiKeys() }
    catch (e: any) { toast.error(e.message) }
  }

  const fetchMappings = async (appName: string) => {
    if (!selectedFacilityId) return
    try { const res = await fetch(`/api/external/mappings?facilityId=${selectedFacilityId}&appName=${encodeURIComponent(appName)}`); const data = await res.json(); setMappings(data.mappings || []); setShowMappings(appName) }
    catch (e: any) { toast.error(e.message) }
  }

  const saveMappings = async () => {
    if (!showMappings || !selectedFacilityId) return
    try { await fetch('/api/external/mappings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ facilityId: selectedFacilityId, appName: showMappings, mappings }) }); toast.success(`Saved ${mappings.length} code mappings`); setShowMappings(null) }
    catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      {/* Info banner */}
      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 flex items-start gap-3">
        <Link2 className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900">
          <p className="font-medium">External App Integration</p>
          <p className="text-xs text-blue-800 mt-0.5">
            Connect external apps (doctor apps, physio apps, lab apps, billing systems) to sync resident data and visit notes.
            Each app gets its own API key, FHIR + legacy endpoints, and optional code mappings.
          </p>
        </div>
      </div>

      {/* Facility picker */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Facility</label>
        <select
          className="w-full sm:w-auto border rounded px-3 py-1.5 text-sm"
          value={selectedFacilityId}
          onChange={e => setSelectedFacilityId(e.target.value)}
        >
          {(facilities || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {/* Connect new app */}
      {canEdit && selectedFacilityId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <Plus className="h-4 w-4" /> Connect New App
            </CardTitle>
            <CardDescription>Create an API key for a new external app.</CardDescription>
          </CardHeader>
          <CardContent>
            <GenerateApiKeyForm onGenerate={generateApiKey} generating={generating} />
          </CardContent>
        </Card>
      )}

      {/* Newly generated key */}
      {newlyGeneratedKey && (
        <Card className="border-emerald-300 bg-emerald-50">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-emerald-600" />
              <div>
                <div className="font-medium text-sm text-emerald-900">API Key Generated!</div>
                <div className="text-xs text-emerald-700">Copy this key now — you will not see it again after dismissing.</div>
              </div>
            </div>
            <div className="flex items-center gap-2 bg-white border border-emerald-200 rounded-lg p-3">
              <code className="flex-1 text-sm font-mono break-all text-emerald-800">{newlyGeneratedKey}</code>
              <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 flex-shrink-0" onClick={async () => {
                try { await navigator.clipboard.writeText(newlyGeneratedKey); toast.success('Copied!') }
                catch { toast.error('Press Ctrl+C after selecting the key') }
              }}><Copy className="h-3.5 w-3.5 mr-1" /> Copy</Button>
            </div>
            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setNewlyGeneratedKey(null)}>Dismiss</Button>
          </CardContent>
        </Card>
      )}

      {/* ===== Connected Apps — each app is a collapsible card ===== */}
      <div>
        <div className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
          <Link2 className="h-4 w-4" /> Connected Apps ({apiKeys.length})
        </div>
        {loading ? (
          <Skeleton className="h-32" />
        ) : apiKeys.length === 0 ? (
          <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
            <Link2 className="h-10 w-10 mx-auto mb-2 opacity-40" />
            <p>No external apps connected yet.</p>
            <p className="text-xs mt-0.5">Click "Connect New App" above to get started.</p>
          </CardContent></Card>
        ) : (
          <div className="space-y-3">
            {apiKeys.map((k, i) => (
              <ConnectedAppCard
                key={i}
                apiKey={k}
                index={i}
                selectedFacilityId={selectedFacilityId}
                canEdit={canEdit}
                onDelete={deleteApiKey}
                onFetchMappings={fetchMappings}
                showMappings={showMappings}
                mappings={mappings}
                setMappings={setMappings}
                setShowMappings={setShowMappings}
                saveMappings={saveMappings}
                residents={residents}
              />
            ))}
          </div>
        )}
      </div>

      {/* FHIR docs */}
      <Card className="border-emerald-200">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4 text-emerald-600" /> HL7 FHIR R4 API (Recommended)
          </CardTitle>
          <CardDescription>Standard healthcare API — no field mapping needed.</CardDescription>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          <div className="bg-emerald-50 border border-emerald-200 rounded p-2 text-emerald-800">
            FHIR standardizes the data format. Patient IDs resolved via identifier system+value — no mapping table needed if the external app stores our identifier.
          </div>
          <pre className="bg-muted/30 rounded p-2 overflow-x-auto text-[10px]"><code>GET  /api/fhir/Patient?facilityId=X
POST /api/fhir/Encounter?facilityId=X
Header: X-API-Key: ext_your_key</code></pre>
        </CardContent>
      </Card>

      {/* Legacy docs */}
      <Card className="border-blue-200">
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" /> Legacy API (Non-FHIR)
          </CardTitle>
          <CardDescription>For apps that do not support FHIR.</CardDescription>
        </CardHeader>
        <CardContent className="text-xs space-y-2">
          <pre className="bg-muted/30 rounded p-2 overflow-x-auto text-[10px]"><code>GET  /api/external/residents?facilityId=X
POST /api/external/visits
POST /api/external/mappings</code></pre>
        </CardContent>
      </Card>
    </div>
  )
}


// ============ AI SETTINGS ============
function AISettings({ role }: { role: string }) {
  // Fetch the current user so we can detect the developer-backdoor case
  // (organizationId === null) and show an org picker.
  const { data: me } = useFetch<any>('/api/auth/me')
  const isDevWithoutOrg = role === 'APP_DEVELOPER' && !me?.user?.organizationId
  const [selectedOrgId, setSelectedOrgId] = useState<string>('')

  // Only fetch /api/ai/config when we have an orgId (either the user's own,
  // or the developer's selected org). For the developer-backdoor case with
  // no org selected yet, pass null so useFetch skips the call.
  const configUrl = isDevWithoutOrg
    ? (selectedOrgId ? `/api/ai/config?orgId=${selectedOrgId}` : null)
    : '/api/ai/config'
  const { data: aiStatus, loading } = useFetch<any>(configUrl)

  const canEdit = role === 'OWNER' || role === 'APP_DEVELOPER'
  const [provider, setProvider] = useState('openai')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1/')
  const [model, setModel] = useState('gpt-4o-mini')
  const [tokenCap, setTokenCap] = useState('')
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>(['CARE_SUMMARY', 'FAMILY_UPDATE', 'SHIFT_HANDOVER'])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (aiStatus?.config) {
      setProvider(aiStatus.config.provider || 'openai')
      setBaseUrl(aiStatus.config.baseUrl || 'https://api.openai.com/v1/')
      setModel(aiStatus.config.model || 'gpt-4o-mini')
      setTokenCap(aiStatus.config.tokenCap ? String(aiStatus.config.tokenCap) : '')
      setEnabledFeatures(aiStatus.config.enabledFeatures || ['CARE_SUMMARY'])
    }
  }, [aiStatus])

  const allFeatures = aiStatus?.availableFeatures || []
  const aiEnabled = aiStatus?.aiEnabled === true
  const config = aiStatus?.config

  const save = async () => {
    setSaving(true)
    try {
      const payload: any = { provider, apiKey: apiKey || undefined, baseUrl, model, tokenCap: tokenCap ? parseInt(tokenCap) : null, enabledFeatures }
      // Developer-backdoor: pass the selected org so the server knows where to save.
      if (isDevWithoutOrg && selectedOrgId) payload.organizationId = selectedOrgId
      const res = await fetch('/api/ai/config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success('AI config saved')
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  if (loading) return <Skeleton className="h-64" />

  return (
    <div className="space-y-4">
      {/* Developer-backdoor org picker */}
      {isDevWithoutOrg && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-3">
          <div className="text-sm font-medium text-amber-900 mb-2">Select Organization</div>
          <p className="text-xs text-amber-800 mb-2">
            You are logged in as the developer backdoor account, which has no organization link.
            Pick which organization's AI config you want to edit.
          </p>
          <select
            className="w-full border rounded px-2 py-1.5 text-sm"
            value={selectedOrgId}
            onChange={e => setSelectedOrgId(e.target.value)}
          >
            <option value="">— Select an organization —</option>
            {(aiStatus?.organizations || []).map((o: any) => (
              <option key={o.id} value={o.id}>{o.name}</option>
            ))}
          </select>
        </div>
      )}

      {isDevWithoutOrg && !selectedOrgId ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
          Select an organization above to view its AI configuration.
        </CardContent></Card>
      ) : (
        <>
          <div className={`rounded-md border p-3 ${aiEnabled && config?.active ? 'border-emerald-300 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
            <Sparkles className={`h-5 w-5 ${aiEnabled ? 'text-emerald-600' : 'text-amber-600'}`} />
            <span className="text-sm font-medium ml-2">{aiEnabled && config?.active ? 'AI Assistant is enabled' : 'AI is not enabled'}</span>
            {aiStatus?.organizationName && <span className="text-xs text-muted-foreground ml-2">({aiStatus.organizationName})</span>}
          </div>
          {canEdit ? (
            <Card>
              <CardHeader><CardTitle className="text-sm flex items-center gap-2"><KeyRound className="h-4 w-4" /> AI Provider</CardTitle></CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Provider</label>
                    <select className="w-full border rounded px-2 py-1.5" value={provider} onChange={e => { setProvider(e.target.value); if (e.target.value === 'openai') { setBaseUrl('https://api.openai.com/v1/'); setModel('gpt-4o-mini') } else if (e.target.value === 'deepseek') { setBaseUrl('https://api.deepseek.com/v1/'); setModel('deepseek-chat') } else if (e.target.value === 'groq') { setBaseUrl('https://api.groq.com/openai/v1/'); setModel('llama-3.3-70b-versatile') } }}>
                      <option value="openai">OpenAI</option><option value="anthropic">Anthropic</option><option value="gemini">Gemini</option><option value="deepseek">DeepSeek</option><option value="groq">Groq</option><option value="ollama">Ollama</option>
                    </select>
                  </div>
                  <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Model</label><Input value={model} onChange={e => setModel(e.target.value)} /></div>
                  <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground mb-1 block">API Key {config?.hasApiKey && <span className="text-emerald-600 ml-1">(set)</span>}</label><Input type="password" value={apiKey} onChange={e => setApiKey(e.target.value)} placeholder="sk-..." /></div>
                  <div className="col-span-2"><label className="text-xs font-medium text-muted-foreground mb-1 block">Base URL</label><Input value={baseUrl} onChange={e => setBaseUrl(e.target.value)} /></div>
                  <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Token Cap</label><Input type="number" value={tokenCap} onChange={e => setTokenCap(e.target.value)} /></div>
                </div>
                <div className="border-t pt-3"><div className="text-xs font-semibold text-muted-foreground mb-2">FEATURES</div>
                  <div className="grid grid-cols-2 gap-2">
                    {allFeatures.map((f: any) => (
                      <label key={f.id} className="flex items-start gap-2 p-2 rounded border cursor-pointer">
                        <input type="checkbox" checked={enabledFeatures.includes(f.id)} onChange={() => setEnabledFeatures(prev => prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id])} className="h-4 w-4 mt-0.5" />
                        <div><div className="font-medium text-xs">{f.label}</div><div className="text-[10px] text-muted-foreground">{f.description}</div></div>
                      </label>
                    ))}
                  </div>
                </div>
                <Button onClick={save} disabled={saving || enabledFeatures.length === 0}>{saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</> : <><Save className="h-3.5 w-3.5 mr-1" /> Save</>}</Button>
              </CardContent>
            </Card>
          ) : <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Only Owner or Developer can configure AI.</CardContent></Card>}

          {/* Q&A Knowledge Base + Data Queries — available to Owner/Developer */}
          {canEdit && (
            <AIKnowledgeBaseSettings role={role} selectedOrgId={isDevWithoutOrg ? selectedOrgId : undefined} />
          )}
        </>
      )}
    </div>
  )
}

// ============ AI KNOWLEDGE BASE SETTINGS ============
// Accepts an optional `selectedOrgId` prop — used when the user is the
// App Developer backdoor account (which has no organizationId of its own).
// In that case, the parent AISettings component lets them pick an org, and
// passes the selected org ID down here so we can read/save that org's settings.
function AIKnowledgeBaseSettings({ role, selectedOrgId }: { role: string; selectedOrgId?: string }) {
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  // Use the prop (developer-backdoor case) OR the user's own orgId (normal case)
  const orgId = selectedOrgId || currentUser?.user?.organizationId
  // Fetch WITHOUT ?facilityId= — the keys below already contain the orgId
  // suffix (e.g. 'aiAllowDataQueries:org_123'), so they're inherently org-scoped.
  // Sending facilityId would cause the settings API to prefix the storage key
  // with 'facility:orgId:', which would mismatch the chat route's lookup
  // (the chat route reads 'aiAllowDataQueries:orgId' directly without prefix).
  const { data: settings, refetch } = useFetch<any>(orgId ? `/api/settings` : null)

  // Knowledge base entries
  const kbKey = orgId ? `aiKnowledgeBase:${orgId}` : ''
  const kb: Array<{ question: string; answer: string; keywords?: string[] }> = settings?.[kbKey] || []
  const [showAddKB, setShowAddKB] = useState(false)
  const [newQuestion, setNewQuestion] = useState('')
  const [newAnswer, setNewAnswer] = useState('')
  const [newKeywords, setNewKeywords] = useState('')
  const [savingKB, setSavingKB] = useState(false)

  // Allow data queries toggle — use local state so the UI updates instantly
  // when the user clicks (the server round-trip would otherwise cause a
  // noticeable lag and make the checkbox feel "stuck").
  const dataQueryKey = orgId ? `aiAllowDataQueries:${orgId}` : ''
  const serverAllowDataQueries = settings?.[dataQueryKey] === true
  const [localAllowDataQueries, setLocalAllowDataQueries] = useState<boolean | null>(null)
  // Once settings load, sync local state with server (only on first load).
  // After that, local state takes over so clicks feel instant.
  const allowDataQueries = localAllowDataQueries !== null ? localAllowDataQueries : serverAllowDataQueries
  useEffect(() => {
    if (settings && localAllowDataQueries === null) {
      setLocalAllowDataQueries(serverAllowDataQueries)
    }
  }, [settings, serverAllowDataQueries, localAllowDataQueries])

  const saveKB = async () => {
    if (!newQuestion.trim() || !newAnswer.trim()) { toast.error('Question and answer are required'); return }
    setSavingKB(true)
    try {
      const keywords = newKeywords.split(',').map(k => k.trim()).filter(Boolean)
      const newKB = [...kb, { question: newQuestion.trim(), answer: newAnswer.trim(), keywords }]
      // NO facilityId — the key already contains the orgId suffix.
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: kbKey, value: newKB }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      toast.success('Q&A pair added to knowledge base')
      setNewQuestion(''); setNewAnswer(''); setNewKeywords('')
      setShowAddKB(false)
      refetch()
    } catch (e: any) { toast.error(e.message) }
    setSavingKB(false)
  }

  const deleteKBEntry = async (index: number) => {
    if (!confirm('Delete this Q&A pair?')) return
    const newKB = kb.filter((_, i) => i !== index)
    try {
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: kbKey, value: newKB }),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      toast.success('Q&A pair deleted')
      refetch()
    } catch (e: any) { toast.error(e.message) }
  }

  const toggleDataQueries = async (enabled: boolean) => {
    // Update local state IMMEDIATELY so the checkbox reflects the click
    // before the server round-trip completes. This is what was making the
    // toggle feel "stuck" — the previous code waited for the server response
    // + refetch before updating the UI.
    setLocalAllowDataQueries(enabled)
    try {
      // NO facilityId — the key 'aiAllowDataQueries:orgId' already contains
      // the orgId suffix, so it's inherently org-scoped. Sending facilityId
      // would cause the settings API to prefix the storage key with
      // 'facility:orgId:', which mismatches the chat route's lookup.
      const r = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: dataQueryKey, value: enabled }),
      })
      if (!r.ok) {
        // Revert local state on failure
        setLocalAllowDataQueries(!enabled)
        throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      }
      toast.success(`Data queries ${enabled ? 'enabled' : 'disabled'}`)
      refetch()
    } catch (e: any) {
      toast.error(e.message)
      setLocalAllowDataQueries(!enabled)
    }
  }

  if (!orgId) return null

  return (
    <>
      {/* Allow Data Queries toggle */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Activity className="h-4 w-4" /> Allow AI to Access Facility Data
          </CardTitle>
          <CardDescription className="text-xs">
            When enabled, the AI can query resident counts, medications, vitals, incidents, and visits (scoped to the user's accessible facilities). When disabled, AI only answers from its general knowledge + the Q&A knowledge base below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={allowDataQueries}
              onChange={e => toggleDataQueries(e.target.checked)}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium">{allowDataQueries ? 'Enabled — AI can access facility data' : 'Disabled — AI uses general knowledge only'}</span>
          </label>
          {allowDataQueries && (
            <div className="mt-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
              ⚠ Data is scoped to each user's accessible facilities. A nurse can only ask about their own facility's data. Family accounts cannot use AI at all.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Q&A Knowledge Base */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Q&A Knowledge Base
          </CardTitle>
          <CardDescription className="text-xs">
            Preset common questions + answers. When a user asks a matching question, the AI returns the preset answer instantly — <strong>0 tokens used</strong>. Add questions about how to use the app, common procedures, facility policies, etc.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {kb.length > 0 ? (
            <div className="space-y-2">
              {kb.map((entry, i) => (
                <div key={i} className="border rounded-md p-2.5 space-y-1">
                  <div className="flex flex-wrap justify-between items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-xs">Q: {entry.question}</div>
                      <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">A: {entry.answer}</div>
                      {entry.keywords && entry.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.keywords.map((k, j) => (
                            <Badge key={j} variant="outline" className="text-[9px] px-1 py-0">{k}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600 flex-shrink-0" onClick={() => deleteKBEntry(i)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-4">No Q&A pairs yet. Add common questions to save tokens.</p>
          )}

          {showAddKB ? (
            <div className="border rounded-md p-3 space-y-2 bg-muted/30">
              <div className="text-xs font-semibold text-muted-foreground">ADD Q&A PAIR</div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Question *</label>
                <Input value={newQuestion} onChange={e => setNewQuestion(e.target.value)} placeholder="e.g. How do I assign a resident to a room?" className="text-sm h-8" />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Answer *</label>
                <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={3} value={newAnswer} onChange={e => setNewAnswer(e.target.value)} placeholder="Go to Residents module, click Edit, select a bed from the dropdown..." />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Keywords (comma-separated, for fuzzy matching)</label>
                <Input value={newKeywords} onChange={e => setNewKeywords(e.target.value)} placeholder="room, bed, assign, resident" className="text-sm h-8" />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={saveKB} disabled={savingKB}>
                  {savingKB ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving...</> : <><Plus className="h-3 w-3 mr-1" /> Add</>}
                </Button>
                <Button size="sm" variant="outline" onClick={() => { setShowAddKB(false); setNewQuestion(''); setNewAnswer(''); setNewKeywords('') }}>Cancel</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowAddKB(true)}>
              <Plus className="h-3 w-3 mr-1" /> Add Q&A Pair
            </Button>
          )}

          <div className="text-[10px] text-muted-foreground mt-2">
            💡 Tip: Add questions like "How to add a medication?", "How to generate MAR?", "How to create an invoice?" — users get instant answers without consuming AI tokens.
          </div>
        </CardContent>
      </Card>
    </>
  )
}

// ============ CONNECTED APP CARD ============
function ConnectedAppCard({ apiKey, index, selectedFacilityId, canEdit, onDelete, onFetchMappings, showMappings, mappings, setMappings, setShowMappings, saveMappings, residents }: any) {
  const [expanded, setExpanded] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const k = apiKey

  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        {/* Header: collapse toggle + app name + status + actions */}
        <div className="flex flex-wrap items-center justify-between gap-2 flex-wrap">
          <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
            <ChevronDownIcon className={`h-4 w-4 text-muted-foreground flex-shrink-0 transition-transform ${expanded ? '' : '-rotate-90'}`} />
            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] flex-shrink-0">Connected</Badge>
            <span className="font-medium text-sm truncate">{k.appName || 'Unknown App'}</span>
          </button>
          <div className="flex flex-wrap items-center gap-1 flex-shrink-0">
            {canEdit && <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => onFetchMappings(k.appName || 'External')}><SettingsIcon className="h-3 w-3 mr-1" /> Mappings</Button>}
            {canEdit && <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => onDelete(k.settingKey)}><Trash2 className="h-3 w-3" /></Button>}
          </div>
        </div>

        {/* Collapsible details */}
        {expanded && (
          <div className="space-y-2 pt-2 border-t">
            {k.appUrl && <div className="text-xs text-muted-foreground">URL: <a href={k.appUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{k.appUrl}</a></div>}
            <div className="text-xs text-muted-foreground">Connected: {k.createdAt ? new Date(k.createdAt).toLocaleDateString('en-MY', { year: 'numeric', month: 'long', day: 'numeric' }) : '—'}</div>

            {/* API Key with show/hide + copy */}
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                <span className="text-xs font-medium text-muted-foreground">API Key</span>
                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1" onClick={() => setShowKey(!showKey)}>{showKey ? 'Hide' : 'Show'}</Button>
                <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1" onClick={async () => {
                  try { await navigator.clipboard.writeText(k.key || ''); toast.success('API key copied') }
                  catch { toast.error('Failed to copy') }
                }}><Copy className="h-3 w-3" /> Copy</Button>
              </div>
              <div className={`text-xs font-mono bg-muted/30 rounded p-2 break-all border ${showKey ? '' : 'text-muted-foreground'}`}>
                {showKey ? (k.key || '—') : `${k.key?.substring(0, 12)}${'•'.repeat(20)}`}
              </div>
            </div>

            {/* Available endpoints */}
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">Available Endpoints</div>
              <div className="text-[10px] space-y-0.5 font-mono bg-muted/20 rounded p-2">
                <div className="text-emerald-600">FHIR R4:</div>
                <div className="pl-3">GET  /api/fhir/Patient?facilityId={selectedFacilityId}</div>
                <div className="pl-3">POST /api/fhir/Encounter?facilityId={selectedFacilityId}</div>
                <div className="text-blue-600 mt-1">Legacy:</div>
                <div className="pl-3">GET  /api/external/residents?facilityId={selectedFacilityId}</div>
                <div className="pl-3">POST /api/external/visits</div>
                <div className="pl-3">GET/POST /api/external/mappings</div>
              </div>
            </div>
          </div>
        )}

        {/* Code mapping dialog */}
        {showMappings === (k.appName || 'External') && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={() => setShowMappings(null)}>
            <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl my-8 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
              <div className="flex justify-between items-center border-b p-4">
                <h3 className="font-semibold text-sm flex items-center gap-2"><Link2 className="h-4 w-4" /> Code Mappings — {k.appName}</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowMappings(null)}>×</Button>
              </div>
              <div className="p-4 overflow-y-auto space-y-2">
                <div className="text-xs text-muted-foreground bg-blue-50 border border-blue-200 rounded p-2">
                  Only needed for Legacy API. FHIR resolves identifiers automatically via the Patient identifier system.
                </div>
                {mappings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">No mappings yet. Add one below.</p>
                ) : (
                  <div className="border rounded overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/50"><tr><th className="text-left p-2">External Code</th><th className="text-left p-2">Resident Code</th><th className="text-left p-2">Name</th><th className="p-2"></th></tr></thead>
                      <tbody>
                        {mappings.map((m: any, i: number) => (
                          <tr key={i} className="border-t">
                            <td className="p-2"><Input value={m.externalCode} onChange={e => { const n = [...mappings]; n[i] = { ...m, externalCode: e.target.value }; setMappings(n) }} className="h-7 text-xs" /></td>
                            <td className="p-2"><Input value={m.residentCode} onChange={e => { const n = [...mappings]; n[i] = { ...m, residentCode: e.target.value }; setMappings(n) }} className="h-7 text-xs" /></td>
                            <td className="p-2 text-muted-foreground">{residents.find((r: any) => r.id === m.residentId)?.firstName} {residents.find((r: any) => r.id === m.residentId)?.lastName}</td>
                            <td className="p-2"><Button size="sm" variant="ghost" className="h-6 text-red-600" onClick={() => setMappings(mappings.filter((_: any, idx: number) => idx !== i))}><Trash2 className="h-3 w-3" /></Button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="border-t pt-2">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Add New Mapping</div>
                  <div className="flex items-center gap-2">
                    <Input placeholder="e.g., DR-001" className="h-7 text-xs flex-1" id={`ext-${index}`} />
                    <span className="text-muted-foreground">→</span>
                    <select className="border rounded px-2 py-1 text-xs flex-1" id={`res-${index}`}>
                      <option value="">— Select —</option>
                      {residents.map((r: any) => <option key={r.id} value={r.id}>{r.code} {r.firstName} {r.lastName}</option>)}
                    </select>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => {
                      const ec = (document.getElementById(`ext-${index}`) as HTMLInputElement)?.value
                      const rid = (document.getElementById(`res-${index}`) as HTMLSelectElement)?.value
                      if (!ec || !rid) { toast.error('Fill both fields'); return }
                      const r = residents.find((x: any) => x.id === rid)
                      setMappings([...mappings, { externalCode: ec, residentCode: r?.code || '', residentId: rid }])
                      ;(document.getElementById(`ext-${index}`) as HTMLInputElement).value = ''
                      ;(document.getElementById(`res-${index}`) as HTMLSelectElement).value = ''
                    }}><Plus className="h-3 w-3 mr-1" /> Add</Button>
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
                <Button variant="outline" onClick={() => setShowMappings(null)}>Cancel</Button>
                <Button onClick={saveMappings}><Save className="h-3.5 w-3.5 mr-1" /> Save</Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function GenerateApiKeyForm({ onGenerate, generating }: { onGenerate: (appName: string, appUrl: string) => void; generating: boolean }) {
  const [appName, setAppName] = useState('')
  const [appUrl, setAppUrl] = useState('')
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">External App Name *</label>
          <Input value={appName} onChange={e => setAppName(e.target.value)} placeholder="e.g., Doctor Portal, Physio App" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">App URL (optional)</label>
          <Input value={appUrl} onChange={e => setAppUrl(e.target.value)} placeholder="https://doctorapp.example.com" />
        </div>
      </div>
      <Button onClick={() => onGenerate(appName, appUrl)} disabled={generating || !appName.trim()}>
        {generating ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating…</> : <><KeyRound className="h-3.5 w-3.5 mr-1" /> Generate API Key</>}
      </Button>
      <p className="text-[10px] text-muted-foreground">
        The API key will be shown once. Store it securely — it gives access to resident data for this facility only.
      </p>
    </div>
  )
}

// ============ STAFF SALARY PRESETS ============
// Lets managers / owners / developers pre-set the recurring monthly salary
// configuration for each staff member: basicSalary, defaultAllowances,
// defaultLoanDeduction, defaultZakat, bank info, EPF/SOCSO/Tax numbers,
// and employmentType. These values are picked up automatically when the
// payroll generator runs each month — see /api/payroll/export and
// src/lib/payroll-my.ts.
function StaffSalaryPresets({ role, facilityId }: { role?: string; facilityId?: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: staffList, loading, refetch } = useFetch<any[]>(`/api/data?type=staff${facilityParam}`)
  const [editing, setEditing] = useState<any | null>(null)
  const [search, setSearching] = useState('')

  const canEdit = role === 'APP_DEVELOPER' || role === 'OWNER' || role === 'MANAGER'
  const all = staffList || []
  const filtered = all.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      s.code?.toLowerCase().includes(q) ||
      s.role?.toLowerCase().includes(q)
    )
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Wallet className="h-4 w-4" /> Staff Salary Presets
        </CardTitle>
        <CardDescription className="text-xs">
          Pre-set each staff member's monthly basic salary, recurring allowances/deductions, statutory numbers, and bank details.
          These values are used automatically when generating monthly payroll.
          {!canEdit && ' (Read-only — ask a Manager or Owner to make changes.)'}
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="p-3 border-b flex items-center gap-2 flex-wrap">
          <Input
            placeholder="Search by name, code, role..."
            value={search}
            onChange={e => setSearching(e.target.value)}
            className="text-sm max-w-xs"
          />
          <Badge variant="outline" className="ml-auto text-xs">{filtered.length} staff</Badge>
        </div>
        {loading && <Skeleton className="h-32 m-3" />}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No staff found</p>
        )}
        <div className="divide-y max-h-[600px] overflow-y-auto">
          {filtered.map(s => (
            <div key={s.id} className="p-3 hover:bg-muted/30">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {s.code && <span className="text-xs font-mono text-primary">{s.code}</span>}
                    <span className="font-medium text-sm">{s.firstName} {s.lastName}</span>
                    <Badge variant="outline" className="text-[10px]">{s.role.replace(/_/g, ' ')}</Badge>
                    {!s.active && <Badge variant="outline" className="text-[10px] text-red-700 border-red-300">Inactive</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                    <span><Banknote className="h-3 w-3 inline mr-1" />
                      Basic: <span className={s.basicSalary ? 'font-medium text-foreground' : ''}>
                        {s.basicSalary ? `RM ${s.basicSalary.toFixed(2)}` : '— not set —'}
                      </span>
                    </span>
                    {s.defaultAllowances ? <span>Allow: RM {s.defaultAllowances.toFixed(2)}</span> : null}
                    {s.defaultLoanDeduction ? <span>Loan: RM {s.defaultLoanDeduction.toFixed(2)}</span> : null}
                    {s.defaultZakat ? <span>Zakat: RM {s.defaultZakat.toFixed(2)}</span> : null}
                    <span className="text-[10px]">Type: {s.employmentType || 'REGULAR'}</span>
                  </div>
                  {s.bankName && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Bank: {s.bankName} {s.bankAccount ? `• A/C: ${s.bankAccount}` : ''}
                    </div>
                  )}
                </div>
                {canEdit && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(s)}>
                    <Edit className="h-3 w-3 mr-1" /> Edit
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
      {editing && (
        <SalaryPresetDialog
          staff={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch() }}
        />
      )}
    </Card>
  )
}

function SalaryPresetDialog({ staff, onClose, onSaved }: { staff: any; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const [form, setForm] = useState<any>({
    basicSalary: staff.basicSalary ?? '',
    defaultAllowances: staff.defaultAllowances ?? '',
    defaultLoanDeduction: staff.defaultLoanDeduction ?? '',
    defaultZakat: staff.defaultZakat ?? '',
    employmentType: staff.employmentType || 'REGULAR',
    bankName: staff.bankName || '',
    bankAccount: staff.bankAccount || '',
    epfNumber: staff.epfNumber || '',
    socsoNumber: staff.socsoNumber || '',
    taxNumber: staff.taxNumber || '',
    icNumber: staff.icNumber || '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      const numOrNullOrZero = (v: any) => {
        if (v === '' || v == null) return 0
        const n = parseFloat(v)
        return isNaN(n) ? 0 : n
      }
      const payload = {
        basicSalary: form.basicSalary === '' ? null : numOrNullOrZero(form.basicSalary),
        defaultAllowances: form.defaultAllowances === '' ? null : numOrNullOrZero(form.defaultAllowances),
        defaultLoanDeduction: form.defaultLoanDeduction === '' ? null : numOrNullOrZero(form.defaultLoanDeduction),
        defaultZakat: form.defaultZakat === '' ? null : numOrNullOrZero(form.defaultZakat),
        employmentType: form.employmentType,
        bankName: form.bankName || null,
        bankAccount: form.bankAccount || null,
        epfNumber: form.epfNumber || null,
        socsoNumber: form.socsoNumber || null,
        taxNumber: form.taxNumber || null,
        icNumber: form.icNumber || null,
      }
      const r = await fetch(`/api/data?type=staff&id=${staff.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`)
      toast.success(`Salary preset saved for ${staff.firstName} ${staff.lastName}`)
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8 max-h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex justify-between items-center border-b p-4 flex-shrink-0">
          <h3 className="font-semibold flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Salary Preset — {staff.firstName} {staff.lastName}
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-3 text-sm">
          <div className="bg-muted/30 rounded p-2 text-xs text-muted-foreground">
            {staff.code} • {staff.role.replace(/_/g, ' ')} • Hire date: {staff.hireDate ? new Date(staff.hireDate).toLocaleDateString() : '—'}
          </div>

          {/* Earnings */}
          <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mt-2">Earnings</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Basic Salary (RM/month) *</label>
              <Input type="number" step="0.01" value={form.basicSalary} onChange={e => setForm({ ...form, basicSalary: e.target.value })} placeholder="2500.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Allowances (RM/month)</label>
              <Input type="number" step="0.01" value={form.defaultAllowances} onChange={e => setForm({ ...form, defaultAllowances: e.target.value })} placeholder="300.00" />
            </div>
          </div>

          {/* Deductions */}
          <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mt-2">Recurring Deductions</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Loan Deduction (RM/month)</label>
              <Input type="number" step="0.01" value={form.defaultLoanDeduction} onChange={e => setForm({ ...form, defaultLoanDeduction: e.target.value })} placeholder="0.00" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Zakat (RM/month)</label>
              <Input type="number" step="0.01" value={form.defaultZakat} onChange={e => setForm({ ...form, defaultZakat: e.target.value })} placeholder="0.00" />
            </div>
          </div>

          {/* Employment type */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Employment Type</label>
            <select
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.employmentType}
              onChange={e => setForm({ ...form, employmentType: e.target.value })}
            >
              <option value="REGULAR">REGULAR — standard payroll with EPF/SOCSO/EIS/PCB</option>
              <option value="OTHER">OTHER — skip statutory deductions</option>
            </select>
          </div>

          {/* Bank & statutory */}
          <div className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mt-2">Bank &amp; Statutory Numbers</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">IC Number</label>
              <Input value={form.icNumber} onChange={e => setForm({ ...form, icNumber: e.target.value })} placeholder="800101-14-5678" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">EPF Number</label>
              <Input value={form.epfNumber} onChange={e => setForm({ ...form, epfNumber: e.target.value })} placeholder="KWSP-XXXX" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">SOCSO Number</label>
              <Input value={form.socsoNumber} onChange={e => setForm({ ...form, socsoNumber: e.target.value })} placeholder="PERKESO-XXXX" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tax Number</label>
              <Input value={form.taxNumber} onChange={e => setForm({ ...form, taxNumber: e.target.value })} placeholder="SG12345678" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank Name</label>
              <Input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} placeholder="Maybank" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank Account Number</label>
              <Input value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })} placeholder="1234567890123" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Saving...</> : <><Save className="h-3.5 w-3.5 mr-1" /> Save Preset</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
