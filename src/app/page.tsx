'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  LayoutDashboard, Users, BedDouble, UserCog, Pill, Activity,
  Calendar, AlertTriangle, DollarSign, MessageSquare, Menu, X,
  HeartPulse, LogOut, ChevronDown, User as UserIcon, Lock, KeyRound,
  Package, Boxes, ScrollText, Smartphone, Settings as SettingsIcon, Building2, Terminal,
  GripVertical, ChevronUp, ChevronDown as ChevronDownIcon, Check, RotateCcw, Pencil, Loader2
} from 'lucide-react'
import { ROLE_MODULES, type Role } from '@/lib/types'
import { isModuleVisible } from '@/lib/business-types'
import { Dashboard } from '@/components/nursing/Dashboard'
import { FamilyDashboard } from '@/components/nursing/FamilyDashboard'
import { Residents } from '@/components/nursing/Residents'
import { Rooms } from '@/components/nursing/Rooms'
import { Staff } from '@/components/nursing/Staff'
import { Medications, VitalsOverview } from '@/components/nursing/Medications'
import { Visits, Incidents } from '@/components/nursing/Visits'
import { ClinicalModule } from '@/components/nursing/ClinicalModule'
import { Finance } from '@/components/nursing/Finance'
import { Messages } from '@/components/nursing/Messages'
import { Login } from '@/components/nursing/Login'
import { UserManagement } from '@/components/nursing/UserManagement'
import { ProductCatalog } from '@/components/nursing/ProductCatalog'
import { Inventory } from '@/components/nursing/Inventory'
import { AuditLog } from '@/components/nursing/AuditLog'
import { MobileCareRounds } from '@/components/nursing/MobileCareRounds'
import { SettingsModule } from '@/components/nursing/Settings'
import { Developer } from '@/components/nursing/Developer'
import { UserProfile } from '@/components/nursing/UserProfile'
import { AIAssistant } from '@/components/nursing/AIAssistant'
import { AIProvider } from '@/components/nursing/AIContext'
import { toast } from 'sonner'

interface CurrentUser {
  id: string
  name: string
  email: string
  role: string
  level: number
  phone?: string | null
  linkedResidentIds?: string | null
  moduleAccess?: string | null
  facilityIds?: string | null
}

interface ModuleDef {
  id: string
  label: string
  icon: any
  component: (props: { setActiveModule: (m: string) => void; role?: string; facilityId?: string }) => React.JSX.Element
}

const ALL_MODULES: ModuleDef[] = [
  { id: 'developer', label: 'Developer', icon: Terminal, component: () => <Developer /> },
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, component: ({ setActiveModule, role, facilityId }) => role === 'FAMILY' ? <FamilyDashboard onNavigate={setActiveModule} /> : <Dashboard onNavigate={setActiveModule} facilityId={facilityId} /> },
  { id: 'rounds', label: 'Care Rounds (Mobile)', icon: Smartphone, component: ({ facilityId }) => <MobileCareRounds facilityId={facilityId} /> },
  { id: 'residents', label: 'Residents', icon: Users, component: ({ facilityId }) => <Residents facilityId={facilityId} /> },
  { id: 'rooms', label: 'Rooms & Beds', icon: BedDouble, component: ({ facilityId }) => <Rooms facilityId={facilityId} /> },
  { id: 'staff', label: 'Staff & Shifts', icon: UserCog, component: ({ facilityId }) => <Staff facilityId={facilityId} /> },
  { id: 'clinical', label: 'Clinical', icon: Pill, component: ({ facilityId, role }) => <ClinicalModule facilityId={facilityId} role={role} /> },
  { id: 'incidents', label: 'Incidents', icon: AlertTriangle, component: ({ facilityId }) => <Incidents facilityId={facilityId} /> },
  { id: 'users', label: 'User Accounts', icon: KeyRound, component: ({ facilityId }) => <UserManagement facilityId={facilityId} /> },
  { id: 'messages', label: 'Family Messages', icon: MessageSquare, component: ({ facilityId }) => <Messages facilityId={facilityId} /> },
  { id: 'products', label: 'Product Catalog', icon: Package, component: ({ facilityId }) => <ProductCatalog facilityId={facilityId} /> },
  { id: 'inventory', label: 'Inventory', icon: Boxes, component: ({ facilityId }) => <Inventory facilityId={facilityId} /> },
  { id: 'finance', label: 'Accounting', icon: DollarSign, component: ({ facilityId }) => <Finance facilityId={facilityId} /> },
  { id: 'audit', label: 'Audit Log', icon: ScrollText, component: ({ facilityId }) => <AuditLog facilityId={facilityId} /> },
  { id: 'settings', label: 'Settings', icon: SettingsIcon, component: ({ facilityId, role }) => <SettingsModule facilityId={facilityId} role={role} /> },
  { id: 'profile', label: 'My Profile', icon: UserIcon, component: () => <UserProfile /> },
]

export default function Home() {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [activeModule, setActiveModule] = useState<string>('dashboard')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const [facilities, setFacilities] = useState<any[]>([])
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('')
  const [facilityMenuOpen, setFacilityMenuOpen] = useState(false)
  // Module reordering
  const [customOrder, setCustomOrder] = useState<string[] | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  // Unread message count (polled every 30s for the sidebar badge)
  const [unreadMessages, setUnreadMessages] = useState(0)
  // Organization branding (loaded from /api/settings)
  const [orgName, setOrgName] = useState<string>('Serenity Care Home')
  const [orgLogoUrl, setOrgLogoUrl] = useState<string>('')
  const [appName, setAppName] = useState<string>('Serenity Care Home')
  const [appTagline, setAppTagline] = useState<string>('Resident & Operations Management')
  const [settingsData, setSettingsData] = useState<any>(null)
  const [organizations, setOrganizations] = useState<any[]>([])

  // Initial session check is handled by <Login />, but we also do a top-level check
  // to skip the login screen if a session cookie already exists.
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => {
        if (data.user) setUser(data.user)
      })
      .catch(() => {})
      .finally(() => setCheckingAuth(false))
  }, [])

  // Load accessible facilities when user changes
  useEffect(() => {
    if (!user) {
      setFacilities([])
      setSelectedFacilityId('')
      setCustomOrder(null)
      return
    }
    fetch('/api/facilities/accessible')
      .then(r => r.json())
      .then(data => {
        setFacilities(data.facilities || [])
        // Auto-select first facility for non-Developer/Owner users
        // Developer and Owner start with "All Facilities" so they see everything
        if (data.facilities?.length > 0 && !selectedFacilityId && user.level > 1) {
          setSelectedFacilityId(data.facilities[0].id)
        }
      })
      .catch(() => {})
    // Load custom module order
    fetch('/api/module-order')
      .then(r => r.json())
      .then(data => {
        if (data.order && Array.isArray(data.order)) {
          setCustomOrder(data.order)
        }
      })
      .catch(() => {})
    // Load organization branding (name + logo) from settings
    fetch('/api/settings')
      .then(r => r.json())
      .then(data => {
        setSettingsData(data)
        if (data.organizationName) setOrgName(data.organizationName)
        const logo = data.appLogoUrl || data.organizationLogoUrl || ''
        if (logo) setOrgLogoUrl(logo)
        if (data.appName) setAppName(data.appName)
        if (data.appTagline) setAppTagline(data.appTagline)
      })
      .catch(() => {})
    // Load organizations (for businessType lookup — the Organization table's
    // businessType field is the source of truth for module visibility + labels)
    fetch('/api/organizations')
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setOrganizations(data)
      })
      .catch(() => {})
  }, [user])

  // Poll unread messages count every 30 seconds for the sidebar badge
  useEffect(() => {
    if (!user) { setUnreadMessages(0); return }
    const fetchUnread = () => {
      const fParam = selectedFacilityId ? `?facilityId=${selectedFacilityId}` : ''
      fetch(`/api/messages/unread${fParam}`)
        .then(r => r.json())
        .then(data => { if (data && typeof data.count === 'number') setUnreadMessages(data.count) })
        .catch(() => {})
    }
    fetchUnread() // initial fetch
    const interval = setInterval(fetchUnread, 30000) // poll every 30s
    return () => clearInterval(interval)
  }, [user, selectedFacilityId])

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {}
    setUser(null)
    setFacilities([])
    setSelectedFacilityId('')
    setActiveModule('dashboard')
    setUserMenuOpen(false)
    toast.success('Signed out')
  }, [])

  // While checking auth, show a small loading state
  if (checkingAuth) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/20">
        <div className="flex items-center gap-3 text-muted-foreground">
          <HeartPulse className="h-6 w-6 animate-pulse text-rose-500" />
          <span className="text-sm">Loading Serenity Care Home...</span>
        </div>
      </div>
    )
  }

  // Not logged in → show login screen
  if (!user) {
    return <Login onLogin={(u) => setUser(u as any)} />
  }

  const role = user.role as Role
  // Use custom moduleAccess if set (even if empty string), otherwise fall back to level-based settings, then role defaults
  // Level-based settings: org-scoped (levelModules:<orgId>:<level>) takes priority over global (levelModules:<level>)
  // Org-level module access (orgModules:<orgId>) acts as a gate — modules not in the org list are removed entirely
  let allowedModules: string[]
  if (user.moduleAccess !== null && user.moduleAccess !== undefined) {
    // Individual user override
    allowedModules = user.moduleAccess.split(',').map(s => s.trim()).filter(Boolean)
  } else {
    // Check org-scoped level modules first, then global, then role defaults
    const userOrgId = (user as any).organizationId
    const orgLevelKey = `levelModules:${userOrgId}:${user.level}`
    const globalLevelKey = `levelModules:${user.level}`
    const orgLevelModules = settingsData?.[orgLevelKey]
    const globalLevelModules = settingsData?.[globalLevelKey]
    if (Array.isArray(orgLevelModules)) {
      allowedModules = orgLevelModules
    } else if (Array.isArray(globalLevelModules)) {
      allowedModules = globalLevelModules
    } else {
      allowedModules = ROLE_MODULES[role]
    }
  }

  // Resolve the user's org ID — needed for both module filtering AND module label overrides.
  // Must be defined OUTSIDE the role check below so Developers also have it (for org label overrides).
  const userOrgIdForBusiness = (user as any).organizationId || (() => {
    if (user.facilityIds) {
      const userFids = user.facilityIds.split(',').map((s: string) => s.trim()).filter(Boolean)
      if (userFids.length > 0) {
        return (facilities.find(f => f.id === userFids[0]) as any)?.organizationId
      }
    }
    return null
  })()

  // Org-level module gate: if orgModules:<orgId> is set, filter out modules not in the org list
  // Developer (level 0) bypasses this — they always see all modules
  if (role !== 'APP_DEVELOPER') {
    if (userOrgIdForBusiness) {
      const orgModulesKey = `orgModules:${userOrgIdForBusiness}`
      const orgModules = settingsData?.[orgModulesKey]
      if (Array.isArray(orgModules)) {
        allowedModules = allowedModules.filter(m => orgModules.includes(m))
      }
    }

    // Business-type-based module filtering: hide modules not in the business type preset
    // e.g. a tailor org hides Medications, Vitals, Care Rounds, Rooms, Incidents, Messages
    if (userOrgIdForBusiness) {
      // Look up the org's business type from settings first (stored as setting key: businessType:<orgId>),
      // then fall back to the Organization table's businessType field (fetched via /api/organizations).
      const businessTypeKey = `businessType:${userOrgIdForBusiness}`
      let businessType = settingsData?.[businessTypeKey]
      if (!businessType) {
        // Fall back to the Organization table's businessType field
        const org = organizations.find(o => o.id === userOrgIdForBusiness)
        businessType = org?.businessType || 'nursing_home'
      }
      // Save for module label overrides
      ;(user as any)._businessType = businessType
      // Check for Developer-customized module list for this business type
      const typeModulesKey = `businessTypeModules:${businessType}`
      const customModules = settingsData?.[typeModulesKey]
      if (Array.isArray(customModules)) {
        // Developer has customized the module list for this business type — use it
        allowedModules = allowedModules.filter(m => customModules.includes(m))
      } else {
        // Use the preset defaults
        allowedModules = allowedModules.filter(m => isModuleVisible(businessType, m))
      }
    }
  }

  const defaultModules = ALL_MODULES.filter(m => allowedModules.includes(m.id))

  // Apply custom order if set — modules in the saved order first, then any
  // new modules the user has access to but weren't in the saved order
  const modules = customOrder
    ? [
        ...customOrder
          .filter(id => defaultModules.find(m => m.id === id))
          .map(id => defaultModules.find(m => m.id === id)!),
        ...defaultModules.filter(m => !customOrder.includes(m.id)),
      ]
    : defaultModules

  // Apply custom module labels.
  // Resolution order (highest priority first):
  //   1. Per-org override: orgModuleLabels:<orgId> → { moduleId: "custom label" }
  //      Set by the org owner in Settings → Customization.
  //   2. Per-business-type: businessTypeModuleLabels:<type> → { moduleId: "custom label" }
  //      Set by the Developer in Developer → Customization → Org Type Management.
  //   3. Built-in default label from ALL_MODULES.
  const businessTypeLabelsKey = `businessTypeModuleLabels:${(user as any)._businessType || 'nursing_home'}`
  const businessTypeLabels = settingsData?.[businessTypeLabelsKey]
  const orgLabelsKey = `orgModuleLabels:${userOrgIdForBusiness}`
  const orgLabels = settingsData?.[orgLabelsKey]

  const modulesWithLabels = modules.map(m => {
    // Org-level override takes priority over business-type-level
    let label = m.label
    if (businessTypeLabels && typeof businessTypeLabels === 'object' && businessTypeLabels[m.id]) {
      label = businessTypeLabels[m.id]
    }
    if (orgLabels && typeof orgLabels === 'object' && orgLabels[m.id]) {
      label = orgLabels[m.id]
    }
    return { ...m, label }
  })

  const active = modulesWithLabels.find(m => m.id === activeModule) || modulesWithLabels[0]

  // If role changes and current module not allowed, reset
  if (!allowedModules.includes(activeModule) && activeModule !== 'dashboard') {
    setActiveModule('dashboard')
  }

  // ============ Module reorder handlers ============
  const moveModule = (id: string, direction: 'up' | 'down') => {
    const ids = modules.map(m => m.id)
    const idx = ids.indexOf(id)
    if (idx === -1) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= ids.length) return
    ;[ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]]
    setCustomOrder(ids)
  }

  const handleDragStart = (id: string) => setDraggedId(id)
  const handleDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault()
    if (!draggedId || draggedId === overId) return
    const ids = modules.map(m => m.id)
    const fromIdx = ids.indexOf(draggedId)
    const toIdx = ids.indexOf(overId)
    if (fromIdx === -1 || toIdx === -1) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, draggedId)
    setCustomOrder(ids)
  }
  const handleDragEnd = () => setDraggedId(null)

  const saveOrder = async () => {
    setSavingOrder(true)
    try {
      const order = modules.map(m => m.id)
      const res = await fetch('/api/module-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
      })
      if (!res.ok) throw new Error('Failed to save')
      setCustomOrder(order)
      setEditMode(false)
      toast.success('Module layout saved')
    } catch (e: any) {
      toast.error(e.message || 'Failed to save layout')
    }
    setSavingOrder(false)
  }

  const resetOrder = async () => {
    setSavingOrder(true)
    try {
      await fetch('/api/module-order', { method: 'DELETE' })
      setCustomOrder(null)
      setEditMode(false)
      toast.success('Reset to default layout')
    } catch (e: any) {
      toast.error(e.message || 'Failed to reset')
    }
    setSavingOrder(false)
  }

  const userInitials = user.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()

  return (
    <AIProvider>
    <div className="min-h-screen flex flex-col bg-muted/20">
      {/* Top header */}
      <header className="sticky top-0 z-30 bg-background border-b h-14 flex items-center px-3 sm:px-4 gap-2">
        <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
        <div className="flex items-center gap-2">
          {orgLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={orgLogoUrl} alt={appName} className="h-8 w-auto max-w-[140px] object-contain" />
          ) : (
            <div className="p-1.5 rounded-lg bg-rose-100 text-rose-600">
              <HeartPulse className="h-5 w-5" />
            </div>
          )}
          <div>
            <div className="font-bold text-sm sm:text-base leading-tight">
              {/* When a specific facility is selected, show its name.
                  Otherwise (Owner viewing "All Facilities"), show the app-wide name. */}
              {selectedFacilityId
                ? (facilities.find(f => f.id === selectedFacilityId)?.name || appName || 'Serenity Care Home')
                : (appName || orgName || 'Serenity Care Home')}
            </div>
            <div className="text-[10px] text-muted-foreground leading-tight hidden sm:block">
              {/* Subtitle: when a facility is selected, show the app tagline.
                  When "All Facilities", show org name (or tagline if no org name). */}
              {selectedFacilityId
                ? (appTagline || orgName || 'Resident & Operations Management')
                : (facilities.length > 1 ? `All Facilities (${facilities.length})` : (appTagline || 'Resident & Operations Management'))}
            </div>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Facility switcher — show if user has >1 facility, or is Owner/Developer */}
          {(facilities.length > 1 || user.level <= 1) && (
            <div className="relative">
              <Button variant="outline" size="sm" onClick={() => setFacilityMenuOpen(!facilityMenuOpen)}>
                <Building2 className="h-3.5 w-3.5 mr-1" />
                <span className="hidden sm:inline text-xs">{facilities.find(f => f.id === selectedFacilityId)?.name || 'All Facilities'}</span>
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              {facilityMenuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setFacilityMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-64 bg-background border rounded-md shadow-lg z-20 max-h-80 overflow-y-auto">
                    <div className="p-2 border-b text-xs font-semibold text-muted-foreground">SELECT FACILITY</div>
                    {/* "All Facilities" option — Developer and Owner can see all */}
                    {user.level <= 1 && (
                      <button
                        onClick={() => { setSelectedFacilityId(''); setFacilityMenuOpen(false); toast.success('Showing all facilities') }}
                        className={`w-full text-left px-3 py-2 hover:bg-muted/50 text-sm ${!selectedFacilityId ? 'bg-primary/5 font-medium' : ''}`}
                      >
                        🏢 All Facilities
                      </button>
                    )}
                    {facilities.map(f => (
                      <button
                        key={f.id}
                        onClick={() => { setSelectedFacilityId(f.id); setFacilityMenuOpen(false); toast.success(`Switched to ${f.name}`) }}
                        className={`w-full text-left px-3 py-2 hover:bg-muted/50 text-sm ${selectedFacilityId === f.id ? 'bg-primary/5 font-medium' : ''}`}
                      >
                        <div>{f.name}</div>
                        {f.address && <div className="text-xs text-muted-foreground">{f.address}</div>}
                      </button>
                    ))}
                    {facilities.length === 0 && <p className="px-3 py-2 text-xs text-muted-foreground">No facilities assigned</p>}
                  </div>
                </>
              )}
            </div>
          )}
          {/* User menu */}
          <div className="relative">
            <Button variant="outline" size="sm" onClick={() => setUserMenuOpen(!userMenuOpen)}>
              <Avatar className="h-6 w-6 mr-1.5">
                <AvatarFallback className="bg-primary/10 text-primary text-[10px]">{userInitials}</AvatarFallback>
              </Avatar>
              <span className="font-medium hidden sm:inline">{user.name}</span>
              <ChevronDown className="h-3 w-3 ml-1" />
            </Button>
            {userMenuOpen && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                <div className="absolute right-0 mt-1 w-64 bg-background border rounded-md shadow-lg z-20">
                  <div className="p-3 border-b">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-10 w-10">
                        <AvatarFallback className="bg-primary/10 text-primary">{userInitials}</AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{user.name}</div>
                        <div className="text-xs text-muted-foreground truncate">{user.email}</div>
                      </div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        <UserIcon className="h-3 w-3 mr-1" />
                        {role}
                      </Badge>
                      {user.phone && <span className="text-xs text-muted-foreground">{user.phone}</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => { setActiveModule('profile'); setUserMenuOpen(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 border-b"
                  >
                    <UserIcon className="h-4 w-4" /> My Profile
                  </button>
                  <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 text-red-600"
                  >
                    <LogOut className="h-4 w-4" /> Sign out
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar */}
        <aside className={`fixed lg:sticky lg:top-14 inset-y-0 left-0 z-20 w-60 bg-background border-r pt-14 lg:pt-0 transition-transform lg:translate-x-0 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'} lg:h-[calc(100vh-3.5rem)]`}>
          <nav className="p-2 space-y-0.5 overflow-y-auto h-full">
            {/* Edit mode toolbar */}
            {editMode && (
              <div className="mb-2 p-2 rounded-md bg-primary/5 border border-primary/20 space-y-2">
                <div className="text-xs font-medium text-primary flex items-center gap-1">
                  <Pencil className="h-3 w-3" /> Rearrange Modules
                </div>
                <div className="text-[10px] text-muted-foreground">Drag the grip handle or use ↑/↓ arrows to reorder. Click Save when done.</div>
                <div className="flex gap-1">
                  <Button size="sm" className="h-7 flex-1 text-xs" onClick={saveOrder} disabled={savingOrder}>
                    {savingOrder ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={resetOrder} disabled={savingOrder}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Reset
                  </Button>
                </div>
              </div>
            )}

            {modulesWithLabels.map((m, idx) => (
              <div
                key={m.id}
                draggable={editMode}
                onDragStart={() => editMode && handleDragStart(m.id)}
                onDragOver={(e) => editMode && handleDragOver(e, m.id)}
                onDragEnd={handleDragEnd}
                className={`group flex items-center gap-1 rounded-md transition-colors ${
                  editMode ? 'cursor-grab active:cursor-grabbing' : ''
                } ${draggedId === m.id ? 'opacity-50' : ''}`}
              >
                {editMode && (
                  <GripVertical className="h-3.5 w-3.5 text-muted-foreground/60 flex-shrink-0" />
                )}
                <button
                  onClick={() => { if (!editMode) { setActiveModule(m.id); setSidebarOpen(false) } }}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors flex-1 min-w-0 ${
                    !editMode && active.id === m.id
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-muted text-foreground'
                  } ${editMode ? 'cursor-default' : ''}`}
                >
                  <m.icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{m.label}</span>
                  {m.id === 'messages' && unreadMessages > 0 && (
                    <span className="ml-auto bg-rose-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">
                      {unreadMessages > 99 ? '99+' : unreadMessages}
                    </span>
                  )}
                </button>
                {editMode && (
                  <div className="flex flex-col flex-shrink-0">
                    <button
                      onClick={() => moveModule(m.id, 'up')}
                      disabled={idx === 0}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                      title="Move up"
                    >
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => moveModule(m.id, 'down')}
                      disabled={idx === modulesWithLabels.length - 1}
                      className="text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed p-0.5"
                      title="Move down"
                    >
                      <ChevronDownIcon className="h-3 w-3" />
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Edit layout button — show for App Developer and Owner */}
            {(role === 'APP_DEVELOPER' || role === 'OWNER') && !editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="w-full flex items-center gap-2 px-3 py-1.5 mt-2 rounded-md text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors border border-dashed border-muted-foreground/30"
              >
                <Pencil className="h-3 w-3" /> Edit Layout
              </button>
            )}

            <div className="pt-4 mt-4 border-t">
              <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Session
              </div>
              <div className="px-3 py-1 text-xs text-muted-foreground truncate">
                {user.name}
              </div>
              <div className="px-3 py-1 text-xs text-muted-foreground">
                Role: <span className="font-medium text-foreground">{role}</span>
              </div>
              <div className="px-3 py-1 text-xs text-muted-foreground flex items-center gap-1">
                <Lock className="h-3 w-3" /> {modulesWithLabels.length} modules accessible
              </div>
            </div>
          </nav>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && <div className="fixed inset-0 bg-black/30 z-10 lg:hidden" onClick={() => setSidebarOpen(false)} />}

        {/* Main content */}
        <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-6 max-w-full">
          <div className="max-w-7xl mx-auto">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold">{active.label}</h1>
                <p className="text-xs text-muted-foreground mt-0.5">{getModuleDescription(active.id)}</p>
              </div>
              {role === 'FAMILY' && (
                <Badge variant="outline" className="text-xs">
                  Family view — limited access
                </Badge>
              )}
            </div>
            <active.component setActiveModule={setActiveModule} role={role} facilityId={selectedFacilityId} />
          </div>
        </main>
      </div>

      <footer className="mt-auto border-t bg-background py-3 px-4 text-center text-xs text-muted-foreground">
        Serenity Care Home Management System • Signed in as {user.name} ({role})
      </footer>

      {/* Floating AI Assistant — visible on every page after login.
          NOTE: AIProvider wraps the whole logged-in app so per-module
          AI feature buttons (in Dashboard, Visits, Residents, etc.) can
          call useAI().triggerFeature(...) without prop drilling. The
          AIAssistant itself returns null when AI is disabled for the org. */}
      <AIAssistant onNavigate={(module, tab, dialog, filter) => {
        setActiveModule(module)
        // TODO: pass tab/dialog/filter to the module component via a global state or context
        // For now, navigating to the module is enough — the user can click the tab/dialog themselves
        // The AI message already tells them which tab to click
        toast.info(`Navigated to ${module}${tab ? ` → ${tab}` : ''}`)
      }} />
    </div>
    </AIProvider>
  )
}

function getModuleDescription(id: string): string {
  const map: Record<string, string> = {
    dashboard: 'Overview of today\'s operations, alerts, and key metrics',
    residents: 'Resident profiles, medical history, care logs, and billing',
    rooms: 'Room occupancy, bed availability, and resident assignments',
    staff: 'Staff directory and shift scheduling',
    medications: 'Medication Administration Record (MAR) and pending doses',
    vitals: 'Vital signs history across all residents',
    visits: 'Doctor, physiotherapy, dietitian, and nurse visits',
    incidents: 'Incident reports and follow-up tracking',
    finance: 'Full double-entry accounting: chart of accounts, journal entries, invoices, expenses, payments, vendors, and financial reports',
    messages: 'Communication with residents\' family members',
    users: 'Create and manage user accounts, passwords, and roles',
    products: 'Billable products and services with default prices',
    inventory: 'Track physical stock, low-stock alerts, and stock movements',
    audit: 'Who did what, when — full activity log for compliance',
    rounds: 'Phone-optimized care rounds: meds, vitals, and quick logging',
    settings: 'Configure medication frequencies, user levels, statuses, billing, and facility info',
    developer: 'Download full app backup, database backup, demo mode control, and system info (Developer only)',
    profile: 'View your login details, leave balance & requests, salary (pending + paid), and upcoming shifts',
  }
  return map[id] || ''
}
