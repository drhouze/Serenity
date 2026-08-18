'use client'

import { useState, useEffect, useMemo } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPost, apiPatch } from './api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Plus, Users as UsersIcon, Key, Edit, UserPlus, Lock, Link2, LayoutGrid, Building2, Search, X, Save, Loader2, Check } from 'lucide-react'
import { StandardSearchBar } from './StandardSearchBar'
import { toast } from 'sonner'
import { ROLES, ROLE_MODULES, ROLE_LEVELS, LEVEL_LABELS, type Role } from '@/lib/types'

// All available modules (must match ALL_MODULES in page.tsx)
const ALL_MODULES = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'residents', label: 'Residents', icon: '👥' },
  { id: 'rooms', label: 'Rooms & Beds', icon: '🛏️' },
  { id: 'staff', label: 'Staff & Shifts', icon: '👔' },
  { id: 'medications', label: 'Medications (MAR)', icon: '💊' },
  { id: 'vitals', label: 'Vital Signs', icon: '❤️' },
  { id: 'visits', label: 'Visits', icon: '📅' },
  { id: 'incidents', label: 'Incidents', icon: '⚠️' },
  { id: 'finance', label: 'Finance', icon: '💰' },
  { id: 'messages', label: 'Family Messages', icon: '💬' },
  { id: 'users', label: 'User Accounts', icon: '🔑' },
  { id: 'products', label: 'Product Catalog', icon: '📦' },
  { id: 'inventory', label: 'Inventory', icon: '📋' },
  { id: 'audit', label: 'Audit Log', icon: '📜' },
  { id: 'rounds', label: 'Care Rounds (Mobile)', icon: '📱' },
]

export function UserManagement({ facilityId }: { facilityId?: string }) {
  const { data: currentUser, loading: userLoading } = useFetch<any>('/api/auth/me')
  const isDeveloper = currentUser?.user?.role === 'APP_DEVELOPER'
  // Developer always sees all users (ignore facility filter); others use the facility filter
  const effectiveFacilityId = isDeveloper ? '' : (facilityId || '')
  const facilityParam = effectiveFacilityId ? `?facilityId=${effectiveFacilityId}` : ''
  // Only fetch users after we know the current user's role (prevents race condition where
  // Developer's users are filtered by facility before isDeveloper is resolved)
  const usersUrl = userLoading ? null : `/api/users${facilityParam}`
  const { data, loading, refetch } = useFetch<any[]>(usersUrl)
  const { data: settings } = useFetch<any>('/api/settings')
  const { data: facilitiesData } = useFetch<any>('/api/facilities/accessible')
  const { data: organizationsData } = useFetch<any[]>('/api/organizations')

  // Check the org's tier — Free tier users can't customize module access per user
  // (the "Modules" button is hidden — they get role-based defaults only)
  const userOrgId = currentUser?.user?.organizationId
  const orgTier = userOrgId ? settings?.[`businessType:${userOrgId}`] : null
  const isFreeTier = orgTier === 'free'
  const canCustomizeModules = isDeveloper || !isFreeTier
  const [showAdd, setShowAdd] = useState(false)
  const [editUser, setEditUser] = useState<any | null>(null)
  const [modulesUser, setModulesUser] = useState<any | null>(null)
  const [activeTab, setActiveTab] = useState<'list' | 'create' | 'defaults'>('list')
  // Filter state (must be before any early return — React Rules of Hooks)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [levelFilter, setLevelFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [orgFilter, setOrgFilter] = useState('')

  const isOwner = currentUser?.user?.role === 'OWNER'
  // isDeveloper is already declared above
  const allFacilities = facilitiesData?.facilities || []
  const allOrganizations = organizationsData || []
  const myRole = currentUser?.user?.role
  const myLevel = currentUser?.user?.level ?? 99
  const myOrgId = currentUser?.user?.organizationId

  if (userLoading || loading || !currentUser) return <Skeleton className="h-96" />

  const allUsers = data || []
  const filtered = allUsers.filter(u => {
    if (search) {
      const q = search.toLowerCase().trim()
      const name = (u.name || '').toLowerCase()
      const email = (u.email || '').toLowerCase()
      const code = (u.code || '').toLowerCase()
      const phone = (u.phone || '').toLowerCase()
      if (!name.includes(q) && !email.includes(q) && !code.includes(q) && !phone.includes(q)) return false
    }
    if (roleFilter && u.role !== roleFilter) return false
    if (levelFilter && u.level !== parseInt(levelFilter)) return false
    if (statusFilter && (statusFilter === 'active' ? !u.active : u.active)) return false
    if (orgFilter) {
      // Prefer direct organizationId, then fall back to facility-based lookup
      const userOrg = allOrganizations.find((org: any) => org.id === u.organizationId)
        || allOrganizations.find((org: any) => {
          const userFids = (u.facilityIds || '').split(',').map((s: string) => s.trim()).filter(Boolean)
          return org.facilities?.some((f: any) => userFids.includes(f.id))
        })
      if (!userOrg || userOrg.id !== orgFilter) return false
    }
    return true
  })

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        <button onClick={() => setActiveTab('list')} className={`px-4 py-2 text-sm border-b-2 ${activeTab === 'list' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
          👥 User List
        </button>
        <button onClick={() => setActiveTab('create')} className={`px-4 py-2 text-sm border-b-2 ${activeTab === 'create' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
          <UserPlus className="h-3.5 w-3.5 inline mr-1" /> Create New User
        </button>
        {(isOwner || isDeveloper) && (
          <button onClick={() => setActiveTab('defaults')} className={`px-4 py-2 text-sm border-b-2 ${activeTab === 'defaults' ? 'border-primary font-medium text-primary' : 'border-transparent text-muted-foreground'}`}>
            <Key className="h-3.5 w-3.5 inline mr-1" /> Default Password
          </button>
        )}
      </div>

      {/* Tab content */}
      {activeTab === 'list' && (
        <>
          {/* Search + Filters */}
          <div className="flex flex-col gap-2">
            <StandardSearchBar
              value={search}
              onChange={setSearch}
              placeholder="Search by name, email, code, or phone..."
              totalCount={allUsers.length}
              filteredCount={filtered.length}
            />
            <div className="flex flex-wrap gap-2 items-center">
              <select className="border rounded px-2 py-1.5 text-xs bg-background" value={roleFilter} onChange={e => setRoleFilter(e.target.value)}>
                <option value="">All Roles</option>
                <option value="OWNER">Owner</option>
                <option value="MANAGER">Manager</option>
                <option value="NURSE">Nurse</option>
                <option value="CARE_STAFF">Care Staff</option>
                <option value="DOCTOR">Doctor</option>
                <option value="PHYSIO">Physio</option>
                <option value="DIETITIAN">Dietitian</option>
                <option value="RECEPTION">Reception</option>
                <option value="FAMILY">Family</option>
              </select>
              <select className="border rounded px-2 py-1.5 text-xs bg-background" value={levelFilter} onChange={e => setLevelFilter(e.target.value)}>
                <option value="">All Levels</option>
                <option value="1">L1 — Owner</option>
                <option value="2">L2 — Manager</option>
                <option value="3">L3 — Clinical</option>
                <option value="4">L4 — Support</option>
                <option value="5">L5 — Family</option>
              </select>
              <select className="border rounded px-2 py-1.5 text-xs bg-background" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
              {isDeveloper && allOrganizations.length > 0 && (
                <select className="border rounded px-2 py-1.5 text-xs bg-background" value={orgFilter} onChange={e => setOrgFilter(e.target.value)}>
                  <option value="">All Organizations</option>
                  {allOrganizations.map((org: any) => <option key={org.id} value={org.id}>{org.name}</option>)}
                </select>
              )}
              {(roleFilter || levelFilter || statusFilter || orgFilter) && (
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setRoleFilter(''); setLevelFilter(''); setStatusFilter(''); setOrgFilter('') }}>
                  <X className="h-3 w-3 mr-1" /> Clear Filters
                </Button>
              )}
              <Button onClick={() => setActiveTab('create')} className="ml-auto">
                <UserPlus className="h-4 w-4 mr-1" /> Add User
              </Button>
            </div>
          </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <UsersIcon className="h-4 w-4" /> System Users
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Name</th>
                  <th className="text-left p-2 font-medium">Email</th>
                  <th className="text-left p-2 font-medium">Role</th>
                  <th className="text-left p-2 font-medium">Level</th>
                  <th className="text-left p-2 font-medium hidden md:table-cell">Organization</th>
                  <th className="text-left p-2 font-medium hidden lg:table-cell">Facilities</th>
                  <th className="text-left p-2 font-medium hidden md:table-cell">Phone</th>
                  <th className="text-left p-2 font-medium">Modules</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={10} className="p-6 text-center text-sm text-muted-foreground">
                    {allUsers.length === 0 ? 'No user accounts yet.' : 'No users match your filters.'}
                  </td></tr>
                ) : filtered.map(u => {
                  const hasCustomModules = u.moduleAccess !== null && u.moduleAccess !== undefined
                  const customCount = hasCustomModules ? u.moduleAccess.split(',').filter(Boolean).length : 0
                  const myLevel = currentUser?.user?.level ?? 99
                  const canEdit = u.level >= myLevel // can only edit users at my level or below
                  const levelColors: Record<number, string> = {
                    0: 'bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200',
                    1: 'bg-rose-100 text-rose-700 border-rose-200',
                    2: 'bg-orange-100 text-orange-700 border-orange-200',
                    3: 'bg-sky-100 text-sky-700 border-sky-200',
                    4: 'bg-emerald-100 text-emerald-700 border-emerald-200',
                    5: 'bg-violet-100 text-violet-700 border-violet-200',
                  }
                  // Resolve user's organization — prefer the direct organizationId field,
                  // then fall back to deriving from facility assignments
                  const userFids = (u.facilityIds || '').split(',').map((s: string) => s.trim()).filter(Boolean)
                  const userOrg = allOrganizations.find((org: any) => org.id === u.organizationId)
                    || allOrganizations.find((org: any) =>
                      org.facilities?.some((f: any) => userFids.includes(f.id))
                    )
                  // Resolve user's facility names
                  const userFacilityNames = userFids.map(fid => allFacilities.find((f: any) => f.id === fid)?.name).filter(Boolean)
                  return (
                    <tr key={u.id} className="border-t hover:bg-muted/30">
                      <td className="p-2">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-7 w-7">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs">
                              {u.name.split(' ').map((s: string) => s[0]).slice(0, 2).join('').toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          <div>
                            {u.code && <div className="text-xs font-mono text-primary">{u.code}</div>}
                            <span className="font-medium">{u.name}</span>
                            {u.id === currentUser?.user?.id && <span className="text-xs text-muted-foreground"> (you)</span>}
                          </div>
                        </div>
                      </td>
                      <td className="p-2 text-xs">{u.email}</td>
                      <td className="p-2">
                        <Badge variant="outline">{u.role}</Badge>
                        {u.role === 'FAMILY' && u.linkedResidentIds && (
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {u.linkedResidentIds.split(',').filter(Boolean).length} resident(s) linked
                          </div>
                        )}
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className={`text-xs ${levelColors[u.level] || ''}`}>
                          L{u.level}
                        </Badge>
                      </td>
                      <td className="p-2 text-xs hidden md:table-cell">
                        {userOrg ? <span className="font-medium">{userOrg.name}</span> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2 text-xs hidden lg:table-cell">
                        {userFacilityNames.length > 0 ? (
                          <span>{userFacilityNames.join(', ')}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="p-2 text-xs hidden md:table-cell">{u.phone || '—'}</td>
                      <td className="p-2">
                        {hasCustomModules ? (
                          <Badge className="bg-violet-100 text-violet-700 border-violet-200 text-xs">Custom ({customCount})</Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Role default</Badge>
                        )}
                      </td>
                      <td className="p-2">
                        {u.active ? (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Disabled</Badge>
                        )}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {(isOwner || isDeveloper) && canEdit && canCustomizeModules && (
                          <Button size="sm" variant="ghost" className="h-7" title="Customize module access" onClick={() => setModulesUser(u)}>
                            <LayoutGrid className="h-3 w-3 mr-1" /> Modules
                          </Button>
                        )}
                        {canEdit ? (
                          <Button size="sm" variant="ghost" className="h-7" title="Edit user" onClick={() => setEditUser(u)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground px-2" title="You cannot edit users above your level">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
        </>
      )}

      {/* Create New User tab */}
      {activeTab === 'create' && (
        <CreateUserForm
          settings={settings}
          allFacilities={allFacilities}
          myRole={myRole}
          myLevel={myLevel}
          myOrgId={myOrgId}
          onCreated={() => { refetch(); setActiveTab('list') }}
        />
      )}

      {/* Default Password tab */}
      {activeTab === 'defaults' && (isOwner || isDeveloper) && (
        <DefaultPasswordCard settings={settings} myRole={myRole} myOrgId={myOrgId} />
      )}

      {showAdd && <UserDialog mode="add" onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refetch() }} />}
      {editUser && <UserDialog mode="edit" user={editUser} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); refetch() }} />}
      {modulesUser && <ModuleAccessDialog user={modulesUser} onClose={() => setModulesUser(null)} onSaved={() => { setModulesUser(null); refetch() }} />}
    </div>
  )
}

// ============ CREATE USER FORM (tab) ============
function CreateUserForm({ settings, allFacilities, myRole, myLevel, myOrgId, onCreated }: {
  settings: any
  allFacilities: any[]
  myRole?: string
  myLevel: number
  myOrgId?: string | null
  onCreated: () => void
}) {
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPassword, setNewUserPassword] = useState('')
  const [newUserRole, setNewUserRole] = useState('CARE_STAFF')
  const [newUserLevel, setNewUserLevel] = useState(4)
  const [newUserPhone, setNewUserPhone] = useState('')
  const [newUserFacilityIds, setNewUserFacilityIds] = useState<string[]>([])
  const [creatingUser, setCreatingUser] = useState(false)

  // Org-level default password (set by Owner) — key: `orgDefaultPassword:<orgId>`
  const orgDefaultPassword = myOrgId ? settings?.[`orgDefaultPassword:${myOrgId}`] || '' : ''

  // Pre-fill password with org default when form loads
  useEffect(() => {
    if (orgDefaultPassword && !newUserPassword) {
      setNewUserPassword(orgDefaultPassword)
    }
  }, [orgDefaultPassword])

  // Available roles based on who is creating
  // - Developer CAN create other Developers (level 0) — full system access
  // - Owner/Manager CANNOT see or create Developers (hidden from lower levels)
  const availableRoles = ROLES.filter(r => {
    if (myRole !== 'APP_DEVELOPER' && r.id === 'APP_DEVELOPER') return false
    if (myRole === 'MANAGER' && (r.id === 'OWNER' || r.id === 'MANAGER')) return false
    if (myRole === 'OWNER' && r.id === 'OWNER') return false
    return true
  })

  // For Owner: show only their org's facilities; for Developer: all
  const visibleFacilities = myRole === 'OWNER' && myOrgId
    ? allFacilities.filter(f => f.organizationId === myOrgId)
    : allFacilities

  const handleCreateUser = async () => {
    if (!newUserName.trim()) { toast.error('Name is required'); return }
    if (!newUserEmail.trim()) { toast.error('Email is required'); return }
    if (!newUserPassword.trim()) { toast.error('Password is required'); return }
    if (newUserPassword.length < 6) { toast.error('Password must be at least 6 characters'); return }
    if (newUserLevel < myLevel) { toast.error(`You cannot create a user with a higher level than your own (Level ${myLevel})`); return }
    setCreatingUser(true)
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newUserName.trim(),
          email: newUserEmail.trim().toLowerCase(),
          password: newUserPassword,
          role: newUserRole,
          level: newUserLevel,
          phone: newUserPhone || undefined,
          facilityIds: newUserFacilityIds.length > 0 ? newUserFacilityIds.join(',') : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(`User created: ${data.name} (${data.email})`)
      onCreated()
    } catch (e: any) {
      toast.error(e.message)
    }
    setCreatingUser(false)
  }

  return (
    <Card className="border-primary/30">
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <UserPlus className="h-4 w-4" /> Create New User
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Full Name *</label>
            <Input value={newUserName} onChange={e => setNewUserName(e.target.value)} placeholder="e.g. Jane Smith" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email (Username) *</label>
            <Input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)} placeholder="e.g. jane@serenitycare.com" className="font-mono text-xs" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              Password *
              {orgDefaultPassword && <span className="text-emerald-600 ml-1">(org default pre-filled)</span>}
            </label>
            <Input type="text" value={newUserPassword} onChange={e => setNewUserPassword(e.target.value)} placeholder="Min 8 chars, 1 uppercase, 1 number" className="font-mono text-xs" />
            {!orgDefaultPassword && (
              <div className="text-[10px] text-amber-700 mt-0.5">
                No org default password set. Set one in the "Default Password" tab.
              </div>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone (optional)</label>
            <Input value={newUserPhone} onChange={e => setNewUserPhone(e.target.value)} placeholder="+60-12-345-6789" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Role *</label>
            <select className="w-full border rounded px-2 py-1.5 text-sm bg-background" value={newUserRole}
              onChange={e => {
                setNewUserRole(e.target.value)
                const roleInfo = availableRoles.find(r => r.id === e.target.value)
                if (roleInfo) {
                  const defaultLevel = (ROLE_LEVELS as any)[roleInfo.id] || 4
                  setNewUserLevel(defaultLevel)
                }
              }}>
              {availableRoles.map(r => <option key={r.id} value={r.id}>{r.label} — {r.description}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Level *</label>
            <select className="w-full border rounded px-2 py-1.5 text-sm bg-background" value={newUserLevel}
              onChange={e => setNewUserLevel(parseInt(e.target.value))}>
              {Object.entries(LEVEL_LABELS).map(([lvl, label]) => {
                const lvlNum = parseInt(lvl)
                if (lvlNum === 0) return null // Developer not selectable
                if (lvlNum < myLevel) return null
                return <option key={lvl} value={lvl}>L{lvl} — {label}</option>
              })}
            </select>
          </div>
        </div>

        {/* Facility access */}
        {visibleFacilities.length > 0 && (
          <div className="border-t pt-3">
            <label className="text-xs font-medium text-muted-foreground mb-2 block">
              Facility Access
              {myRole === 'OWNER' && <span className="ml-1 text-[10px]">(within your organization)</span>}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {visibleFacilities.map(f => (
                <label key={f.id} className="flex items-center gap-2 cursor-pointer p-1.5 rounded hover:bg-muted/50 text-xs">
                  <input type="checkbox" checked={newUserFacilityIds.includes(f.id)}
                    onChange={() => setNewUserFacilityIds(prev => prev.includes(f.id) ? prev.filter(id => id !== f.id) : [...prev, f.id])}
                    className="h-3.5 w-3.5" />
                  <span className="font-medium truncate">{f.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleCreateUser} disabled={creatingUser || !newUserName.trim() || !newUserEmail.trim() || !newUserPassword.trim()}>
            {creatingUser ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Creating...</> : <><UserPlus className="h-4 w-4 mr-2" /> Create User</>}
          </Button>
          <Button variant="outline" onClick={() => {
            setNewUserName(''); setNewUserEmail(''); setNewUserPassword(orgDefaultPassword || '')
            setNewUserRole('CARE_STAFF'); setNewUserLevel(4); setNewUserPhone(''); setNewUserFacilityIds([])
          }}>Clear Form</Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ============ DEFAULT PASSWORD CARD (tab) ============
function DefaultPasswordCard({ settings, myRole, myOrgId }: { settings: any; myRole?: string; myOrgId?: string | null }) {
  // Owner uses org-level key; Developer uses app-level key
  const settingKey = myRole === 'APP_DEVELOPER' ? 'defaultNewUserPassword' : `orgDefaultPassword:${myOrgId}`
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (settings) {
      setPassword(settings[settingKey] || '')
    }
  }, [settings, settingKey])

  const handleSave = async () => {
    setSaving(true)
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: settingKey, value: password }),
      })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`)
      toast.success('Default password saved')
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Key className="h-4 w-4" /> Default New User Password
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="text-xs text-muted-foreground">
          {myRole === 'APP_DEVELOPER'
            ? 'This is the app-wide default password pre-filled when creating new users. Each organization owner can also set their own org-level default (see below).'
            : 'This is the default password for your organization. It will be pre-filled whenever you create a new user (staff or family). Users should change it after first login.'}
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">
            {myRole === 'APP_DEVELOPER' ? 'App-wide Default Password' : `Default Password for Your Organization`}
          </label>
          <Input type="text" value={password} onChange={e => setPassword(e.target.value)} placeholder="e.g. welcome123" className="font-mono" />
          <div className="text-[10px] text-muted-foreground mt-1">
            {myRole === 'APP_DEVELOPER'
              ? 'Applies globally to all organizations that don\'t have their own default.'
              : 'Only you (Org Owner) can set this. It applies to all new users you create.'}
          </div>
        </div>
        <Button size="sm" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Saving...</> : <><Save className="h-3 w-3 mr-1" /> Save Default Password</>}
        </Button>
      </CardContent>
    </Card>
  )
}

function ModuleAccessDialog({ user, onClose, onSaved }: { user: any; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  // Initialize from user's current moduleAccess, or from role defaults if not set
  const roleDefaults = (user.role ? (ROLE_MODULES as any)[user.role] || [] : []) as string[]
  const initialModules: Set<string> = user.moduleAccess !== null && user.moduleAccess !== undefined
    ? new Set<string>(user.moduleAccess.split(',').map((s: string) => s.trim()).filter(Boolean))
    : new Set<string>(roleDefaults)
  const [selected, setSelected] = useState<Set<string>>(initialModules)
  const [useCustom, setUseCustom] = useState(user.moduleAccess !== null && user.moduleAccess !== undefined)
  const [saving, setSaving] = useState(false)

  const toggleModule = (id: string) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  const selectAll = () => setSelected(new Set(ALL_MODULES.map(m => m.id)))
  const selectNone = () => setSelected(new Set())

  const submit = async () => {
    setSaving(true)
    try {
      const moduleAccess = useCustom ? Array.from(selected).join(',') : null
      await apiPatch(`/api/users?id=${user.id}`, { moduleAccess })
      toast.success(useCustom ? `Module access updated (${selected.size} modules)` : 'Reset to role defaults')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2">
            <LayoutGrid className="h-4 w-4" /> Module Access — {user.name}
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {/* Mode toggle */}
          <div className="flex gap-2">
            <button
              onClick={() => setUseCustom(false)}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                !useCustom ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              Use Role Defaults
              <div className="text-xs font-normal opacity-80">{roleDefaults.length} modules for {user.role}</div>
            </button>
            <button
              onClick={() => setUseCustom(true)}
              className={`flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition-colors ${
                useCustom ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'
              }`}
            >
              Custom Access
              <div className="text-xs font-normal opacity-80">Pick modules individually</div>
            </button>
          </div>

          {useCustom && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{selected.size} of {ALL_MODULES.length} modules selected</span>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={selectAll}>Select all</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={selectNone}>Clear</Button>
                </div>
              </div>
              <div className="border rounded-md max-h-72 overflow-y-auto">
                {ALL_MODULES.map(m => (
                  <label key={m.id} className="flex items-center gap-2 p-2 border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                    <Checkbox
                      checked={selected.has(m.id)}
                      onCheckedChange={() => toggleModule(m.id)}
                    />
                    <span className="text-lg">{m.icon}</span>
                    <span className="text-sm flex-1">{m.label}</span>
                    {selected.has(m.id) && <span className="text-xs text-emerald-600">✓</span>}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                The user will only see the checked modules in their sidebar. Dashboard is recommended.
              </p>
            </>
          )}

          {!useCustom && (
            <div className="text-xs text-muted-foreground bg-muted/30 rounded p-3">
              This user will see the default modules for their role ({user.role}):
              <div className="mt-1 flex flex-wrap gap-1">
                {roleDefaults.map(id => {
                  const mod = ALL_MODULES.find(m => m.id === id)
                  return mod ? <span key={id} className="text-xs px-1.5 py-0.5 bg-background border rounded">{mod.icon} {mod.label}</span> : null
                })}
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save Module Access'}</Button>
        </div>
      </div>
    </div>
  )
}

function UserDialog({ mode, user, onClose, onSaved }: { mode: 'add' | 'edit'; user?: any; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const { data: residents } = useFetch<any[]>('/api/data?type=residents')
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const { data: facilities } = useFetch<any[]>('/api/facilities')
  const { data: organizations } = useFetch<any[]>('/api/organizations')
  const [form, setForm] = useState<any>({
    name: user?.name || '',
    email: user?.email || '',
    role: user?.role || 'NURSE',
    level: user?.level ?? (ROLE_LEVELS as any)[user?.role || 'NURSE'] ?? 3,
    phone: user?.phone || '',
    password: '',
    active: user?.active ?? true,
    organizationId: user?.organizationId || '',
    linkedResidentIds: new Set<string>(
      mode === 'edit' && user?.linkedResidentIds
        ? user.linkedResidentIds.split(',').map((s: string) => s.trim()).filter(Boolean)
        : []
    ),
    facilityIds: new Set<string>(
      mode === 'edit' && user?.facilityIds
        ? user.facilityIds.split(',').map((s: string) => s.trim()).filter(Boolean)
        : []
    ),
  })
  const [saving, setSaving] = useState(false)
  const [residentSearch, setResidentSearch] = useState('')

  const myLevel = currentUser?.user?.level ?? 99

  const submit = async () => {
    if (!form.name || !form.email) { toast.error('Name and email required'); return }
    if (mode === 'add' && !form.password) { toast.error('Password required for new users'); return }
    setSaving(true)
    try {
      const payload: any = {
        name: form.name,
        email: form.email,
        role: form.role,
        level: parseInt(form.level, 10),
        phone: form.phone,
        active: form.active,
        organizationId: form.organizationId || null,
      }
      if (form.password) payload.password = form.password
      // Include linked resident IDs (comma-separated) for FAMILY users
      if (form.role === 'FAMILY') {
        payload.linkedResidentIds = Array.from(form.linkedResidentIds as Set<string>).join(',')
      } else {
        payload.linkedResidentIds = ''
      }
      // Include facility IDs (comma-separated) — Owner gets all, others get assigned
      if (parseInt(String(form.level), 10) !== 1) {
        payload.facilityIds = Array.from(form.facilityIds as Set<string>).join(',')
      } else {
        payload.facilityIds = '' // Owner gets all automatically
      }

      if (mode === 'add') {
        await apiPost('/api/users', payload)
        toast.success('User created')
      } else {
        await apiPatch(`/api/users?id=${user.id}`, payload)
        toast.success('User updated')
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  const toggleResident = (rid: string) => {
    const next = new Set(form.linkedResidentIds as Set<string>)
    if (next.has(rid)) next.delete(rid)
    else next.add(rid)
    setForm({ ...form, linkedResidentIds: next })
  }

  const filteredResidents = useMemo(() => {
    if (!residentSearch.trim()) return residents || []
    const q = residentSearch.toLowerCase().trim()
    return (residents || []).filter((r: any) => {
      const name = `${r.firstName} ${r.lastName}`.toLowerCase()
      const code = (r.code || '').toLowerCase()
      const room = (r.room?.roomNumber || '').toLowerCase()
      return name.includes(q) || code.includes(q) || room.includes(q)
    })
  }, [residents, residentSearch])

  return (
    <Modal title={mode === 'add' ? 'Add User Account' : 'Edit User Account'} onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Field label="Full Name *"><Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Email *"><Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Role *">
          <select className="w-full border rounded px-2 py-1.5" value={form.role} onChange={e => {
            const newRole = e.target.value
            // Auto-update level when role changes (only if user hasn't manually overridden)
            const defaultLevel = (ROLE_LEVELS as any)[newRole] ?? 3
            setForm({ ...form, role: newRole, level: defaultLevel })
          }}>
            {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
        <Field label={`Access Level (your level: ${myLevel})`}>
          <select className="w-full border rounded px-2 py-1.5" value={form.level} onChange={e => setForm({ ...form, level: parseInt(e.target.value, 10) })}>
            {[1, 2, 3, 4, 5].map(l => {
              const disabled = l < myLevel
              return (
                <option key={l} value={l} disabled={disabled}>
                  {LEVEL_LABELS[l]}{disabled ? ' (above your level)' : ''}
                </option>
              )
            })}
          </select>
        </Field>
        <Field label="Phone"><Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
        <Field label={mode === 'add' ? 'Password *' : 'New Password (leave blank to keep)'}>
          <Input type="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder={mode === 'edit' ? '•••••• (leave blank to keep)' : 'Min 8 chars, 1 uppercase, 1 number'} />
        </Field>
        {mode === 'edit' && (
          <Field label="Status">
            <select className="w-full border rounded px-2 py-1.5" value={form.active ? '1' : '0'} onChange={e => setForm({ ...form, active: e.target.value === '1' })}>
              <option value="1">Active</option>
              <option value="0">Disabled</option>
            </select>
          </Field>
        )}
        {/* Organization dropdown — determines which org's facilities are shown below */}
        {myLevel <= 1 && (organizations || []).length > 0 && (
          <Field label="Organization">
            <select
              className="w-full border rounded px-2 py-1.5"
              value={form.organizationId}
              onChange={e => {
                const newOrgId = e.target.value
                // When org changes, clear facility selections (they belong to the old org)
                setForm({ ...form, organizationId: newOrgId, facilityIds: new Set<string>() })
              }}
            >
              <option value="">— No organization —</option>
              {(organizations || []).map((org: any) => (
                <option key={org.id} value={org.id}>{org.name}</option>
              ))}
            </select>
          </Field>
        )}
        {/* Show org name as read-only for non-Developer/Owner users */}
        {myLevel > 1 && form.organizationId && (organizations || []).length > 0 && (
          <Field label="Organization">
            <Input value={(organizations || []).find((o: any) => o.id === form.organizationId)?.name || '—'} disabled className="bg-muted/50" />
          </Field>
        )}
      </div>

      {/* Linked residents for FAMILY role */}
      {form.role === 'FAMILY' && (
        <div className="mt-4 border-t pt-3">
          <label className="text-xs font-medium text-muted-foreground mb-2 block flex items-center gap-1">
            <Link2 className="h-3 w-3" /> Linked Residents *
            <span className="text-muted-foreground/70 font-normal">(this family member can only see info & messages for these residents)</span>
          </label>
          {/* Search bar */}
          <div className="relative mb-2">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="text"
              value={residentSearch}
              onChange={e => setResidentSearch(e.target.value)}
              placeholder="Search by code, name, or room..."
              className="w-full pl-7 pr-7 py-1.5 text-sm border rounded outline-none focus:border-primary"
            />
            {residentSearch && (
              <button
                type="button"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setResidentSearch('')}
                title="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <div className="border rounded-md max-h-48 overflow-y-auto">
            {(residents || []).length === 0 && <p className="p-2 text-xs text-muted-foreground">Loading residents...</p>}
            {filteredResidents.length === 0 && (residents || []).length > 0 && (
              <p className="p-2 text-xs text-muted-foreground">No residents match "{residentSearch}"</p>
            )}
            {filteredResidents.map((r: any) => (
              <label key={r.id} className="flex items-center gap-2 p-2 border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                <Checkbox
                  checked={(form.linkedResidentIds as Set<string>).has(r.id)}
                  onCheckedChange={() => toggleResident(r.id)}
                />
                {r.code && <span className="font-mono text-[10px] text-primary bg-primary/5 px-1 py-0.5 rounded">{r.code}</span>}
                <span className="text-sm flex-1">{r.firstName} {r.lastName}</span>
                <span className="text-xs text-muted-foreground">Room {r.room?.roomNumber || '—'}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {(form.linkedResidentIds as Set<string>).size} resident(s) selected
            {residentSearch && ` · showing ${filteredResidents.length} of ${(residents || []).length} residents`}
          </p>
        </div>
      )}

      {/* Facility assignment */}
      {(() => {
        const isOwner = parseInt(String(form.level), 10) === 1
        // Filter facilities by the selected organization (if any)
        const orgFacilities = form.organizationId
          ? (facilities || []).filter((f: any) => f.organizationId === form.organizationId)
          : (facilities || [])
        return (
          <div className="mt-4 border-t pt-3">
            <label className="text-xs font-medium text-muted-foreground mb-2 block flex items-center gap-1">
              <Building2 className="h-3 w-3" /> Assigned Facilities
              {isOwner
                ? <span className="text-muted-foreground/70 font-normal">(Owner gets all facilities automatically)</span>
                : <span className="text-muted-foreground/70 font-normal">(this user can only access these facilities)</span>}
              {form.organizationId && <span className="text-muted-foreground/70 font-normal">— filtered by org</span>}
            </label>
            {isOwner ? (
              <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                Owner-level users automatically have access to all facilities in their organization. No manual assignment needed.
              </div>
            ) : orgFacilities.length === 0 ? (
              <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                {form.organizationId
                  ? 'No facilities found in this organization. Add facilities first in Developer → Organization Management.'
                  : 'No facilities available. Select an organization first, or add facilities in Developer → Organization Management.'}
              </div>
            ) : (
              <>
                <div className="border rounded-md max-h-40 overflow-y-auto">
                  {orgFacilities.map((f: any) => (
                    <label key={f.id} className="flex items-center gap-2 p-2 border-b last:border-b-0 hover:bg-muted/30 cursor-pointer">
                      <Checkbox
                        checked={(form.facilityIds as Set<string>).has(f.id)}
                        onCheckedChange={() => {
                          const next = new Set(form.facilityIds as Set<string>)
                          if (next.has(f.id)) next.delete(f.id)
                          else next.add(f.id)
                          setForm({ ...form, facilityIds: next })
                        }}
                      />
                      <span className="text-sm flex-1">{f.name}</span>
                      {f.director && <span className="text-xs text-muted-foreground">{f.director}</span>}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {(form.facilityIds as Set<string>).size} facility(ies) selected
                  {form.organizationId && ` · ${orgFacilities.length} available in this org`}
                  {!form.organizationId && ` · ${orgFacilities.length} total (all orgs)`}
                </p>
              </>
            )}
          </div>
        )
      })()}

      {mode === 'add' && (
        <p className="text-xs text-muted-foreground mt-3 flex items-center gap-1">
          <Lock className="h-3 w-3" /> The new user will sign in with this email and password.
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : (mode === 'add' ? 'Create User' : 'Save Changes')}</Button>
      </div>
    </Modal>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEscClose(onClose)
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><Key className="h-4 w-4" /> {title}</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>{children}</div>
}
