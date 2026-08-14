'use client'

import { useFetch } from './api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { StatusBadge, ShiftBadge } from './Badges'
import { fmtTime, fmtDateTime, fmtMoney, age } from '@/lib/types'
import {
  Users, BedDouble, Calendar, Pill, AlertTriangle, DollarSign,
  MessageSquare, Activity, Stethoscope, Clock, Phone
} from 'lucide-react'

interface DashboardData {
  kpis: {
    activeResidents: number
    totalStaff: number
    occupancyRate: number
    occupiedBeds: number
    totalBeds: number
    totalRooms: number
    occupiedRooms: number
    todayShifts: number
    todayVisits: number
    todayMedAdmins: number
    pendingMedAdmins: number
    overdueInvoicesCount: number
    outstandingAmount: number
    overdueAmount: number
    unbilledAmount: number
    unreadMessages: number
    criticalIncidents: number
    monthlyExpenses: number
    monthlyRevenue: number
    monthlyCollected?: number
    monthlyInvoiceCount?: number
    monthlyExpenseCount?: number
    monthStartDate?: string
  }
  todayShifts: any[]
  todayVisits: any[]
  upcomingVisits: any[]
  recentIncidents: any[]
}

export function Dashboard({ onNavigate, facilityId }: { onNavigate: (m: string) => void; facilityId?: string }) {
  const url = facilityId ? `/api/dashboard?facilityId=${facilityId}` : '/api/dashboard'
  // Auto-refresh every 30s so multiple users see each other's changes
  // (e.g. new admissions, medication updates, vitals logged by other staff)
  const { data, loading } = useFetch<DashboardData>(url, { refreshInterval: 30000 })

  if (loading || !data) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    )
  }

  const k = data.kpis
  const kpiCards = [
    { label: 'Active Residents', value: k.activeResidents, icon: Users, color: 'text-emerald-600', bg: 'bg-emerald-50', onClick: () => onNavigate('residents') },
    { label: 'Bed Occupancy', value: `${k.occupancyRate}%`, sub: `${k.occupiedBeds}/${k.totalBeds} beds`, icon: BedDouble, color: 'text-amber-600', bg: 'bg-amber-50', onClick: () => onNavigate('rooms') },
    { label: "Today's Shifts", value: k.todayShifts, icon: Clock, color: 'text-violet-600', bg: 'bg-violet-50', onClick: () => onNavigate('staff') },
    { label: "Today's Visits", value: k.todayVisits, icon: Stethoscope, color: 'text-sky-600', bg: 'bg-sky-50', onClick: () => onNavigate('clinical') },
    { label: 'Meds Due Today', value: k.todayMedAdmins, sub: `${k.pendingMedAdmins} pending`, icon: Pill, color: 'text-rose-600', bg: 'bg-rose-50', onClick: () => onNavigate('clinical') },
    { label: 'Outstanding A/R', value: fmtMoney(k.outstandingAmount), sub: `${k.overdueInvoicesCount} overdue`, icon: DollarSign, color: 'text-orange-600', bg: 'bg-orange-50', onClick: () => onNavigate('finance') },
    { label: 'Unbilled Services', value: fmtMoney(k.unbilledAmount), icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', onClick: () => onNavigate('finance') },
    { label: 'Unread Messages', value: k.unreadMessages, icon: MessageSquare, color: 'text-teal-600', bg: 'bg-teal-50', onClick: () => onNavigate('messages') },
  ]

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {(k.criticalIncidents > 0 || k.overdueInvoicesCount > 0 || k.pendingMedAdmins > 0) && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-amber-900">Action needed</p>
              <ul className="text-amber-800 space-y-0.5">
                {k.criticalIncidents > 0 && <li>• {k.criticalIncidents} critical/high incidents in the last 30 days</li>}
                {k.overdueInvoicesCount > 0 && <li>• {k.overdueInvoicesCount} overdue invoices totaling {fmtMoney(k.overdueAmount)}</li>}
                {k.pendingMedAdmins > 0 && <li>• {k.pendingMedAdmins} medication administrations pending today</li>}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {kpiCards.map((c, i) => (
          <button
            key={i}
            onClick={c.onClick}
            className="text-left transition-shadow hover:shadow-md"
          >
            <Card className="h-full">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className={`p-2 rounded-lg ${c.bg}`}>
                    <c.icon className={`h-4 w-4 ${c.color}`} />
                  </div>
                </div>
                <div className="text-2xl font-bold tracking-tight">{c.value}</div>
                <div className="text-xs text-muted-foreground mt-1">{c.label}</div>
                {c.sub && <div className="text-xs text-muted-foreground/70 mt-0.5">{c.sub}</div>}
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      {/* Today's schedule + upcoming */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card onClick={() => onNavigate('staff')} className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" /> Today&apos;s Shifts
            </CardTitle>
            <CardDescription>{data.todayShifts.length} staff scheduled today — click to view all shifts</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto">
            {data.todayShifts.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No shifts scheduled</p>}
            {data.todayShifts.map(s => (
              <div key={s.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  <div className="font-medium">{s.staff?.firstName} {s.staff?.lastName}</div>
                  <div className="text-xs text-muted-foreground">{s.staff?.role.replace(/_/g, ' ')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono">{s.startTime} – {s.endTime}</span>
                  <ShiftBadge type={s.shiftType} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card onClick={() => onNavigate('clinical')} className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Stethoscope className="h-4 w-4" /> Today&apos;s Visits
            </CardTitle>
            <CardDescription>{data.todayVisits.length} visits scheduled today — click to view all visits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto">
            {data.todayVisits.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No visits today</p>}
            {data.todayVisits.map(v => (
              <div key={v.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  <div className="font-medium">
                    {v.resident?.code && <span className="text-xs font-mono text-primary mr-1">{v.resident.code}</span>}
                    {v.resident?.firstName} {v.resident?.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground">{v.visitType.replace(/_/g, ' ')}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono">{fmtTime(v.scheduledAt)}</span>
                  <StatusBadge status={v.status} />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Upcoming visits + Recent incidents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card onClick={() => onNavigate('clinical')} className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Upcoming Visits (7 days)
            </CardTitle>
            <CardDescription>Click to view all visits</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto">
            {data.upcomingVisits.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No upcoming visits</p>}
            {data.upcomingVisits.slice(0, 10).map(v => (
              <div key={v.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
                <div>
                  <div className="font-medium">
                    {v.resident?.code && <span className="text-xs font-mono text-primary mr-1">{v.resident.code}</span>}
                    {v.resident?.firstName} {v.resident?.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground">{v.visitType.replace(/_/g, ' ')} • {v.staff?.firstName} {v.staff?.lastName}</div>
                </div>
                <span className="text-xs text-muted-foreground">{fmtDateTime(v.scheduledAt)}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card onClick={() => onNavigate('incidents')} className="cursor-pointer hover:shadow-md transition-shadow">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" /> Recent Incidents (7 days)
            </CardTitle>
            <CardDescription>Click to view all incidents</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-80 overflow-y-auto">
            {data.recentIncidents.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">No incidents reported</p>}
            {data.recentIncidents.map(i => (
              <div key={i.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <div>
                    <span className="font-medium">
                      {i.resident?.code && <span className="text-xs font-mono text-primary mr-1">{i.resident.code}</span>}
                      {i.resident?.firstName} {i.resident?.lastName}
                    </span>
                    {i.resident?.room?.roomNumber && (
                      <span className="text-xs text-muted-foreground ml-2">Room {i.resident.room.roomNumber}</span>
                    )}
                  </div>
                  <div className="flex gap-1">
                    <Badge variant="outline" className="text-xs">{i.incidentType.replace(/_/g, ' ')}</Badge>
                    <Badge variant="outline" className="text-xs">{i.severity}</Badge>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{i.description}</p>
                {/* Family / emergency contact info */}
                {i.resident?.emergencyContactName && (
                  <div className="text-xs mt-1 px-1.5 py-1 rounded bg-blue-50 border border-blue-200 text-blue-800">
                    <span className="font-medium">Family Contact:</span> {i.resident.emergencyContactName}
                    {i.resident.emergencyContactRelation && <span className="text-blue-600"> ({i.resident.emergencyContactRelation})</span>}
                    {i.resident.emergencyContactPhone && (
                      <a href={`tel:${i.resident.emergencyContactPhone}`} className="ml-1 text-blue-600 hover:underline flex items-center gap-0.5 inline-flex">
                        <Phone className="h-3 w-3" /> {i.resident.emergencyContactPhone}
                      </a>
                    )}
                  </div>
                )}
                {i.actionTaken && <p className="text-xs text-muted-foreground/80 mt-1"><span className="font-medium">Action:</span> {i.actionTaken}</p>}
                <p className="text-xs text-muted-foreground/70 mt-0.5">{fmtDateTime(i.occurredAt)}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Financial snapshot */}
      <Card onClick={() => onNavigate('finance')} className="cursor-pointer hover:shadow-md transition-shadow">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Activity className="h-4 w-4" /> Financial Snapshot
          </CardTitle>
          <CardDescription>
            {k.monthStartDate
              ? `Since ${new Date(k.monthStartDate).toLocaleDateString('en-MY', { day: 'numeric', month: 'short', year: 'numeric' })} — click to view full finance module`
              : 'Click to view full finance module'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">
                Billed This Month {k.monthlyInvoiceCount ? `(${k.monthlyInvoiceCount})` : ''}
              </div>
              <div className="text-lg font-semibold text-sky-600">{fmtMoney(k.monthlyRevenue)}</div>
              <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                Collected: <span className="text-emerald-600 font-medium">{fmtMoney(k.monthlyCollected || 0)}</span>
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">
                Expenses This Month {k.monthlyExpenseCount ? `(${k.monthlyExpenseCount})` : ''}
              </div>
              <div className="text-lg font-semibold text-orange-600">{fmtMoney(k.monthlyExpenses)}</div>
              {k.monthlyExpenses === 0 && (
                <div className="text-[10px] text-amber-600 mt-0.5">No expenses logged yet this month</div>
              )}
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Net (Billed − Expenses)</div>
              <div className="text-lg font-semibold">{fmtMoney(k.monthlyRevenue - k.monthlyExpenses)}</div>
              <div className="text-[10px] text-muted-foreground/80 mt-0.5">
                Cash basis: {fmtMoney((k.monthlyCollected || 0) - k.monthlyExpenses)}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Total Outstanding</div>
              <div className="text-lg font-semibold text-red-600">{fmtMoney(k.outstandingAmount)}</div>
              {k.overdueInvoicesCount > 0 && (
                <div className="text-[10px] text-red-600/80 mt-0.5">
                  {k.overdueInvoicesCount} overdue: {fmtMoney(k.overdueAmount)}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
