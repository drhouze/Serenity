'use client'

import { useFetch } from './api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StatusBadge } from './Badges'
import { fmtDate, fmtDateTime, fmtTime, age, initials } from '@/lib/types'
import {
  Heart, MessageSquare, Calendar, Activity, FileText, AlertCircle,
  Pill, BedDouble, User, ChevronRight
} from 'lucide-react'

interface FamilyDashboardData {
  isFamily: boolean
  linkedResidents: any[]
  messages: any[]
  recentVisits: any[]
  recentCareLogs: any[]
  recentIncidents: any[]
  unreadCount: number
}

export function FamilyDashboard({ onNavigate }: { onNavigate: (m: string) => void }) {
  const { data, loading } = useFetch<FamilyDashboardData>('/api/dashboard')

  if (loading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  if (data.linkedResidents.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <Heart className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="font-medium">No residents linked to your account</p>
          <p className="text-sm text-muted-foreground mt-1">
            Please contact the nursing home staff to link your account with your family member.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* Linked residents */}
      <div>
        <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
          <Heart className="h-5 w-5 text-rose-500" /> Your Family Member{data.linkedResidents.length > 1 ? 's' : ''}
        </h2>
        <div className="grid gap-3">
          {data.linkedResidents.map((r: any) => (
            <Card key={r.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => onNavigate('residents')}>
              <CardContent className="p-4">
                <div className="flex items-start gap-3">
                  <Avatar className="h-14 w-14">
                    <AvatarFallback className="bg-emerald-100 text-emerald-700 text-lg">
                      {initials(r.firstName, r.lastName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {r.code && <Badge variant="outline" className="text-xs font-mono bg-primary/5 text-primary">{r.code}</Badge>}
                      <h3 className="font-bold text-lg">{r.firstName} {r.lastName}</h3>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-sm text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                      {r.dateOfBirth && <span>{age(r.dateOfBirth)} years old</span>}
                      <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" /> Room {r.room?.roomNumber || 'Unassigned'}</span>
                      <span>Admitted {fmtDate(r.admissionDate)}</span>
                    </div>
                    {r.dietaryNeeds && r.dietaryNeeds !== 'Regular' && (
                      <div className="text-sm mt-2">
                        <span className="text-muted-foreground">Diet: </span>
                        <Badge variant="outline">{r.dietaryNeeds}</Badge>
                      </div>
                    )}
                    {r.allergies && r.allergies !== 'None' && (
                      <div className="text-sm mt-1 text-red-600 flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> Allergies: {r.allergies}
                      </div>
                    )}
                    {r.medications?.length > 0 && (
                      <div className="text-sm mt-1 flex items-center gap-1 text-muted-foreground">
                        <Pill className="h-3 w-3" /> {r.medications.length} active medication{r.medications.length > 1 ? 's' : ''}
                      </div>
                    )}
                    <div className="text-xs text-primary mt-2 flex items-center gap-1">
                      Click to view full details <ChevronRight className="h-3 w-3" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <button onClick={() => onNavigate('messages')} className="text-left transition-shadow hover:shadow-md">
          <Card className="h-full">
            <CardContent className="p-4">
              <div className="p-1.5 rounded-lg bg-teal-50 inline-block mb-2">
                <MessageSquare className="h-4 w-4 text-teal-600" />
              </div>
              <div className="text-2xl font-bold">{data.unreadCount}</div>
              <div className="text-xs text-muted-foreground">Unread Messages</div>
            </CardContent>
          </Card>
        </button>
        <button onClick={() => onNavigate('residents')} className="text-left transition-shadow hover:shadow-md">
          <Card className="h-full">
            <CardContent className="p-4">
              <div className="p-1.5 rounded-lg bg-sky-50 inline-block mb-2">
                <Calendar className="h-4 w-4 text-sky-600" />
              </div>
              <div className="text-2xl font-bold">{data.recentVisits.length}</div>
              <div className="text-xs text-muted-foreground">Upcoming Visits</div>
            </CardContent>
          </Card>
        </button>
        <button onClick={() => onNavigate('residents')} className="text-left transition-shadow hover:shadow-md">
          <Card className="h-full">
            <CardContent className="p-4">
              <div className="p-1.5 rounded-lg bg-violet-50 inline-block mb-2">
                <FileText className="h-4 w-4 text-violet-600" />
              </div>
              <div className="text-2xl font-bold">{data.recentCareLogs.length}</div>
              <div className="text-xs text-muted-foreground">Recent Care Updates</div>
            </CardContent>
          </Card>
        </button>
        <button onClick={() => onNavigate('residents')} className="text-left transition-shadow hover:shadow-md">
          <Card className="h-full">
            <CardContent className="p-4">
              <div className="p-1.5 rounded-lg bg-amber-50 inline-block mb-2">
                <AlertCircle className="h-4 w-4 text-amber-600" />
              </div>
              <div className="text-2xl font-bold">{data.recentIncidents.length}</div>
              <div className="text-xs text-muted-foreground">Recent Incidents</div>
            </CardContent>
          </Card>
        </button>
      </div>

      {/* Messages preview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquare className="h-4 w-4" /> Recent Messages
          </CardTitle>
          <CardDescription>Communication about your family member</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 max-h-72 overflow-y-auto">
          {data.messages.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No messages yet</p>}
          {data.messages.slice(0, 5).map((m: any) => (
            <div key={m.id} className={`rounded-md border p-2 text-sm ${!m.read ? 'border-primary/40 bg-primary/5' : ''}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <span className="font-medium truncate">{m.subject || '(no subject)'}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">{fmtDateTime(m.sentAt)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Re: {m.resident?.code && <span className="font-mono text-primary">{m.resident.code} </span>}{m.resident?.firstName} {m.resident?.lastName} • From {m.sender?.name}</p>
              <p className="text-sm mt-1 line-clamp-2">{m.body}</p>
            </div>
          ))}
          {data.messages.length > 0 && (
            <button onClick={() => onNavigate('messages')} className="w-full text-center text-xs text-primary hover:underline pt-2">
              View all messages →
            </button>
          )}
        </CardContent>
      </Card>

      {/* Upcoming visits */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Upcoming Visits
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 max-h-64 overflow-y-auto">
          {data.recentVisits.length === 0 && <p className="text-sm text-muted-foreground text-center py-4">No upcoming visits scheduled</p>}
          {data.recentVisits.map((v: any) => (
            <div key={v.id} className="flex items-center justify-between rounded-md border p-2 text-sm">
              <div>
                <div className="font-medium flex items-center gap-2">
                  {v.visitType.replace(/_/g, ' ')}
                  {v.externalSource && (
                    <span className="text-[9px] bg-violet-50 text-violet-700 border border-violet-300 rounded px-1 py-0.5" title={`Synced from ${v.externalSource}`}>
                      Synced
                    </span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  For {v.resident?.code && <span className="font-mono text-primary">{v.resident.code} </span>}
                  {v.resident?.firstName} {v.resident?.lastName}
                  {v.staff
                    ? ` • with ${v.staff.firstName} ${v.staff.lastName}`
                    : v.completedByName
                      ? ` • with ${v.completedByName}`
                      : ''}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs font-medium">{fmtDate(v.scheduledAt)}</div>
                <div className="text-xs text-muted-foreground">{fmtTime(v.scheduledAt)}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Recent care updates */}
      {data.recentCareLogs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" /> Recent Care Updates
            </CardTitle>
            <CardDescription>What the care team has noted recently</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 max-h-64 overflow-y-auto">
            {data.recentCareLogs.map((l: any) => (
              <div key={l.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <Badge variant="outline" className="text-xs">{l.category}</Badge>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(l.recordedAt)}</span>
                </div>
                <p>{l.description}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  For {l.resident?.code && <span className="font-mono text-primary">{l.resident.code} </span>}
                  {l.resident?.firstName} {l.resident?.lastName}
                  {l.staff && ` • by ${l.staff.firstName} ${l.staff.lastName}`}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Recent incidents */}
      {data.recentIncidents.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertCircle className="h-4 w-4" /> Incident Reports
            </CardTitle>
            <CardDescription>Incidents involving your family member</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.recentIncidents.map((i: any) => (
              <div key={i.id} className="rounded-md border p-2 text-sm">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-xs">{i.incidentType.replace(/_/g, ' ')}</Badge>
                    <Badge variant="outline" className="text-xs">{i.severity}</Badge>
                  </div>
                  <span className="text-xs text-muted-foreground">{fmtDateTime(i.occurredAt)}</span>
                </div>
                <p>{i.description}</p>
                {i.resident && (
                  <p className="text-xs text-muted-foreground mt-1">
                    For {i.resident.code && <span className="font-mono text-primary">{i.resident.code} </span>}
                    {i.resident.firstName} {i.resident.lastName}
                  </p>
                )}
                {i.actionTaken && <p className="text-xs text-muted-foreground mt-1"><span className="font-medium">Action taken:</span> {i.actionTaken}</p>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
