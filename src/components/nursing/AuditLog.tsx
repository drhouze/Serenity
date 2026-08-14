'use client'

import { useState, useEffect } from 'react'
import { useFetch } from './api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Search, ScrollText, LogIn, LogOut, Pill, Activity, FileText,
  AlertTriangle, DollarSign, MessageSquare, UserCog, Calendar,
  Package, Shield, Building2
} from 'lucide-react'
import { fmtDateTime } from '@/lib/types'
import { StandardSearchBar } from './StandardSearchBar'
import { DateRangeFilter, type DateRangeValue } from './DateRangeFilter'

const ACTION_ICONS: Record<string, any> = {
  LOGIN: LogIn,
  LOGOUT: LogOut,
  MED_ADMINISTERED: Pill,
  MED_REFUSED: Pill,
  VITAL_RECORDED: Activity,
  CARE_LOG_ADDED: FileText,
  VISIT_SCHEDULED: Calendar,
  VISIT_COMPLETED: Calendar,
  INCIDENT_REPORTED: AlertTriangle,
  INVOICE_CREATED: DollarSign,
  INVOICE_PAID: DollarSign,
  INVOICE_DELETED: DollarSign,
  EXPENSE_ADDED: DollarSign,
  UNBILLED_ITEM_ADDED: DollarSign,
  UNBILLED_ITEM_EDITED: DollarSign,
  UNBILLED_ITEM_REPEATED: DollarSign,
  MONTHLY_CHARGES_GENERATED: DollarSign,
  MESSAGE_SENT: MessageSquare,
  INVENTORY_ADJUSTED: Package,
  USER_CREATED: UserCog,
  USER_UPDATED: UserCog,
  RESIDENT_CREATED: UserCog,
  RESIDENT_UPDATED: UserCog,
  RESIDENT_ARCHIVED: UserCog,
  RESIDENT_RESTORED: UserCog,
  RESIDENT_STATUS_CHANGED: UserCog,
  SHIFT_ADDED: Calendar,
  SHIFT_DELETED: Calendar,
}

const ACTION_COLORS: Record<string, string> = {
  LOGIN: 'bg-emerald-100 text-emerald-700',
  LOGOUT: 'bg-slate-100 text-slate-700',
  MED_ADMINISTERED: 'bg-rose-100 text-rose-700',
  MED_REFUSED: 'bg-amber-100 text-amber-700',
  VITAL_RECORDED: 'bg-sky-100 text-sky-700',
  CARE_LOG_ADDED: 'bg-violet-100 text-violet-700',
  INCIDENT_REPORTED: 'bg-red-100 text-red-700',
  INVOICE_CREATED: 'bg-emerald-100 text-emerald-700',
  INVOICE_PAID: 'bg-emerald-100 text-emerald-700',
  MESSAGE_SENT: 'bg-teal-100 text-teal-700',
}

const ACTION_FILTERS = [
  'ALL',
  'LOGIN', 'LOGOUT',
  'MED_ADMINISTERED', 'MED_REFUSED',
  'VITAL_RECORDED', 'CARE_LOG_ADDED',
  'VISIT_SCHEDULED', 'VISIT_COMPLETED',
  'INCIDENT_REPORTED',
  'INVOICE_CREATED', 'INVOICE_PAID',
  'UNBILLED_ITEM_ADDED', 'UNBILLED_ITEM_EDITED', 'UNBILLED_ITEM_REPEATED',
  'MONTHLY_CHARGES_GENERATED',
  'EXPENSE_ADDED',
  'MESSAGE_SENT',
  'USER_CREATED', 'USER_UPDATED',
  'RESIDENT_STATUS_CHANGED',
  'SHIFT_ADDED', 'SHIFT_DELETED',
]

// Regex to detect entity codes in audit log descriptions.
// We render them as styled chips so codes stand out at a glance.
// Patterns: RES-0001, USR-0001, STF-0001, ROM-0001, PRD-0001, INV-0001, ITM-0001
const CODE_PATTERN = /\b((?:RES|USR|STF|ROM|PRD|INV|ITM)-\d{3,5})\b/g

function renderDescriptionWithCodes(description: string) {
  if (!description) return null
  // Split description by code pattern, capturing the codes
  const parts = description.split(CODE_PATTERN)
  return (
    <>
      {parts.map((part, i) => {
        if (CODE_PATTERN.test(part)) {
          // Reset lastIndex (stateful regex)
          CODE_PATTERN.lastIndex = 0
          return (
            <Badge key={i} variant="outline" className="mx-0.5 font-mono text-[10px] py-0 px-1.5 bg-primary/5 border-primary/30 text-primary">
              {part}
            </Badge>
          )
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

// Parse the userName field — newer entries prepend the code (e.g., "USR-0001 Sarah Chen")
function parseUserWithName(userName: string): { code: string | null; name: string } {
  const match = userName.match(/^((?:USR-\d{3,5}))\s+(.+)$/)
  if (match) {
    return { code: match[1], name: match[2] }
  }
  return { code: null, name: userName }
}

export function AuditLog({ facilityId }: { facilityId?: string }) {
  const [search, setSearch] = useState('')
  const [actionFilter, setActionFilter] = useState('ALL')
  const [userFilter, setUserFilter] = useState('')
  const [facilityFilter, setFacilityFilter] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRangeValue>({})
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const isDeveloper = currentUser?.user?.role === 'APP_DEVELOPER'
  const facilityParam = facilityFilter ? `&facilityId=${facilityFilter}` : ''
  const dateQ = (dateRange.startDate ? `&startDate=${dateRange.startDate}` : '') + (dateRange.endDate ? `&endDate=${dateRange.endDate}` : '')
  const { data, loading } = useFetch<any[]>(`/api/data?type=auditLogs${facilityParam}${dateQ}`)
  // Load facilities list for the filter dropdown
  const { data: facilities } = useFetch<any[]>('/api/facilities')

  // Initialize facility filter:
  // - Developer: "All Facilities" (empty) so they see everything
  // - Owner/Manager: the selected facility from the header
  useEffect(() => {
    if (isDeveloper) {
      setFacilityFilter('')  // Developer sees all by default
    } else if (facilityId !== undefined) {
      setFacilityFilter(facilityId)  // Others get the selected facility
    }
  }, [isDeveloper, facilityId])

  if (loading) return <Skeleton className="h-96" />

  const all = data || []

  // Get unique users + facilities for filters
  const uniqueUsers = Array.from(new Set(all.map(l => l.userName)))
  const uniqueFacilities = Array.from(new Set(all.map(l => l.facilityName).filter(Boolean))) as string[]

  let filtered = all
  if (actionFilter !== 'ALL') {
    filtered = filtered.filter(l => l.action === actionFilter)
  }
  if (userFilter) {
    filtered = filtered.filter(l => l.userName === userFilter)
  }
  if (search) {
    const s = search.toLowerCase()
    filtered = filtered.filter(l =>
      l.description?.toLowerCase().includes(s) ||
      l.action?.toLowerCase().includes(s) ||
      l.userName?.toLowerCase().includes(s) ||
      l.facilityName?.toLowerCase().includes(s) ||
      l.metadata?.toLowerCase().includes(s)
    )
  }

  // Group by date
  const grouped: Record<string, any[]> = {}
  for (const l of filtered) {
    const d = new Date(l.createdAt).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    if (!grouped[d]) grouped[d] = []
    grouped[d].push(l)
  }

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Events</div>
          <div className="text-2xl font-bold">{all.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Unique Users</div>
          <div className="text-2xl font-bold">{uniqueUsers.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Action Types</div>
          <div className="text-2xl font-bold">{new Set(all.map(l => l.action)).size}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Showing</div>
          <div className="text-2xl font-bold">{filtered.length}</div>
        </CardContent></Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center flex-wrap">
        <StandardSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by description, action, user, code, or facility..."
          totalCount={all.length}
          filteredCount={filtered.length}
          className="flex-1 min-w-[200px]"
        />
        <DateRangeFilter
          value={dateRange}
          onChange={setDateRange}
          label="Logged"
          align="end"
        />
        <select className="border rounded px-3 py-1.5 text-sm" value={userFilter} onChange={e => setUserFilter(e.target.value)}>
          <option value="">All users</option>
          {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
        </select>
        {/* Facility filter — Owner can switch between facilities, or view all */}
        <select className="border rounded px-3 py-1.5 text-sm" value={facilityFilter} onChange={e => setFacilityFilter(e.target.value)}>
          <option value="">All Facilities</option>
          {(facilities || []).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>

      {/* Action filter chips */}
      <div className="flex gap-1 flex-wrap">
        {ACTION_FILTERS.map(a => (
          <button
            key={a}
            onClick={() => setActionFilter(a)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
              actionFilter === a
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background border-border hover:bg-muted'
            }`}
          >
            {a.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}
          </button>
        ))}
      </div>

      {/* Legend */}
      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
        <span>Codes are shown as</span>
        <Badge variant="outline" className="font-mono text-[10px] py-0 px-1.5 bg-primary/5 border-primary/30 text-primary">RES-0001</Badge>
        <Badge variant="outline" className="font-mono text-[10px] py-0 px-1.5 bg-primary/5 border-primary/30 text-primary">STF-0001</Badge>
        <Badge variant="outline" className="font-mono text-[10px] py-0 px-1.5 bg-primary/5 border-primary/30 text-primary">USR-0001</Badge>
        <span>— searchable.</span>
      </div>

      {/* Timeline */}
      {Object.keys(grouped).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ScrollText className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No audit log entries found</p>
          </CardContent>
        </Card>
      )}

      {Object.entries(grouped).map(([date, entries]) => (
        <div key={date}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 mt-4 sticky top-14 bg-background py-1 z-10">
            {date} • {entries.length} event{entries.length > 1 ? 's' : ''}
          </h3>
          <div className="space-y-2">
            {entries.map(l => {
              const Icon = ACTION_ICONS[l.action] || ScrollText
              const colorClass = ACTION_COLORS[l.action] || 'bg-muted text-muted-foreground'
              const parsed = parseUserWithName(l.userName || '')
              const initials = parsed.name.split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()
              return (
                <Card key={l.id} className="hover:shadow-sm transition-shadow">
                  <CardContent className="p-3 flex items-start gap-3">
                    <div className={`p-1.5 rounded-lg flex-shrink-0 ${colorClass}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-start justify-between gap-2 flex-wrap">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm">{renderDescriptionWithCodes(l.description)}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <Badge variant="outline" className="text-xs">{l.action.replace(/_/g, ' ').toLowerCase()}</Badge>
                            {l.userRole && <Badge variant="outline" className="text-xs">{l.userRole}</Badge>}
                            {l.facilityName && (
                              <Badge variant="outline" className="text-xs bg-sky-50 border-sky-200 text-sky-700 flex items-center gap-1">
                                <Building2 className="h-2.5 w-2.5" /> {l.facilityName}
                              </Badge>
                            )}
                            {l.entityType && <span className="text-xs text-muted-foreground">{l.entityType}</span>}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            {parsed.code && (
                              <Badge variant="outline" className="font-mono text-[10px] py-0 px-1.5 bg-primary/5 border-primary/30 text-primary block mb-0.5">
                                {parsed.code}
                              </Badge>
                            )}
                            <span className="text-xs text-muted-foreground whitespace-nowrap block">{fmtDateTime(l.createdAt)}</span>
                          </div>
                          <Avatar className="h-6 w-6">
                            <AvatarFallback className="bg-primary/10 text-primary text-[10px]">{initials}</AvatarFallback>
                          </Avatar>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
