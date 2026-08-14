'use client'

import { useState } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPatch, apiDelete } from './api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { StatusBadge } from './Badges'
import { fmtDateTime, fmtDate } from '@/lib/types'
import { Calendar, Stethoscope, Edit, X, Activity, CloudUpload, Trash2, AlertTriangle, Sparkles, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { StandardSearchBar } from './StandardSearchBar'

export function Visits({ facilityId }: { facilityId?: string }) {
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [search, setSearch] = useState('')
  const [noteVisitId, setNoteVisitId] = useState<string | null>(null)
  const [cancellingId, setCancellingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=visits${tab === 'upcoming' ? '&upcoming=true' : ''}${facilityParam}`)

  // Delete a visit record. Backend handler at /api/data DELETE writes a
  // VISIT_DELETED audit entry with the full visit context (resident, type,
  // scheduled date, who deleted it).
  const deleteVisit = async (v: any) => {
    setDeletingId(v.id)
    try {
      await apiDelete(`/api/data?type=visits&id=${v.id}`)
      toast.success(`Deleted ${v.visitType?.replace(/_/g, ' ') || 'visit'} for ${v.resident?.firstName || ''} ${v.resident?.lastName || ''}`.trim())
      refetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete visit')
    }
    setDeletingId(null)
    setConfirmDelete(null)
  }

  const all = data || []
  const filtered = all.filter(v => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      `${v.resident?.firstName} ${v.resident?.lastName}`.toLowerCase().includes(s) ||
      v.resident?.code?.toLowerCase().includes(s) ||
      v.resident?.room?.roomNumber?.toLowerCase().includes(s) ||
      v.visitType?.toLowerCase().includes(s) ||
      v.staff && `${v.staff.firstName} ${v.staff.lastName}`.toLowerCase().includes(s)
    )
  })

  // Group by date
  const grouped: Record<string, any[]> = {}
  for (const v of filtered) {
    const k = fmtDate(v.scheduledAt)
    if (!grouped[k]) grouped[k] = []
    grouped[k].push(v)
  }

  // Find the visit being noted
  const noteVisit = noteVisitId ? all.find(v => v.id === noteVisitId) : null

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        {(['upcoming', 'past'] as const).map(t => (
          <button key={t} onClick={() => { setTab(t); setSearch('') }} className={`px-4 py-2 text-sm border-b-2 capitalize ${tab === t ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
            {t === 'upcoming' ? 'Upcoming' : 'Past Visits'}
          </button>
        ))}
      </div>

      <StandardSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by resident, code, room, visit type, staff..."
        totalCount={all.length}
        filteredCount={filtered.length}
      />

      {Object.keys(grouped).length === 0 && <p className="text-sm text-muted-foreground text-center py-8">No {tab} visits</p>}

      {Object.entries(grouped).map(([date, visits]) => (
        <div key={date}>
          <h3 className="text-sm font-semibold text-muted-foreground mb-2">{date}</h3>
          <div className="grid gap-2">
            {visits.map(v => (
              <Card key={v.id}>
                <CardContent className="p-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline">{v.visitType.replace(/_/g, ' ')}</Badge>
                        <StatusBadge status={v.status} />
                        <span className="text-xs text-muted-foreground whitespace-nowrap">{fmtDateTime(v.scheduledAt)}</span>
                        {v.externalSource && (
                          <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-300 gap-1 whitespace-nowrap" title={`Synced from ${v.externalSource}`}>
                            <CloudUpload className="h-3 w-3" /> {v.externalSource}
                          </Badge>
                        )}
                      </div>
                      <div className="font-medium mt-1">
                        {v.resident?.code && <span className="text-xs font-mono text-primary mr-1">{v.resident.code}</span>}
                        {v.resident?.firstName} {v.resident?.lastName} <span className="text-xs text-muted-foreground">Room {v.resident?.room?.roomNumber || '—'}</span>
                      </div>
                      {v.staff
                        ? <div className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">With: {v.staff.firstName} {v.staff.lastName} ({v.staff.role.replace(/_/g, ' ')})</div>
                        : v.completedByName
                          ? <div className="text-xs text-muted-foreground mt-0.5 whitespace-nowrap">With: {v.completedByName}</div>
                          : null
                      }

                      {/* Clinical note fields — shown if filled */}
                      {v.chiefComplaint && <div className="text-sm mt-2"><span className="font-medium">Chief Complaint:</span> {v.chiefComplaint}</div>}
                      {v.vitalsNote && <div className="text-sm mt-1"><span className="font-medium">Vitals:</span> {v.vitalsNote}</div>}
                      {v.findings && <div className="text-sm mt-1"><span className="font-medium">Findings:</span> {v.findings}</div>}
                      {v.diagnosis && <div className="text-sm mt-1"><span className="font-medium">Diagnosis:</span> {v.diagnosis}</div>}
                      {v.treatmentPlan && <div className="text-sm mt-1"><span className="font-medium">Treatment Plan:</span> {v.treatmentPlan}</div>}
                      {v.prescription && <div className="text-sm mt-1"><span className="font-medium">Prescription:</span> {v.prescription}</div>}
                      {v.followUpNote && <div className="text-sm mt-1"><span className="font-medium">Follow-up:</span> {v.followUpNote}</div>}
                      {v.recommendations && <div className="text-sm mt-1"><span className="font-medium">Recommendations:</span> {v.recommendations}</div>}
                      {v.completedAt && <div className="text-xs text-muted-foreground mt-1 whitespace-nowrap">Completed: {fmtDate(v.completedAt)}{v.duration ? ` • ${v.duration} min` : ''}</div>}
                    </div>
                    {/* Action buttons — compact on mobile (icon-only), full on desktop */}
                    <div className="flex gap-1 flex-wrap sm:flex-nowrap sm:flex-shrink-0 sm:justify-end">
                      {v.status === 'SCHEDULED' && (
                        <>
                          <Button size="sm" variant="outline" onClick={() => setNoteVisitId(v.id)} className="h-7 px-2">
                            <Edit className="h-3 w-3 sm:mr-1" /> <span className="hidden sm:inline">Fill Form</span>
                          </Button>
                          <Button size="sm" variant="ghost" className="text-amber-600 hover:bg-amber-50 h-7 px-2" disabled={cancellingId === v.id} onClick={async () => {
                            if (!confirm('Cancel this visit? This cannot be undone.')) return
                            setCancellingId(v.id)
                            try {
                              await apiPatch(`/api/data?type=visits&id=${v.id}`, { status: 'CANCELLED' })
                              toast.success('Visit cancelled')
                              refetch()
                            } catch (e: any) {
                              toast.error(e.message || 'Failed to cancel visit')
                            }
                            setCancellingId(null)
                          }} title="Cancel visit (status → CANCELLED, record kept)">
                            <X className="h-3 w-3 sm:mr-1" /> <span className="hidden sm:inline">Cancel</span>
                          </Button>
                        </>
                      )}
                      {v.status === 'COMPLETED' && (
                        <Button size="sm" variant="ghost" onClick={() => setNoteVisitId(v.id)} title="View visit notes" className="h-7 px-2">
                          <Stethoscope className="h-3 w-3 sm:mr-1" /> <span className="hidden sm:inline">View</span>
                        </Button>
                      )}
                      {/* Delete — permanently removes the record (with confirmation dialog).
                          Red Trash2 icon. Different from "Cancel" (amber X) which only changes status. */}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-red-600 hover:bg-red-50 h-7 px-2"
                        disabled={deletingId === v.id}
                        onClick={() => setConfirmDelete(v)}
                        title="Delete this visit permanently"
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      {/* Visit note dialog */}
      {noteVisit && (
        <VisitFormDialog visit={noteVisit} onClose={() => setNoteVisitId(null)} onSaved={() => { setNoteVisitId(null); refetch() }} onDelete={() => { setNoteVisitId(null); setConfirmDelete(noteVisit) }} />
      )}

      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <DeleteVisitDialog
          visit={confirmDelete}
          loading={deletingId === confirmDelete.id}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={() => deleteVisit(confirmDelete)}
        />
      )}
    </div>
  )
}

/**
 * DeleteVisitDialog — explicit confirmation step before permanently removing
 * a visit record. Shows the visit summary (resident, type, date, doctor,
 * clinical-note presence) so the user knows exactly what they're deleting.
 */
function DeleteVisitDialog({ visit, loading, onCancel, onConfirm }: {
  visit: any
  loading: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  useEscClose(onCancel)
  const hasClinicalNotes = !!(visit.chiefComplaint || visit.diagnosis || visit.prescription || visit.findings || visit.treatmentPlan || visit.vitalsNote)
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2 text-red-700">
            <AlertTriangle className="h-4 w-4" /> Delete Visit?
          </h3>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={loading}>×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {/* Visit summary */}
          <div className="rounded-md bg-muted/50 p-3 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline">{visit.visitType?.replace(/_/g, ' ') || 'Visit'}</Badge>
              <StatusBadge status={visit.status} />
              <span className="text-xs text-muted-foreground">{fmtDateTime(visit.scheduledAt)}</span>
            </div>
            <div className="font-medium mt-1">
              {visit.resident?.code && <span className="text-xs font-mono text-primary mr-1">{visit.resident.code}</span>}
              {visit.resident?.firstName} {visit.resident?.lastName}
            </div>
            {visit.staff
              ? <div className="text-xs text-muted-foreground">With: {visit.staff.firstName} {visit.staff.lastName}</div>
              : visit.completedByName
                ? <div className="text-xs text-muted-foreground">With: {visit.completedByName}</div>
                : null
            }
            {visit.externalSource && (
              <div className="text-xs text-violet-700 flex items-center gap-1">
                <CloudUpload className="h-3 w-3" /> Synced from {visit.externalSource}
              </div>
            )}
          </div>

          {/* Warning about clinical notes */}
          {hasClinicalNotes && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">This visit has clinical notes attached.</div>
                <div className="mt-0.5">
                  {(visit.chiefComplaint || visit.diagnosis || visit.prescription || visit.findings || visit.treatmentPlan || visit.vitalsNote)
                    && 'Chief complaint, diagnosis, prescription, or vitals will be permanently deleted. '}
                  The deletion will be logged in the audit trail (who, when, what was deleted).
                </div>
              </div>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            This action <span className="font-semibold text-foreground">cannot be undone</span>. If you only want to hide a visit from the resident's record, consider cancelling it instead (status → CANCELLED) so the audit history is preserved.
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={onConfirm} disabled={loading}>
            {loading ? <><Trash2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Deleting...</> : <><Trash2 className="h-3.5 w-3.5 mr-1" /> Delete Permanently</>}
          </Button>
        </div>
      </div>
    </div>
  )
}

/**
 * VisitFormDialog — clinical notes form for completing a visit.
 * Includes chief complaint, vitals (auto-saved to Vital Signs), findings,
 * diagnosis, treatment plan, prescription, and follow-up.
 */
function VisitFormDialog({ visit, onClose, onSaved, onDelete }: { visit: any; onClose: () => void; onSaved: () => void; onDelete?: () => void }) {
  useEscClose(onClose)
  const { data: currentUser } = useFetch<any>('/api/auth/me')

  // No access denial — if the user can see the button, they can fill/edit.
  // Buttons are only shown to users with module access (controlled by role/level).
  const [editMode, setEditMode] = useState(false)
  const isReadOnly = visit.status === 'COMPLETED' && !editMode

  // === AI MAR Generator state ===
  // When the user clicks "AI: Create MAR", we POST to /api/ai/generate-mar
  // which uses AI to parse the visit's prescription into structured meds +
  // creates Medication + MedAdministration records.
  const [marGenerating, setMarGenerating] = useState(false)
  const [marResult, setMarResult] = useState<any | null>(null)

  const generateMAR = async () => {
    if (!visit.prescription) {
      toast.error('This visit note has no prescription to generate MAR from.')
      return
    }
    if (!confirm(`Use AI to parse the prescription and create medication + MAR entries for ${visit.resident?.firstName} ${visit.resident?.lastName}?\n\nPrescription:\n${visit.prescription}`)) return
    setMarGenerating(true)
    setMarResult(null)
    try {
      const r = await fetch('/api/ai/generate-mar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitId: visit.id }),
      })
      const data = await r.json()
      if (!r.ok) {
        toast.error(data.error || 'AI MAR generation failed')
        return
      }
      setMarResult(data)
      toast.success(data.message || `Created ${data.created?.length || 0} medications + ${data.marCount || 0} MAR entries`)
      onSaved()  // refetch the visits list in case the visit was updated
    } catch (e: any) {
      toast.error(e.message || 'Network error during AI MAR generation')
    }
    setMarGenerating(false)
  }

  // Prefill start/end with current date/time (formatted for datetime-local input)
  const nowLocal = () => {
    const d = new Date()
    const off = d.getTimezoneOffset()
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
  }
  const addMinutes = (dtStr: string, mins: number) => {
    const d = new Date(dtStr)
    d.setMinutes(d.getMinutes() + mins)
    const off = d.getTimezoneOffset()
    return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16)
  }

  const [form, setForm] = useState<any>({
    visitStart: visit.completedAt ? new Date(visit.completedAt).toISOString().slice(0, 16) : nowLocal(),
    visitEnd: visit.completedAt && visit.duration ? addMinutes(new Date(visit.completedAt).toISOString().slice(0, 16), visit.duration) : addMinutes(nowLocal(), 30),
    chiefComplaint: visit.chiefComplaint || '',
    // Structured vitals fields
    bpSys: visit.vitalsNote ? (visit.vitalsNote.match(/BP\s*(\d+)/i)?.[1] || '') : '',
    bpDia: visit.vitalsNote ? (visit.vitalsNote.match(/BP\s*\d+\/(\d+)/i)?.[1] || '') : '',
    hr: visit.vitalsNote ? (visit.vitalsNote.match(/HR\s*(\d+)/i)?.[1] || '') : '',
    temp: visit.vitalsNote ? (visit.vitalsNote.match(/Temp\s*([\d.]+)/i)?.[1] || '') : '',
    rr: visit.vitalsNote ? (visit.vitalsNote.match(/RR\s*(\d+)/i)?.[1] || '') : '',
    o2: visit.vitalsNote ? (visit.vitalsNote.match(/SpO2?\s*(\d+)/i)?.[1] || '') : '',
    bs: visit.vitalsNote ? (visit.vitalsNote.match(/BS\s*([\d.]+)/i)?.[1] || '') : '',
    wt: visit.vitalsNote ? (visit.vitalsNote.match(/Wt\s*([\d.]+)/i)?.[1] || '') : '',
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

  // Auto-calculate duration when start/end changes
  const calcDuration = () => {
    if (form.visitStart && form.visitEnd) {
      const start = new Date(form.visitStart)
      const end = new Date(form.visitEnd)
      const diffMin = Math.round((end.getTime() - start.getTime()) / 60000)
      if (diffMin > 0) return diffMin
    }
    return form.duration ? parseInt(form.duration) : null
  }

  const submit = async () => {
    setSaving(true)
    try {
      const userName = currentUser?.user?.name || 'Unknown'
      const duration = calcDuration()

      // Build vitalsNote string from structured fields (for display on the visit record)
      const vitalsParts: string[] = []
      if (form.bpSys && form.bpDia) vitalsParts.push(`BP ${form.bpSys}/${form.bpDia}`)
      if (form.hr) vitalsParts.push(`HR ${form.hr}`)
      if (form.temp) vitalsParts.push(`Temp ${form.temp}`)
      if (form.rr) vitalsParts.push(`RR ${form.rr}`)
      if (form.o2) vitalsParts.push(`SpO2 ${form.o2}`)
      if (form.bs) vitalsParts.push(`BS ${form.bs}`)
      if (form.wt) vitalsParts.push(`Wt ${form.wt}`)
      const vitalsNoteStr = vitalsParts.join(', ')

      const payload: any = {
        chiefComplaint: form.chiefComplaint || null,
        vitalsNote: vitalsNoteStr || null,
        findings: form.findings || null,
        diagnosis: form.diagnosis || null,
        treatmentPlan: form.treatmentPlan || null,
        prescription: form.prescription || null,
        followUpNote: form.followUpNote || null,
        recommendations: form.recommendations || null,
        duration: duration,
        scheduledAt: form.visitStart ? new Date(form.visitStart).toISOString() : undefined,
      }
      if (visit.status === 'SCHEDULED') {
        payload.status = 'COMPLETED'
        payload.completedAt = form.visitEnd ? new Date(form.visitEnd).toISOString() : new Date().toISOString()
        payload.completedById = currentUser?.user?.id || null
        payload.completedByName = userName
      } else {
        payload.completedAt = form.visitEnd ? new Date(form.visitEnd).toISOString() : undefined
      }
      await apiPatch(`/api/data?type=visits&id=${visit.id}`, payload)

      // Auto-create a VitalSign record from the structured vitals fields
      const vitalsData: any = {}
      if (form.bpSys) vitalsData.bloodPressureSystolic = parseInt(form.bpSys)
      if (form.bpDia) vitalsData.bloodPressureDiastolic = parseInt(form.bpDia)
      if (form.hr) vitalsData.heartRate = parseInt(form.hr)
      if (form.temp) vitalsData.temperature = parseFloat(form.temp)
      if (form.rr) vitalsData.respiratoryRate = parseInt(form.rr)
      if (form.o2) vitalsData.oxygenSaturation = parseInt(form.o2)
      if (form.bs) vitalsData.bloodSugar = parseFloat(form.bs)
      if (form.wt) vitalsData.weight = parseFloat(form.wt)

      if (Object.keys(vitalsData).length > 0) {
        try {
          const { apiPost } = await import('./api')
          await apiPost('/api/data?type=vitals', {
            residentId: visit.residentId,
            ...vitalsData,
            notes: `Recorded during ${visit.visitType.replace(/_/g, ' ')} visit by ${userName}`,
            recordedById: currentUser?.user?.id || null,
          })
          toast.success('Vitals auto-saved to Vital Signs module')
        } catch (e: any) {
          console.log('Vitals auto-save failed (non-critical):', e.message)
        }
      }

      toast.success(visit.status === 'SCHEDULED' ? 'Visit form submitted — moved to Past Visits' : 'Visit notes updated')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8 max-h-[calc(100vh-4rem)] flex flex-col">
        <div className="flex justify-between items-center border-b p-4 flex-shrink-0">
          <h3 className="font-semibold">
            {isReadOnly ? 'Visit Notes (Read-Only)' : visit.status === 'SCHEDULED' ? 'Visit Form — Clinical Notes' : 'Edit Visit Notes'}
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 overflow-y-auto flex-1 space-y-3">
          {/* Visit info */}
          <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 flex flex-wrap items-center gap-x-2 gap-y-1">
            <Badge variant="outline">{visit.visitType.replace(/_/g, ' ')}</Badge>
            <span className="whitespace-nowrap">Scheduled: {fmtDateTime(visit.scheduledAt)}</span>
            {visit.staff && <span className="whitespace-nowrap">• Assigned: {visit.staff.firstName} {visit.staff.lastName}</span>}
            {visit.resident && <span className="whitespace-nowrap">• {visit.resident.firstName} {visit.resident.lastName}</span>}
            {visit.completedByName && <span className="whitespace-nowrap">• Filled by: {visit.completedByName}</span>}
            {visit.externalSource && (
              <Badge variant="outline" className="text-[9px] bg-violet-50 text-violet-700 border-violet-300 gap-1 whitespace-nowrap" title={`Synced from ${visit.externalSource}`}>
                <CloudUpload className="h-2.5 w-2.5" /> Synced from {visit.externalSource}
              </Badge>
            )}
            {isReadOnly && <Badge variant="outline" className="text-[9px] text-amber-700 border-amber-300">Read-Only</Badge>}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            {/* Visit start & end date/time — prefilled with current time */}
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Visit Start *</label>
              <Input type="datetime-local" value={form.visitStart} onChange={e => setForm({ ...form, visitStart: e.target.value })} disabled={isReadOnly} className="text-sm" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Visit End</label>
              <Input type="datetime-local" value={form.visitEnd} onChange={e => setForm({ ...form, visitEnd: e.target.value })} disabled={isReadOnly} className="text-sm" />
              {calcDuration() && <p className="text-[9px] text-muted-foreground mt-0.5">Duration: {calcDuration()} min</p>}
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Chief Complaint</label>
              <textarea className="w-full border rounded px-2 py-1.5 text-sm" rows={2} value={form.chiefComplaint} onChange={e => setForm({ ...form, chiefComplaint: e.target.value })} disabled={isReadOnly} placeholder="Patient's main complaint, e.g. lower back pain for 2 weeks" />
            </div>
            <div className="sm:col-span-2 border rounded-md p-2 bg-emerald-50/30">
              <div className="text-xs font-semibold text-emerald-700 mb-2 flex items-center gap-1">
                <Activity className="h-3.5 w-3.5" /> Vital Signs <span className="text-[9px] text-muted-foreground font-normal">(auto-saves to Vital Signs module)</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">BP Systolic (mmHg)</label>
                  <Input type="number" value={form.bpSys || ''} onChange={e => setForm({ ...form, bpSys: e.target.value })} disabled={isReadOnly} placeholder="140" className="text-sm h-8" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">BP Diastolic (mmHg)</label>
                  <Input type="number" value={form.bpDia || ''} onChange={e => setForm({ ...form, bpDia: e.target.value })} disabled={isReadOnly} placeholder="90" className="text-sm h-8" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Heart Rate (bpm)</label>
                  <Input type="number" value={form.hr || ''} onChange={e => setForm({ ...form, hr: e.target.value })} disabled={isReadOnly} placeholder="72" className="text-sm h-8" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Temperature (°C)</label>
                  <Input type="number" step="0.1" value={form.temp || ''} onChange={e => setForm({ ...form, temp: e.target.value })} disabled={isReadOnly} placeholder="37.2" className="text-sm h-8" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Resp Rate (/min)</label>
                  <Input type="number" value={form.rr || ''} onChange={e => setForm({ ...form, rr: e.target.value })} disabled={isReadOnly} placeholder="18" className="text-sm h-8" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">SpO₂ (%)</label>
                  <Input type="number" value={form.o2 || ''} onChange={e => setForm({ ...form, o2: e.target.value })} disabled={isReadOnly} placeholder="98" className="text-sm h-8" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Blood Sugar (mmol/L)</label>
                  <Input type="number" step="0.1" value={form.bs || ''} onChange={e => setForm({ ...form, bs: e.target.value })} disabled={isReadOnly} placeholder="5.5" className="text-sm h-8" />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Weight (kg)</label>
                  <Input type="number" step="0.1" value={form.wt || ''} onChange={e => setForm({ ...form, wt: e.target.value })} disabled={isReadOnly} placeholder="65" className="text-sm h-8" />
                </div>
              </div>
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
        </div>
        {/* Footer: edit mode shows Cancel + Submit; read-only shows Delete + Edit + Close */}
        {(!isReadOnly || editMode) ? (
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t flex-shrink-0">
          {editMode && (
            <Button variant="outline" onClick={() => setEditMode(false)}>Cancel</Button>
          )}
          {!editMode && (
            <Button variant="outline" onClick={onClose}>Cancel</Button>
          )}
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Submitting...' : visit.status === 'SCHEDULED' ? 'Submit Form' : 'Update Notes'}
          </Button>
        </div>
        ) : (
        <div className="flex flex-col gap-2 p-4 border-t flex-shrink-0">
          {/* AI MAR Generator result — shown after the AI runs */}
          {marResult && (
            <div className="rounded-md border border-violet-200 bg-violet-50/50 p-2.5 text-xs space-y-1.5">
              <div className="font-semibold text-violet-800 flex items-center gap-1">
                <Sparkles className="h-3.5 w-3.5" /> AI MAR Generator Result
              </div>
              {marResult.created?.length > 0 && (
                <div className="space-y-0.5">
                  <div className="text-violet-700 font-medium">Created medications:</div>
                  {marResult.created.map((m: any) => (
                    <div key={m.id} className="pl-3 text-muted-foreground">
                      • {m.name} {m.dosage} — {m.frequency} ({m.route})
                      {Array.isArray(m.scheduleTimes) && m.scheduleTimes.length > 0 && (
                        <span className="text-[10px]"> at {m.scheduleTimes.join(', ')}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {marResult.skipped?.length > 0 && (
                <div className="text-amber-700">
                  {marResult.skipped.length} medication(s) skipped (already exist or unparseable)
                </div>
              )}
              <div className="text-violet-700 font-medium">
                MAR entries generated: {marResult.marCount || 0} (today + tomorrow)
              </div>
              {marResult.tokensUsed && (
                <div className="text-[10px] text-muted-foreground">
                  Tokens used: {marResult.tokensUsed.total} ({marResult.tokensUsed.prompt} prompt + {marResult.tokensUsed.completion} completion)
                </div>
              )}
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {onDelete && (
                <Button variant="ghost" className="text-red-600 hover:bg-red-50" onClick={onDelete} title="Delete this visit record permanently">
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              )}
              {/* AI MAR Generator button — only shown for COMPLETED visits with a prescription.
                  Uses AI to parse the free-text prescription into structured medications + MAR entries. */}
              {visit.prescription && (
                <Button
                  variant="outline"
                  className="text-violet-600 border-violet-300 hover:bg-violet-50"
                  disabled={marGenerating}
                  onClick={generateMAR}
                  title="Use AI to parse this prescription into structured medications + generate MAR entries"
                >
                  {marGenerating ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Generating MAR...</> : <><Sparkles className="h-3.5 w-3.5 mr-1" /> AI: Create MAR</>}
                </Button>
              )}
            </div>
            <div className="flex gap-2 ml-auto">
              <Button onClick={() => setEditMode(true)}>
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
              <Button variant="outline" onClick={onClose}>Close</Button>
            </div>
          </div>
        </div>
        )}
      </div>
    </div>
  )
}

/**
 * Parses vital signs from free-text input.
 * Supports: "BP 140/90, HR 72, Temp 37.2, RR 18, SpO2 98, BS 5.5, Wt 65"
 */
function parseVitalsFromText(text: string): any | null {
  const result: any = {}
  const lower = text.toLowerCase()

  const bpMatch = lower.match(/(?:bp|blood\s*pressure)?\s*(\d{2,3})\s*\/\s*(\d{2,3})/)
  if (bpMatch) { result.bloodPressureSystolic = parseInt(bpMatch[1]); result.bloodPressureDiastolic = parseInt(bpMatch[2]) }

  const hrMatch = lower.match(/(?:hr|heart\s*rate|pulse)\s*:?\s*(\d{2,3})/)
  if (hrMatch) result.heartRate = parseInt(hrMatch[1])

  const tempMatch = lower.match(/(?:temp|temperature)?\s*:?\s*(\d{2,3}(?:\.\d)?)\s*(?:°?c|°?f)?/i)
  if (tempMatch) {
    const temp = parseFloat(tempMatch[1])
    if (temp >= 30 && temp <= 45) result.temperature = temp
    else if (temp >= 90 && temp <= 115) result.temperature = parseFloat(((temp - 32) * 5/9).toFixed(1))
  }

  const rrMatch = lower.match(/(?:rr|resp(?:iratory)?\s*rate)\s*:?\s*(\d{2,3})/)
  if (rrMatch) { const rr = parseInt(rrMatch[1]); if (rr >= 8 && rr <= 60) result.respiratoryRate = rr }

  const o2Match = lower.match(/(?:spo2|o2|oxygen|sat)\s*:?\s*(\d{2,3})\s*%?/)
  if (o2Match) { const o2 = parseInt(o2Match[1]); if (o2 >= 50 && o2 <= 100) result.oxygenSaturation = o2 }

  const bsMatch = lower.match(/(?:bs|blood\s*sugar|glucose|bgl)\s*:?\s*(\d{1,3}(?:\.\d)?)\s*(?:mmol\/l|mg\/dl)?/)
  if (bsMatch) {
    const bs = parseFloat(bsMatch[1])
    if (bs >= 3 && bs <= 30) result.bloodSugar = bs
    else if (bs >= 50 && bs <= 500) result.bloodSugar = parseFloat((bs / 18.0182).toFixed(1))
  }

  const wtMatch = lower.match(/(?:wt|weight)\s*:?\s*(\d{2,3}(?:\.\d)?)\s*kg?/)
  if (wtMatch) result.weight = parseFloat(wtMatch[1])

  return Object.keys(result).length > 0 ? result : null
}

export function Incidents({ facilityId }: { facilityId?: string }) {
  const [search, setSearch] = useState('')
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading } = useFetch<any[]>(`/api/data?type=incidents${facilityParam}`)

  const all = data || []
  const filtered = all.filter(i => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      `${i.resident?.firstName} ${i.resident?.lastName}`.toLowerCase().includes(s) ||
      i.resident?.code?.toLowerCase().includes(s) ||
      i.resident?.room?.roomNumber?.toLowerCase().includes(s) ||
      i.incidentType?.toLowerCase().includes(s) ||
      i.severity?.toLowerCase().includes(s) ||
      i.description?.toLowerCase().includes(s) ||
      i.actionTaken?.toLowerCase().includes(s) ||
      i.followUp?.toLowerCase().includes(s)
    )
  })

  if (loading) return <Skeleton className="h-96" />

  return (
    <div className="space-y-4">
      <StandardSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by resident, code, room, type, severity, description..."
        totalCount={all.length}
        filteredCount={filtered.length}
      />
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2"><Calendar className="h-4 w-4" /> Incident Reports (Recent)</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y max-h-[600px] overflow-y-auto">
            {filtered.length === 0 && <p className="text-sm text-muted-foreground text-center py-8">{search ? 'No incidents match your search' : 'No incidents reported'}</p>}
            {filtered.map(i => (
            <div key={i.id} className="p-3">
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
                <span className="text-xs text-muted-foreground">{fmtDateTime(i.occurredAt)}</span>
              </div>
              <div className="font-medium text-sm">
                {i.resident?.code && <span className="text-xs font-mono text-primary mr-1">{i.resident.code}</span>}
                {i.resident?.firstName} {i.resident?.lastName}
              </div>
              <p className="text-sm mt-1">{i.description}</p>
              {i.actionTaken && <p className="text-xs mt-1 text-muted-foreground"><span className="font-medium">Action:</span> {i.actionTaken}</p>}
              {i.followUp && <p className="text-xs mt-0.5 text-muted-foreground"><span className="font-medium">Follow-up:</span> {i.followUp}</p>}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
    </div>
  )
}
