'use client'

import { useState, useMemo, useEffect } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPatch } from './api'
import { useMedSettings } from './useMedSettings'
import { StandardSearchBar } from './StandardSearchBar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from './Badges'
import { fmtDateTime, fmtTime } from '@/lib/types'
import {
  Pill, CheckCircle, XCircle, Clock, PackageX, PauseCircle,
  LogOut, MoreVertical, ChevronDown, Filter, Loader2, CalendarPlus,
  AlarmClock, BellRing, AlertTriangle, Calendar
} from 'lucide-react'
import { DateRangeFilter, type DateRangeValue } from './DateRangeFilter'
import { toast } from 'sonner'

const MED_STATUSES = [
  { id: 'GIVEN', label: 'Given', icon: CheckCircle, color: 'text-emerald-600 border-emerald-200 hover:bg-emerald-50', desc: 'Medication administered successfully' },
  { id: 'REFUSED', label: 'Refused', icon: XCircle, color: 'text-red-600 border-red-200 hover:bg-red-50', desc: 'Resident refused to take medication' },
  { id: 'WITHHELD', label: 'Withheld', icon: PauseCircle, color: 'text-amber-600 border-amber-200 hover:bg-amber-50', desc: 'Held by nurse per doctor order or clinical reason' },
  { id: 'DELAYED', label: 'Delayed', icon: Clock, color: 'text-yellow-600 border-yellow-200 hover:bg-yellow-50', desc: 'Will be given later (e.g., resident eating, vitals not ready)' },
  { id: 'FINISHED', label: 'Med Finished', icon: PackageX, color: 'text-orange-600 border-orange-200 hover:bg-orange-50', desc: 'Medication supply has run out — needs restocking' },
  { id: 'RESIDENT_OUT', label: 'Resident Out', icon: LogOut, color: 'text-violet-600 border-violet-200 hover:bg-violet-50', desc: 'Resident is out (hospital/family) — medication skipped' },
] as const

// ===== Time-window presets for the MAR =====
// Helps nurses answer "what do I need to give right now / in the next hour?"
// 'due_now' uses a ±30 min window around the current time so it catches
//   meds that should have been given in the last 30 min OR are due in the
//   next 30 min — i.e. anything that needs attention right now.
// 'overdue' shows only past-due PENDING administrations (the alarm case).
// 'next_1h' / 'next_2h' show what's coming up so staff can plan.
// 'morning' / 'afternoon' / 'evening' / 'night' are conventional shift windows
//   (06–12 / 12–18 / 18–22 / 22–06) used in Malaysian care homes.
type TimeWindow =
  | 'all' | 'due_now' | 'overdue' | 'next_1h' | 'next_2h'
  | 'morning' | 'afternoon' | 'evening' | 'night'

const TIME_WINDOWS: { id: TimeWindow; label: string; icon: any }[] = [
  { id: 'due_now',   label: 'Due Now',     icon: AlarmClock },
  { id: 'overdue',   label: 'Overdue',     icon: AlertTriangle },
  { id: 'next_1h',   label: 'Next 1h',     icon: Clock },
  { id: 'morning',   label: 'Morning',     icon: Clock },
  { id: 'afternoon', label: 'Afternoon',   icon: Clock },
  { id: 'evening',   label: 'Evening',     icon: Clock },
  { id: 'night',     label: 'Night',       icon: Clock },
  { id: 'all',       label: 'All Times',   icon: Calendar },
]

// Shift windows (local time, 24h)
const SHIFT_WINDOWS: Record<string, { start: number; end: number }> = {
  morning:   { start: 6,  end: 12 },
  afternoon: { start: 12, end: 18 },
  evening:   { start: 18, end: 22 },
  night:     { start: 22, end: 30 }, // 22:00 – 06:00 next day (30 = 06:00+24)
}

// Alarm thresholds (minutes from scheduledAt)
const DUE_WINDOW_MIN = 30       // within ±30 min of scheduledAt → DUE
const OVERDUE_GRACE_MIN = 5     // 5-min grace before flagging OVERDUE
const UPCOMING_WINDOW_MIN = 120 // within next 2h → UPCOMING

/**
 * Compute the alarm state for a single med administration record.
 *   - OVERDUE: scheduledAt + grace has passed AND status is still PENDING
 *   - DUE:     within ±DUE_WINDOW_MIN of scheduledAt AND status is PENDING
 *   - UPCOMING: scheduled in the next UPCOMING_WINDOW_MIN AND status is PENDING
 *   - none:    everything else (already administered, far in the future, etc.)
 */
function getAlarmState(a: any, now: number): 'OVERDUE' | 'DUE' | 'UPCOMING' | null {
  if (a.status !== 'PENDING') return null
  const scheduled = new Date(a.scheduledAt).getTime()
  if (isNaN(scheduled)) return null
  const diffMin = (scheduled - now) / 60000
  // OVERDUE: scheduled time + grace has passed
  if (diffMin < -OVERDUE_GRACE_MIN) return 'OVERDUE'
  // DUE: within the ±30 min window around the scheduled time
  if (diffMin <= DUE_WINDOW_MIN && diffMin >= -DUE_WINDOW_MIN) return 'DUE'
  // UPCOMING: in the next 2h (but beyond the DUE window)
  if (diffMin > DUE_WINDOW_MIN && diffMin <= UPCOMING_WINDOW_MIN) return 'UPCOMING'
  return null
}

export function Medications({ facilityId }: { facilityId?: string }) {
  const [tab, setTab] = useState<'today' | 'all'>('today')
  const [statusFilter, setStatusFilter] = useState<string>('PENDING')
  // Filter dropdowns (driven by facility med settings)
  const [routeFilter, setRouteFilter] = useState<string>('')
  const [freqFilter, setFreqFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  // Time-window filter — defaults to 'due_now' on the Today tab so nurses
  // immediately see what needs attention right now.
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('due_now')
  // Date range filter — only applies when viewing 'all' (not 'today');
  // when 'today' is selected the server uses ?today=true for backward compatibility.
  const [dateRange, setDateRange] = useState<DateRangeValue>({})
  const [actionItem, setActionItem] = useState<any | null>(null)
  const [generating, setGenerating] = useState(false)
  // "Now" timestamp that ticks every 60s so alarm badges stay current
  // without needing a full refetch.
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowTick(Date.now()), 60_000)
    return () => clearInterval(id)
  }, [])

  const { routes, frequencies, loading: settingsLoading } = useMedSettings(facilityId)

  // Build query string. Today tab uses the legacy shortcut; All tab honours dateRange.
  const dateQ = tab === 'today'
    ? '&today=true'
    : (dateRange.startDate ? `&startDate=${dateRange.startDate}` : '') + (dateRange.endDate ? `&endDate=${dateRange.endDate}` : '')
  // Auto-refresh every 60s when on the Today tab so the alarm summary stays
  // accurate even if the user leaves the tab open.
  const { data, loading, refetch } = useFetch<any[]>(
    `/api/data?type=medAdmins${dateQ}${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}${facilityId ? `&facilityId=${facilityId}` : ''}`,
    { refreshInterval: tab === 'today' ? 60_000 : 0 }
  )

  // Generate tomorrow's medication administrations
  const handleGenerateMeds = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/meds/generate', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(data.message || `Generated ${data.created} med administrations (${data.skipped} already existed)`)
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate medications')
    }
    setGenerating(false)
  }

  // Compute alarm state for every record (memoised on data + nowTick)
  const withAlarms = useMemo(() => {
    if (!data) return []
    return data.map(a => ({ ...a, _alarm: getAlarmState(a, nowTick) }))
  }, [data, nowTick])

  // Apply client-side route/frequency/time-window filters + text search
  const list = useMemo(() => {
    let out = withAlarms
    // Time window filter — applied to scheduledAt's local time-of-day
    if (timeWindow !== 'all') {
      const now = nowTick
      out = out.filter(a => {
        const scheduled = new Date(a.scheduledAt)
        const scheduledMin = scheduled.getHours() * 60 + scheduled.getMinutes()
        const diffMin = (scheduled.getTime() - now) / 60000
        switch (timeWindow) {
          case 'due_now':
            return a._alarm === 'DUE' || a._alarm === 'OVERDUE'
          case 'overdue':
            return a._alarm === 'OVERDUE'
          case 'next_1h':
            return diffMin >= 0 && diffMin <= 60 && a.status === 'PENDING'
          case 'next_2h':
            return diffMin >= 0 && diffMin <= 120 && a.status === 'PENDING'
          case 'morning': {
            const w = SHIFT_WINDOWS.morning
            return scheduledMin >= w.start * 60 && scheduledMin < w.end * 60
          }
          case 'afternoon': {
            const w = SHIFT_WINDOWS.afternoon
            return scheduledMin >= w.start * 60 && scheduledMin < w.end * 60
          }
          case 'evening': {
            const w = SHIFT_WINDOWS.evening
            return scheduledMin >= w.start * 60 && scheduledMin < w.end * 60
          }
          case 'night': {
            const w = SHIFT_WINDOWS.night
            // 22:00–06:00 wraps midnight
            return scheduledMin >= w.start * 60 || scheduledMin < (w.end - 24) * 60
          }
          default:
            return true
        }
      })
    }
    // Route + frequency filters
    out = out.filter(a => {
      if (routeFilter && a.medication?.route !== routeFilter) return false
      if (freqFilter && a.medication?.frequency !== freqFilter) return false
      return true
    })
    // Text search
    const s = search.toLowerCase().trim()
    if (s) {
      out = out.filter(a => {
        const resident = a.resident
        const med = a.medication
        return (
          `${resident?.firstName} ${resident?.lastName}`.toLowerCase().includes(s) ||
          resident?.code?.toLowerCase().includes(s) ||
          resident?.room?.roomNumber?.toLowerCase().includes(s) ||
          med?.name?.toLowerCase().includes(s) ||
          med?.dosage?.toLowerCase().includes(s) ||
          med?.route?.toLowerCase().includes(s) ||
          med?.frequency?.toLowerCase().includes(s) ||
          med?.prescribedBy?.toLowerCase().includes(s) ||
          a.status?.toLowerCase().includes(s) ||
          a.notes?.toLowerCase().includes(s)
        )
      })
    }
    // Sort: when an alarm/due/overdue filter is active, show most urgent first
    // (OVERDUE > DUE > UPCOMING > by scheduled time ascending). Otherwise keep
    // the server's order (desc by scheduledAt).
    if (timeWindow === 'due_now' || timeWindow === 'overdue' || timeWindow === 'next_1h' || timeWindow === 'next_2h') {
      const rank = { OVERDUE: 0, DUE: 1, UPCOMING: 2 }
      out = [...out].sort((a, b) => {
        const ra = rank[a._alarm as keyof typeof rank] ?? 3
        const rb = rank[b._alarm as keyof typeof rank] ?? 3
        if (ra !== rb) return ra - rb
        return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
      })
    }
    return out
  }, [withAlarms, routeFilter, freqFilter, search, timeWindow, nowTick])

  // Alarm summary counts — shown in the banner above the list
  const alarmCounts = useMemo(() => {
    let overdue = 0, due = 0, upcoming = 0
    for (const a of withAlarms) {
      if (a._alarm === 'OVERDUE') overdue++
      else if (a._alarm === 'DUE') due++
      else if (a._alarm === 'UPCOMING') upcoming++
    }
    return { overdue, due, upcoming }
  }, [withAlarms])

  if (loading) return <Skeleton className="h-96" />

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b flex-wrap">
        {(['today', 'all'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm border-b-2 ${tab === t ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}
          >
            {t === 'today' ? 'Today' : 'All'}
          </button>
        ))}
        <div className="ml-auto flex gap-1 flex-wrap">
          {['PENDING', 'GIVEN', 'REFUSED', 'WITHHELD', 'DELAYED', 'FINISHED', 'RESIDENT_OUT', 'ALL'].map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border hover:bg-muted'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* === Alarm summary banner === — shows how many meds need attention right now */}
      {tab === 'today' && statusFilter === 'PENDING' && (alarmCounts.overdue > 0 || alarmCounts.due > 0) && (
        <div className={`rounded-md border p-3 flex items-center gap-3 flex-wrap ${
          alarmCounts.overdue > 0
            ? 'border-red-300 bg-red-50'
            : 'border-amber-300 bg-amber-50'
        }`}>
          <BellRing className={`h-5 w-5 flex-shrink-0 ${alarmCounts.overdue > 0 ? 'text-red-600' : 'text-amber-600'}`} />
          <div className="flex-1 min-w-0 text-sm">
            <div className={`font-semibold ${alarmCounts.overdue > 0 ? 'text-red-800' : 'text-amber-800'}`}>
              {alarmCounts.overdue > 0
                ? `${alarmCounts.overdue} medication${alarmCounts.overdue === 1 ? '' : 's'} OVERDUE — administer or update status now`
                : `${alarmCounts.due} medication${alarmCounts.due === 1 ? '' : 's'} due now (within ±30 min)`}
            </div>
            {alarmCounts.overdue > 0 && alarmCounts.due > 0 && (
              <div className="text-xs text-red-700 mt-0.5">
                Plus {alarmCounts.due} due now • {alarmCounts.upcoming} upcoming in next 2h
              </div>
            )}
            {alarmCounts.overdue === 0 && alarmCounts.upcoming > 0 && (
              <div className="text-xs text-amber-700 mt-0.5">
                {alarmCounts.upcoming} upcoming in the next 2h
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-1 flex-shrink-0">
            {alarmCounts.overdue > 0 && (
              <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-100"
                onClick={() => setTimeWindow('overdue')}>
                Show overdue ({alarmCounts.overdue})
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-100"
              onClick={() => setTimeWindow('due_now')}>
              Show due now ({alarmCounts.due + alarmCounts.overdue})
            </Button>
          </div>
        </div>
      )}

      {/* Search bar + date filter — standardised across all modules */}
      <div className="flex flex-wrap items-center gap-2">
        <StandardSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by resident name, code, room, medication, route, status..."
          totalCount={data?.length || 0}
          filteredCount={list.length}
          className="flex-1"
        />
        {tab === 'all' && (
          <DateRangeFilter
            value={dateRange}
            onChange={setDateRange}
            label="Scheduled"
            align="end"
          />
        )}
      </div>

      {/* === Time-window filter === — preset chips so nurses can answer
          "what do I give now / next hour / this shift" */}
      {tab === 'today' && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 mr-1">
            <AlarmClock className="h-3 w-3" /> Time:
          </span>
          {TIME_WINDOWS.map(w => {
            const active = timeWindow === w.id
            // Show count badges on Due Now / Overdue chips for at-a-glance urgency
            const count = w.id === 'due_now'
              ? alarmCounts.due + alarmCounts.overdue
              : w.id === 'overdue'
                ? alarmCounts.overdue
                : null
            return (
              <button
                key={w.id}
                onClick={() => setTimeWindow(w.id)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? w.id === 'overdue'
                      ? 'bg-red-600 text-white border-red-600'
                      : w.id === 'due_now'
                        ? 'bg-amber-500 text-white border-amber-500'
                        : 'bg-primary text-primary-foreground border-primary'
                    : w.id === 'overdue' && alarmCounts.overdue > 0
                      ? 'bg-red-50 text-red-700 border-red-300 hover:bg-red-100'
                      : w.id === 'due_now' && (alarmCounts.due + alarmCounts.overdue) > 0
                        ? 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'
                        : 'bg-background border-border hover:bg-muted'
                }`}
                title={w.id === 'due_now' ? 'Within ±30 min of scheduled time' : w.id === 'overdue' ? 'Past scheduled time, still pending' : w.id === 'next_1h' ? 'Next 60 minutes' : w.id === 'next_2h' ? 'Next 120 minutes' : `${w.label} shift`}
              >
                <w.icon className="h-3 w-3" />
                {w.label}
                {count !== null && count > 0 && (
                  <span className={`ml-0.5 px-1 rounded-full text-[10px] ${active ? 'bg-white/25' : 'bg-current/15'}`}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* Route & Frequency filter dropdowns — driven by facility settings */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs font-medium text-muted-foreground flex items-center gap-1"><Filter className="h-3 w-3" /> Filters:</span>
        <select
          className="border rounded px-2 py-1 text-xs"
          value={routeFilter}
          onChange={e => setRouteFilter(e.target.value)}
          disabled={settingsLoading}
        >
          <option value="">All Routes</option>
          {routes.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select
          className="border rounded px-2 py-1 text-xs"
          value={freqFilter}
          onChange={e => setFreqFilter(e.target.value)}
          disabled={settingsLoading}
        >
          <option value="">All Frequencies</option>
          {frequencies.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        {(routeFilter || freqFilter) && (
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setRouteFilter(''); setFreqFilter('') }}>
            Clear filters
          </Button>
        )}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Pill className="h-4 w-4" /> Medication Administration Record (MAR)
              <Badge variant="outline" className="ml-2">{list.length} {statusFilter !== 'ALL' ? statusFilter.toLowerCase() : 'records'}</Badge>
            </CardTitle>
            <Button
              size="sm"
              variant="outline"
              disabled={generating}
              onClick={handleGenerateMeds}
              title="Generate tomorrow's medication schedule based on each resident's medications and their set times"
            >
              {generating ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating...</> : <><CalendarPlus className="h-3.5 w-3.5 mr-1" /> Generate Tomorrow's Meds</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {list.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No medications found</p>}
            {list.map(a => {
              // === Per-row alarm badge === — coloured pill so the nurse
              // can see at a glance which meds need attention right now
              const alarm = a._alarm
              return (
                <div key={a.id} className={`p-3 ${alarm === 'OVERDUE' ? 'bg-red-50/40' : alarm === 'DUE' ? 'bg-amber-50/30' : ''}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">
                          {a.resident?.code && <span className="text-xs font-mono text-primary mr-1">{a.resident.code}</span>}
                          {a.resident?.firstName} {a.resident?.lastName}
                        </span>
                        <span className="text-xs text-muted-foreground">Room {a.resident?.room?.roomNumber || '—'}</span>
                        {a.status !== 'PENDING' && <StatusBadge status={a.status} />}
                        {/* Alarm badge */}
                        {alarm === 'OVERDUE' && (
                          <Badge variant="outline" className="text-[10px] bg-red-100 text-red-700 border-red-400 animate-pulse">
                            <AlertTriangle className="h-3 w-3 mr-0.5" /> OVERDUE
                          </Badge>
                        )}
                        {alarm === 'DUE' && (
                          <Badge variant="outline" className="text-[10px] bg-amber-100 text-amber-800 border-amber-400">
                            <AlarmClock className="h-3 w-3 mr-0.5" /> DUE NOW
                          </Badge>
                        )}
                        {alarm === 'UPCOMING' && (
                          <Badge variant="outline" className="text-[10px] bg-sky-100 text-sky-700 border-sky-300">
                            <Clock className="h-3 w-3 mr-0.5" /> UPCOMING
                          </Badge>
                        )}
                      </div>
                      <div className="text-sm mt-0.5">
                        {a.medication?.name} {a.medication?.dosage}
                        {a.medication?.route && (
                          <Badge variant="outline" className="ml-2 text-[10px] py-0 px-1.5 bg-sky-50 border-sky-200 text-sky-700">{a.medication.route}</Badge>
                        )}
                        {a.medication?.duration && (
                          <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1.5 bg-violet-50 border-violet-200 text-violet-700">{a.medication.duration}</Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Scheduled: {fmtDateTime(a.scheduledAt)} ({fmtTime(a.scheduledAt)}) • {a.medication?.frequency}
                        {a.medication?.prescribedBy && <span className="ml-1">• Rx: {a.medication.prescribedBy}</span>}
                        {/* Relative time hint for pending meds */}
                        {a.status === 'PENDING' && (() => {
                          const diffMin = Math.round((new Date(a.scheduledAt).getTime() - nowTick) / 60000)
                          if (diffMin === 0) return <span className="ml-1 text-amber-600 font-medium">• now</span>
                          if (diffMin > 0 && diffMin <= 120) return <span className="ml-1 text-amber-600 font-medium">• in {diffMin} min</span>
                          if (diffMin < 0 && diffMin >= -180) return <span className="ml-1 text-red-600 font-medium">• {Math.abs(diffMin)} min ago</span>
                          return null
                        })()}
                      </div>
                      {a.notes && <div className="text-xs text-muted-foreground mt-0.5 italic">Note: {a.notes}</div>}
                      {a.administeredAt && <div className="text-xs text-emerald-600 mt-0.5">Administered: {fmtDateTime(a.administeredAt)}</div>}
                      {/* Show resident status warning if not ACTIVE */}
                      {a.resident?.status && a.resident.status !== 'ACTIVE' && (
                        <div className="text-xs mt-1 px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 inline-block">
                          ⚠ Resident is {a.resident.status.replace(/_/g, ' ').toLowerCase()}
                        </div>
                      )}
                    </div>
                    {a.status === 'PENDING' && (
                      <div className="flex flex-wrap gap-1 flex-shrink-0 flex-wrap justify-end">
                        <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200 hover:bg-emerald-50" onClick={async () => {
                          try {
                            await apiPatch(`/api/data?type=medAdmins&id=${a.id}`, { status: 'GIVEN', administeredAt: new Date().toISOString() })
                            toast.success(`${a.medication?.name} marked as given`)
                            refetch()
                          } catch (e: any) { toast.error(e.message) }
                        }}>
                          <CheckCircle className="h-3 w-3 mr-1" /> Given
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setActionItem(a)}>
                          <MoreVertical className="h-3 w-3 mr-1" /> Other
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {actionItem && <MedActionDialog item={actionItem} onClose={() => setActionItem(null)} onSaved={() => { setActionItem(null); refetch() }} />}
    </div>
  )
}

function MedActionDialog({ item, onClose, onSaved }: { item: any; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const [selectedStatus, setSelectedStatus] = useState<string>('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!selectedStatus) { toast.error('Select a status'); return }
    setSaving(true)
    try {
      await apiPatch(`/api/data?type=medAdmins&id=${item.id}`, {
        status: selectedStatus,
        administeredAt: selectedStatus === 'GIVEN' ? new Date().toISOString() : null,
        notes: notes || null,
      })
      toast.success(`Marked as ${selectedStatus.replace(/_/g, ' ').toLowerCase()}`)
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2">
            <Pill className="h-4 w-4" /> Medication Action
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="rounded-md bg-muted/50 p-3">
            <div className="font-medium">{item.medication?.name} {item.medication?.dosage}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {item.resident?.code} {item.resident?.firstName} {item.resident?.lastName} • Room {item.resident?.room?.roomNumber || '—'}
            </div>
            <div className="text-xs text-muted-foreground">Scheduled: {fmtDateTime(item.scheduledAt)}</div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-2 block">Select status *</label>
            <div className="grid grid-cols-2 gap-2">
              {MED_STATUSES.filter(s => s.id !== 'GIVEN').map(s => (
                <button
                  key={s.id}
                  onClick={() => setSelectedStatus(s.id)}
                  className={`flex items-start gap-2 p-2.5 rounded-lg border text-left transition-colors ${
                    selectedStatus === s.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                  }`}
                >
                  <s.icon className={`h-4 w-4 mt-0.5 flex-shrink-0 ${s.color.split(' ')[0]}`} />
                  <div>
                    <div className="font-medium text-sm">{s.label}</div>
                    <div className="text-xs text-muted-foreground">{s.desc}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes (optional)</label>
            <textarea
              className="w-full border rounded px-2 py-1.5 text-sm"
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="e.g., Resident nausea, doctor ordered hold, supply reordered..."
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !selectedStatus}>{saving ? 'Saving...' : 'Confirm'}</Button>
        </div>
      </div>
    </div>
  )
}

export function VitalsOverview({ facilityId }: { facilityId?: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const [search, setSearch] = useState('')
  const [dateRange, setDateRange] = useState<DateRangeValue>({})
  const dateQ = (dateRange.startDate ? `&startDate=${dateRange.startDate}` : '') + (dateRange.endDate ? `&endDate=${dateRange.endDate}` : '')
  const { data, loading } = useFetch<any[]>(`/api/data?type=vitals${facilityParam}${dateQ}`)

  const filtered = useMemo(() => {
    if (!data) return []
    if (!search.trim()) return data
    const q = search.toLowerCase().trim()
    return data.filter(v => {
      const name = `${v.resident?.firstName || ''} ${v.resident?.lastName || ''}`.toLowerCase()
      const code = (v.resident?.code || '').toLowerCase()
      const room = (v.resident?.room?.roomNumber || '').toLowerCase()
      const notes = (v.notes || '').toLowerCase()
      return name.includes(q) || code.includes(q) || room.includes(q) || notes.includes(q)
    })
  }, [data, search])

  if (loading || !data) return <Skeleton className="h-96" />

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StandardSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search resident, code, room, notes..."
              totalCount={data.length}
              filteredCount={filtered.length}
              className="flex-1"
            />
            <DateRangeFilter
              value={dateRange}
              onChange={setDateRange}
              label="Recorded"
              align="end"
            />
          </div>
          <CardTitle className="text-sm">Recent Vital Signs (across all residents)</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border rounded-md max-h-[600px] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="text-left p-2 font-medium">Resident</th>
                <th className="text-left p-2 font-medium">Room</th>
                <th className="text-left p-2 font-medium">Date</th>
                <th className="text-left p-2 font-medium">Temp</th>
                <th className="text-left p-2 font-medium">BP</th>
                <th className="text-left p-2 font-medium">HR</th>
                <th className="text-left p-2 font-medium">O₂</th>
                <th className="text-left p-2 font-medium">Glucose</th>
                <th className="text-left p-2 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-6 text-center text-sm text-muted-foreground">
                    {search ? `No vital signs matching "${search}"` : 'No vital signs recorded yet'}
                  </td>
                </tr>
              ) : (
                filtered.map(v => (
                  <tr key={v.id} className="border-t hover:bg-muted/30">
                    <td className="p-2">
                      {v.resident?.code && <span className="text-xs font-mono text-primary block">{v.resident.code}</span>}
                      {v.resident?.firstName} {v.resident?.lastName}
                    </td>
                    <td className="p-2 text-xs">{v.resident?.room?.roomNumber || '—'}</td>
                    <td className="p-2 text-xs">{fmtDateTime(v.recordedAt)}</td>
                    <td className="p-2">{v.temperature?.toFixed(1)}°C</td>
                    <td className="p-2">{v.bloodPressureSystolic}/{v.bloodPressureDiastolic}</td>
                    <td className="p-2">{v.heartRate}</td>
                    <td className="p-2">{v.oxygenSaturation}%</td>
                    <td className="p-2">{v.bloodSugar?.toFixed(1)}</td>
                    <td className="p-2 text-xs text-muted-foreground">{v.notes || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  )
}
