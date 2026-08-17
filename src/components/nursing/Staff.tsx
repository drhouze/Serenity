'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPost, apiPatch, apiDelete } from './api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { ShiftBadge, StatusBadge } from './Badges'
import { StandardSearchBar } from './StandardSearchBar'
import { fmtDate, fmtTime, fmtMoney, initials } from '@/lib/types'
import {
  Plus, Phone, Calendar, Clock, Users, ChevronLeft, ChevronRight,
  Copy, Trash2, CalendarPlus, X, UserCog, Printer, Plane, Check, CheckCircle, XCircle,
  AlertTriangle, CalendarOff, KeyRound, Receipt, DollarSign, Mail, Building2, Activity,
  FileText, Wallet, LogIn, LogOut, Calculator, Download, Loader2
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppDropdowns } from './useAppDropdowns'
import { calculatePayroll, type PayrollInput } from '@/lib/payroll-my'

// Color mapping for shift types (display only — the actual types/times come from settings)
const SHIFT_COLORS: Record<string, string> = {
  DAY: 'bg-amber-100 text-amber-700 border-amber-200',
  EVENING: 'bg-violet-100 text-violet-700 border-violet-200',
  NIGHT: 'bg-slate-700 text-white border-slate-800',
}
const DEFAULT_SHIFT_COLOR = 'bg-muted text-muted-foreground border-border'
function shiftColor(type: string): string {
  return SHIFT_COLORS[type] || DEFAULT_SHIFT_COLOR
}
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getWeekStart(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = day === 0 ? -6 : 1 - day // Monday as start of week
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

// Smart default: if today is weekend (Sat/Sun), show next week (upcoming schedule)
function getInitialWeekStart(): Date {
  const today = new Date()
  const day = today.getDay()
  if (day === 6 || day === 0) {
    // Saturday or Sunday — jump to next Monday
    const nextMonday = new Date(today)
    const diff = day === 0 ? 1 : 2 // Sunday → +1, Saturday → +2
    nextMonday.setDate(nextMonday.getDate() + diff)
    nextMonday.setHours(0, 0, 0, 0)
    return nextMonday
  }
  return getWeekStart(today)
}
function addDays(date: Date, days: number): Date {
  const d = new Date(date); d.setDate(d.getDate() + days); return d
}

// Timezone-safe date key: extracts YYYY-MM-DD from a Date without UTC conversion issues.
// Uses the date's own year/month/day (local) to build the key, avoiding toISOString() which shifts.
function dateKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}
function isOnLeave(staffId: string, date: Date, leaves: any[]): any | null {
  for (const l of leaves) {
    if (l.staffId === staffId && l.status === 'APPROVED') {
      const start = new Date(l.startDate); start.setHours(0, 0, 0, 0)
      const end = new Date(l.endDate); end.setHours(23, 59, 59, 999)
      if (date >= start && date <= end) return l
    }
  }
  return null
}

async function shiftApi(action: string, body: any) {
  const r = await fetch(`/api/shifts?action=${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  if (!r.ok) {
    const e = await r.json().catch(() => ({}))
    throw new Error((e as any).error || `HTTP ${r.status}`)
  }
  return r.json()
}

export function Staff({ facilityId }: { facilityId?: string }) {
  const [tab, setTab] = useState<'schedule' | 'directory' | 'leave' | 'attendance' | 'payroll'>('schedule')
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: staff, loading, refetch: refetchStaff } = useFetch<any[]>(`/api/data?type=staff${facilityParam}`)

  if (loading) return <Skeleton className="h-96" />

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b overflow-x-auto scrollbar-thin">
        {([
          { id: 'schedule', label: '📅 Schedule' },
          { id: 'directory', label: '👥 Directory' },
          { id: 'leave', label: '🏖️ Leave' },
          { id: 'attendance', label: '⏱️ Attendance' },
          { id: 'payroll', label: '💰 Payroll' },
        ] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm border-b-2 whitespace-nowrap flex-shrink-0 ${tab === t.id ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'schedule' && <ScheduleView staff={staff || []} facilityId={facilityId} />}
      {tab === 'directory' && <StaffDirectory staff={staff || []} facilityId={facilityId} refetchStaff={refetchStaff} />}
      {tab === 'leave' && <LeaveView staff={staff || []} facilityId={facilityId} />}
      {tab === 'attendance' && <AttendanceView staff={staff || []} facilityId={facilityId} />}
      {tab === 'payroll' && <PayrollView staff={staff || []} facilityId={facilityId} />}
    </div>
  )
}

// ============ SCHEDULE VIEW ============
function ScheduleView({ staff, facilityId }: { staff: any[]; facilityId?: string }) {
  const { shiftTypes } = useAppDropdowns(facilityId)
  const { data: settings } = useFetch<any>('/api/settings')
  const orgName = settings?.organizationName || settings?.appName || 'Serenity Care Home'
  const [weekStart, setWeekStart] = useState(getInitialWeekStart())
  const [showAddShift, setShowAddShift] = useState<any | null>(null)
  const [showGenerate, setShowGenerate] = useState(false)
  const [showCopy, setShowCopy] = useState(false)
  const [reassignShift, setReassignShift] = useState<any | null>(null)
  const [showPrint, setShowPrint] = useState(false)
  const [draggedShift, setDraggedShift] = useState<any | null>(null)
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), [])

  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: shifts, loading } = useFetch<any[]>(`/api/data?type=shifts&date=${dateKey(weekStart)}${facilityParam}&key=${refreshKey}`)
  const { data: leaves } = useFetch<any[]>(`/api/data?type=leaves&status=APPROVED${facilityParam}`)

  const weekDates: Date[] = []
  const shiftsByDay: Record<string, any[]> = {}
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i)
    weekDates.push(d)
    shiftsByDay[dateKey(d)] = []
  }
  for (const s of (shifts || [])) {
    const key = dateKey(new Date(s.date))
    if (shiftsByDay[key]) shiftsByDay[key].push(s)
  }
  for (const key of Object.keys(shiftsByDay)) {
    shiftsByDay[key].sort((a, b) => a.startTime.localeCompare(b.startTime))
  }

  const today = new Date()
  const isThisWeek = sameDay(weekStart, getInitialWeekStart())
  const coverageByType: Record<string, number> = { DAY: 0, EVENING: 0, NIGHT: 0 }
  for (const s of (shifts || [])) { if (coverageByType[s.shiftType] !== undefined) coverageByType[s.shiftType]++ }

  const handleDragStart = (e: React.DragEvent, shift: any) => {
    setDraggedShift(shift)
    e.dataTransfer.effectAllowed = 'move'
  }
  const handleDragOver = (e: React.DragEvent, dateKey: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(dateKey)
  }
  const handleDrop = async (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault()
    setDragOverDate(null)
    if (!draggedShift) return
    const targetKey = dateKey(targetDate)
    const sourceKey = dateKey(new Date(draggedShift.date))
    if (targetKey === sourceKey) { setDraggedShift(null); return }

    // Check leave conflict
    const leave = isOnLeave(draggedShift.staffId, targetDate, leaves || [])
    if (leave) {
      toast.error(`Cannot move: ${draggedShift.staff?.firstName} is on ${leave.type.toLowerCase()} leave that day`)
      setDraggedShift(null)
      return
    }

    // Check shift conflict
    const targetDayShifts = shiftsByDay[targetKey] || []
    const conflict = targetDayShifts.find(s => s.staffId === draggedShift.staffId)
    if (conflict) {
      toast.error(`Conflict: ${draggedShift.staff?.firstName} already has a ${conflict.shiftType} shift on ${targetDate.toDateString()}`)
      setDraggedShift(null)
      return
    }

    // Move the shift
    try {
      const r = await shiftApi('move', { shiftId: draggedShift.id, newDate: targetDate.toISOString() })
      if (r.success) {
        toast.success(`Shift moved to ${targetDate.toDateString()}`)
        triggerRefresh()
      } else {
        toast.error(r.error || 'Move failed')
      }
    } catch (e: any) { toast.error(e.message) }
    setDraggedShift(null)
  }

  const handleDeleteDay = async (date: Date) => {
    if (!confirm(`Delete all shifts for ${fmtDate(date)}?`)) return
    try {
      await shiftApi('deleteDay', { date: date.toISOString() })
      toast.success('Shifts deleted')
      triggerRefresh()
    } catch (e: any) { toast.error(e.message) }
  }
  const handleDeleteWeek = async () => {
    if (!confirm(`Delete ALL shifts for the week of ${fmtDate(weekStart)}?`)) return
    try {
      await shiftApi('deleteWeek', { startDate: dateKey(weekStart) })
      toast.success('Week cleared')
      triggerRefresh()
    } catch (e: any) { toast.error(e.message) }
  }
  const handleGenerateWeek = async () => {
    try {
      const r = await shiftApi('generateWeek', { startDate: dateKey(weekStart), facilityId })
      if (r.success) { toast.success(r.message); triggerRefresh() }
      else { toast.error(r.error || 'Failed') }
    } catch (e: any) { toast.error(e.message) }
    setShowGenerate(false)
  }
  const handleCopyWeek = async (fromDate: string) => {
    try {
      const r = await shiftApi('copyWeek', { fromDate, toDate: dateKey(weekStart), overwrite: true })
      if (r.success) { toast.success(r.message); triggerRefresh() }
      else { toast.error(r.error || 'Failed') }
    } catch (e: any) { toast.error(e.message) }
    setShowCopy(false)
  }

  if (showPrint) return <PrintSchedule weekStart={weekStart} shifts={shifts || []} staff={staff} orgName={orgName} settings={settings} onClose={() => setShowPrint(false)} />

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(getInitialWeekStart())} disabled={isThisWeek}>This Week</Button>
          <Button variant="outline" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight className="h-4 w-4" /></Button>
          <span className="font-semibold text-sm ml-2">{fmtDate(weekStart, { month: 'short', day: 'numeric' })} – {fmtDate(addDays(weekStart, 6), { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => setShowGenerate(true)}><CalendarPlus className="h-3 w-3 mr-1" /> Auto-Generate</Button>
          <Button size="sm" variant="outline" onClick={() => setShowCopy(true)}><Copy className="h-3 w-3 mr-1" /> Copy Week</Button>
          <Button size="sm" variant="outline" onClick={() => setShowPrint(true)}><Printer className="h-3 w-3 mr-1" /> Print</Button>
          <Button size="sm" variant="outline" onClick={handleDeleteWeek} className="text-red-600"><Trash2 className="h-3 w-3 mr-1" /> Clear</Button>
        </div>
      </div>

      {/* Coverage */}
      <div className="grid grid-cols-3 gap-2">
        {shiftTypes.map(st => (
          <Card key={st.type}><CardContent className="p-3 flex items-center justify-between">
            <div>
              <div className="text-xs text-muted-foreground">{st.type}</div>
              <div className={`text-lg font-bold ${coverageByType[st.type] === 0 ? 'text-red-600' : ''}`}>{coverageByType[st.type]} shifts</div>
              <div className="text-xs text-muted-foreground">{st.start}–{st.end}</div>
            </div>
            <div className={`p-2 rounded-lg ${shiftColor(st.type)}`}><Clock className="h-5 w-5" /></div>
          </CardContent></Card>
        ))}
      </div>

      {/* Tip */}
      <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 flex items-center gap-2">
        <AlertTriangle className="h-3 w-3" /> Tip: Drag shift cards between days to move them. Conflicts (double-booking, leave) are automatically checked.
      </div>

      {/* Week grid */}
      {loading ? <Skeleton className="h-96" /> : (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
          {weekDates.map((date, i) => {
            const key = dateKey(date)
            const dayShifts = shiftsByDay[key] || []
            const isToday = sameDay(date, today)
            const isDragOver = dragOverDate === key
            return (
              <div
                key={i}
                className={`rounded-lg border min-h-[140px] ${isToday ? 'border-primary ring-1 ring-primary/20' : 'border-border'} ${isDragOver ? 'ring-2 ring-primary bg-primary/5' : ''}`}
                onDragOver={(e) => handleDragOver(e, key)}
                onDragLeave={() => setDragOverDate(null)}
                onDrop={(e) => handleDrop(e, date)}
              >
                <div className={`p-2 border-b ${isToday ? 'bg-primary/5' : 'bg-muted/30'}`}>
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-medium">{DAY_NAMES[date.getDay()]}</div>
                      <div className={`text-sm font-bold ${isToday ? 'text-primary' : ''}`}>{date.getDate()}</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Button size="sm" variant="ghost" className="h-8 w-8 p-0" title="Add shift" onClick={() => setShowAddShift({ date: date.toISOString() })}><Plus className="h-4 w-4" /></Button>
                      {dayShifts.length > 0 && <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500" title="Clear day" onClick={() => handleDeleteDay(date)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>
                </div>
                <div className="p-1.5 space-y-1.5">
                  {dayShifts.length === 0 && <p className="text-xs text-muted-foreground text-center py-4 italic">No shifts</p>}
                  {dayShifts.map(s => {
                    const stType = shiftTypes.find(st => st.type === s.shiftType) || shiftTypes[0] || { type: s.shiftType, start: s.startTime, end: s.endTime }
                    const leave = isOnLeave(s.staffId, date, leaves || [])
                    return (
                      <div
                        key={s.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, s)}
                        className={`rounded-md border p-1.5 text-xs cursor-grab active:cursor-grabbing hover:shadow-sm transition-shadow ${shiftColor(s.shiftType)} ${draggedShift?.id === s.id ? 'opacity-50' : ''}`}
                        onClick={() => setReassignShift(s)}
                        title="Drag to move • Click to reassign"
                      >
                        <div className="font-medium truncate">{s.staff?.firstName} {s.staff?.lastName}</div>
                        <div className="flex items-center gap-1 mt-0.5"><Clock className="h-2.5 w-2.5" />{s.startTime}–{s.endTime}</div>
                        <div className="text-[10px] opacity-80 mt-0.5">{s.staff?.code} • {s.staff?.role.replace(/_/g, ' ')}</div>
                        {leave && <div className="text-[10px] mt-0.5 flex items-center gap-0.5"><CalendarOff className="h-2.5 w-2.5" /> ON LEAVE</div>}
                      </div>
                    )
                  })}
                  {/* Show staff who are on approved leave today but have no shift (informational) */}
                  {(staff || []).filter(s => s.active && isOnLeave(s.id, date, leaves || []) && !dayShifts.some(sh => sh.staffId === s.id)).slice(0, 3).map(s => {
                    const leave = isOnLeave(s.id, date, leaves || [])!
                    return (
                      <div
                        key={`leave-${s.id}`}
                        className="rounded-md border border-amber-200 bg-amber-50 p-1.5 text-xs text-amber-700"
                        title={`${leave.type} leave until ${new Date(leave.endDate).toDateString()}`}
                      >
                        <div className="font-medium truncate flex items-center gap-1"><CalendarOff className="h-2.5 w-2.5" /> {s.firstName} {s.lastName}</div>
                        <div className="text-[10px] mt-0.5">On {leave.type.toLowerCase()} leave</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAddShift && <AddShiftDialog date={showAddShift.date} staff={staff} leaves={leaves || []} facilityId={facilityId} onClose={() => setShowAddShift(null)} onSaved={() => { setShowAddShift(null); triggerRefresh() }} />}
      {showGenerate && <ConfirmDialog title="Auto-Generate Week" message={`Generate shifts for the week of ${fmtDate(weekStart)}? Creates Day + Night shifts for all active staff. Days with existing shifts are skipped. Staff on approved leave are automatically skipped.`} confirmLabel="Generate" onConfirm={handleGenerateWeek} onClose={() => setShowGenerate(false)} />}
      {showCopy && <CopyWeekDialog targetWeek={weekStart} onClose={() => setShowCopy(false)} onCopy={handleCopyWeek} />}
      {reassignShift && <ReassignDialog shift={reassignShift} staff={staff} onClose={() => setReassignShift(null)} onReassign={async (shiftId, newStaffId) => { try { const r = await shiftApi('reassign', { shiftId, newStaffId }); if (r.success) { toast.success('Reassigned'); setReassignShift(null); triggerRefresh() } else { toast.error(r.error) } } catch (e: any) { toast.error(e.message) } }} />}
    </div>
  )
}

// ============ PRINT SCHEDULE ============
function PrintSchedule({ weekStart, shifts, staff, orgName, settings, onClose }: { weekStart: Date; shifts: any[]; staff: any[]; orgName: string; settings?: any; onClose: () => void }) {
  useEscClose(onClose)
  const weekDates: Date[] = []
  const shiftsByDay: Record<string, any[]> = {}
  for (let i = 0; i < 7; i++) {
    const d = addDays(weekStart, i)
    weekDates.push(d)
    shiftsByDay[dateKey(d)] = []
  }
  for (const s of shifts) {
    const key = dateKey(new Date(s.date))
    if (shiftsByDay[key]) shiftsByDay[key].push(s)
  }
  for (const key of Object.keys(shiftsByDay)) shiftsByDay[key].sort((a, b) => a.startTime.localeCompare(b.startTime))

  // Org contact info from settings
  const orgPhone = settings?.organizationPhone || settings?.facilityPhone || ''
  const orgEmail = settings?.organizationEmail || settings?.facilityEmail || ''
  const orgAddress = settings?.organizationAddress || ''
  const orgAddress2 = settings?.organizationAddress2 || ''
  const orgCity = settings?.organizationCity || ''
  const orgState = settings?.organizationState || ''
  const orgPostal = settings?.organizationPostalCode || ''
  const orgCountry = settings?.organizationCountry || ''
  const orgLogoUrl = settings?.organizationLogoUrl || settings?.appLogoUrl || ''
  const primaryColor = settings?.primaryColor || settings?.appPrimaryColor || '#e11d48'

  const addressLines = [
    orgAddress,
    orgAddress2,
    [orgCity, orgState, orgPostal].filter(Boolean).join(', '),
    orgCountry
  ].filter(Boolean)

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=1000,height=700')
    if (!w) { toast.error('Please allow popups'); return }
    const rows = weekDates.map(d => {
      const key = dateKey(d)
      const dayShifts = (shiftsByDay[key] || []).map(s => `<div class="shift ${s.shiftType}">${s.staff?.firstName} ${s.staff?.lastName} (${s.startTime}–${s.endTime})</div>`).join('')
      return `<tr><td class="day-header">${DAY_NAMES[d.getDay()]} ${d.getDate()}</td><td class="shifts">${dayShifts || '<span class="none">No shifts</span>'}</td></tr>`
    }).join('')
    w.document.write(`<html><head><title>Shift Schedule — ${fmtDate(weekStart)}</title><style>
      *{margin:0;padding:0;box-sizing:border-box} body{font-family:Arial,sans-serif;padding:30px;color:#1a1a1a}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:3px solid ${primaryColor};padding-bottom:15px}
      .org-name{font-size:22px;font-weight:bold;color:${primaryColor}}
      .org-info{font-size:11px;color:#666;margin-top:4px;line-height:1.5}
      .schedule-title{text-align:right}
      .schedule-title h1{font-size:20px;margin-bottom:5px;color:#333}
      .schedule-title .subtitle{font-size:12px;color:#666}
      table{width:100%;border-collapse:collapse;margin-top:10px} th{background:#f0f0f0;padding:8px;text-align:left;font-size:11px;border:1px solid #ddd}
      td{padding:8px;border:1px solid #ddd;vertical-align:top;font-size:12px}
      .day-header{font-weight:bold;width:120px;background:#fafafa}
      .shift{padding:3px 6px;margin:2px 0;border-radius:3px;font-size:11px}
      .DAY{background:#fef3c7;color:#92400e} .EVENING{background:#ede9fe;color:#5b21b6} .NIGHT{background:#1e293b;color:#fff}
      .none{color:#999;font-style:italic;font-size:11px}
      .footer{margin-top:20px;font-size:10px;color:#999;text-align:center;border-top:1px solid #eee;padding-top:10px}
      @media print{body{padding:15px}}
    </style></head><body>
      <div class="header">
        <div>
          ${orgLogoUrl ? `<img src="${orgLogoUrl}" alt="${orgName}" style="max-height:50px; max-width:180px; object-fit:contain;" />` : `<div class="org-name">${orgName}</div>`}
          ${addressLines.length > 0 ? `<div class="org-info">${addressLines.join('<br/>')}</div>` : ''}
          <div class="org-info">
            ${orgPhone ? `Tel: ${orgPhone}` : ''}
            ${orgEmail ? `${orgPhone ? ' | ' : ''}Email: ${orgEmail}` : ''}
          </div>
        </div>
        <div class="schedule-title">
          <h1>Shift Schedule</h1>
          <div class="subtitle">Week of ${fmtDate(weekStart)} to ${fmtDate(addDays(weekStart, 6))}</div>
        </div>
      </div>
      <table><thead><tr><th>Day</th><th>Shifts</th></tr></thead><tbody>${rows}</tbody></table>
      <div class="footer">
        <p>Printed on ${new Date().toLocaleString()} by ${orgName}</p>
        <p>This schedule is for internal staff use only.</p>
      </div>
    </body></html>`)
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 300)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Print Preview — Week of {fmtDate(weekStart)}</h3>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onClose}><X className="h-3 w-3 mr-1" /> Close</Button>
          <Button size="sm" onClick={handlePrint}><Printer className="h-3 w-3 mr-1" /> Print / Save PDF</Button>
        </div>
      </div>
      <div className="text-xs text-muted-foreground bg-muted/30 border rounded p-2">
        <span className="font-medium">{orgName}</span>
        {addressLines.length > 0 && <span> • {addressLines.join(', ')}</span>}
        {orgPhone && <span> • Tel: {orgPhone}</span>}
        {orgEmail && <span> • {orgEmail}</span>}
      </div>
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr><th className="text-left p-2 font-medium w-32">Day</th><th className="text-left p-2 font-medium">Shifts</th></tr>
            </thead>
            <tbody>
              {weekDates.map((d, i) => {
                const key = dateKey(d)
                const dayShifts = (shiftsByDay[key] || []).sort((a, b) => a.startTime.localeCompare(b.startTime))
                return (
                  <tr key={i} className="border-t">
                    <td className="p-2 font-medium">{DAY_NAMES[d.getDay()]} {d.getDate()}</td>
                    <td className="p-2 space-y-1">
                      {dayShifts.length === 0 ? <span className="text-xs text-muted-foreground italic">No shifts</span> : dayShifts.map(s => {
                        return <div key={s.id} className={`inline-block mr-2 px-2 py-0.5 rounded text-xs ${shiftColor(s.shiftType)}`}>{s.staff?.firstName} {s.staff?.lastName} — {s.shiftType} ({s.startTime}–{s.endTime})</div>
                      })}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ LEAVE VIEW ============
function LeaveView({ staff, facilityId }: { staff: any[]; facilityId?: string }) {
  const { leaveTypes } = useAppDropdowns(facilityId)
  const [showRequest, setShowRequest] = useState(false)
  const [filter, setFilter] = useState('PENDING')
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: leaves, loading, refetch } = useFetch<any[]>(`/api/data?type=leaves${filter !== 'ALL' ? `&status=${filter}` : ''}${facilityParam}`)
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const [refreshKey, setRefreshKey] = useState(0)
  const triggerRefresh = useCallback(() => { setRefreshKey(k => k + 1); refetch() }, [refetch])

  if (loading) return <Skeleton className="h-96" />

  const isManager = currentUser?.user?.role === 'OWNER' || currentUser?.user?.role === 'MANAGER'

  const handleApprove = async (leave: any, approved: boolean) => {
    // Pre-confirm: if approving, warn about any existing shifts that will be auto-deleted
    if (approved) {
      try {
        // Quick check via the data API for existing shifts for this staff in the leave range
        const leaveStart = new Date(leave.startDate)
        const leaveEnd = new Date(leave.endDate)
        // We can't easily query by date range from the frontend list endpoint, so we just
        // confirm with the user that any existing shifts will be removed.
        const confirmed = confirm(
          `Approve ${leave.type.toLowerCase()} leave for ${leave.staff?.firstName || ''} ${leave.staff?.lastName || ''} from ${leaveStart.toDateString()} to ${leaveEnd.toDateString()}?\n\n` +
          `⚠ Any existing shifts for this staff during the leave period will be automatically removed to prevent conflicts.`
        )
        if (!confirmed) return
      } catch {
        // If anything fails, fall through to the actual API call
      }
    }
    try {
      const r = await fetch(`/api/data?type=leaves&id=${leave.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: approved ? 'APPROVED' : 'REJECTED',
          reviewedById: currentUser?.user?.id,
          reviewedByName: currentUser?.user?.name,
          reviewedAt: new Date().toISOString(),
        }),
      }).then(r => r.json())
      if (!r || r.error) {
        toast.error(r?.error || 'Failed to update leave')
        return
      }
      if (approved && r.autoDeletedShifts > 0) {
        toast.success(`Leave approved — ${r.autoDeletedShifts} conflicting shift(s) auto-removed`)
      } else {
        toast.success(`Leave ${approved ? 'approved' : 'rejected'}`)
      }
      triggerRefresh()
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      {/* Leave Balance Summary — shows annual/sick leave used vs. remaining per staff */}
      <Card className="border-blue-200">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <CalendarOff className="h-4 w-4" /> Leave Balances (Current Year)
          </CardTitle>
          <CardDescription className="text-xs">
            Malaysian Employment Act entitlements — Annual: 8 days (&lt;1yr), 12 (1-2yr), 16 (&gt;2yr). Sick: 14 days (&lt;2yr), 18 (&gt;2yr).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LeaveBalanceTable staff={staff} leaves={leaves || []} />
        </CardContent>
      </Card>

      <div className="flex justify-between items-center">
        <div className="flex gap-1">
          {['PENDING', 'APPROVED', 'REJECTED', 'ALL'].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-2.5 py-1 rounded-full text-xs font-medium border ${filter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'}`}>{s}</button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowRequest(true)}><Plane className="h-3 w-3 mr-1" /> Request Leave</Button>
      </div>

      <div className="grid gap-2">
        {(leaves || []).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No leave requests</p>}
        {(leaves || []).map(l => (
          <Card key={l.id}>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{l.type}</Badge>
                    <StatusBadge status={l.status} />
                    <span className="font-medium text-sm">{l.staff?.firstName} {l.staff?.lastName}</span>
                    {l.staff?.code && <span className="text-xs font-mono text-primary">{l.staff.code}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {fmtDate(l.startDate)} – {fmtDate(l.endDate)}
                    <span className="ml-2">({Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1} days)</span>
                  </div>
                  {l.reason && <p className="text-sm mt-1 italic">"{l.reason}"</p>}
                  {l.reviewedByName && <p className="text-xs text-muted-foreground mt-1">Reviewed by {l.reviewedByName} on {l.reviewedAt ? fmtDate(l.reviewedAt) : '—'}</p>}
                  {l.reviewNotes && <p className="text-xs text-muted-foreground mt-0.5">Notes: {l.reviewNotes}</p>}
                </div>
                {l.status === 'PENDING' && isManager && (
                  <div className="flex flex-wrap gap-1 flex-shrink-0">
                    <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => handleApprove(l, true)}><Check className="h-3 w-3 mr-1" /> Approve</Button>
                    <Button size="sm" variant="outline" className="text-red-600 border-red-200" onClick={() => handleApprove(l, false)}><XCircle className="h-3 w-3 mr-1" /> Reject</Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showRequest && <RequestLeaveDialog staff={staff} onClose={() => setShowRequest(false)} onSaved={() => { setShowRequest(false); triggerRefresh() }} />}
    </div>
  )
}

function RequestLeaveDialog({ staff, onClose, onSaved }: { staff: any[]; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const { leaveTypes } = useAppDropdowns(undefined)
  const [form, setForm] = useState<any>({ staffId: staff[0]?.id || '', type: 'ANNUAL', startDate: '', endDate: '', reason: '' })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.staffId || !form.startDate || !form.endDate) { toast.error('Staff, start date, and end date required'); return }
    if (new Date(form.endDate) < new Date(form.startDate)) { toast.error('End date must be after start date'); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=leaves', {
        staffId: form.staffId,
        type: form.type,
        startDate: new Date(form.startDate).toISOString(),
        endDate: new Date(form.endDate).toISOString(),
        status: 'PENDING',
        reason: form.reason || null,
      })
      toast.success('Leave request submitted')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><Plane className="h-4 w-4" /> Request Leave</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Staff Member *</label>
            <select className="w-full border rounded px-2 py-1.5" value={form.staffId} onChange={e => setForm({ ...form, staffId: e.target.value })}>
              {staff.filter((s: any) => s.active).map((s: any) => <option key={s.id} value={s.id}>{s.code} {s.firstName} {s.lastName} ({s.role.replace(/_/g, ' ')})</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Leave Type *</label>
            <select className="w-full border rounded px-2 py-1.5" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
              {(leaveTypes.length > 0 ? leaveTypes : ['ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'OTHER']).map(t => <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date *</label><Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} /></div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">End Date *</label><Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} /></div>
          </div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Reason</label><textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} placeholder="e.g., Family vacation, medical appointment..." /></div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Submitting...' : 'Submit Request'}</Button>
        </div>
      </div>
    </div>
  )
}

// ============ ADD SHIFT DIALOG ============
function AddShiftDialog({ date, staff, leaves, facilityId, onClose, onSaved }: { date: string; staff: any[]; leaves: any[]; facilityId?: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const { shiftTypes } = useAppDropdowns(facilityId)
  const [staffId, setStaffId] = useState(staff[0]?.id || '')
  const [shiftType, setShiftType] = useState(shiftTypes[0]?.type || 'DAY')
  const [startTime, setStartTime] = useState(shiftTypes[0]?.start || '07:00')
  const [endTime, setEndTime] = useState(shiftTypes[0]?.end || '15:00')
  const [saving, setSaving] = useState(false)

  // Check if selected staff is on approved leave on this date
  const shiftDate = new Date(date)
  const selectedLeave = isOnLeave(staffId, shiftDate, leaves)
  // Also flag staff who are on leave so we can mark them in the dropdown
  const staffOnLeave: Record<string, any> = {}
  for (const s of staff) {
    const l = isOnLeave(s.id, shiftDate, leaves)
    if (l) staffOnLeave[s.id] = l
  }

  const onTypeChange = (type: string) => { setShiftType(type); const st = shiftTypes.find(s => s.type === type); if (st) { setStartTime(st.start); setEndTime(st.end) } }
  const submit = async () => {
    if (selectedLeave) {
      toast.error(`${staff.find(s => s.id === staffId)?.firstName} is on approved leave on ${fmtDate(date)} — cannot schedule shift`)
      return
    }
    setSaving(true)
    try {
      await apiPost('/api/data?type=shifts', { staffId, date: new Date(date).toISOString(), startTime, endTime, shiftType })
      toast.success('Shift added')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><CalendarPlus className="h-4 w-4" /> Add Shift — {fmtDate(date)}</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Staff Member *</label>
            <select className="w-full border rounded px-2 py-1.5" value={staffId} onChange={e => setStaffId(e.target.value)}>
              {staff.filter((s: any) => s.active).map((s: any) => {
                const onLeave = staffOnLeave[s.id]
                return (
                  <option key={s.id} value={s.id}>
                    {s.code} {s.firstName} {s.lastName} ({s.role.replace(/_/g, ' ')}){onLeave ? ` — ⚠ ON LEAVE (${onLeave.type.toLowerCase()})` : ''}
                  </option>
                )
              })}
            </select>
          </div>

          {selectedLeave && (
            <div className="rounded-md bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-800 flex items-start gap-2">
              <span className="text-base leading-none">⚠</span>
              <div>
                <div className="font-semibold">On approved {selectedLeave.type.toLowerCase()} leave</div>
                <div>{new Date(selectedLeave.startDate).toDateString()} → {new Date(selectedLeave.endDate).toDateString()}</div>
                <div className="mt-1">Shifts cannot be scheduled during approved leave. Pick a different staff or date.</div>
              </div>
            </div>
          )}

          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Shift Type</label>
            <div className="grid grid-cols-3 gap-1">
              {shiftTypes.map(st => <button key={st.type} onClick={() => onTypeChange(st.type)} className={`px-2 py-1.5 rounded-lg border text-xs font-medium ${shiftType === st.type ? shiftColor(st.type) + ' border-current' : 'border-border'}`}>{st.type}</button>)}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Start</label><Input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} /></div>
            <div><label className="text-xs font-medium text-muted-foreground mb-1 block">End</label><Input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} /></div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !staffId || !!selectedLeave}>{saving ? 'Adding...' : 'Add Shift'}</Button>
        </div>
      </div>
    </div>
  )
}

// ============ REASSIGN DIALOG ============
function ReassignDialog({ shift, staff, onClose, onReassign }: { shift: any; staff: any[]; onClose: () => void; onReassign: (shiftId: string, newStaffId: string) => void }) {
  useEscClose(onClose)
  const [newStaffId, setNewStaffId] = useState('')
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><UserCog className="h-4 w-4" /> Reassign Shift</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="rounded-md bg-muted/50 p-3">
            <div className="font-medium">{shift.staff?.firstName} {shift.staff?.lastName}</div>
            <div className="text-xs text-muted-foreground">{shift.shiftType} • {shift.startTime}–{shift.endTime} • {fmtDate(shift.date)}</div>
          </div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Reassign to *</label>
            <select className="w-full border rounded px-2 py-1.5" value={newStaffId} onChange={e => setNewStaffId(e.target.value)}>
              <option value="">— Select staff —</option>
              {staff.filter((s: any) => s.active && s.id !== shift.staffId).map((s: any) => <option key={s.id} value={s.id}>{s.code} {s.firstName} {s.lastName} ({s.role.replace(/_/g, ' ')})</option>)}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">💡 You can also drag this shift card to a different day to move it.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onReassign(shift.id, newStaffId)} disabled={!newStaffId}>Reassign</Button>
        </div>
      </div>
    </div>
  )
}

// ============ COPY WEEK DIALOG ============
function CopyWeekDialog({ targetWeek, onClose, onCopy }: { targetWeek: Date; onClose: () => void; onCopy: (fromDate: string) => void }) {
  useEscClose(onClose)
  const [fromDate, setFromDate] = useState('')
  const prevWeek = new Date(targetWeek); prevWeek.setDate(prevWeek.getDate() - 7)
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex justify-between items-center border-b p-4"><h3 className="font-semibold flex items-center gap-2"><Copy className="h-4 w-4" /> Copy Week</h3><Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button></div>
        <div className="p-4 space-y-3 text-sm">
          <div className="rounded-md bg-muted/50 p-3"><div className="text-xs text-muted-foreground">Copy shifts TO:</div><div className="font-medium">Week of {fmtDate(targetWeek)}</div></div>
          <div><label className="text-xs font-medium text-muted-foreground mb-1 block">Copy FROM week starting: *</label><Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} /></div>
          <Button size="sm" variant="outline" onClick={() => setFromDate(prevWeek.toISOString().slice(0, 10))}>Use last week ({fmtDate(prevWeek, { month: 'short', day: 'numeric' })})</Button>
          <p className="text-xs text-muted-foreground">This will overwrite any existing shifts in the target week.</p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={() => onCopy(new Date(fromDate).toISOString())} disabled={!fromDate}>Copy Week</Button></div>
      </div>
    </div>
  )
}

// ============ CONFIRM DIALOG ============
function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: any) {
  useEscClose(onClose)
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex justify-between items-center border-b p-4"><h3 className="font-semibold">{title}</h3><Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button></div>
        <div className="p-4 text-sm text-muted-foreground">{message}</div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t"><Button variant="outline" onClick={onClose}>Cancel</Button><Button onClick={onConfirm}>{confirmLabel}</Button></div>
      </div>
    </div>
  )
}

// ============ STAFF DIRECTORY ============
function StaffDirectory({ staff, facilityId, refetchStaff }: { staff: any[]; facilityId?: string; refetchStaff: () => void }) {
  const [search, setSearch] = useState('')
  const [showAddStaff, setShowAddStaff] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null)
  const triggerRefresh = useCallback(() => setRefreshKey(k => k + 1), [])

  const filtered = staff.filter(s => { if (!search) return true; const q = search.toLowerCase(); return `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) || s.role.toLowerCase().includes(q) || (s.email || '').toLowerCase().includes(q) })
  const byRole: Record<string, any[]> = {}
  for (const s of filtered) { if (!byRole[s.role]) byRole[s.role] = []; byRole[s.role].push(s) }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <StandardSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search staff by name, role, or email..."
          totalCount={staff.length}
          filteredCount={filtered.length}
        />
        <Button onClick={() => setShowAddStaff(true)} className="whitespace-nowrap">
          <Plus className="h-4 w-4 mr-1" /> Add Staff
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {Object.entries(byRole).map(([role, list]) => (
          <Card key={role}><CardHeader className="pb-2"><CardTitle className="text-sm flex items-center justify-between"><span>{role.replace(/_/g, ' ')}s</span><Badge variant="outline">{list.length}</Badge></CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {list.map(s => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSelectedStaffId(s.id)}
                  className="w-full flex items-center gap-2 text-sm rounded-md p-1 hover:bg-primary/5 hover:shadow-sm transition-all cursor-pointer text-left border border-transparent hover:border-primary/20"
                  title={`Click to view ${s.firstName}'s details, expenses, shifts, and leave history`}
                >
                  <Avatar className="h-8 w-8"><AvatarFallback className="bg-violet-100 text-violet-700 text-xs">{initials(s.firstName, s.lastName)}</AvatarFallback></Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="truncate hover:text-primary transition-colors">{s.code && <span className="text-xs font-mono text-primary mr-1">{s.code}</span>}{s.firstName} {s.lastName}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">{s.phone && <span className="flex items-center gap-0.5"><Phone className="h-3 w-3" /> {s.phone}</span>}</div>
                  </div>
                  {!s.active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                </button>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
      {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No staff found</p>}
      {showAddStaff && <AddStaffDialog key={refreshKey} facilityId={facilityId} onClose={() => setShowAddStaff(false)} onSaved={() => { setShowAddStaff(false); triggerRefresh() }} />}
      {selectedStaffId && (
        <StaffDetailDialog
          staffId={selectedStaffId}
          staffList={staff}
          facilityId={facilityId}
          onClose={() => setSelectedStaffId(null)}
          onStaffUpdated={refetchStaff}
        />
      )}
    </div>
  )
}

// ============ STAFF DETAIL DIALOG ============
// Opens when a staff name is clicked in the directory. Shows the staff's
// profile, expenses they paid (with reimbursement status), shifts, and leave history.
function StaffDetailDialog({ staffId, staffList, facilityId, onClose, onStaffUpdated }: {
  staffId: string
  staffList: any[]
  facilityId?: string
  onClose: () => void
  onStaffUpdated?: () => void
}) {
  useEscClose(onClose)
  const [tab, setTab] = useState<string>('profile')
  const [showEdit, setShowEdit] = useState(false)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''

  // Find the staff from the passed list (already loaded by parent)
  const staff = staffList.find(s => s.id === staffId)

  // Fetch the org's enabled custom tabs for the staff module
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const orgId = currentUser?.user?.organizationId
  const { data: staffCustomTabs } = useFetch<any[]>(orgId ? `/api/org-custom-tabs?orgId=${orgId}&enabledOnly=true&module=staff` : null)

  // Fetch expenses paid by this staff
  const { data: expenses, loading: expLoading } = useFetch<any[]>(
    `/api/data?type=expenses&paidByStaffId=${staffId}${facilityParam}`
  )

  // Fetch this staff's shifts (upcoming + recent)
  const { data: shifts, loading: shiftsLoading } = useFetch<any[]>(
    `/api/data?type=shifts&staffId=${staffId}${facilityParam}`
  )

  // Fetch this staff's leave records
  const { data: leaves, loading: leavesLoading } = useFetch<any[]>(
    `/api/data?type=leaves&staffId=${staffId}${facilityParam}`
  )

  if (!staff) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <div className="bg-background rounded-lg p-6 max-w-md">
          <p className="text-sm text-muted-foreground">Staff member not found.</p>
          <Button onClick={onClose} className="mt-4">Close</Button>
        </div>
      </div>
    )
  }

  // Expense summary calculations
  const allExpenses = expenses || []
  const totalExpenses = allExpenses.reduce((s, e) => s + e.amount, 0)
  const pendingReimb = allExpenses.filter(e => e.reimbursementStatus === 'PENDING').reduce((s, e) => s + e.amount, 0)
  const approvedReimb = allExpenses.filter(e => e.reimbursementStatus === 'APPROVED').reduce((s, e) => s + e.amount, 0)
  const reimbursedTotal = allExpenses.filter(e => e.reimbursementStatus === 'REIMBURSED').reduce((s, e) => s + e.amount, 0)
  const notReimbursable = allExpenses.filter(e => !e.reimbursementStatus).reduce((s, e) => s + e.amount, 0)

  // Shift summary
  const allShifts = shifts || []
  const now = new Date()
  const upcomingShifts = allShifts.filter(s => new Date(s.date) >= new Date(now.getFullYear(), now.getMonth(), now.getDate())).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const pastShifts = allShifts.filter(s => new Date(s.date) < new Date(now.getFullYear(), now.getMonth(), now.getDate())).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  // Leave summary
  const allLeaves = leaves || []
  const pendingLeaves = allLeaves.filter(l => l.status === 'PENDING')
  const approvedLeaves = allLeaves.filter(l => l.status === 'APPROVED')

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-3xl my-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2 border-b p-4">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar className="h-12 w-12 flex-shrink-0">
              <AvatarFallback className="bg-violet-100 text-violet-700">{initials(staff.firstName, staff.lastName)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h3 className="font-semibold text-lg flex items-center gap-2 flex-wrap">
                {staff.firstName} {staff.lastName}
                {!staff.active && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
              </h3>
              <div className="text-sm text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1">
                {staff.code && <span className="font-mono text-primary whitespace-nowrap">{staff.code}</span>}
                <span className="whitespace-nowrap">{staff.role?.replace(/_/g, ' ')}</span>
                {staff.email && <span className="flex items-center gap-0.5 whitespace-nowrap"><Mail className="h-3 w-3" /> {staff.email}</span>}
              </div>
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>

        {/* Tabs */}
        <div className="border-b px-4 flex gap-1 overflow-x-auto scrollbar-thin">
          {[
            { id: 'profile', label: 'Profile', icon: UserCog },
            { id: 'expenses', label: `Expenses (${allExpenses.length})`, icon: Receipt },
            { id: 'shifts', label: `Shifts (${allShifts.length})`, icon: Calendar },
            { id: 'leave', label: `Leave (${allLeaves.length})`, icon: Plane },
            ...(staffCustomTabs || []).map((t: any) => ({ id: `custom_${t.globalTabId}`, label: t.label, icon: FileText })),
          ].map(t => {
            const Icon = t.icon
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id as any)}
                className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-1.5 flex-shrink-0 ${
                  tab === t.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            )
          })}
        </div>

        {/* Content */}
        <div className="p-4 max-h-[60vh] overflow-y-auto">
          {/* PROFILE TAB */}
          {tab === 'profile' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-md border p-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Contact</div>
                  <div className="space-y-1 text-sm">
                    {staff.phone && <div className="flex items-center gap-2"><Phone className="h-3 w-3 text-muted-foreground" /> {staff.phone}</div>}
                    {staff.email && <div className="flex items-center gap-2"><Mail className="h-3 w-3 text-muted-foreground" /> {staff.email}</div>}
                    {!staff.phone && !staff.email && <span className="text-muted-foreground text-xs">No contact info</span>}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs font-medium text-muted-foreground uppercase mb-1">Employment</div>
                  <div className="space-y-1 text-sm">
                    <div><span className="text-muted-foreground">Role:</span> <span className="font-medium">{staff.role?.replace(/_/g, ' ')}</span></div>
                    <div><span className="text-muted-foreground">Hired:</span> <span className="font-medium">{fmtDate(staff.hireDate)}</span></div>
                    <div><span className="text-muted-foreground">Status:</span> <span className={`font-medium ${staff.active ? 'text-emerald-600' : 'text-red-600'}`}>{staff.active ? 'Active' : 'Inactive'}</span></div>
                  </div>
                </div>
              </div>

              {/* Payroll info card */}
              <div className="rounded-md border p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase">Payroll Info</div>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowEdit(true)}>
                    <UserCog className="h-3 w-3 mr-1" /> Edit
                  </Button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  <div>
                    <span className="text-muted-foreground">Basic Salary:</span>{' '}
                    <span className="font-medium">{staff.basicSalary ? fmtMoney(staff.basicSalary) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">EPF No:</span>{' '}
                    <span className="font-medium">{staff.epfNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">SOCSO No:</span>{' '}
                    <span className="font-medium">{staff.socsoNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tax No:</span>{' '}
                    <span className="font-medium">{staff.taxNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Bank:</span>{' '}
                    <span className="font-medium">{staff.bankName || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Account:</span>{' '}
                    <span className="font-medium font-mono">{staff.bankAccount || '—'}</span>
                  </div>
                </div>
                {!staff.basicSalary && (
                  <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mt-2">
                    ⚠ No basic salary set — payroll cannot be generated for this staff. Click Edit to set it.
                  </div>
                )}
              </div>

              {/* Quick stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div className="rounded-md border p-2 text-center">
                  <div className="text-xs text-muted-foreground">Total Expenses</div>
                  <div className="text-lg font-bold">{fmtMoney(totalExpenses)}</div>
                  <div className="text-[10px] text-muted-foreground">{allExpenses.length} records</div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="text-xs text-muted-foreground">Pending Reimb.</div>
                  <div className="text-lg font-bold text-amber-600">{fmtMoney(pendingReimb)}</div>
                  <div className="text-[10px] text-muted-foreground">{allExpenses.filter(e => e.reimbursementStatus === 'PENDING').length} pending</div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="text-xs text-muted-foreground">Upcoming Shifts</div>
                  <div className="text-lg font-bold text-blue-600">{upcomingShifts.length}</div>
                  <div className="text-[10px] text-muted-foreground">next 30 days</div>
                </div>
                <div className="rounded-md border p-2 text-center">
                  <div className="text-xs text-muted-foreground">Leave Days</div>
                  <div className="text-lg font-bold text-purple-600">{approvedLeaves.length}</div>
                  <div className="text-[10px] text-muted-foreground">{pendingLeaves.length} pending</div>
                </div>
              </div>
            </div>
          )}

          {/* EXPENSES TAB */}
          {tab === 'expenses' && (
            <div className="space-y-3">
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="rounded-md border p-2 bg-muted/30">
                  <div className="text-muted-foreground">Total</div>
                  <div className="font-bold text-sm">{fmtMoney(totalExpenses)}</div>
                </div>
                <div className="rounded-md border p-2 bg-amber-50/50">
                  <div className="text-amber-700">Pending</div>
                  <div className="font-bold text-sm text-amber-700">{fmtMoney(pendingReimb)}</div>
                </div>
                <div className="rounded-md border p-2 bg-sky-50/50">
                  <div className="text-sky-700">Approved</div>
                  <div className="font-bold text-sm text-sky-700">{fmtMoney(approvedReimb)}</div>
                </div>
                <div className="rounded-md border p-2 bg-emerald-50/50">
                  <div className="text-emerald-700">Reimbursed</div>
                  <div className="font-bold text-sm text-emerald-700">{fmtMoney(reimbursedTotal)}</div>
                </div>
              </div>

              {expLoading ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Loading expenses...</div>
              ) : allExpenses.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Receipt className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No expenses recorded for this staff member.
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50 sticky top-0">
                      <tr>
                        <th className="text-left p-2 font-medium">Date</th>
                        <th className="text-left p-2 font-medium">Description</th>
                        <th className="text-left p-2 font-medium">Category</th>
                        <th className="text-left p-2 font-medium">Vendor</th>
                        <th className="text-right p-2 font-medium">Amount</th>
                        <th className="text-center p-2 font-medium">Reimbursement</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allExpenses.slice(0, 100).map(e => (
                        <tr key={e.id} className="border-t hover:bg-muted/30">
                          <td className="p-2 whitespace-nowrap">{fmtDate(e.date)}</td>
                          <td className="p-2 max-w-48 truncate" title={e.description}>{e.description}</td>
                          <td className="p-2"><Badge variant="outline" className="text-[10px]">{e.category?.replace(/_/g, ' ')}</Badge></td>
                          <td className="p-2 text-muted-foreground">{e.vendor?.name || e.vendorName || '—'}</td>
                          <td className="p-2 text-right font-medium">{fmtMoney(e.amount)}</td>
                          <td className="p-2 text-center">
                            {!e.reimbursementStatus && <span className="text-muted-foreground">—</span>}
                            {e.reimbursementStatus === 'PENDING' && <Badge className="bg-amber-100 text-amber-700 text-[10px]">Pending</Badge>}
                            {e.reimbursementStatus === 'APPROVED' && <Badge className="bg-sky-100 text-sky-700 text-[10px]">Approved</Badge>}
                            {e.reimbursementStatus === 'REIMBURSED' && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Reimbursed</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 bg-muted/30 font-medium">
                        <td colSpan={4} className="p-2 text-right">Total:</td>
                        <td className="p-2 text-right">{fmtMoney(totalExpenses)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                  {allExpenses.length > 100 && (
                    <div className="p-2 text-center text-xs text-muted-foreground bg-muted/30">
                      Showing first 100 of {allExpenses.length} expenses
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* SHIFTS TAB */}
          {tab === 'shifts' && (
            <div className="space-y-3">
              {shiftsLoading ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Loading shifts...</div>
              ) : allShifts.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Calendar className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No shifts assigned to this staff member.
                </div>
              ) : (
                <>
                  {upcomingShifts.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Upcoming ({upcomingShifts.length})</div>
                      <div className="border rounded-md divide-y">
                        {upcomingShifts.slice(0, 20).map(s => (
                          <div key={s.id} className="flex items-center gap-3 p-2 text-sm">
                            <div className="text-xs font-mono bg-muted px-2 py-1 rounded">{fmtDate(s.date)}</div>
                            <ShiftBadge type={s.shiftType} />
                            <div className="text-xs text-muted-foreground">{s.startTime} – {s.endTime}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {pastShifts.length > 0 && (
                    <div>
                      <div className="text-xs font-medium text-muted-foreground uppercase mb-2">Past ({pastShifts.length})</div>
                      <div className="border rounded-md divide-y max-h-60 overflow-y-auto">
                        {pastShifts.slice(0, 30).map(s => (
                          <div key={s.id} className="flex items-center gap-3 p-2 text-sm opacity-70">
                            <div className="text-xs font-mono bg-muted px-2 py-1 rounded">{fmtDate(s.date)}</div>
                            <ShiftBadge type={s.shiftType} />
                            <div className="text-xs text-muted-foreground">{s.startTime} – {s.endTime}</div>
                          </div>
                        ))}
                      </div>
                      {pastShifts.length > 30 && (
                        <div className="text-xs text-muted-foreground text-center mt-1">Showing last 30 of {pastShifts.length} past shifts</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* LEAVE TAB */}
          {tab === 'leave' && (
            <div className="space-y-3">
              {leavesLoading ? (
                <div className="text-center py-8 text-sm text-muted-foreground">Loading leave records...</div>
              ) : allLeaves.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <Plane className="h-10 w-10 mx-auto mb-2 opacity-30" />
                  No leave records for this staff member.
                </div>
              ) : (
                <div className="border rounded-md overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Type</th>
                        <th className="text-left p-2 font-medium">Start</th>
                        <th className="text-left p-2 font-medium">End</th>
                        <th className="text-left p-2 font-medium">Reason</th>
                        <th className="text-center p-2 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {allLeaves.map(l => (
                        <tr key={l.id} className="border-t hover:bg-muted/30">
                          <td className="p-2"><Badge variant="outline" className="text-[10px]">{l.leaveType?.replace(/_/g, ' ')}</Badge></td>
                          <td className="p-2 whitespace-nowrap">{fmtDate(l.startDate)}</td>
                          <td className="p-2 whitespace-nowrap">{fmtDate(l.endDate)}</td>
                          <td className="p-2 max-w-48 truncate" title={l.reason}>{l.reason || '—'}</td>
                          <td className="p-2 text-center">
                            {l.status === 'PENDING' && <Badge className="bg-amber-100 text-amber-700 text-[10px]">Pending</Badge>}
                            {l.status === 'APPROVED' && <Badge className="bg-emerald-100 text-emerald-700 text-[10px]">Approved</Badge>}
                            {l.status === 'REJECTED' && <Badge className="bg-red-100 text-red-700 text-[10px]">Rejected</Badge>}
                            {l.status === 'CANCELLED' && <Badge className="bg-muted text-muted-foreground text-[10px]">Cancelled</Badge>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* CUSTOM TABS — linked to the staff module */}
          {tab.startsWith('custom_') && (
            <StaffCustomTabView tabId={tab.replace('custom_', '')} staff={staff} orgId={orgId} />
          )}
        </div>
      </div>
      {showEdit && (
        <EditStaffDialog
          staff={staff}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            setShowEdit(false)  // close edit dialog
            if (onStaffUpdated) onStaffUpdated()  // refetch staff list from server — detail dialog stays open and re-renders with fresh data
          }}
        />
      )}
    </div>
  )
}

// ============ EDIT STAFF DIALOG ============
function EditStaffDialog({ staff, onClose, onSaved }: { staff: any; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const [form, setForm] = useState<any>({
    firstName: staff.firstName || '',
    lastName: staff.lastName || '',
    role: staff.role || 'CARE_STAFF',
    phone: staff.phone || '',
    email: staff.email || '',
    active: staff.active !== false,
    basicSalary: staff.basicSalary != null ? String(staff.basicSalary) : '',
    icNumber: staff.icNumber || '',
    epfNumber: staff.epfNumber || '',
    socsoNumber: staff.socsoNumber || '',
    taxNumber: staff.taxNumber || '',
    bankName: staff.bankName || '',
    bankAccount: staff.bankAccount || '',
    defaultAllowances: staff.defaultAllowances != null ? String(staff.defaultAllowances) : '',
    defaultZakat: staff.defaultZakat != null ? String(staff.defaultZakat) : '',
    defaultLoanDeduction: staff.defaultLoanDeduction != null ? String(staff.defaultLoanDeduction) : '',
    employmentType: staff.employmentType || 'REGULAR',
  })
  const [saving, setSaving] = useState(false)
  const { staffRoles } = useAppDropdowns(staff.facilityId)
  const availableRoles = staffRoles.length > 0 ? staffRoles : ['NURSE', 'CARE_STAFF', 'DOCTOR', 'PHYSIO', 'DIETITIAN', 'RECEPTION']

  const submit = async () => {
    if (!form.firstName || !form.lastName) { toast.error('First and last name required'); return }
    setSaving(true)
    try {
      await apiPatch(`/api/data?type=staff&id=${staff.id}`, {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        role: form.role,
        phone: form.phone || null,
        email: form.email || null,
        active: form.active,
        basicSalary: form.basicSalary ? parseFloat(form.basicSalary) : null,
        icNumber: form.icNumber || null,
        epfNumber: form.epfNumber || null,
        socsoNumber: form.socsoNumber || null,
        taxNumber: form.taxNumber || null,
        bankName: form.bankName || null,
        bankAccount: form.bankAccount || null,
        defaultAllowances: form.defaultAllowances ? parseFloat(form.defaultAllowances) : null,
        defaultZakat: form.defaultZakat ? parseFloat(form.defaultZakat) : null,
        defaultLoanDeduction: form.defaultLoanDeduction ? parseFloat(form.defaultLoanDeduction) : null,
        employmentType: form.employmentType,
      })
      toast.success('Staff updated')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-[60] flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <UserCog className="h-4 w-4" /> Edit Staff
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm max-h-[60vh] overflow-y-auto">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">First Name *</label>
              <Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Last Name *</label>
              <Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {availableRoles.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
          </div>

          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">PAYROLL INFO</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">IC Number</label>
                <Input value={form.icNumber} onChange={e => setForm({ ...form, icNumber: e.target.value })} placeholder="800101-14-5678" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Basic Salary (RM/month)</label>
                <Input type="number" step="0.01" value={form.basicSalary} onChange={e => setForm({ ...form, basicSalary: e.target.value })} placeholder="2500.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">EPF Number (KWSP)</label>
                <Input value={form.epfNumber} onChange={e => setForm({ ...form, epfNumber: e.target.value })} placeholder="KWSP-12345678" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">SOCSO Number (PERKESO)</label>
                <Input value={form.socsoNumber} onChange={e => setForm({ ...form, socsoNumber: e.target.value })} placeholder="PERKESO-123456" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tax Number (LHDN)</label>
                <Input value={form.taxNumber} onChange={e => setForm({ ...form, taxNumber: e.target.value })} placeholder="SG12345678" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank Name</label>
                <Input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} placeholder="Maybank" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank Account</label>
                <Input value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })} placeholder="1234567890123" />
              </div>
            </div>

            {/* Per-staff recurring payroll deductions */}
            <div className="border-t pt-3 mt-2">
              <div className="text-xs font-semibold text-muted-foreground mb-2">RECURRING PAYROLL DEDUCTIONS & ALLOWANCES</div>
              <div className="text-[10px] text-muted-foreground mb-2">
                Applied automatically every month when generating payroll. Leave blank for 0.
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Monthly Allowances (RM)</label>
                  <Input type="number" step="0.01" value={form.defaultAllowances} onChange={e => setForm({ ...form, defaultAllowances: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Zakat (RM/mo)</label>
                  <Input type="number" step="0.01" value={form.defaultZakat} onChange={e => setForm({ ...form, defaultZakat: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Loan Repayment (RM/mo)</label>
                  <Input type="number" step="0.01" value={form.defaultLoanDeduction} onChange={e => setForm({ ...form, defaultLoanDeduction: e.target.value })} placeholder="0.00" />
                </div>
              </div>
            </div>
          </div>

          {/* Internal employment type — only visible to Developer/Owner */}
          <div className="border-t pt-3 space-y-1">
            <label className="text-xs font-medium text-muted-foreground block">Employment Type</label>
            <select
              className="w-full border rounded px-2 py-1.5 text-sm"
              value={form.employmentType}
              onChange={e => setForm({ ...form, employmentType: e.target.value })}
            >
              <option value="REGULAR">Regular (with EPF/SOCSO/EIS/PCB)</option>
              <option value="OTHER">Other (no statutory deductions)</option>
            </select>
            {form.employmentType === 'OTHER' && (
              <p className="text-[10px] text-muted-foreground">
                Statutory deductions (EPF/SOCSO/EIS/PCB) will not be applied for this employment type.
              </p>
            )}
          </div>

          <label className="flex items-center gap-2 cursor-pointer border-t pt-3">
            <input type="checkbox" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} className="h-4 w-4" />
            <span className="text-sm">Active (uncheck to deactivate this staff)</span>
          </label>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </div>
    </div>
  )
}

/**
 * StaffCustomTabView — renders a custom tab's fields for a staff member.
 * Similar to CustomTabView in Residents.tsx but for the staff entity.
 */
function StaffCustomTabView({ tabId, staff, orgId }: { tabId: string; staff: any; orgId?: string }) {
  const { data: orgCustomTabs } = useFetch<any[]>(orgId ? `/api/org-custom-tabs?orgId=${orgId}&module=staff` : null)
  const tabDef = (orgCustomTabs || []).find(t => t.globalTabId === tabId)
  const { data: customFields } = useFetch<any[]>(orgId ? `/api/custom-fields?orgId=${orgId}` : null)
  const { data: customValues } = useFetch<any[]>(staff?.id ? `/api/custom-field-values?entityId=${staff.id}&entityType=staff` : null)

  if (!tabDef) {
    return <div className="text-center py-8 text-sm text-muted-foreground">Tab not found.</div>
  }

  const fieldIds: string[] = JSON.parse(tabDef.fields || '[]')
  const valueByFieldId: Record<string, string> = {}
  for (const v of customValues || []) {
    valueByFieldId[v.fieldId] = v.value || ''
  }

  const BUILTIN_LABELS: Record<string, string> = {
    firstName: 'First Name', lastName: 'Last Name', role: 'Role', phone: 'Phone',
    email: 'Email', hireDate: 'Hire Date', active: 'Status', notes: 'Notes',
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold text-muted-foreground">{tabDef.label.toUpperCase()}</div>
      {tabDef.description && <p className="text-xs text-muted-foreground -mt-2">{tabDef.description}</p>}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {fieldIds.map(fieldId => {
          const isBuiltin = !!BUILTIN_LABELS[fieldId]
          const cf = (customFields || []).find(f => f.id === fieldId)
          const label = isBuiltin ? BUILTIN_LABELS[fieldId] : (cf?.label || fieldId)
          const val = isBuiltin ? (staff as any)[fieldId] : valueByFieldId[fieldId]
          return (
            <div key={fieldId} className="border rounded-md p-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-0.5">{label}</div>
              <div className="font-medium text-sm break-words">
                {val !== undefined && val !== '' && val !== null
                  ? String(val)
                  : <span className="text-muted-foreground/60">—</span>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function AddStaffDialog({ facilityId, onClose, onSaved }: any) {
  useEscClose(onClose)
  const { staffRoles } = useAppDropdowns(facilityId)
  const { data: facilitiesResponse } = useFetch<any>('/api/facilities/accessible')
  const { data: settings } = useFetch<any>('/api/settings')
  const facilities = facilitiesResponse?.facilities || []
  const [form, setForm] = useState<any>({
    firstName: '', lastName: '', role: 'CARE_STAFF', phone: '', email: '',
    selectedFacilityIds: [] as string[],
    basicSalary: '',
    epfNumber: '', socsoNumber: '', taxNumber: '',
    bankName: '', bankAccount: '',
  })
  const [createUser, setCreateUser] = useState(false)
  const [userEmail, setUserEmail] = useState('')
  const [userPassword, setUserPassword] = useState('')
  const [saving, setSaving] = useState(false)

  // Build default email when name + org name available
  const orgName = settings?.organizationName || 'serenity'
  const orgSlug = (orgName || 'serenity')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .replace(/^(sdn|bhd|llp|ltd|inc|corp|plc|pty)+$/g, '')
    .slice(0, 30) || 'serenity'
  const fullStaffName = `${(form.firstName || '').trim()} ${(form.lastName || '').trim()}`.trim()
  const nameSlug = fullStaffName
    .toLowerCase()
    .replace(/[^a-z0-9\s.]+/g, '')
    .trim()
    .replace(/\s+/g, '.')
  const defaultEmail = nameSlug ? `${nameSlug}@${orgSlug}.com` : ''

  // Sync default email into user email field when name changes (only if user hasn't manually edited)
  const [emailTouched, setEmailTouched] = useState(false)
  useEffect(() => {
    if (!emailTouched && createUser) {
      setUserEmail(defaultEmail)
    }
  }, [defaultEmail, createUser, emailTouched])

  // Pre-select the parent facilityId prop, if provided
  useEffect(() => {
    if (facilityId && form.selectedFacilityIds.length === 0) {
      setForm((f: any) => ({ ...f, selectedFacilityIds: [facilityId] }))
    }
  }, [facilityId])

  const availableRoles = staffRoles.length > 0 ? staffRoles : ['NURSE', 'CARE_STAFF', 'DOCTOR', 'PHYSIO', 'DIETITIAN', 'RECEPTION']

  const toggleFacility = (fid: string) => {
    setForm((f: any) => {
      const list: string[] = f.selectedFacilityIds || []
      const next = list.includes(fid) ? list.filter(id => id !== fid) : [...list, fid]
      return { ...f, selectedFacilityIds: next }
    })
  }

  const submit = async () => {
    if (!form.firstName || !form.lastName) { toast.error('First and last name are required'); return }
    if (form.selectedFacilityIds.length === 0) { toast.error('Please select at least one facility'); return }
    if (createUser) {
      if (!userEmail || !userPassword) { toast.error('Email and password are required to create a user account'); return }
      if (userPassword.length < 6) { toast.error('Password must be at least 6 characters'); return }
    }

    setSaving(true)
    try {
      // Primary facility = first selected; facilityIds = all selected (comma-separated)
      const primaryFacilityId = form.selectedFacilityIds[0]
      const facilityIdsCsv = form.selectedFacilityIds.join(',')

      const staffPayload: any = {
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        role: form.role,
        phone: form.phone || null,
        email: createUser ? userEmail.toLowerCase().trim() : (form.email || null),
        hireDate: new Date().toISOString(),
        active: true,
        facilityId: primaryFacilityId,
        facilityIds: facilityIdsCsv,
        basicSalary: form.basicSalary ? parseFloat(form.basicSalary) : null,
        epfNumber: form.epfNumber || null,
        socsoNumber: form.socsoNumber || null,
        taxNumber: form.taxNumber || null,
        bankName: form.bankName || null,
        bankAccount: form.bankAccount || null,
      }
      const staffRes = await apiPost('/api/data?type=staff', staffPayload)

      // Optionally create the user account
      if (createUser) {
        try {
          await apiPost('/api/users', {
            name: `${form.firstName.trim()} ${form.lastName.trim()}`,
            email: userEmail.toLowerCase().trim(),
            password: userPassword,
            role: form.role, // staff role maps 1:1 to user Role enum
            phone: form.phone || undefined,
            facilityIds: facilityIdsCsv,
          })
          toast.success(`Staff added + user account created (${userEmail})`)
        } catch (e: any) {
          // Partial failure — staff record was created but user account creation failed.
          // Use a warning (yellow) toast to signal that something went wrong, not a success toast.
          toast.warning(`Staff added, but user account creation failed: ${e.message}`)
        }
      } else {
        toast.success('Staff member added')
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold">Add Staff Member</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>

        <div className="p-4 space-y-4 text-sm">
          {/* Name + role */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">First Name *</label>
              <Input value={form.firstName} onChange={e => setForm({ ...form, firstName: e.target.value })} placeholder="Jane" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Last Name *</label>
              <Input value={form.lastName} onChange={e => setForm({ ...form, lastName: e.target.value })} placeholder="Smith" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Role</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                {availableRoles.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="+60-3-XXXX XXXX" />
            </div>
          </div>

          {/* Multi-facility selection */}
          <div className="border-t pt-3">
            <div className="text-xs font-semibold text-muted-foreground mb-2">FACILITY ASSIGNMENT *</div>
            <div className="text-xs text-muted-foreground mb-2">Select one or more facilities this staff member works at.</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-44 overflow-y-auto border rounded-md p-2">
              {facilities.length === 0 && <div className="text-xs text-muted-foreground p-2">No facilities available.</div>}
              {facilities.map(f => {
                const checked = form.selectedFacilityIds.includes(f.id)
                return (
                  <label key={f.id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-muted/50 text-xs">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleFacility(f.id)}
                      className="h-3.5 w-3.5"
                    />
                    <span className="font-medium truncate">{f.name}</span>
                    {checked && form.selectedFacilityIds[0] === f.id && (
                      <Badge variant="outline" className="text-[10px] ml-auto bg-primary/10">Primary</Badge>
                    )}
                  </label>
                )
              })}
            </div>
            {form.selectedFacilityIds.length > 0 && (
              <div className="text-xs text-muted-foreground mt-1">
                {form.selectedFacilityIds.length} facilit{form.selectedFacilityIds.length === 1 ? 'y' : 'ies'} selected — first one is the primary facility.
              </div>
            )}
          </div>

          {/* Optional: contact email (only used if not creating user account) */}
          {!createUser && (
            <div className="grid grid-cols-1 gap-3 border-t pt-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Contact Email (optional)</label>
                <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="jane@example.com" />
              </div>
            </div>
          )}

          {/* Payroll info */}
          <div className="border-t pt-3 space-y-3">
            <div className="text-xs font-semibold text-muted-foreground">PAYROLL INFO (optional)</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Basic Salary (RM/month)</label>
                <Input type="number" step="0.01" value={form.basicSalary} onChange={e => setForm({ ...form, basicSalary: e.target.value })} placeholder="2500.00" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">EPF Number (KWSP)</label>
                <Input value={form.epfNumber} onChange={e => setForm({ ...form, epfNumber: e.target.value })} placeholder="KWSP-12345678" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">SOCSO Number (PERKESO)</label>
                <Input value={form.socsoNumber} onChange={e => setForm({ ...form, socsoNumber: e.target.value })} placeholder="PERKESO-123456" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Tax Number (LHDN)</label>
                <Input value={form.taxNumber} onChange={e => setForm({ ...form, taxNumber: e.target.value })} placeholder="SG12345678" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank Name</label>
                <Input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} placeholder="Maybank" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank Account</label>
                <Input value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })} placeholder="1234567890123" />
              </div>
            </div>
          </div>

          {/* Optional: create user account */}
          <div className="border-t pt-3 space-y-3">
            <label className="flex items-start gap-2 cursor-pointer p-2 rounded-md hover:bg-muted/30">
              <input
                type="checkbox"
                checked={createUser}
                onChange={e => {
                  setCreateUser(e.target.checked)
                  setEmailTouched(false)
                }}
                className="h-4 w-4 mt-0.5"
              />
              <div>
                <div className="font-medium text-sm flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5" /> Create a user login account for this staff
                </div>
                <div className="text-xs text-muted-foreground">
                  If checked, a user account will be created so this staff member can sign in to the system.
                  The default email is auto-generated as <code className="text-[10px] bg-muted px-1 rounded">firstname.lastname@{orgSlug}.com</code> — you can override it.
                </div>
              </div>
            </label>

            {createUser && (
              <div className="pl-6 space-y-3 border-l-2 border-primary/30 ml-2">
                <div className="text-xs text-muted-foreground">
                  Organization name (configurable in <strong>Settings → Facility &amp; Org</strong>): <strong>{orgName}</strong>
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Login Email *</label>
                  <Input
                    type="email"
                    value={userEmail}
                    onChange={e => { setUserEmail(e.target.value); setEmailTouched(true) }}
                    placeholder={defaultEmail || 'firstname.lastname@orgname.com'}
                  />
                  {defaultEmail && (
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      Suggested: <code className="bg-muted px-1 rounded">{defaultEmail}</code>
                      {emailTouched && userEmail !== defaultEmail && (
                        <button
                          type="button"
                          className="ml-2 text-primary underline"
                          onClick={() => { setUserEmail(defaultEmail); setEmailTouched(false) }}
                        >
                          reset
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Password *</label>
                  <Input
                    type="password"
                    value={userPassword}
                    onChange={e => setUserPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete="new-password"
                  />
                  <div className="text-[10px] text-muted-foreground mt-0.5">User will be assigned the same role ({form.role}) and same facilities as the staff record.</div>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Adding...' : (createUser ? 'Add Staff + Create User' : 'Add Staff')}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============ ATTENDANCE VIEW ============
function AttendanceView({ staff, facilityId }: { staff: any[]; facilityId?: string }) {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 10))
  const [showManual, setShowManual] = useState<any | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: records, loading, refetch } = useFetch<any[]>(`/api/data?type=attendance&date=${selectedDate}${facilityParam}`)
  const { data: currentUser } = useFetch<any>('/api/auth/me')

  const todayRecords = records || []

  const handleQuickCheckIn = async (staffId: string) => {
    try {
      // Use local-time midnight for the `date` field (the work date — used by the
      // upsert lookup `staffId_date`). Using `new Date().toISOString()` (full timestamp)
      // would cause the upsert key to differ between check-ins on the same calendar day.
      const now = new Date()
      const workDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      await apiPost('/api/data?type=attendance', {
        staffId,
        date: workDate,
        checkIn: now.toISOString(),
        status: 'PRESENT',
        recordedById: currentUser?.user?.id || null,
        recordedByName: currentUser?.user?.name || null,
      })
      toast.success('Checked in')
      refetch()
    } catch (e: any) { toast.error(e.message) }
  }

  const handleQuickCheckOut = async (record: any) => {
    try {
      const checkOut = new Date()
      const checkIn = new Date(record.checkIn)
      const workedMs = checkOut.getTime() - checkIn.getTime()
      const workedHours = Math.round((workedMs / 3600000) * 100) / 100
      const overtimeHours = Math.max(0, Math.round((workedHours - 8) * 100) / 100)
      await apiPatch(`/api/data?type=attendance&id=${record.id}`, {
        checkOut: checkOut.toISOString(),
        workedHours,
        overtimeHours,
      })
      toast.success(`Checked out — ${workedHours}h worked${overtimeHours > 0 ? `, ${overtimeHours}h OT` : ''}`)
      refetch()
    } catch (e: any) { toast.error(e.message) }
  }

  // Group by status for summary
  const summary = {
    PRESENT: todayRecords.filter(r => r.status === 'PRESENT' && r.checkOut == null).length,
    COMPLETED: todayRecords.filter(r => r.checkOut != null).length,
    ABSENT: todayRecords.filter(r => r.status === 'ABSENT').length,
    LATE: todayRecords.filter(r => r.status === 'LATE').length,
    ON_LEAVE: todayRecords.filter(r => r.status === 'ON_LEAVE').length,
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="date"
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            className="w-auto"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap text-xs">
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Present: {summary.PRESENT}</Badge>
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Done: {summary.COMPLETED}</Badge>
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Late: {summary.LATE}</Badge>
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Absent: {summary.ABSENT}</Badge>
          <Badge variant="outline" className="bg-violet-50 text-violet-700 border-violet-200">On Leave: {summary.ON_LEAVE}</Badge>
        </div>
      </div>

      {loading ? (
        <Skeleton className="h-64" />
      ) : (
        <div className="grid gap-2">
          {staff.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No staff found</p>}
          {staff.map(s => {
            const record = todayRecords.find(r => r.staffId === s.id)
            const hasRecord = !!record
            return (
              <Card key={s.id}>
                <CardContent className="p-3">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <Avatar className="h-10 w-10 flex-shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-xs">{initials(s.firstName, s.lastName)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">
                          {s.code && <span className="text-xs font-mono text-primary mr-1">{s.code}</span>}
                          {s.firstName} {s.lastName}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {s.role?.replace(/_/g, ' ').toLowerCase() || '—'}
                          {s.shiftStart && s.shiftEnd && <> • Shift {s.shiftStart}–{s.shiftEnd}</>}
                        </div>
                        {hasRecord && record.checkIn && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            <LogIn className="h-2.5 w-2.5 inline mr-1" />
                            In: {fmtTime(record.checkIn)}
                            {record.checkOut && <><LogOut className="h-2.5 w-2.5 inline ml-2 mr-1" />Out: {fmtTime(record.checkOut)}</>}
                            {record.workedHours != null && <> • {record.workedHours}h worked</>}
                            {record.overtimeHours != null && record.overtimeHours > 0 && <> • {record.overtimeHours}h OT</>}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 flex-shrink-0">
                      {hasRecord ? (
                        <>
                          <StatusBadge status={record.status} />
                          {record.checkIn && !record.checkOut && (
                            <Button size="sm" variant="outline" className="text-rose-600 border-rose-200" onClick={() => handleQuickCheckOut(record)}>
                              <LogOut className="h-3 w-3 mr-1" /> Check Out
                            </Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => setShowManual({ ...record, staffId: s.id, staffName: `${s.firstName} ${s.lastName}` })}>
                            Edit
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-200" onClick={() => handleQuickCheckIn(s.id)}>
                            <LogIn className="h-3 w-3 mr-1" /> Check In
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setShowManual({ staffId: s.id, staffName: `${s.firstName} ${s.lastName}`, date: selectedDate, status: 'ABSENT' })}>
                            Mark
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {showManual && (
        <ManualAttendanceDialog
          record={showManual}
          onClose={() => setShowManual(null)}
          onSaved={() => { setShowManual(null); refetch() }}
        />
      )}
    </div>
  )
}

function ManualAttendanceDialog({ record, onClose, onSaved }: { record: any; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const [status, setStatus] = useState(record.status || 'PRESENT')
  const [checkIn, setCheckIn] = useState(record.checkIn ? new Date(record.checkIn).toISOString().slice(0, 16) : '')
  const [checkOut, setCheckOut] = useState(record.checkOut ? new Date(record.checkOut).toISOString().slice(0, 16) : '')
  const [notes, setNotes] = useState(record.notes || '')
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      // For the `date` field (work date), normalize to local midnight so the upsert
      // lookup `staffId_date` matches consistently across the same calendar day.
      const now = new Date()
      const defaultDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
      const payload: any = {
        staffId: record.staffId,
        date: record.date || defaultDate,
        status,
        notes: notes || null,
      }
      if (checkIn) payload.checkIn = new Date(checkIn).toISOString()
      if (checkOut) {
        payload.checkOut = new Date(checkOut).toISOString()
        if (checkIn) {
          const workedMs = new Date(checkOut).getTime() - new Date(checkIn).getTime()
          payload.workedHours = Math.round((workedMs / 3600000) * 100) / 100
          payload.overtimeHours = Math.max(0, Math.round((payload.workedHours - 8) * 100) / 100)
        }
      }
      if (record.id) {
        await apiPatch(`/api/data?type=attendance&id=${record.id}`, payload)
        toast.success('Attendance updated')
      } else {
        await apiPost('/api/data?type=attendance', payload)
        toast.success('Attendance recorded')
      }
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold text-sm">Attendance — {record.staffName}</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
            <select className="w-full border rounded px-3 py-2 text-sm" value={status} onChange={e => setStatus(e.target.value)}>
              <option value="PRESENT">Present</option>
              <option value="ABSENT">Absent</option>
              <option value="LATE">Late</option>
              <option value="HALF_DAY">Half Day</option>
              <option value="ON_LEAVE">On Leave</option>
              <option value="HOLIDAY">Holiday</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Check In</label>
              <Input type="datetime-local" value={checkIn} onChange={e => setCheckIn(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Check Out</label>
              <Input type="datetime-local" value={checkOut} onChange={e => setCheckOut(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional notes..." />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
        </div>
      </div>
    </div>
  )
}

// ============ PAYROLL VIEW ============
function PayrollView({ staff, facilityId }: { staff: any[]; facilityId?: string }) {
  const today = new Date()
  const [selectedMonth, setSelectedMonth] = useState(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`)
  const [showGenerate, setShowGenerate] = useState<any | null>(null)
  const [viewPayroll, setViewPayroll] = useState<any | null>(null)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: payrolls, loading, refetch } = useFetch<any[]>(`/api/data?type=payroll&month=${selectedMonth}${facilityParam}`)
  const { data: attendance } = useFetch<any[]>(`/api/data?type=attendance${facilityParam}`)
  const { data: currentUser } = useFetch<any>('/api/auth/me')

  const monthPayrolls = payrolls || []

  // Summary
  const totalGross = monthPayrolls.reduce((s, p) => s + (p.grossPay || 0), 0)
  const totalNet = monthPayrolls.reduce((s, p) => s + (p.netPay || 0), 0)
  const totalEPF = monthPayrolls.reduce((s, p) => s + (p.epfEmployer || 0), 0)
  const totalSOCSO = monthPayrolls.reduce((s, p) => s + (p.socsoEmployer || 0) + (p.eisEmployer || 0), 0)
  const draftCount = monthPayrolls.filter(p => p.status === 'DRAFT').length
  const approvedCount = monthPayrolls.filter(p => p.status === 'APPROVED').length
  const paidCount = monthPayrolls.filter(p => p.status === 'PAID').length

  const handleGenerate = async (s: any) => {
    const basicSalary = parseFloat(s.basicSalary) || 0
    if (basicSalary <= 0) {
      toast.error(`No basic salary set for ${s.firstName} ${s.lastName}. Set it in the staff directory first.`)
      return
    }
    // Check for existing payroll — schema has @@unique([staffId, payrollMonth])
    const existing = monthPayrolls.find(p => p.staffId === s.id)
    if (existing) {
      toast.error(`${s.firstName} ${s.lastName} already has a payroll for ${selectedMonth}. Delete it first if you want to regenerate.`)
      return
    }
    // Calculate OT from attendance in the selected month
    const [year, month] = selectedMonth.split('-').map(Number)
    const monthStart = new Date(year, month - 1, 1)
    const monthEnd = new Date(year, month, 0, 23, 59, 59)
    const staffAttendance = (attendance || []).filter(a => a.staffId === s.id && new Date(a.date) >= monthStart && new Date(a.date) <= monthEnd)
    const overtimeHours = staffAttendance.reduce((sum, a) => sum + (a.overtimeHours || 0), 0)
    const workingDays = staffAttendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE').length
    const hourlyRate = basicSalary / 26 / 8
    const overtimePay = Math.round(overtimeHours * hourlyRate * 1.5 * 100) / 100

    // Per-staff custom deductions + allowances (from EditStaffDialog → Payroll Info)
    const allowances = parseFloat(s.defaultAllowances) || 0
    const zakat = parseFloat(s.defaultZakat) || 0
    const loanDeduction = parseFloat(s.defaultLoanDeduction) || 0
    // Skip statutory deductions for "Other" employment type
    const skipStatutory = s.employmentType === 'OTHER'

    const input: PayrollInput = {
      basicSalary,
      overtimePay,
      overtimeHours,
      allowances,
      zakat,
      loanDeduction,
      skipStatutory,
    }
    const calc = calculatePayroll(input)

    try {
      await apiPost('/api/data?type=payroll', {
        staffId: s.id,
        facilityId: s.facilityId || facilityId,  // prefer staff's own facility
        payrollMonth: selectedMonth,
        periodStart: monthStart.toISOString(),
        periodEnd: monthEnd.toISOString(),
        status: 'DRAFT',
        ...calc,
        workingDays,
        overtimeHours,
      })
      toast.success(`Payroll generated for ${s.firstName} ${s.lastName}`)
      refetch()
      setShowGenerate(null)
    } catch (e: any) {
      // Handle unique-constraint violation with a friendly message
      if (e.message?.includes('Unique constraint') || e.message?.includes('already exists')) {
        toast.error(`${s.firstName} ${s.lastName} already has a payroll for ${selectedMonth}.`)
      } else {
        toast.error(e.message)
      }
    }
  }

  const [disbursePayroll, setDisbursePayroll] = useState<any | null>(null)
  const [showRecords, setShowRecords] = useState(false)

  const handleStatusChange = async (p: any, newStatus: string) => {
    const patch: any = { status: newStatus }
    if (newStatus === 'APPROVED') {
      // Simple approve — no payment details needed
    }
    try {
      await apiPatch(`/api/data?type=payroll&id=${p.id}`, patch)
      toast.success(`Payroll marked as ${newStatus.toLowerCase()}`)
      refetch()
    } catch (e: any) { toast.error(e.message) }
  }

  // Disburse: opens a dialog to collect payment method + bank reference, then marks as PAID.
  // The API auto-posts the payroll journal entry (Dr. Salaries, Cr. Bank + payables).
  const handleDisburse = async (p: any, paymentMethod: string, paymentReference: string) => {
    try {
      // Use raw fetch instead of apiPatch so we can read the _autoPostWarning
      // field if GL accounts are missing (the payroll is still marked PAID).
      const r = await fetch(`/api/data?type=payroll&id=${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PAID',
          paidAt: new Date().toISOString(),
          paidByName: currentUser?.user?.name || null,
          paidById: currentUser?.user?.id || null,
          paymentMethod,
          paymentReference: paymentReference || null,
        }),
      })
      const data = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`)
      if (data._autoPostWarning) {
        toast.warning(data._autoPostWarning, { duration: 12000 })
      } else {
        toast.success(`Payroll disbursed — ${p.staff?.firstName} ${p.staff?.lastName} paid via ${paymentMethod.toLowerCase()}`)
      }
      refetch()
      setDisbursePayroll(null)
    } catch (e: any) { toast.error(e.message) }
  }

  const handleDelete = async (p: any) => {
    if (!confirm(`Delete payroll for ${p.staff?.firstName} ${p.staff?.lastName} (${p.payrollMonth})?`)) return
    try {
      await apiDelete(`/api/data?type=payroll&id=${p.id}`)
      toast.success('Payroll deleted')
      refetch()
    } catch (e: any) { toast.error(e.message) }
  }

  const downloadExport = async (format: 'kwsp' | 'socso' | 'bank' | 'lhdn') => {
    try {
      const fParam = facilityId ? `&facilityId=${facilityId}` : ''
      const res = await fetch(`/api/payroll/export?month=${selectedMonth}&format=${format}${fParam}`)
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || `HTTP ${res.status}`)
      }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename="?([^"]+)"?/)
      a.download = match ? match[1] : `export-${selectedMonth}.${format === 'kwsp' ? 'txt' : 'csv'}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
      toast.success(`Export downloaded: ${a.download}`)
    } catch (e: any) { toast.error(e.message) }
  }

  return (
    <div className="space-y-4">
      {/* Month picker + summary */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <Input
            type="month"
            value={selectedMonth}
            onChange={e => setSelectedMonth(e.target.value)}
            className="w-auto"
          />
        </div>
        <Button size="sm" onClick={() => setShowGenerate({})}>
          <Calculator className="h-3.5 w-3.5 mr-1" /> Generate Payroll
        </Button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Total Gross</div>
          <div className="text-lg font-bold">{fmtMoney(totalGross)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Total Net Pay</div>
          <div className="text-lg font-bold text-emerald-600">{fmtMoney(totalNet)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Employer EPF</div>
          <div className="text-lg font-bold">{fmtMoney(totalEPF)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-3">
          <div className="text-xs text-muted-foreground">Employer SOCSO+EIS</div>
          <div className="text-lg font-bold">{fmtMoney(totalSOCSO)}</div>
        </CardContent></Card>
      </div>

      {/* Status filter chips */}
      <div className="flex gap-1.5 flex-wrap text-xs">
        <Badge variant="outline" className="bg-muted/50">{monthPayrolls.length} total</Badge>
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{draftCount} draft</Badge>
        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">{approvedCount} approved</Badge>
        <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">{paidCount} paid</Badge>
      </div>

      {/* Payroll list */}
      {loading ? (
        <Skeleton className="h-64" />
      ) : monthPayrolls.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">
          <Wallet className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm">No payroll records for {selectedMonth}</p>
          <p className="text-xs mt-1">Click "Generate Payroll" to create pay slips for staff with salaries set.</p>
        </CardContent></Card>
      ) : (
        <div className="grid gap-2">
          {monthPayrolls.map(p => (
            <Card key={p.id}>
              <CardContent className="p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {p.staff?.code && <span className="text-xs font-mono text-primary mr-1">{p.staff.code}</span>}
                        {p.staff?.firstName} {p.staff?.lastName}
                      </span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {p.workingDays} working days • {p.overtimeHours || 0}h OT
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-2 text-xs">
                      <div><span className="text-muted-foreground">Basic:</span> {fmtMoney(p.basicSalary)}</div>
                      <div><span className="text-muted-foreground">Gross:</span> {fmtMoney(p.grossPay)}</div>
                      <div><span className="text-muted-foreground">Deductions:</span> {fmtMoney(p.totalDeductions)}</div>
                      <div><span className="text-emerald-600 font-medium">Net:</span> {fmtMoney(p.netPay)}</div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" onClick={() => setViewPayroll(p)}>View</Button>
                    {p.status === 'DRAFT' && (
                      <Button size="sm" variant="outline" className="text-blue-600 border-blue-200" onClick={() => handleStatusChange(p, 'APPROVED')}>Approve</Button>
                    )}
                    {p.status === 'APPROVED' && (
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => setDisbursePayroll(p)}>Disburse</Button>
                    )}
                    {p.status === 'DRAFT' && (
                      <Button size="sm" variant="ghost" className="text-red-600" onClick={() => handleDelete(p)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {showGenerate && (
        <GeneratePayrollDialog
          staff={staff}
          existingPayrolls={monthPayrolls}
          selectedMonth={selectedMonth}
          onClose={() => setShowGenerate(null)}
          onGenerate={handleGenerate}
        />
      )}

      {viewPayroll && (
        <ViewPayrollDialog
          payroll={viewPayroll}
          onClose={() => setViewPayroll(null)}
        />
      )}

      {disbursePayroll && (
        <DisbursePayrollDialog
          payroll={disbursePayroll}
          currentUser={currentUser}
          onClose={() => setDisbursePayroll(null)}
          onDisburse={handleDisburse}
        />
      )}

      {/* ===== Statutory Export Files ===== */}
      {paidCount > 0 && (
        <div className="border-t pt-3 space-y-2">
          <div className="text-sm font-medium flex items-center gap-1.5">
            <Download className="h-4 w-4" /> Export for Statutory Portals
          </div>
          <div className="text-xs text-muted-foreground mb-2">
            Download files formatted for upload to Malaysian government portals and banks.
            Only includes PAID payrolls for {selectedMonth}. {paidCount} payroll(s) paid.
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              onClick={() => downloadExport('kwsp')}
              className="p-2.5 rounded-lg border bg-background hover:bg-muted/50 text-left transition-colors"
            >
              <div className="text-xs font-medium flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5 text-blue-600" /> KWSP i-Akaun
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">EPF contribution .txt file</div>
            </button>
            <button
              onClick={() => downloadExport('socso')}
              className="p-2.5 rounded-lg border bg-background hover:bg-muted/50 text-left transition-colors"
            >
              <div className="text-xs font-medium flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5 text-emerald-600" /> PERKESO ASSIST
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">SOCSO + EIS .csv file</div>
            </button>
            <button
              onClick={() => downloadExport('bank')}
              className="p-2.5 rounded-lg border bg-background hover:bg-muted/50 text-left transition-colors"
            >
              <div className="text-xs font-medium flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5 text-violet-600" /> Bank Transfer
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Salary disbursement .csv</div>
            </button>
            <button
              onClick={() => downloadExport('lhdn')}
              className="p-2.5 rounded-lg border bg-background hover:bg-muted/50 text-left transition-colors"
            >
              <div className="text-xs font-medium flex items-center gap-1.5">
                <Download className="h-3.5 w-3.5 text-amber-600" /> LHDN PCB
              </div>
              <div className="text-[10px] text-muted-foreground mt-0.5">Tax submission .csv</div>
            </button>
          </div>
        </div>
      )}

      {/* Annual payroll records — yearly summary per staff */}
      <div className="border-t pt-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium flex items-center gap-1.5">
            <FileText className="h-4 w-4" /> Annual Payroll Records
          </div>
          <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowRecords(s => !s)}>
            {showRecords ? 'Hide' : 'Show'} records
          </Button>
        </div>
        {showRecords && (
          <AnnualPayrollRecords facilityId={facilityId} staff={staff} />
        )}
      </div>
    </div>
  )
}

// ============ DISBURSE PAYROLL DIALOG ============
// Collects payment method + bank reference, then marks the payroll as PAID.
// The API auto-posts the payroll journal entry (Dr. Salaries, Cr. Bank + payables).
function DisbursePayrollDialog({ payroll, currentUser, onClose, onDisburse }: {
  payroll: any
  currentUser: any
  onClose: () => void
  onDisburse: (p: any, method: string, ref: string) => void
}) {
  useEscClose(onClose)
  const [paymentMethod, setPaymentMethod] = useState('BANK_TRANSFER')
  const [paymentReference, setPaymentReference] = useState('')
  const [saving, setSaving] = useState(false)

  const p = payroll
  const bankName = p.staff?.bankName
  const bankAccount = p.staff?.bankAccount
  const epfNumber = p.staff?.epfNumber

  const submit = async () => {
    if (paymentMethod === 'BANK_TRANSFER' && !paymentReference.trim()) {
      toast.error('Please enter the bank transaction reference number')
      return
    }
    setSaving(true)
    await onDisburse(p, paymentMethod, paymentReference.trim())
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold text-sm flex items-center gap-1.5">
            <Wallet className="h-4 w-4" /> Disburse Payroll
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {/* Summary */}
          <div className="bg-muted/30 rounded p-3 space-y-1">
            <div className="font-medium">{p.staff?.firstName} {p.staff?.lastName}</div>
            <div className="text-xs text-muted-foreground">Period: {p.payrollMonth}</div>
            <div className="flex justify-between text-sm mt-1">
              <span>Net Pay:</span>
              <span className="font-bold text-emerald-600">{fmtMoney(p.netPay)}</span>
            </div>
          </div>

          {/* Bank details from staff record */}
          {(bankName || bankAccount) && (
            <div className="text-xs bg-blue-50 border border-blue-200 rounded p-2">
              <div className="font-medium text-blue-900 mb-0.5">Staff Bank Details</div>
              {bankName && <div>Bank: <strong>{bankName}</strong></div>}
              {bankAccount && <div>Account: <strong className="font-mono">{bankAccount}</strong></div>}
              {epfNumber && <div>EPF: <strong className="font-mono">{epfNumber}</strong> (KWSP contribution recorded)</div>}
            </div>
          )}

          {/* Payment method */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Method *</label>
            <select className="w-full border rounded px-3 py-2 text-sm" value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)}>
              <option value="BANK_TRANSFER">Bank Transfer (Direct Deposit)</option>
              <option value="CASH">Cash</option>
              <option value="CHEQUE">Cheque</option>
              <option value="ONLINE">Online Transfer (e.g. DuitNow)</option>
            </select>
          </div>

          {/* Payment reference */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Payment Reference {paymentMethod === 'BANK_TRANSFER' ? '*' : '(optional)'}
            </label>
            <Input
              value={paymentReference}
              onChange={e => setPaymentReference(e.target.value)}
              placeholder={paymentMethod === 'BANK_TRANSFER' ? 'Bank txn ref (e.g. TNR-20260815-001)' : 'Cheque #, txn ref, etc.'}
            />
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Used for audit trail + reconciliation. The payroll JE will be auto-posted to the ledger.
            </div>
          </div>

          {/* JE preview */}
          <div className="text-xs bg-muted/30 border rounded p-2">
            <div className="font-medium mb-1">Journal Entry Preview (auto-posted):</div>
            <div className="space-y-0.5 font-mono text-[10px]">
              <div>Dr. Salaries & Wages (5000) — {fmtMoney((p.basicSalary || 0) + (p.allowances || 0) + (p.bonus || 0) + (p.commission || 0) - (p.zakat || 0) - (p.loanDeduction || 0) - (p.unpaidLeaveDeduction || 0))}</div>
              {p.overtimePay > 0 && <div>Dr. Overtime Pay (5010) — {fmtMoney(p.overtimePay)}</div>}
              {p.epfEmployer > 0 && <div>Dr. EPF Contribution (5030) — {fmtMoney(p.epfEmployer)}</div>}
              {(p.socsoEmployer + p.eisEmployer) > 0 && <div>Dr. SOCSO Contribution (5040) — {fmtMoney(p.socsoEmployer + p.eisEmployer)}</div>}
              <div className="border-t my-0.5" />
              {(p.epfEmployee + p.epfEmployer) > 0 && <div className="text-emerald-700">Cr. EPF Payable (2210) — {fmtMoney(p.epfEmployee + p.epfEmployer)}</div>}
              {(p.socsoEmployee + p.socsoEmployer + p.eisEmployee + p.eisEmployer) > 0 && <div className="text-emerald-700">Cr. SOCSO Payable (2220) — {fmtMoney(p.socsoEmployee + p.socsoEmployer + p.eisEmployee + p.eisEmployer)}</div>}
              {p.pcbTax > 0 && <div className="text-emerald-700">Cr. Tax Payable (2230) — {fmtMoney(p.pcbTax)}</div>}
              <div className="text-emerald-700">Cr. Bank (1010) — {fmtMoney(p.netPay)}</div>
            </div>
          </div>

          <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠ This will mark the payroll as PAID and auto-post a journal entry to the general ledger.
            Make sure the bank transfer has been completed before confirming.
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Disbursing…</> : <><Wallet className="h-3.5 w-3.5 mr-1" /> Disburse {fmtMoney(p.netPay)}</>}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============ ANNUAL PAYROLL RECORDS ============
// Shows a yearly summary per staff: total gross, total net, total tax, total EPF.
// Used for tax form generation + annual reporting.
function AnnualPayrollRecords({ facilityId, staff }: { facilityId?: string; staff: any[] }) {
  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  // Fetch ALL payrolls for the year (not just one month)
  const { data: allPayrolls, loading } = useFetch<any[]>(`/api/data?type=payroll${facilityParam}`)

  if (loading) return <Skeleton className="h-32" />

  const yearPayrolls = (allPayrolls || []).filter((p: any) => p.payrollMonth?.startsWith(String(year)))

  // Group by staff
  const byStaff: Record<string, any[]> = {}
  for (const p of yearPayrolls) {
    if (!byStaff[p.staffId]) byStaff[p.staffId] = []
    byStaff[p.staffId].push(p)
  }

  return (
    <div className="mt-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Year:</span>
        <select className="border rounded px-2 py-1 text-xs" value={year} onChange={e => setYear(parseInt(e.target.value))}>
          {[today.getFullYear(), today.getFullYear() - 1, today.getFullYear() - 2].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <Badge variant="outline" className="text-xs">{yearPayrolls.length} payrolls in {year}</Badge>
      </div>

      {Object.keys(byStaff).length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">No payroll records for {year}.</p>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2 font-medium">Staff</th>
                <th className="text-right p-2 font-medium">Months</th>
                <th className="text-right p-2 font-medium">Total Gross</th>
                <th className="text-right p-2 font-medium">Total Net</th>
                <th className="text-right p-2 font-medium">EPF (Employee)</th>
                <th className="text-right p-2 font-medium">EPF (Employer)</th>
                <th className="text-right p-2 font-medium">SOCSO+EIS</th>
                <th className="text-right p-2 font-medium">PCB Tax</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(byStaff).map(([staffId, pays]) => {
                const s = staff.find(x => x.id === staffId)
                const totalGross = pays.reduce((sum, p) => sum + (p.grossPay || 0), 0)
                const totalNet = pays.reduce((sum, p) => sum + (p.netPay || 0), 0)
                const totalEPFEe = pays.reduce((sum, p) => sum + (p.epfEmployee || 0), 0)
                const totalEPFEr = pays.reduce((sum, p) => sum + (p.epfEmployer || 0), 0)
                const totalSOCSO = pays.reduce((sum, p) => sum + (p.socsoEmployee || 0) + (p.socsoEmployer || 0) + (p.eisEmployee || 0) + (p.eisEmployer || 0), 0)
                const totalPCB = pays.reduce((sum, p) => sum + (p.pcbTax || 0), 0)
                const paidCount = pays.filter(p => p.status === 'PAID').length
                return (
                  <tr key={staffId} className="border-t hover:bg-muted/30">
                    <td className="p-2">
                      <div className="font-medium">{s?.firstName} {s?.lastName}</div>
                      {s?.code && <span className="text-[10px] font-mono text-primary">{s.code}</span>}
                    </td>
                    <td className="p-2 text-right">{pays.length} ({paidCount} paid)</td>
                    <td className="p-2 text-right font-medium">{fmtMoney(totalGross)}</td>
                    <td className="p-2 text-right font-medium text-emerald-600">{fmtMoney(totalNet)}</td>
                    <td className="p-2 text-right">{fmtMoney(totalEPFEe)}</td>
                    <td className="p-2 text-right">{fmtMoney(totalEPFEr)}</td>
                    <td className="p-2 text-right">{fmtMoney(totalSOCSO)}</td>
                    <td className="p-2 text-right">{fmtMoney(totalPCB)}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t-2 font-medium bg-muted/30">
              <tr>
                <td className="p-2" colSpan={2}>TOTAL</td>
                <td className="p-2 text-right">{fmtMoney(yearPayrolls.reduce((s, p) => s + (p.grossPay || 0), 0))}</td>
                <td className="p-2 text-right text-emerald-600">{fmtMoney(yearPayrolls.reduce((s, p) => s + (p.netPay || 0), 0))}</td>
                <td className="p-2 text-right">{fmtMoney(yearPayrolls.reduce((s, p) => s + (p.epfEmployee || 0), 0))}</td>
                <td className="p-2 text-right">{fmtMoney(yearPayrolls.reduce((s, p) => s + (p.epfEmployer || 0), 0))}</td>
                <td className="p-2 text-right">{fmtMoney(yearPayrolls.reduce((s, p) => s + (p.socsoEmployee || 0) + (p.socsoEmployer || 0) + (p.eisEmployee || 0) + (p.eisEmployer || 0), 0))}</td>
                <td className="p-2 text-right">{fmtMoney(yearPayrolls.reduce((s, p) => s + (p.pcbTax || 0), 0))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">
        This table serves as the annual tax summary (Borang EA equivalent). Each staff row shows total gross, net, EPF, SOCSO, and PCB for the selected year — used for LHDN tax filing and employee tax form (EA) generation.
      </p>
    </div>
  )
}

function GeneratePayrollDialog({ staff, existingPayrolls, selectedMonth, onClose, onGenerate }: {
  staff: any[]
  existingPayrolls: any[]
  selectedMonth: string
  onClose: () => void
  onGenerate: (s: any) => void
}) {
  useEscClose(onClose)
  const existingStaffIds = new Set(existingPayrolls.map(p => p.staffId))
  const eligible = staff.filter(s => (parseFloat(s.basicSalary) || 0) > 0)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<string>('')

  // Filter by search
  const filtered = eligible.filter(s => {
    if (!search.trim()) return true
    const q = search.toLowerCase().trim()
    return (
      `${s.firstName} ${s.lastName}`.toLowerCase().includes(q) ||
      (s.code || '').toLowerCase().includes(q) ||
      (s.role || '').toLowerCase().includes(q)
    )
  })

  // Get the selected staff
  const selectedStaff = eligible.find(s => s.id === selected)

  // Calculate the payroll breakdown preview using the payroll-my library
  const payrollPreview = useMemo(() => {
    if (!selectedStaff) return null
    const basicSalary = parseFloat(selectedStaff.basicSalary) || 0
    const allowances = parseFloat(selectedStaff.defaultAllowances) || 0
    const zakat = parseFloat(selectedStaff.defaultZakat) || 0
    const loanDeduction = parseFloat(selectedStaff.defaultLoanDeduction) || 0
    const skipStatutory = selectedStaff.employmentType === 'OTHER'
    return calculatePayroll({ basicSalary, allowances, zakat, loanDeduction, skipStatutory })
  }, [selectedStaff])

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8 max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b p-4 flex-shrink-0">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Calculator className="h-4 w-4" /> Generate Payroll — {selectedMonth}
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>

        {eligible.length === 0 ? (
          <div className="p-6 text-center text-muted-foreground">
            <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-amber-500" />
            <p>No staff with a basic salary set.</p>
            <p className="text-xs mt-1">Set each staff&apos;s Basic Salary in the Directory tab first.</p>
          </div>
        ) : (
          <>
            {/* Search bar */}
            <div className="p-4 pb-2 flex-shrink-0">
              <StandardSearchBar
                value={search}
                onChange={setSearch}
                placeholder="Search by name, code, or role..."
                totalCount={eligible.length}
                filteredCount={filtered.length}
                className="w-full"
              />
            </div>

            {/* Staff list — scrollable */}
            <div className="px-4 pb-2 overflow-y-auto flex-shrink-0" style={{ maxHeight: '200px' }}>
              <div className="space-y-1">
                {filtered.map(s => {
                  const hasPayroll = existingStaffIds.has(s.id)
                  const isSelected = selected === s.id
                  return (
                    <button
                      key={s.id}
                      onClick={() => setSelected(s.id)}
                      className={`w-full text-left p-2 rounded-lg border transition-colors ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                      }`}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {s.code && <span className="text-xs font-mono text-primary mr-1">{s.code}</span>}
                            {s.firstName} {s.lastName}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {s.role?.replace(/_/g, ' ').toLowerCase()} • {fmtMoney(parseFloat(s.basicSalary) || 0)}/mo
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {hasPayroll && (
                            <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200 whitespace-nowrap">
                              Already generated
                            </Badge>
                          )}
                          {isSelected && (
                            <CheckCircle className="h-4 w-4 text-primary" />
                          )}
                        </div>
                      </div>
                    </button>
                  )
                })}
                {filtered.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-4">No staff matching "{search}"</p>
                )}
              </div>
            </div>

            {/* Deduction breakdown preview — shows when a staff is selected */}
            {selectedStaff && payrollPreview && (
              <div className="px-4 pb-2 flex-shrink-0">
                <div className="border rounded-lg p-3 bg-muted/20 space-y-2">
                  <div className="text-xs font-semibold text-muted-foreground uppercase">Payroll Breakdown Preview</div>
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    {/* Earnings */}
                    <div className="space-y-1">
                      <div className="font-medium text-emerald-700 mb-1">Earnings</div>
                      <div className="flex justify-between"><span>Basic Salary</span><span>{fmtMoney(payrollPreview.basicSalary)}</span></div>
                      <div className="flex justify-between"><span>Allowances</span><span>{fmtMoney(payrollPreview.allowances)}</span></div>
                      <div className="flex justify-between font-medium border-t pt-1"><span>Gross Pay</span><span>{fmtMoney(payrollPreview.grossPay)}</span></div>
                    </div>
                    {/* Deductions */}
                    <div className="space-y-1">
                      <div className="font-medium text-red-700 mb-1">Deductions</div>
                      <div className="flex justify-between"><span>EPF (11%)</span><span>{fmtMoney(payrollPreview.epfEmployee)}</span></div>
                      <div className="flex justify-between"><span>SOCSO (0.5%)</span><span>{fmtMoney(payrollPreview.socsoEmployee)}</span></div>
                      <div className="flex justify-between"><span>EIS (0.2%)</span><span>{fmtMoney(payrollPreview.eisEmployee)}</span></div>
                      <div className="flex justify-between"><span>PCB Tax</span><span>{fmtMoney(payrollPreview.pcbTax)}</span></div>
                      {(payrollPreview.zakat > 0) && <div className="flex justify-between"><span>Zakat</span><span>{fmtMoney(payrollPreview.zakat)}</span></div>}
                      {(payrollPreview.loanDeduction > 0) && <div className="flex justify-between"><span>Loan Repayment</span><span>{fmtMoney(payrollPreview.loanDeduction)}</span></div>}
                      <div className="flex justify-between font-medium border-t pt-1"><span>Total</span><span>{fmtMoney(payrollPreview.totalDeductions)}</span></div>
                    </div>
                  </div>
                  <div className="flex justify-between items-center bg-emerald-50 border border-emerald-200 rounded p-2 mt-2">
                    <span className="text-xs font-medium text-emerald-900">Net Pay (take-home)</span>
                    <span className="text-lg font-bold text-emerald-700">{fmtMoney(payrollPreview.netPay)}</span>
                  </div>
                  {/* Per-staff custom deductions info */}
                  {(selectedStaff.defaultZakat > 0 || selectedStaff.defaultLoanDeduction > 0 || selectedStaff.defaultAllowances > 0) && (
                    <div className="text-[10px] text-muted-foreground bg-blue-50 border border-blue-200 rounded p-1.5">
                      <strong>Per-staff settings applied:</strong>
                      {selectedStaff.defaultAllowances > 0 && <> Allowances: {fmtMoney(selectedStaff.defaultAllowances)}</>}
                      {selectedStaff.defaultZakat > 0 && <> • Zakat: {fmtMoney(selectedStaff.defaultZakat)}</>}
                      {selectedStaff.defaultLoanDeduction > 0 && <> • Loan: {fmtMoney(selectedStaff.defaultLoanDeduction)}</>}
                      <> — Set in Staff → Profile → Edit → Payroll Info</>
                    </div>
                  )}
                  {/* Employer contributions */}
                  <div className="text-[10px] text-muted-foreground border-t pt-1.5">
                    <strong>Employer contributions (not deducted from staff):</strong>
                    EPF 12%: {fmtMoney(payrollPreview.epfEmployer)} •
                    SOCSO 1.75%: {fmtMoney(payrollPreview.socsoEmployer)} •
                    EIS 0.2%: {fmtMoney(payrollPreview.eisEmployer)} •
                    Total employer cost: {fmtMoney(payrollPreview.grossPay + payrollPreview.epfEmployer + payrollPreview.socsoEmployer + payrollPreview.eisEmployer)}
                  </div>
                </div>
              </div>
            )}

            {/* Warning if already has payroll */}
            {selected && existingStaffIds.has(selected) && (
              <div className="px-4 pb-2 flex-shrink-0">
                <div className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                  ⚠ This staff already has a payroll for {selectedMonth}. Generating will create a duplicate.
                </div>
              </div>
            )}
          </>
        )}

        <div className="flex flex-wrap justify-end gap-2 p-4 border-t flex-shrink-0">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!selected || eligible.length === 0}
            onClick={() => {
              const s = eligible.find(s => s.id === selected)
              if (s) onGenerate(s)
            }}
          >
            <Calculator className="h-3.5 w-3.5 mr-1" /> Generate Payroll
          </Button>
        </div>
      </div>
    </div>
  )
}

function ViewPayrollDialog({ payroll, onClose }: { payroll: any; onClose: () => void }) {
  useEscClose(onClose)
  const p = payroll
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8" onClick={e => e.stopPropagation()}>
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <FileText className="h-4 w-4" /> Pay Slip — {p.payrollMonth}
          </h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
          </div>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="bg-muted/30 rounded p-3">
            <div className="font-medium">
              {p.staff?.code && <span className="text-xs font-mono text-primary mr-1">{p.staff.code}</span>}
              {p.staff?.firstName} {p.staff?.lastName}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {p.staff?.role?.replace(/_/g, ' ').toLowerCase() || '—'}
              {p.staff?.icNumber && <> • IC: {p.staff.icNumber}</>}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Earnings</h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span>Basic Salary</span><span>{fmtMoney(p.basicSalary)}</span></div>
                <div className="flex justify-between"><span>Overtime ({p.overtimeHours || 0}h)</span><span>{fmtMoney(p.overtimePay)}</span></div>
                <div className="flex justify-between"><span>Allowances</span><span>{fmtMoney(p.allowances)}</span></div>
                <div className="flex justify-between"><span>Bonus</span><span>{fmtMoney(p.bonus)}</span></div>
                <div className="flex justify-between"><span>Commission</span><span>{fmtMoney(p.commission)}</span></div>
                <div className="flex justify-between font-medium border-t pt-1"><span>Gross Pay</span><span>{fmtMoney(p.grossPay)}</span></div>
              </div>
            </div>
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-1">Deductions</h4>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between"><span>EPF (11%)</span><span>{fmtMoney(p.epfEmployee)}</span></div>
                <div className="flex justify-between"><span>SOCSO (0.5%)</span><span>{fmtMoney(p.socsoEmployee)}</span></div>
                <div className="flex justify-between"><span>EIS (0.2%)</span><span>{fmtMoney(p.eisEmployee)}</span></div>
                <div className="flex justify-between"><span>PCB Tax</span><span>{fmtMoney(p.pcbTax)}</span></div>
                <div className="flex justify-between"><span>Zakat</span><span>{fmtMoney(p.zakat)}</span></div>
                <div className="flex justify-between"><span>Loan</span><span>{fmtMoney(p.loanDeduction)}</span></div>
                <div className="flex justify-between"><span>Unpaid Leave</span><span>{fmtMoney(p.unpaidLeaveDeduction)}</span></div>
                <div className="flex justify-between font-medium border-t pt-1"><span>Total Deductions</span><span>{fmtMoney(p.totalDeductions)}</span></div>
              </div>
            </div>
          </div>

          <div className="bg-emerald-50 border border-emerald-200 rounded p-3 flex justify-between items-center">
            <div>
              <div className="text-xs text-muted-foreground">Net Pay</div>
              <div className="text-2xl font-bold text-emerald-700">{fmtMoney(p.netPay)}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Status</div>
              <StatusBadge status={p.status} />
              {p.paidAt && <div className="text-xs text-muted-foreground mt-1">Paid: {fmtDate(p.paidAt)}</div>}
            </div>
          </div>

          <div className="bg-muted/30 rounded p-2 text-xs text-muted-foreground">
            <div className="font-medium text-foreground mb-1">Employer Contributions (not deducted from staff)</div>
            <div className="grid grid-cols-3 gap-2 mt-1">
              <div>EPF (12%): {fmtMoney(p.epfEmployer)}</div>
              <div>SOCSO (1.75%): {fmtMoney(p.socsoEmployer)}</div>
              <div>EIS (0.2%): {fmtMoney(p.eisEmployer)}</div>
            </div>
            <div className="mt-1">
              Total employer cost: <strong>{fmtMoney(p.grossPay + p.epfEmployer + p.socsoEmployer + p.eisEmployer)}</strong>
            </div>
          </div>

          {p.notes && (
            <div className="text-xs">
              <span className="text-muted-foreground">Notes: </span>
              <span className="italic">{p.notes}</span>
            </div>
          )}
        </div>
        <div className="flex justify-end p-4 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

// ============ LEAVE BALANCE TABLE ============
// Shows annual + sick leave used vs. remaining per staff, based on Malaysian Employment Act:
//   Annual leave: < 1 year tenure = 8 days, 1-2 years = 12, > 2 years = 16
//   Sick leave: < 2 years tenure = 14 days, > 2 years = 18
// Counted from APPROVED leaves in the current calendar year.
function LeaveBalanceTable({ staff, leaves }: { staff: any[]; leaves: any[] }) {
  const currentYear = new Date().getFullYear()

  // Count approved leave days per staff, per type, for the current year
  const balances = staff.map(s => {
    const staffLeaves = leaves.filter(l =>
      l.staffId === s.id &&
      l.status === 'APPROVED' &&
      new Date(l.startDate).getFullYear() === currentYear
    )
    // Calculate total days from date ranges
    const countDays = (type: string) => {
      return staffLeaves
        .filter(l => l.type === type)
        .reduce((sum, l) => {
          const start = new Date(l.startDate)
          const end = new Date(l.endDate)
          return sum + Math.ceil((end.getTime() - start.getTime()) / 86400000) + 1
        }, 0)
    }

    // Entitlement based on tenure
    const tenureYears = s.hireDate
      ? (Date.now() - new Date(s.hireDate).getTime()) / (365.25 * 86400000)
      : 0
    const annualEntitlement = tenureYears < 1 ? 8 : tenureYears < 2 ? 12 : 16
    const sickEntitlement = tenureYears < 2 ? 14 : 18

    const annualUsed = countDays('ANNUAL')
    const sickUsed = countDays('SICK')

    return {
      staff: s,
      annualUsed,
      annualRemaining: annualEntitlement - annualUsed,
      annualEntitlement,
      sickUsed,
      sickRemaining: sickEntitlement - sickUsed,
      sickEntitlement,
      tenureYears: Math.floor(tenureYears * 10) / 10,
    }
  })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-2 font-medium">Staff</th>
            <th className="text-center p-2 font-medium">Tenure</th>
            <th className="text-center p-2 font-medium">Annual Used</th>
            <th className="text-center p-2 font-medium">Annual Remaining</th>
            <th className="text-center p-2 font-medium">Sick Used</th>
            <th className="text-center p-2 font-medium">Sick Remaining</th>
          </tr>
        </thead>
        <tbody>
          {balances.map(b => (
            <tr key={b.staff.id} className="border-t hover:bg-muted/30">
              <td className="p-2">
                <div className="font-medium">{b.staff.firstName} {b.staff.lastName}</div>
                {b.staff.code && <span className="text-[10px] font-mono text-primary">{b.staff.code}</span>}
              </td>
              <td className="p-2 text-center text-muted-foreground">{b.tenureYears}y</td>
              <td className="p-2 text-center">{b.annualUsed} / {b.annualEntitlement}</td>
              <td className={`p-2 text-center font-medium ${b.annualRemaining < 0 ? 'text-red-600' : b.annualRemaining <= 2 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {b.annualRemaining}
              </td>
              <td className="p-2 text-center">{b.sickUsed} / {b.sickEntitlement}</td>
              <td className={`p-2 text-center font-medium ${b.sickRemaining < 0 ? 'text-red-600' : b.sickRemaining <= 2 ? 'text-amber-600' : 'text-emerald-600'}`}>
                {b.sickRemaining}
              </td>
            </tr>
          ))}
          {balances.length === 0 && (
            <tr>
              <td colSpan={6} className="p-4 text-center text-muted-foreground">No staff found</td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="text-[10px] text-muted-foreground mt-2">
        Counts APPROVED leaves in {currentYear}. Negative balances indicate overuse — staff has taken more leave than entitled.
      </p>
    </div>
  )
}
