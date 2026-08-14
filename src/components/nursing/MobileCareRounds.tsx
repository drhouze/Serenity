'use client'

import { useState, useEffect } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPost, apiPatch } from './api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Pill, Activity, FileText, AlertTriangle, ChevronRight,
  CheckCircle, XCircle, Search, RefreshCw, Heart, BedDouble,
  ClipboardList, Plus, Stethoscope, User, Send, Calendar,
  TrendingUp, Clock, Users, Loader2, CalendarPlus, X
} from 'lucide-react'
import { fmtTime, fmtDate, initials, age } from '@/lib/types'
import { toast } from 'sonner'
import { ResidentSelect } from './ResidentSelect'
import { useAppDropdowns } from './useAppDropdowns'

type Tab = 'overview' | 'residents' | 'meds' | 'vitals' | 'care' | 'incidents'

export function MobileCareRounds({ facilityId }: { facilityId?: string }) {
  const [tab, setTab] = useState<Tab>('overview')
  const [selectedResident, setSelectedResident] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Fetch current user to identify the staff member performing actions
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const currentUserName = currentUser?.user?.name || 'Unknown Staff'
  const currentUserId = currentUser?.user?.id || ''

  return (
    <div className="max-w-md mx-auto min-h-[calc(100vh-3.5rem)] bg-muted/20 -mt-3 sm:-mt-4 lg:-mt-6">
      {/* Mobile header — sticky so the tab bar stays visible while scrolling */}
      <div className="sticky top-0 z-20 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-base flex items-center gap-2">
            <Stethoscope className="h-4 w-4 text-rose-500" /> Care Rounds
          </h2>
          <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
            {currentUserName !== 'Unknown Staff' && (
              <Badge variant="outline" className="text-[10px] flex items-center gap-1 max-w-[120px] truncate">
                <User className="h-2.5 w-2.5 flex-shrink-0" />
                <span className="truncate">{currentUserName}</span>
              </Badge>
            )}
            <span className="text-xs text-muted-foreground whitespace-nowrap">{new Date().toLocaleDateString('en-MY', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
        {/* Tab bar */}
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 scrollbar-thin pb-1">
          {([
            { id: 'overview', label: 'Today', icon: Clock },
            { id: 'residents', label: 'Cust.', icon: BedDouble },
            { id: 'meds', label: 'Meds', icon: Pill },
            { id: 'vitals', label: 'Vitals', icon: Activity },
            { id: 'care', label: 'Care', icon: FileText },
            { id: 'incidents', label: 'Inc.', icon: AlertTriangle },
          ] as const).map(t => (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSelectedResident(null) }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap flex-shrink-0 transition-colors ${
                tab === t.id ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              <t.icon className="h-3.5 w-3.5" /> <span>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 pb-24">
        {tab === 'overview' && <OverviewTab facilityId={facilityId} onGoToTab={(t) => setTab(t)} onSelectResident={(id) => { setSelectedResident(id); setTab('meds') }} currentUserName={currentUserName} currentUserId={currentUserId} />}
        {tab === 'residents' && <ResidentsList facilityId={facilityId} search={search} setSearch={setSearch} onSelect={(id) => { setSelectedResident(id); setTab('meds') }} />}
        {tab === 'meds' && <MedsTab facilityId={facilityId} residentId={selectedResident} setResidentId={setSelectedResident} currentUserName={currentUserName} currentUserId={currentUserId} />}
        {tab === 'vitals' && <VitalsTab facilityId={facilityId} residentId={selectedResident} setResidentId={setSelectedResident} currentUserName={currentUserName} currentUserId={currentUserId} />}
        {tab === 'care' && <CareTab facilityId={facilityId} residentId={selectedResident} setResidentId={setSelectedResident} currentUserName={currentUserName} currentUserId={currentUserId} />}
        {tab === 'incidents' && <IncidentsTab facilityId={facilityId} residentId={selectedResident} setResidentId={setSelectedResident} currentUserName={currentUserName} currentUserId={currentUserId} />}
      </div>
    </div>
  )
}

// ============ TODAY OVERVIEW TAB ============
function OverviewTab({ facilityId, onGoToTab, onSelectResident, currentUserName, currentUserId }: {
  facilityId?: string
  onGoToTab: (t: Tab) => void
  onSelectResident: (id: string) => void
  currentUserName: string
  currentUserId: string
}) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: medAdmins, loading: medsLoading, refetch: refetchMeds } = useFetch<any[]>(`/api/data?type=medAdmins&today=true${facilityParam}`)
  const { data: incidents } = useFetch<any[]>(`/api/data?type=incidents${facilityParam}`)
  const { data: careLogs } = useFetch<any[]>(`/api/data?type=careLogs${facilityParam}`)
  const { data: vitals } = useFetch<any[]>(`/api/data?type=vitals${facilityParam}`)
  const { data: residents } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)
  const [generating, setGenerating] = useState(false)

  const handleGenerateMeds = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/meds/generate?days=0', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(`Generated ${data.created || 0} med administrations for today`)
      refetchMeds()
    } catch (e: any) { toast.error(e.message || 'Failed to generate meds') }
    setGenerating(false)
  }

  if (medsLoading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>

  const pendingMeds = (medAdmins || []).filter(a => a.status === 'PENDING')
  const completedMeds = (medAdmins || []).filter(a => a.status !== 'PENDING')
  const todayIncidents = (incidents || []).filter(i => new Date(i.occurredAt).toDateString() === new Date().toDateString())
  const todayCareLogs = (careLogs || []).filter(l => new Date(l.recordedAt).toDateString() === new Date().toDateString())
  const todayVitals = (vitals || []).filter(v => new Date(v.recordedAt).toDateString() === new Date().toDateString())
  const activeResidents = (residents || []).filter(r => r.status === 'ACTIVE')

  // Residents with pending meds (unique)
  const residentsWithPendingMeds = new Set(pendingMeds.map(m => m.residentId))

  return (
    <div className="space-y-3">
      <Card className="bg-gradient-to-br from-rose-50 to-background">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <div className="text-xs text-muted-foreground">Welcome, {currentUserName.split(' ')[0]}</div>
              <div className="text-lg font-bold">Today's Care Summary</div>
            </div>
            <Clock className="h-8 w-8 text-rose-300" />
          </div>
          <div className="text-xs text-muted-foreground">
            {new Date().toLocaleDateString('en-MY', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </div>
        </CardContent>
      </Card>

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 gap-2">
        {/* Pending meds — tap to go to meds tab */}
        <button onClick={() => onGoToTab('meds')}>
          <Card className="active:scale-[0.98] transition-transform h-full">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Pill className="h-4 w-4 text-rose-500 flex-shrink-0" />
                <span className="text-xs text-muted-foreground">Meds Due</span>
              </div>
              <div className="text-2xl font-bold text-rose-600 leading-tight">{pendingMeds.length}</div>
              <div className="text-[10px] text-muted-foreground break-words leading-tight">{completedMeds.length} done • {residentsWithPendingMeds.size} customers</div>
            </CardContent>
          </Card>
        </button>

        {/* Vitals recorded today */}
        <button onClick={() => onGoToTab('vitals')}>
          <Card className="active:scale-[0.98] transition-transform h-full">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <Activity className="h-4 w-4 text-sky-500 flex-shrink-0" />
                <span className="text-xs text-muted-foreground">Vitals Today</span>
              </div>
              <div className="text-2xl font-bold text-sky-600 leading-tight">{todayVitals.length}</div>
              <div className="text-[10px] text-muted-foreground break-words leading-tight">{Math.max(activeResidents.length - todayVitals.length, 0)} pending</div>
            </CardContent>
          </Card>
        </button>

        {/* Care logs today */}
        <button onClick={() => onGoToTab('care')}>
          <Card className="active:scale-[0.98] transition-transform h-full">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <FileText className="h-4 w-4 text-violet-500 flex-shrink-0" />
                <span className="text-xs text-muted-foreground">Care Logs</span>
              </div>
              <div className="text-2xl font-bold text-violet-600 leading-tight">{todayCareLogs.length}</div>
              <div className="text-[10px] text-muted-foreground break-words leading-tight">entries today</div>
            </CardContent>
          </Card>
        </button>

        {/* Incidents today */}
        <button onClick={() => onGoToTab('incidents')}>
          <Card className="active:scale-[0.98] transition-transform h-full">
            <CardContent className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                <span className="text-xs text-muted-foreground">Incidents</span>
              </div>
              <div className={`text-2xl font-bold leading-tight ${todayIncidents.length > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{todayIncidents.length}</div>
              <div className="text-[10px] text-muted-foreground break-words leading-tight">{todayIncidents.length === 0 ? 'no incidents today' : 'requires attention'}</div>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* Priority: pending meds by resident */}
      {pendingMeds.length > 0 ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <Pill className="h-4 w-4 text-rose-500" /> Priority: Pending Medications
            </div>
            <button onClick={() => onGoToTab('meds')} className="text-xs text-primary">View all →</button>
          </div>
          <div className="space-y-2">
            {pendingMeds.slice(0, 5).map(a => (
              <button key={a.id} onClick={() => onSelectResident(a.residentId)} className="w-full text-left">
                <Card className="active:scale-[0.98] transition-transform">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{a.medication?.name} {a.medication?.dosage}</div>
                      <div className="text-xs text-muted-foreground">{a.resident?.firstName} {a.resident?.lastName} • Room {a.resident?.room?.roomNumber || '—'}</div>
                      <div className="text-xs text-muted-foreground">Due: {fmtTime(a.scheduledAt)}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </CardContent>
                </Card>
              </button>
            ))}
            {pendingMeds.length > 5 && (
              <button onClick={() => onGoToTab('meds')} className="w-full text-center text-xs text-primary py-2">
                + {pendingMeds.length - 5} more pending →
              </button>
            )}
          </div>
        </div>
      ) : (
        /* No meds scheduled for today — show generate button */
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4 text-center">
            <Pill className="h-8 w-8 mx-auto mb-2 text-amber-500" />
            <p className="text-sm font-medium text-amber-900">No medications scheduled for today</p>
            <p className="text-xs text-amber-700 mt-0.5 mb-3">Med schedules are generated automatically when the dashboard loads. If this is empty, click below to generate now.</p>
            <Button
              size="sm"
              variant="outline"
              className="bg-amber-100 border-amber-300 text-amber-700 hover:bg-amber-200"
              disabled={generating}
              onClick={handleGenerateMeds}
            >
              {generating ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating…</> : <><CalendarPlus className="h-3.5 w-3.5 mr-1" /> Generate Today's Meds</>}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Recent incidents (if any) */}
      {todayIncidents.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm font-semibold flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Today's Incidents
            </div>
            <button onClick={() => onGoToTab('incidents')} className="text-xs text-primary">View all →</button>
          </div>
          <div className="space-y-1.5">
            {todayIncidents.slice(0, 3).map(i => (
              <div key={i.id} className="text-xs bg-amber-50 border border-amber-200 rounded p-2">
                <div className="flex items-center gap-1 mb-0.5">
                  <Badge variant="outline" className="text-[10px]">{i.incidentType?.replace(/_/g, ' ')}</Badge>
                  <Badge variant="outline" className={`text-[10px] ${i.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' : i.severity === 'HIGH' ? 'bg-orange-100 text-orange-700' : 'bg-amber-100 text-amber-700'}`}>{i.severity}</Badge>
                </div>
                <div>{i.description}</div>
                <div className="text-muted-foreground">{i.resident?.firstName} {i.resident?.lastName} • {fmtTime(i.occurredAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent care logs */}
      {todayCareLogs.length > 0 && (
        <div>
          <div className="text-sm font-semibold flex items-center gap-1.5 mb-2">
            <FileText className="h-4 w-4 text-violet-500" /> Recent Care Logs
          </div>
          <div className="space-y-1.5">
            {todayCareLogs.slice(0, 3).map((l: any) => (
              <div key={l.id} className="text-xs bg-muted/30 rounded p-2">
                <div className="font-medium">{l.description}</div>
                <div className="text-muted-foreground">{l.category} • {l.resident?.firstName} {l.resident?.lastName} • {fmtTime(l.recordedAt)}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ============ RESIDENTS LIST ============
function ResidentsList({ facilityId, search, setSearch, onSelect }: { facilityId?: string; search: string; setSearch: (s: string) => void; onSelect: (id: string) => void }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)
  const { data: medAdmins } = useFetch<any[]>(`/api/data?type=medAdmins&today=true${facilityParam}`)
  const { data: incidents } = useFetch<any[]>(`/api/data?type=incidents${facilityParam}`)
  const { residentStatuses } = useAppDropdowns(facilityId)
  const [showStatusDialog, setShowStatusDialog] = useState<{ resident: any } | null>(null)

  if (loading) return <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16" />)}</div>

  const todayIncidents = (incidents || []).filter(i => new Date(i.occurredAt).toDateString() === new Date().toDateString())

  const filtered = (data || []).filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return `${r.firstName} ${r.lastName}`.toLowerCase().includes(s) || r.room?.roomNumber?.includes(s) || r.code?.toLowerCase().includes(s)
  })

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search customer or room..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9 h-11" />
      </div>
      <div className="text-xs text-muted-foreground px-1">{filtered.length} customers</div>
      <div className="space-y-2">
        {filtered.map(r => {
          // Count pending meds for this resident today
          const pendingCount = (medAdmins || []).filter(a => a.residentId === r.id && a.status === 'PENDING').length
          // Count today's incidents for this resident
          const incidentCount = todayIncidents.filter(i => i.residentId === r.id).length

          return (
            <Card key={r.id} className="active:scale-[0.98] transition-transform">
              <CardContent className="p-3">
                <div className="flex items-center gap-3">
                  <Avatar className="h-11 w-11 flex-shrink-0">
                    <AvatarFallback className="bg-emerald-100 text-emerald-700">{initials(r.firstName, r.lastName)}</AvatarFallback>
                  </Avatar>
                  <button onClick={() => onSelect(r.id)} className="flex-1 min-w-0 text-left">
                    <div className="font-medium truncate">
                      {r.code && <span className="text-xs font-mono text-primary mr-1">{r.code}</span>}
                      {r.firstName} {r.lastName}
                    </div>
                    <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="flex items-center gap-0.5 whitespace-nowrap"><BedDouble className="h-3 w-3" /> {r.room?.roomNumber || '—'}</span>
                      {r.dateOfBirth && <span className="whitespace-nowrap">• {age(r.dateOfBirth)}y</span>}
                    </div>
                    {r.allergies && r.allergies !== 'None' && (
                      <div className="text-xs text-red-600 truncate mt-0.5">⚠ {r.allergies}</div>
                    )}
                  </button>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0 max-w-[40%]">
                    {/* Pending meds badge */}
                    {pendingCount > 0 && (
                      <Badge className="bg-rose-100 text-rose-700 text-[10px] flex items-center gap-0.5 whitespace-nowrap">
                        <Pill className="h-2.5 w-2.5" /> {pendingCount} meds due
                      </Badge>
                    )}
                    {/* Today's incident badge */}
                    {incidentCount > 0 && (
                      <Badge className="bg-amber-100 text-amber-700 text-[10px] flex items-center gap-0.5 whitespace-nowrap">
                        <AlertTriangle className="h-2.5 w-2.5" /> {incidentCount} incident{incidentCount > 1 ? 's' : ''}
                      </Badge>
                    )}
                    {/* Status badge */}
                    {r.status !== 'ACTIVE' && (
                      <Badge variant="outline" className="text-[10px] whitespace-nowrap">{r.status.replace(/_/g, ' ')}</Badge>
                    )}
                  </div>
                </div>
                {/* Quick status change button */}
                <div className="mt-2 pt-2 border-t flex items-center justify-between gap-2">
                  <button
                    onClick={() => setShowStatusDialog({ resident: r })}
                    className="text-[10px] text-muted-foreground hover:text-primary flex items-center gap-0.5 min-w-0 truncate"
                  >
                    <User className="h-2.5 w-2.5 flex-shrink-0" /> <span className="truncate">Status: {r.status?.replace(/_/g, ' ').toLowerCase()} → change</span>
                  </button>
                  <button
                    onClick={() => onSelect(r.id)}
                    className="text-[10px] text-primary flex items-center gap-0.5 whitespace-nowrap flex-shrink-0"
                  >
                    View rounds <ChevronRight className="h-2.5 w-2.5" />
                  </button>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
      {showStatusDialog && (
        <QuickStatusChange
          resident={showStatusDialog.resident}
          residentStatuses={residentStatuses}
          onClose={() => setShowStatusDialog(null)}
          onSaved={() => { setShowStatusDialog(null); refetch() }}
        />
      )}
    </div>
  )
}

// ============ QUICK STATUS CHANGE ============
function QuickStatusChange({ resident, residentStatuses, onClose, onSaved }: any) {
  useEscClose(onClose)
  const [status, setStatus] = useState(resident.status || 'ACTIVE')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      // Update resident status — for DISCHARGED, also set dischargeDate (matching desktop flow)
      const patch: any = { status }
      if (status === 'DISCHARGED' || status === 'DECEASED') {
        patch.dischargeDate = new Date().toISOString()
      }
      // Pass statusReason so the PATCH handler can log it (desktop flow does this)
      if (reason) patch.statusReason = reason
      await apiPatch(`/api/data?type=residents&id=${resident.id}`, patch)
      // Create a status log entry
      await apiPost('/api/data?type=statusLogs', {
        residentId: resident.id,
        fromStatus: resident.status,
        toStatus: status,
        reason: reason || null,
      })
      toast.success(`${resident.firstName}'s status changed to ${status.replace(/_/g, ' ')}`)
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm">Change Status</h3>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            {resident.firstName} {resident.lastName} ({resident.code})
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">New Status</label>
            <select className="w-full border rounded px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
              {(residentStatuses.length > 0
                ? residentStatuses
                : [
                    { id: 'ACTIVE', label: 'Active' },
                    { id: 'HOSPITALIZED', label: 'Hospitalized' },
                    { id: 'OUT_WITH_FAMILY', label: 'Out With Family' },
                    { id: 'DISCHARGED', label: 'Discharged' },
                    { id: 'DECEASED', label: 'Deceased' },
                  ]
              ).map((s: any) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason (optional)</label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Admitted to hospital" />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="h-11 text-sm">Cancel</Button>
            <Button onClick={submit} disabled={saving} className="h-11 text-sm">
              {saving ? 'Saving...' : 'Update'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ MEDS TAB ============
function MedsTab({ facilityId, residentId, setResidentId, currentUserName, currentUserId }: { facilityId?: string; residentId: string | null; setResidentId: (id: string | null) => void; currentUserName: string; currentUserId: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: residents } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)
  const url = residentId
    ? `/api/data?type=medAdmins&residentId=${residentId}&today=true`
    : '/api/data?type=medAdmins&today=true'
  const { data: admins, loading, refetch } = useFetch<any[]>(url)

  if (loading) return <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20" />)}</div>

  const list = (admins || []).filter(a => a.status === 'PENDING')
  const completedCount = (admins || []).filter(a => a.status !== 'PENDING').length

  return (
    <div className="space-y-3">
      <div className="mb-3">
        <ResidentSelect
          residents={residents || []}
          value={residentId || ''}
          onChange={(id) => setResidentId(id || null)}
          allowAll
          allLabel="All customers"
          placeholder="All customers"
          className="w-full"
        />
      </div>
      <Card className="bg-gradient-to-br from-rose-50 to-background">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">Today's Medication Rounds</div>
              <div className="text-2xl font-bold text-rose-600">{list.length} pending</div>
              <div className="text-xs text-emerald-600 mt-0.5">{completedCount} completed</div>
            </div>
            <Pill className="h-10 w-10 text-rose-300" />
          </div>
        </CardContent>
      </Card>

      <Button variant="outline" size="sm" className="w-full" onClick={() => refetch()}>
        <RefreshCw className="h-3 w-3 mr-1" /> Refresh
      </Button>

      {list.length === 0 && (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <CheckCircle className="h-10 w-10 mx-auto mb-2 text-emerald-400" />
          <p className="text-sm">All medications administered! 🎉</p>
        </CardContent></Card>
      )}

      <div className="space-y-2">
        {list.map(a => (
          <Card key={a.id}>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <div className="font-medium break-words">{a.medication?.name} {a.medication?.dosage}</div>
                  <div className="text-xs text-muted-foreground truncate">{a.medication?.route} • {a.medication?.frequency}</div>
                  <div className="text-sm mt-1 truncate">{a.resident?.firstName} {a.resident?.lastName}</div>
                  <div className="text-xs text-muted-foreground">Room {a.resident?.room?.roomNumber || '—'}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">Due: {fmtTime(a.scheduledAt)}</div>
                </div>
              </div>
              {a.resident?.allergies && a.resident.allergies !== 'None' && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-1.5 mb-2 break-words">
                  ⚠ Allergies: {a.resident.allergies}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={async () => {
                  try {
                    await apiPatch(`/api/data?type=medAdmins&id=${a.id}`, {
                      status: 'GIVEN',
                      administeredAt: new Date().toISOString(),
                      administeredById: currentUserId || null,
                      administeredByName: currentUserName,
                    })
                    toast.success(`${a.medication?.name} administered to ${a.resident?.firstName}`)
                    refetch()
                  } catch (e: any) { toast.error(e.message) }
                }}>
                  <CheckCircle className="h-4 w-4 mr-1" /> Given
                </Button>
                <Button size="sm" variant="outline" className="text-amber-600 border-amber-300" onClick={async () => {
                  try {
                    await apiPatch(`/api/data?type=medAdmins&id=${a.id}`, {
                      status: 'REFUSED',
                      administeredById: currentUserId || null,
                      administeredByName: currentUserName,
                    })
                    toast.success('Marked as refused')
                    refetch()
                  } catch (e: any) { toast.error(e.message) }
                }}>
                  <XCircle className="h-4 w-4 mr-1" /> Refused
                </Button>
              </div>
              {/* Staff attribution */}
              <div className="text-[10px] text-muted-foreground mt-2 flex items-center gap-1">
                <User className="h-2.5 w-2.5" /> Will be recorded by: {currentUserName}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

// ============ VITALS TAB ============
function VitalsTab({ facilityId, residentId, setResidentId, currentUserName, currentUserId }: { facilityId?: string; residentId: string | null; setResidentId: (id: string | null) => void; currentUserName: string; currentUserId: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: residents } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)
  const [selectedR, setSelectedR] = useState(residentId || '')
  const [form, setForm] = useState<any>({ temp: '', bpSys: '', bpDia: '', hr: '', o2: '', glucose: '', weight: '', notes: '' })
  const [saving, setSaving] = useState(false)

  const resident = (residents || []).find(r => r.id === selectedR)

  const submit = async () => {
    if (!selectedR) { toast.error('Select a customer'); return }
    if (!form.temp && !form.bpSys && !form.hr && !form.o2) { toast.error('Enter at least one vital sign'); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=vitals', {
        residentId: selectedR,
        temperature: form.temp ? parseFloat(form.temp) : null,
        bloodPressureSystolic: form.bpSys ? parseInt(form.bpSys) : null,
        bloodPressureDiastolic: form.bpDia ? parseInt(form.bpDia) : null,
        heartRate: form.hr ? parseInt(form.hr) : null,
        oxygenSaturation: form.o2 ? parseInt(form.o2) : null,
        bloodSugar: form.glucose ? parseFloat(form.glucose) : null,
        weight: form.weight ? parseFloat(form.weight) : null,
        notes: form.notes || null,
        recordedAt: new Date().toISOString(),
        recordedById: currentUserId || null,
        recordedByName: currentUserName,
      })
      toast.success('Vitals recorded')
      setForm({ temp: '', bpSys: '', bpDia: '', hr: '', o2: '', glucose: '', weight: '', notes: '' })
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <Card className="bg-gradient-to-br from-sky-50 to-background">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-sky-500" />
            <span className="font-medium">Record Vital Signs</span>
          </div>
        </CardContent>
      </Card>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Customer *</label>
        <ResidentSelect
          residents={residents || []}
          value={selectedR}
          onChange={setSelectedR}
          placeholder="— Select customer —"
          className="w-full"
          required
        />
      </div>

      {resident && (
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
          {resident.allergies && resident.allergies !== 'None' && <span className="text-red-600">⚠ Allergies: {resident.allergies}</span>}
          {resident.conditions && <div>Conditions: {resident.conditions}</div>}
        </div>
      )}

      <div className="space-y-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Temperature (°C)</label>
          <Input type="number" step="0.1" placeholder="36.5" value={form.temp} onChange={e => setForm({ ...form, temp: e.target.value })} className="h-11" />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Blood Pressure</label>
          <div className="flex gap-2">
            <Input type="number" placeholder="Sys" value={form.bpSys} onChange={e => setForm({ ...form, bpSys: e.target.value })} className="h-11" />
            <span className="self-center text-muted-foreground">/</span>
            <Input type="number" placeholder="Dia" value={form.bpDia} onChange={e => setForm({ ...form, bpDia: e.target.value })} className="h-11" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Heart Rate (bpm)</label>
            <Input type="number" placeholder="72" value={form.hr} onChange={e => setForm({ ...form, hr: e.target.value })} className="h-11" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">O₂ Sat (%)</label>
            <Input type="number" placeholder="98" value={form.o2} onChange={e => setForm({ ...form, o2: e.target.value })} className="h-11" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">Glucose (mmol/L)</label>
            <Input type="number" step="0.1" placeholder="5.5" value={form.glucose} onChange={e => setForm({ ...form, glucose: e.target.value })} className="h-11" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Weight (kg)</label>
            <Input type="number" step="0.1" placeholder="65" value={form.weight} onChange={e => setForm({ ...form, weight: e.target.value })} className="h-11" />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <Input placeholder="Optional notes..." value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} className="h-11" />
        </div>
      </div>

      <Button onClick={submit} disabled={saving} className="w-full h-11">
        {saving ? 'Saving...' : 'Record Vitals'}
      </Button>
      <div className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
        <User className="h-2.5 w-2.5" /> Recorded by: {currentUserName}
      </div>
    </div>
  )
}

// ============ CARE LOG TAB ============
function CareTab({ facilityId, residentId, setResidentId, currentUserName, currentUserId }: { facilityId?: string; residentId: string | null; setResidentId: (id: string | null) => void; currentUserName: string; currentUserId: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: residents } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)
  const { data: logs, refetch } = useFetch<any[]>(`/api/data?type=careLogs${residentId ? `&residentId=${residentId}` : ''}${facilityParam}`)
  const [selectedR, setSelectedR] = useState(residentId || '')
  const [category, setCategory] = useState('HYGIENE')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const [showFamilyMsg, setShowFamilyMsg] = useState(false)

  const CATEGORIES = [
    { id: 'HYGIENE', label: 'Hygiene', icon: '🚿' },
    { id: 'MEALS', label: 'Meals', icon: '🍽️' },
    { id: 'MOBILITY', label: 'Mobility', icon: '🚶' },
    { id: 'TOILETING', label: 'Toileting', icon: '🚽' },
    { id: 'BEHAVIOR', label: 'Behavior', icon: '💭' },
    { id: 'OTHER', label: 'Other', icon: '📝' },
  ]

  const QUICK_TEXTS: Record<string, string[]> = {
    HYGIENE: ['Assisted with morning shower', 'Oral care provided', 'Incontinence care', 'Hair washed'],
    MEALS: ['Ate 75% of meal', 'Refused meal, encouraged fluids', 'Snack provided', 'Diabetic meal served'],
    MOBILITY: ['Ambulated with walker', 'Wheelchair transfer', 'Range of motion exercises', 'Bed rest'],
    TOILETING: ['Toileted', 'Incontinence brief changed', 'Constipation reported'],
    BEHAVIOR: ['Calm and cooperative', 'Agitated', 'Participated in activity', 'Wandering noted'],
    OTHER: ['Family visit', 'Watching TV', 'Sleeping comfortably', 'Other note'],
  }

  const submit = async (text?: string) => {
    if (!selectedR) { toast.error('Select a customer'); return }
    const desc = text || description
    if (!desc) { toast.error('Enter a description'); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=careLogs', {
        residentId: selectedR,
        category,
        description: desc,
        recordedAt: new Date().toISOString(),
        staffId: currentUserId || null,
        staffName: currentUserName,
      })
      toast.success('Care log added')
      setDescription('')
      refetch()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  const resident = (residents || []).find(r => r.id === selectedR)

  return (
    <div className="space-y-3">
      <Card className="bg-gradient-to-br from-violet-50 to-background">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-500" />
            <span className="font-medium">Quick Care Log</span>
          </div>
        </CardContent>
      </Card>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Customer *</label>
        <ResidentSelect
          residents={residents || []}
          value={selectedR}
          onChange={setSelectedR}
          placeholder="— Select customer —"
          className="w-full"
          required
        />
      </div>

      {/* Category chips */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
        <div className="grid grid-cols-3 gap-1.5">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setCategory(c.id)}
              className={`flex flex-col items-center gap-0.5 py-2 rounded-lg border text-xs transition-colors ${
                category === c.id ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'
              }`}
            >
              <span className="text-lg">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Quick text buttons */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Quick entries (tap to log instantly)</label>
        <div className="space-y-1.5">
          {(QUICK_TEXTS[category] || []).map(text => (
            <button
              key={text}
              onClick={() => submit(text)}
              disabled={saving || !selectedR}
              className="w-full text-left p-2.5 rounded-lg border bg-background hover:bg-muted/50 disabled:opacity-50 text-sm flex items-center justify-between gap-2"
            >
              <span className="break-words min-w-0">{text}</span>
              <Plus className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>

      {/* Custom entry */}
      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Or type your own</label>
        <Input placeholder="Describe care provided..." value={description} onChange={e => setDescription(e.target.value)} className="h-11" />
        <Button onClick={() => submit()} disabled={saving || !selectedR} className="w-full h-11 mt-2">
          {saving ? 'Saving...' : 'Add Log Entry'}
        </Button>
      </div>

      {/* Quick family update */}
      {resident && (
        <Button variant="outline" size="sm" className="w-full" onClick={() => setShowFamilyMsg(true)}>
          <Send className="h-3 w-3 mr-1" /> Send Family Update
        </Button>
      )}

      {/* Staff attribution */}
      <div className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
        <User className="h-2.5 w-2.5" /> Care logs recorded by: {currentUserName}
      </div>

      {/* Recent logs */}
      {(logs || []).length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 mt-4">Recent logs</div>
          <div className="space-y-1.5">
            {(logs || []).slice(0, 5).map((l: any) => (
              <div key={l.id} className="text-xs bg-muted/30 rounded p-2">
                <div className="font-medium break-words">{l.description}</div>
                <div className="text-muted-foreground break-words">
                  {l.category} • {l.resident?.firstName} {l.resident?.lastName} • {fmtTime(l.recordedAt)}
                  {l.staffName && <span> • by {l.staffName}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showFamilyMsg && resident && (
        <QuickFamilyMessage
          resident={resident}
          currentUserName={currentUserName}
          onClose={() => setShowFamilyMsg(false)}
        />
      )}
    </div>
  )
}

// ============ QUICK FAMILY MESSAGE ============
function QuickFamilyMessage({ resident, currentUserName, onClose }: any) {
  useEscClose(onClose)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const quickTemplates = [
    `${resident.firstName} is doing well today. Had a good meal and participated in activities.`,
    `${resident.firstName} had a restful night and is in good spirits this morning.`,
    `${resident.firstName}'s vitals are stable. Medication administered as prescribed.`,
    `Update: ${resident.firstName} had a minor incident today. Staff have attended to it. Please call for details.`,
  ]

  const submit = async (msg?: string) => {
    const text = msg || message
    if (!text) { toast.error('Enter a message'); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=messages', {
        residentId: resident.id,
        message: text,
        sentBy: currentUserName,
        direction: 'OUTGOING',
      })
      toast.success('Family update sent')
      setMessage('')
      onClose()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-sm flex items-center gap-1.5">
              <Send className="h-4 w-4" /> Family Update
            </h3>
            <button onClick={onClose} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground" aria-label="Close">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="text-xs text-muted-foreground">
            To: Family of {resident.firstName} {resident.lastName} ({resident.code})
          </div>
          {/* Quick templates */}
          <div className="space-y-1">
            <div className="text-[10px] text-muted-foreground">Quick templates:</div>
            {quickTemplates.map((t, i) => (
              <button
                key={i}
                onClick={() => submit(t)}
                disabled={saving}
                className="w-full text-left p-2 rounded-lg border bg-background hover:bg-muted/50 text-xs disabled:opacity-50 break-words"
              >
                {t}
              </button>
            ))}
          </div>
          {/* Custom message */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Or type your own</label>
            <textarea
              className="w-full border rounded-lg px-3 py-2 text-sm bg-background min-h-16"
              placeholder="Type your message..."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Button variant="outline" onClick={onClose} className="h-11 text-sm">Cancel</Button>
            <Button onClick={() => submit()} disabled={saving} className="h-11 text-sm">
              {saving ? 'Sending...' : 'Send'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ INCIDENTS TAB ============
function IncidentsTab({ facilityId, residentId, setResidentId, currentUserName, currentUserId }: { facilityId?: string; residentId: string | null; setResidentId: (id: string | null) => void; currentUserName: string; currentUserId: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: residents } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)
  const { data: incidents, refetch } = useFetch<any[]>(`/api/data?type=incidents${facilityParam}`)
  const { incidentTypes, incidentSeverities } = useAppDropdowns(facilityId)
  const [selectedR, setSelectedR] = useState(residentId || '')
  const [incidentType, setIncidentType] = useState('FALL')
  const [severity, setSeverity] = useState('LOW')
  const [description, setDescription] = useState('')
  const [action, setAction] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!selectedR) { toast.error('Select a customer'); return }
    if (!description) { toast.error('Description required'); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=incidents', {
        residentId: selectedR,
        incidentType,
        severity,
        description,
        actionTaken: action || null,
        occurredAt: new Date().toISOString(),
        reportedById: currentUserId || null,
        reportedByName: currentUserName,
      })
      toast.success('Incident reported')
      setDescription('')
      setAction('')
      refetch()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="space-y-3">
      <Card className="bg-gradient-to-br from-amber-50 to-background">
        <CardContent className="p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            <span className="font-medium">Report Incident</span>
          </div>
        </CardContent>
      </Card>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Customer *</label>
        <ResidentSelect
          residents={residents || []}
          value={selectedR}
          onChange={setSelectedR}
          placeholder="— Select customer —"
          className="w-full"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
          <select className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background" value={incidentType} onChange={e => setIncidentType(e.target.value)}>
            {incidentTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Severity</label>
          <select className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background" value={severity} onChange={e => setSeverity(e.target.value)}>
            {incidentSeverities.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Description *</label>
        <textarea
          className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background min-h-20"
          placeholder="What happened?"
          value={description}
          onChange={e => setDescription(e.target.value)}
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground mb-1 block">Action Taken</label>
        <textarea
          className="w-full border rounded-lg px-3 py-2.5 text-sm bg-background min-h-16"
          placeholder="What did you do?"
          value={action}
          onChange={e => setAction(e.target.value)}
        />
      </div>

      <Button onClick={submit} disabled={saving} className="w-full h-11 bg-amber-600 hover:bg-amber-700">
        {saving ? 'Saving...' : 'Report Incident'}
      </Button>
      <div className="text-[10px] text-muted-foreground text-center flex items-center justify-center gap-1">
        <User className="h-2.5 w-2.5" /> Reported by: {currentUserName}
      </div>

      {/* Recent incidents */}
      {(incidents || []).length > 0 && (
        <div>
          <div className="text-xs font-medium text-muted-foreground mb-2 mt-4">Recent incidents</div>
          <div className="space-y-1.5">
            {(incidents || []).slice(0, 5).map((i: any) => (
              <div key={i.id} className="text-xs bg-muted/30 rounded p-2">
                <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                  <Badge variant="outline" className="text-xs whitespace-nowrap">{i.incidentType.replace(/_/g, ' ')}</Badge>
                  <Badge variant="outline" className={
                    i.severity === 'CRITICAL' ? 'bg-red-100 text-red-700 whitespace-nowrap' :
                    i.severity === 'HIGH' ? 'bg-orange-100 text-orange-700 whitespace-nowrap' :
                    i.severity === 'MODERATE' ? 'bg-amber-100 text-amber-700 whitespace-nowrap' : 'whitespace-nowrap'
                  }>{i.severity}</Badge>
                </div>
                <div className="break-words">{i.description}</div>
                <div className="text-muted-foreground break-words">
                  {i.resident?.firstName} {i.resident?.lastName} • {fmtTime(i.occurredAt)}
                  {i.reportedByName && <span> • by {i.reportedByName}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
