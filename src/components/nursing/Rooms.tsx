'use client'

import { useState } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPatch, apiPost, apiDelete, withFacility } from './api'
import { useAppDropdowns } from './useAppDropdowns'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { StatusBadge } from './Badges'
import { BedDouble, Archive, ArchiveRestore, X, Wrench, Plus, Edit, Trash2, AlertTriangle } from 'lucide-react'
import { toast } from 'sonner'
import { StandardSearchBar } from './StandardSearchBar'

export function Rooms({ facilityId }: { facilityId?: string }) {
  const { roomTypes, roomStatuses } = useAppDropdowns(facilityId)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [showAdd, setShowAdd] = useState(false)
  const [editingRoom, setEditingRoom] = useState<any | null>(null)
  const [search, setSearch] = useState('')

  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=rooms${facilityParam}`)
  const { data: residentsData } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)

  const handleArchive = async (ids: string[], archive: boolean) => {
    const newStatus = archive ? 'MAINTENANCE' : 'AVAILABLE'
    const action = archive ? 'Marking as maintenance' : 'Restoring'
    toast.info(`${action} ${ids.length} room(s)...`)
    let success = 0
    let failed = 0
    const errors: string[] = []
    for (const id of ids) {
      try {
        // Only allow archiving empty rooms
        const room = (data || []).find(r => r.id === id)
        if (archive && room && room.residents.length > 0) {
          failed++
          errors.push(`Room ${room.roomNumber} has residents — cannot archive`)
          continue
        }
        await apiPatch(`/api/data?type=rooms&id=${id}`, { status: newStatus })
        success++
      } catch (e: any) {
        failed++
        const room = (data || []).find(r => r.id === id)
        const roomLabel = room ? `${room.code || ''} ${room.roomNumber}`.trim() : id.slice(-8)
        errors.push(`${roomLabel}: ${e.message || 'Unknown error'}`)
      }
    }
    if (success > 0) toast.success(`${success} room(s) updated`)
    if (errors.length > 0) {
      // Show first few errors so the user can see what went wrong
      for (const err of errors.slice(0, 3)) {
        toast.error(err)
      }
      if (errors.length > 3) {
        toast.info(`${errors.length - 3} more error(s) not shown`)
      }
    }
    setSelectedIds(new Set())
    refetch()
  }

  const handleDelete = async (room: any) => {
    if (room.residents?.length > 0) {
      toast.error(`Room ${room.roomNumber} has active residents — reassign them first`)
      return
    }
    if (!confirm(`Delete Room ${room.roomNumber}? This cannot be undone.`)) return
    try {
      await apiDelete(`/api/data?type=rooms&id=${room.id}`)
      toast.success(`Room ${room.roomNumber} deleted`)
      refetch()
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete room')
    }
  }

  if (loading) return <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-32" />)}</div>
  if (!data) return null

  const totalBeds = data.reduce((s, r) => s + r.capacity, 0)
  const occupiedBeds = data.reduce((s, r) => s + r.residents.length, 0)
  const occupancy = totalBeds ? Math.round((occupiedBeds / totalBeds) * 100) : 0

  // Filter rooms by search term (room number, code, type, floor, status, resident name)
  const filtered = data.filter(r => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      r.roomNumber?.toLowerCase().includes(s) ||
      r.code?.toLowerCase().includes(s) ||
      r.type?.toLowerCase().includes(s) ||
      r.status?.toLowerCase().includes(s) ||
      String(r.floor).includes(s) ||
      r.residents?.some((res: any) => `${res.firstName} ${res.lastName}`.toLowerCase().includes(s))
    )
  })

  const allSelected = data.length > 0 && data.filter(r => r.residents.length === 0).every(r => selectedIds.has(r.id))
  const someSelected = data.some(r => selectedIds.has(r.id))
  const hasSelection = selectedIds.size > 0

  const toggleAll = () => {
    const archivable = data.filter(r => r.residents.length === 0)
    if (allSelected) {
      const next = new Set(selectedIds)
      archivable.forEach(r => next.delete(r.id))
      setSelectedIds(next)
    } else {
      const next = new Set(selectedIds)
      archivable.forEach(r => next.add(r.id))
      setSelectedIds(next)
    }
  }

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelectedIds(next)
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Rooms</div><div className="text-2xl font-bold">{data.length}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Total Beds</div><div className="text-2xl font-bold">{totalBeds}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Occupied</div><div className="text-2xl font-bold text-amber-600">{occupiedBeds}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-xs text-muted-foreground">Occupancy Rate</div><div className="text-2xl font-bold text-emerald-600">{occupancy}%</div></CardContent></Card>
      </div>

      {/* Unassigned residents alert */}
      {(() => {
        const unassigned = (residentsData || []).filter((r: any) => r.status === 'ACTIVE' && !r.roomId)
        if (unassigned.length === 0) return null
        return (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <div className="font-medium text-amber-800">
                {unassigned.length} active resident{unassigned.length === 1 ? '' : 's'} without a room assignment
              </div>
              <div className="text-xs text-amber-700 mt-0.5">
                {unassigned.map((r: any) => `${r.code || ''} ${r.firstName} ${r.lastName}`).join(', ')}
              </div>
              <div className="text-[10px] text-amber-600 mt-1">
                Go to the Residents module to assign rooms to these residents.
              </div>
            </div>
          </div>
        )
      })()}

      {/* Top bar: search + select-all + Add Room */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <StandardSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by room number, code, type, floor, or resident name..."
          totalCount={data.length}
          filteredCount={filtered.length}
        />
        <div className="flex flex-wrap items-center gap-2 px-3 py-1 text-xs text-muted-foreground">
          <Checkbox
            checked={allSelected ? true : someSelected ? 'indeterminate' : false}
            onCheckedChange={toggleAll}
          />
          <span className="whitespace-nowrap">
            {filtered.length} rooms
            {selectedIds.size > 0 && ` • ${selectedIds.size} selected`}
          </span>
          <span className="text-muted-foreground/70 hidden sm:inline">(only empty rooms can be archived)</span>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" /> Add Room
        </Button>
      </div>

      {hasSelection && (
        <div className="sticky top-14 z-20 flex items-center justify-between gap-2 bg-primary text-primary-foreground rounded-lg p-2 px-4 shadow-md">
          <div className="flex items-center gap-3 text-sm">
            <button onClick={() => setSelectedIds(new Set())} className="hover:opacity-80">
              <X className="h-4 w-4" />
            </button>
            <span className="font-medium">{selectedIds.size} selected</span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" onClick={() => {
              if (confirm(`Mark ${selectedIds.size} room(s) as maintenance? They will be unavailable for new residents.`)) {
                handleArchive(Array.from(selectedIds), true)
              }
            }}>
              <Wrench className="h-3 w-3 mr-1" /> Mark Maintenance
            </Button>
            <Button size="sm" variant="secondary" onClick={() => handleArchive(Array.from(selectedIds), false)}>
              <ArchiveRestore className="h-3 w-3 mr-1" /> Make Available
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {filtered.map(room => {
          const isSelected = selectedIds.has(room.id)
          const canSelect = room.residents.length === 0
          return (
            <Card key={room.id} className={`${isSelected ? 'ring-2 ring-primary' : ''} ${room.status === 'MAINTENANCE' ? 'opacity-70' : ''} relative group`}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {canSelect && (
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggleOne(room.id)}
                      />
                    )}
                    <CardTitle className="text-base">
                      {room.code && <span className="text-xs font-mono text-primary mr-2">{room.code}</span>}
                      Room {room.roomNumber}
                    </CardTitle>
                  </div>
                  <StatusBadge status={room.status} />
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <span>Floor {room.floor}</span> •
                  <span>{room.type.replace(/_/g, ' ')}</span> •
                  <span className="flex items-center gap-1"><BedDouble className="h-3 w-3" /> {room.residents.length}/{room.capacity}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {room.residents.length === 0 && <p className="text-xs text-muted-foreground italic">Empty</p>}
                {room.residents.map(r => (
                  <div key={r.id} className="flex items-center gap-2 text-sm">
                    <Avatar className="h-7 w-7">
                      <AvatarFallback className="bg-emerald-100 text-emerald-700 text-xs">{(r.firstName[0] + r.lastName[0]).toUpperCase()}</AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="truncate">{r.firstName} {r.lastName}</div>
                      {r.allergies && r.allergies !== 'None' && <div className="text-xs text-red-600 truncate">⚠ {r.allergies}</div>}
                    </div>
                  </div>
                ))}
                {room.notes && <p className="text-xs text-muted-foreground italic pt-1 border-t">📝 {room.notes}</p>}

                {/* Per-room edit/delete buttons — always visible */}
                <div className="absolute top-2 right-2 flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    className="h-7 w-7 p-0"
                    onClick={(e) => { e.stopPropagation(); setEditingRoom(room) }}
                    title="Edit room"
                  >
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                  {room.residents.length === 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                      onClick={(e) => { e.stopPropagation(); handleDelete(room) }}
                      title="Delete room"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {filtered.length === 0 && data.length > 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <BedDouble className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No rooms match your search.</p>
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setSearch('')}>Clear search</Button>
        </div>
      )}
      {data.length === 0 && (
        <div className="text-center py-12 border-2 border-dashed rounded-lg">
          <BedDouble className="h-12 w-12 text-muted-foreground/50 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No rooms yet. Add your first room to get started.</p>
          <Button size="sm" onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Add Room</Button>
        </div>
      )}

      {showAdd && (
        <RoomDialog
          facilityId={facilityId}
          roomTypes={roomTypes}
          roomStatuses={roomStatuses}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refetch() }}
        />
      )}
      {editingRoom && (
        <RoomDialog
          room={editingRoom}
          facilityId={facilityId}
          roomTypes={roomTypes}
          roomStatuses={roomStatuses}
          onClose={() => setEditingRoom(null)}
          onSaved={() => { setEditingRoom(null); refetch() }}
        />
      )}
    </div>
  )
}

// ============ ADD / EDIT ROOM DIALOG ============
function RoomDialog({ room, facilityId, roomTypes, roomStatuses, onClose, onSaved }: {
  room?: any
  facilityId?: string
  roomTypes: string[]
  roomStatuses: string[]
  onClose: () => void
  onSaved: () => void
}) {
  useEscClose(onClose)
  const isEdit = !!room
  const [form, setForm] = useState({
    roomNumber: room?.roomNumber || '',
    floor: room?.floor ?? 1,
    capacity: room?.capacity ?? 1,
    type: room?.type || 'PRIVATE',
    status: room?.status || 'AVAILABLE',
    notes: room?.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.roomNumber.trim()) { toast.error('Room number is required'); return }
    setSaving(true)
    try {
      const payload = {
        roomNumber: form.roomNumber.trim(),
        floor: parseInt(String(form.floor)) || 1,
        capacity: parseInt(String(form.capacity)) || 1,
        type: form.type,
        status: form.status,
        notes: form.notes.trim() || null,
        ...(facilityId ? { facilityId } : {}),
      }
      if (isEdit) {
        await apiPatch(`/api/data?type=rooms&id=${room.id}`, payload)
        toast.success(`Room ${form.roomNumber} updated`)
      } else {
        await apiPost(withFacility('/api/data?type=rooms', facilityId), payload)
        toast.success(`Room ${form.roomNumber} added`)
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message || 'Failed to save room')
    }
    setSaving(false)
  }

  // Helper: when type changes, suggest a default capacity
  const onTypeChange = (type: string) => {
    const defaults: Record<string, number> = { PRIVATE: 1, SEMI_PRIVATE: 2, WARD: 4 }
    setForm(prev => ({
      ...prev,
      type,
      // Only auto-set capacity if user hasn't manually changed it from the type default
      capacity: prev.capacity === defaults[prev.type] ? defaults[type] : prev.capacity,
    }))
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2">
            <BedDouble className="h-4 w-4" /> {isEdit ? `Edit Room ${room.roomNumber}` : 'Add New Room'}
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {room?.code && (
            <div className="text-xs text-muted-foreground">Room Code: <span className="font-mono text-primary">{room.code}</span></div>
          )}

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Room Number *</label>
            <Input
              value={form.roomNumber}
              onChange={e => setForm({ ...form, roomNumber: e.target.value })}
              placeholder="e.g., 101, A-201, DELUXE-1"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Floor</label>
              <Input
                type="number"
                min={1}
                value={form.floor}
                onChange={e => setForm({ ...form, floor: parseInt(e.target.value) || 1 })}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Capacity (beds)</label>
              <Input
                type="number"
                min={1}
                value={form.capacity}
                onChange={e => setForm({ ...form, capacity: parseInt(e.target.value) || 1 })}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Room Type</label>
            <select
              className="w-full border rounded px-2 py-1.5"
              value={form.type}
              onChange={e => onTypeChange(e.target.value)}
            >
              {roomTypes.map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
            <select
              className="w-full border rounded px-2 py-1.5"
              value={form.status}
              onChange={e => setForm({ ...form, status: e.target.value })}
            >
              {roomStatuses.map(s => {
                // Don't allow setting an occupied room to "AVAILABLE" — it's logically inconsistent.
                // Occupied rooms can be marked MAINTENANCE (planned) or kept OCCUPIED.
                const isOccupied = isEdit && room.residents?.length > 0
                const disabled = isOccupied && s === 'AVAILABLE'
                return (
                  <option key={s} value={s} disabled={disabled}>
                    {s.replace(/_/g, ' ')}{disabled ? ' (not allowed — room has residents)' : ''}
                  </option>
                )
              })}
            </select>
            {isEdit && room.residents?.length > 0 && (
              <p className="text-xs text-amber-600 mt-1">⚠ Room has active residents — "Available" status is disabled. Use "Occupied" or "Maintenance".</p>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes (optional)</label>
            <textarea
              className="w-full border rounded px-2 py-1.5"
              rows={2}
              value={form.notes}
              onChange={e => setForm({ ...form, notes: e.target.value })}
              placeholder="e.g., Window facing garden, near nursing station, equipped with oxygen outlet..."
            />
          </div>

          {facilityId && (
            <p className="text-xs text-muted-foreground italic">Room will be assigned to the currently selected facility.</p>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !form.roomNumber.trim()}>
            {saving ? 'Saving...' : (isEdit ? 'Save Changes' : 'Add Room')}
          </Button>
        </div>
      </div>
    </div>
  )
}
