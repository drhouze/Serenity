'use client'

import { useState, useEffect, useCallback } from 'react'
import { useEscClose } from './useEscClose'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  User, Mail, Phone, Lock, Save, Eye, EyeOff, KeyRound, Building2, Shield,
  CalendarOff, Plane, Calendar, Clock, Wallet, FileText, ChevronDown, ChevronRight,
  Briefcase, Banknote, AlertCircle, CheckCircle2, XCircle, Plus,
} from 'lucide-react'
import { toast } from 'sonner'
import { LEVEL_LABELS, ROLES, fmtDate, fmtDateTime, fmtTime } from '@/lib/types'
import { useAppDropdowns } from './useAppDropdowns'
import { StatusBadge } from './Badges'
import { apiPost } from './api'

type ProfileData = {
  user: {
    id: string
    name: string
    email: string
    phone?: string | null
    role: string
    level: number
    code?: string | null
    organizationId?: string | null
    facilityIds?: string | null
  }
  staff: any | null
  leaveBalance: any | null
  leaves: any[]
  shifts: { upcoming: any[]; past: any[] }
  payrolls: { pending: any[]; paid: any[] }
  attendances: any[]
}

export function UserProfile() {
  const { data, loading, refetch } = useFetch<ProfileData>('/api/profile/me/full')
  const [tab, setTab] = useState<'account' | 'leaves' | 'salary' | 'shifts'>('account')

  if (loading || !data) {
    return <Skeleton className="h-96" />
  }

  const { user, staff, leaveBalance, leaves, shifts, payrolls } = data
  const initials = user.name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
  const roleLabel = ROLES.find(r => r.id === user.role)?.label || user.role
  const levelLabel = LEVEL_LABELS[user.level] || `Level ${user.level}`
  const hasStaff = !!staff

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Profile header */}
      <Card>
        <CardContent className="p-4 flex items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="bg-primary/10 text-primary text-xl">{initials}</AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-lg font-bold">{user.name}</div>
            <div className="text-sm text-muted-foreground">{user.email}</div>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <Badge variant="outline" className="text-xs"><Shield className="h-3 w-3 mr-1" />{roleLabel}</Badge>
              <Badge variant="outline" className="text-xs">{levelLabel}</Badge>
              {user.code && <span className="text-xs font-mono text-muted-foreground">{user.code}</span>}
              {staff?.code && staff.code !== user.code && (
                <span className="text-xs font-mono text-muted-foreground">Staff: {staff.code}</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* If no linked Staff — show notice */}
      {!hasStaff && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardContent className="p-4 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-medium text-amber-900">No linked staff record</div>
              <p className="text-amber-700 mt-1">
                Your account is not linked to a Staff profile. Leave balances, salary, and shift
                information are only available for accounts linked to a staff record. Please ask
                your manager to link your user account to a Staff entry.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <div className="flex gap-2 border-b overflow-x-auto">
        {([
          { id: 'account', label: 'Account & Login', icon: User },
          { id: 'leaves', label: 'Leave', icon: Plane, disabled: !hasStaff },
          { id: 'salary', label: 'Salary', icon: Wallet, disabled: !hasStaff },
          { id: 'shifts', label: 'My Shifts', icon: Calendar, disabled: !hasStaff },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => !t.disabled && setTab(t.id)}
            disabled={t.disabled}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm border-b-2 whitespace-nowrap transition-colors ${
              tab === t.id
                ? 'border-primary font-medium text-primary'
                : t.disabled
                  ? 'border-transparent text-muted-foreground/40 cursor-not-allowed'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <t.icon className="h-3.5 w-3.5" /> {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'account' && <AccountTab user={user} staff={staff} onUpdated={refetch} />}
      {tab === 'leaves' && hasStaff && (
        <LeavesTab staff={staff} leaveBalance={leaveBalance} leaves={leaves} onSaved={refetch} />
      )}
      {tab === 'salary' && hasStaff && (
        <SalaryTab staff={staff} payrolls={payrolls} />
      )}
      {tab === 'shifts' && hasStaff && (
        <ShiftsTab staff={staff} shifts={shifts} />
      )}
    </div>
  )
}

// ============ ACCOUNT TAB ============
function AccountTab({ user, staff, onUpdated }: { user: any; staff: any; onUpdated: () => void }) {
  const [form, setForm] = useState({
    name: user.name || '',
    email: user.email || '',
    phone: user.phone || '',
  })
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [showPasswords, setShowPasswords] = useState(false)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingPassword, setSavingPassword] = useState(false)

  // Keep form in sync if user prop changes (e.g. after a refetch)
  useEffect(() => {
    setForm({
      name: user.name || '',
      email: user.email || '',
      phone: user.phone || '',
    })
  }, [user])

  const saveProfile = async () => {
    if (!form.name) { toast.error('Name is required'); return }
    setSavingProfile(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Profile updated')
      onUpdated()
    } catch (e: any) { toast.error(e.message) }
    setSavingProfile(false)
  }

  const changePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toast.error('Please fill in all password fields')
      return
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match')
      return
    }
    if (passwordForm.newPassword.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }
    setSavingPassword(true)
    try {
      const res = await fetch('/api/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast.success('Password changed successfully')
      setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' })
    } catch (e: any) { toast.error(e.message) }
    setSavingPassword(false)
  }

  const roleLabel = ROLES.find(r => r.id === user.role)?.label || user.role

  return (
    <div className="space-y-4">
      {/* Login details (read-only summary) */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <KeyRound className="h-4 w-4" /> Login Details
          </CardTitle>
          <CardDescription>Your account information as registered in the system.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="User Code" value={user.code || '—'} mono />
          <Row label="Role" value={roleLabel} />
          <Row label="Level" value={LEVEL_LABELS[user.level] || `Level ${user.level}`} />
          {staff?.facility?.name && (
            <Row label="Primary Facility" value={staff.facility.name} icon={<Building2 className="h-3.5 w-3.5" />} />
          )}
          {user.facilityIds && (
            <Row label="Accessible Facilities" value={`${user.facilityIds.split(',').filter(Boolean).length} facility(ies)`} />
          )}
        </CardContent>
      </Card>

      {/* Edit profile */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <User className="h-4 w-4" /> Profile Details
          </CardTitle>
          <CardDescription>Update your name, email, and contact number.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Full Name *</label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email Address</label>
            <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone Number</label>
            <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="e.g. +60123456789" />
          </div>
          <Button onClick={saveProfile} disabled={savingProfile}>
            {savingProfile ? <><Save className="h-4 w-4 mr-1" /> Saving...</> : <><Save className="h-4 w-4 mr-1" /> Save Profile</>}
          </Button>
        </CardContent>
      </Card>

      {/* Change password */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Lock className="h-4 w-4" /> Change Password
          </CardTitle>
          <CardDescription>Enter your current password and a new password.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Current Password</label>
            <div className="relative">
              <Input
                type={showPasswords ? 'text' : 'password'}
                value={passwordForm.currentPassword}
                onChange={e => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
                placeholder="Enter current password"
              />
              <button
                type="button"
                onClick={() => setShowPasswords(!showPasswords)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">New Password</label>
              <Input
                type={showPasswords ? 'text' : 'password'}
                value={passwordForm.newPassword}
                onChange={e => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
                placeholder="Min 6 characters"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Confirm New Password</label>
              <Input
                type={showPasswords ? 'text' : 'password'}
                value={passwordForm.confirmPassword}
                onChange={e => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
                placeholder="Re-enter new password"
              />
            </div>
          </div>
          <Button onClick={changePassword} disabled={savingPassword}>
            {savingPassword ? <><KeyRound className="h-4 w-4 mr-1" /> Changing...</> : <><KeyRound className="h-4 w-4 mr-1" /> Change Password</>}
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

// ============ LEAVES TAB ============
function LeavesTab({ staff, leaveBalance, leaves, onSaved }: { staff: any; leaveBalance: any; leaves: any[]; onSaved: () => void }) {
  const [showRequest, setShowRequest] = useState(false)
  const [filter, setFilter] = useState<'ALL' | 'PENDING' | 'APPROVED' | 'REJECTED'>('ALL')

  const filtered = filter === 'ALL' ? leaves : leaves.filter(l => l.status === filter)

  return (
    <div className="space-y-4">
      {/* Leave balance summary */}
      {leaveBalance && (
        <Card className="border-blue-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <CalendarOff className="h-4 w-4" /> Leave Balance ({leaveBalance.currentYear})
            </CardTitle>
            <CardDescription className="text-xs">
              Entitlement based on Malaysian Employment Act + your tenure ({leaveBalance.tenureYears}y).
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <BalanceCard
                label="Annual Leave"
                used={leaveBalance.annualUsed}
                entitlement={leaveBalance.annualEntitlement}
                remaining={leaveBalance.annualRemaining}
              />
              <BalanceCard
                label="Sick Leave"
                used={leaveBalance.sickUsed}
                entitlement={leaveBalance.sickEntitlement}
                remaining={leaveBalance.sickRemaining}
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Request leave button + filter */}
      <div className="flex flex-wrap justify-between items-center flex-wrap gap-2">
        <div className="flex gap-1">
          {(['ALL', 'PENDING', 'APPROVED', 'REJECTED'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${
                filter === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-background border-border'
              }`}
            >
              {s}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setShowRequest(true)}>
          <Plus className="h-3 w-3 mr-1" /> Request Leave
        </Button>
      </div>

      {/* Leave list */}
      <div className="grid gap-2">
        {filtered.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No {filter !== 'ALL' ? filter.toLowerCase() : ''} leave requests
          </p>
        )}
        {filtered.map(l => (
          <Card key={l.id}>
            <CardContent className="p-3">
              <div className="flex flex-wrap items-start justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="text-xs">{l.type}</Badge>
                    <StatusBadge status={l.status} />
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {fmtDate(l.startDate)} – {fmtDate(l.endDate)}
                    <span className="ml-2">
                      ({Math.ceil((new Date(l.endDate).getTime() - new Date(l.startDate).getTime()) / 86400000) + 1} days)
                    </span>
                  </div>
                  {l.reason && <p className="text-sm mt-1 italic">"{l.reason}"</p>}
                  {l.reviewedByName && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Reviewed by {l.reviewedByName} on {l.reviewedAt ? fmtDate(l.reviewedAt) : '—'}
                    </p>
                  )}
                  {l.reviewNotes && <p className="text-xs text-muted-foreground mt-0.5">Notes: {l.reviewNotes}</p>}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showRequest && (
        <RequestLeaveDialog
          staff={staff}
          onClose={() => setShowRequest(false)}
          onSaved={() => { setShowRequest(false); onSaved() }}
        />
      )}
    </div>
  )
}

function BalanceCard({ label, used, entitlement, remaining }: { label: string; used: number; entitlement: number; remaining: number }) {
  const color = remaining < 0 ? 'text-red-600' : remaining <= 2 ? 'text-amber-600' : 'text-emerald-600'
  return (
    <div className="rounded-md border p-3 bg-muted/30">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="text-2xl font-bold mt-1">{remaining}</div>
      <div className="text-xs text-muted-foreground">days remaining</div>
      <div className="text-xs mt-1">
        Used <span className="font-medium">{used}</span> of <span className="font-medium">{entitlement}</span>
      </div>
      <div className={`text-xs font-medium mt-1 ${color}`}>
        {remaining < 0 ? `${Math.abs(remaining)} day(s) over` : `${remaining} day(s) left`}
      </div>
    </div>
  )
}

// ============ SALARY TAB ============
function SalaryTab({ staff, payrolls }: { staff: any; payrolls: { pending: any[]; paid: any[] } }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  return (
    <div className="space-y-4">
      {/* Salary preset summary (read-only — managers set this in Settings) */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Briefcase className="h-4 w-4" /> Salary Preset
          </CardTitle>
          <CardDescription className="text-xs">
            Monthly salary configuration set by your manager. Used when generating payroll each month.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <Row label="Basic Salary" value={staff.basicSalary != null ? `RM ${staff.basicSalary.toFixed(2)}` : '—'} />
          <Row label="Default Allowances (monthly)" value={staff.defaultAllowances != null ? `RM ${staff.defaultAllowances.toFixed(2)}` : '—'} />
          <Row label="Default Loan Deduction (monthly)" value={staff.defaultLoanDeduction != null ? `RM ${staff.defaultLoanDeduction.toFixed(2)}` : '—'} />
          <Row label="Default Zakat (monthly)" value={staff.defaultZakat != null ? `RM ${staff.defaultZakat.toFixed(2)}` : '—'} />
          <Row label="Employment Type" value={staff.employmentType} />
          <Row label="Bank" value={staff.bankName ? `${staff.bankName} (${staff.bankAccount || '—'})` : '—'} />
          {staff.epfNumber && <Row label="EPF No." value={staff.epfNumber} />}
          {staff.socsoNumber && <Row label="SOCSO No." value={staff.socsoNumber} />}
          {staff.taxNumber && <Row label="Tax No." value={staff.taxNumber} />}
        </CardContent>
      </Card>

      {/* Pending salary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" /> Pending Salary
            <Badge variant="outline" className="ml-auto">{payrolls.pending.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Draft or approved payrolls not yet marked as paid.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {payrolls.pending.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No pending salary</p>
          )}
          {payrolls.pending.map(p => (
            <PayrollRow
              key={p.id}
              p={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
            />
          ))}
        </CardContent>
      </Card>

      {/* Past (paid) salary */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Wallet className="h-4 w-4" /> Past Salary (Paid)
            <Badge variant="outline" className="ml-auto">{payrolls.paid.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Salary payments already disbursed.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {payrolls.paid.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No paid salary records yet</p>
          )}
          {payrolls.paid.map(p => (
            <PayrollRow
              key={p.id}
              p={p}
              expanded={expandedId === p.id}
              onToggle={() => setExpandedId(expandedId === p.id ? null : p.id)}
            />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}

function PayrollRow({ p, expanded, onToggle }: { p: any; expanded: boolean; onToggle: () => void }) {
  const statusColor =
    p.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' :
    p.status === 'APPROVED' ? 'bg-blue-100 text-blue-700' :
    'bg-amber-100 text-amber-700'

  return (
    <div className="border rounded-md">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-2.5 text-left hover:bg-muted/30"
      >
        <div className="flex items-center gap-2">
          {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
          <div>
            <div className="font-medium text-sm">{p.payrollMonth}</div>
            <div className="text-xs text-muted-foreground">
              {p.facility?.name || '—'} • {p.workingDays} working days
              {p.overtimeHours ? ` • ${p.overtimeHours}h OT` : ''}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="font-bold text-sm">RM {p.netPay.toFixed(2)}</div>
          <div className="flex items-center gap-1 justify-end">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColor}`}>{p.status}</span>
          </div>
        </div>
      </button>
      {expanded && (
        <div className="border-t p-3 space-y-1.5 text-xs">
          {/* Earnings */}
          <div className="font-semibold text-emerald-700 mb-1">Earnings</div>
          <LineItem label="Basic Salary" value={p.basicSalary} />
          <LineItem label="Overtime Pay" value={p.overtimePay} />
          <LineItem label="Allowances" value={p.allowances} />
          <LineItem label="Bonus" value={p.bonus} />
          <LineItem label="Commission" value={p.commission} />
          <div className="flex justify-between font-medium pt-1 border-t">
            <span>Gross Pay</span><span>RM {p.grossPay.toFixed(2)}</span>
          </div>

          {/* Deductions */}
          <div className="font-semibold text-red-700 mt-2 mb-1">Deductions</div>
          <LineItem label="EPF (Employee)" value={p.epfEmployee} />
          <LineItem label="SOCSO (Employee)" value={p.socsoEmployee} />
          <LineItem label="EIS (Employee)" value={p.eisEmployee} />
          <LineItem label="PCB Tax" value={p.pcbTax} />
          <LineItem label="Zakat" value={p.zakat} />
          <LineItem label="Loan Deduction" value={p.loanDeduction} />
          <LineItem label="Unpaid Leave Deduction" value={p.unpaidLeaveDeduction} />
          <div className="flex justify-between font-medium pt-1 border-t">
            <span>Total Deductions</span><span>RM {p.totalDeductions.toFixed(2)}</span>
          </div>

          {/* Net pay */}
          <div className="flex justify-between font-bold text-sm pt-2 border-t mt-1">
            <span>Net Pay</span><span>RM {p.netPay.toFixed(2)}</span>
          </div>

          {/* Payment details */}
          {p.status === 'PAID' && (
            <div className="pt-2 border-t mt-2 space-y-0.5">
              <div className="font-semibold text-muted-foreground mb-1">Payment</div>
              <LineItem label="Paid On" value={p.paidAt ? fmtDate(p.paidAt) : '—'} isText />
              <LineItem label="Paid By" value={p.paidByName || '—'} isText />
              <LineItem label="Method" value={p.paymentMethod || '—'} isText />
              {p.paymentReference && <LineItem label="Reference" value={p.paymentReference} isText />}
            </div>
          )}

          {/* Line items (allowances breakdown etc.) */}
          {p.lineItems?.length > 0 && (
            <div className="pt-2 border-t mt-2 space-y-0.5">
              <div className="font-semibold text-muted-foreground mb-1">Line Items Breakdown</div>
              {p.lineItems.map((li: any) => (
                <div key={li.id} className="flex justify-between">
                  <span className="text-muted-foreground">{li.category.replace(/_/g, ' ')}</span>
                  <span>RM {(li.amount || 0).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function LineItem({ label, value, isText }: { label: string; value: any; isText?: boolean }) {
  if (value == null || value === 0 || value === '') return null
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{isText ? value : `RM ${Number(value).toFixed(2)}`}</span>
    </div>
  )
}

// ============ SHIFTS TAB ============
function ShiftsTab({ staff, shifts }: { staff: any; shifts: { upcoming: any[]; past: any[] } }) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Upcoming Shifts
            <Badge variant="outline" className="ml-auto">{shifts.upcoming.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Your scheduled shifts for the next 14 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {shifts.upcoming.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No upcoming shifts</p>
          )}
          {shifts.upcoming.map(s => <ShiftRow key={s.id} s={s} />)}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" /> Recent Past Shifts
            <Badge variant="outline" className="ml-auto">{shifts.past.length}</Badge>
          </CardTitle>
          <CardDescription className="text-xs">
            Your shifts from the past 30 days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {shifts.past.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No recent past shifts</p>
          )}
          {shifts.past.map(s => <ShiftRow key={s.id} s={s} />)}
        </CardContent>
      </Card>
    </div>
  )
}

function ShiftRow({ s }: { s: any }) {
  const shiftColor = (type: string) => {
    switch (type) {
      case 'DAY': return 'bg-sky-100 text-sky-700 border-sky-300'
      case 'NIGHT': return 'bg-indigo-100 text-indigo-700 border-indigo-300'
      case 'MORNING': return 'bg-amber-100 text-amber-700 border-amber-300'
      case 'EVENING': return 'bg-purple-100 text-purple-700 border-purple-300'
      default: return 'bg-muted text-muted-foreground border-border'
    }
  }
  return (
    <div className="flex items-center justify-between rounded-md border p-2 text-sm">
      <div className="flex items-center gap-2">
        <Badge variant="outline" className={`text-xs ${shiftColor(s.shiftType)}`}>{s.shiftType}</Badge>
        <div>
          <div className="font-medium">{fmtDate(s.date)}</div>
          <div className="text-xs text-muted-foreground">{s.startTime} – {s.endTime}</div>
        </div>
      </div>
      <div className="text-xs text-muted-foreground">
        {(() => {
          const start = new Date(`2000-01-01T${s.startTime}:00`)
          const end = new Date(`2000-01-01T${s.endTime}:00`)
          if (end < start) end.setDate(end.getDate() + 1)
          const hrs = (end.getTime() - start.getTime()) / 3600000
          return `${hrs}h`
        })()}
      </div>
    </div>
  )
}

// ============ SHARED ============
function Row({ label, value, mono, icon }: { label: string; value: string; mono?: boolean; icon?: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-muted-foreground flex items-center gap-1.5">{icon}{label}</span>
      <span className={mono ? 'font-mono text-xs' : ''}>{value}</span>
    </div>
  )
}

// ============ REQUEST LEAVE DIALOG ============
function RequestLeaveDialog({ staff, onClose, onSaved }: { staff: any; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const { leaveTypes } = useAppDropdowns(undefined)
  const [form, setForm] = useState<any>({
    staffId: staff.id,
    type: 'ANNUAL',
    startDate: '',
    endDate: '',
    reason: '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.staffId || !form.startDate || !form.endDate) {
      toast.error('Start date and end date are required')
      return
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      toast.error('End date must be after start date')
      return
    }
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
          {/* Show the staff this is for (read-only) */}
          <div className="bg-muted/30 rounded p-2 text-xs">
            <span className="text-muted-foreground">For: </span>
            <span className="font-medium">{staff.code} {staff.firstName} {staff.lastName}</span>
            <span className="text-muted-foreground"> ({staff.role.replace(/_/g, ' ')})</span>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Leave Type *</label>
            <select
              className="w-full border rounded px-2 py-1.5"
              value={form.type}
              onChange={e => setForm({ ...form, type: e.target.value })}
            >
              {(leaveTypes.length > 0 ? leaveTypes : ['ANNUAL', 'SICK', 'EMERGENCY', 'UNPAID', 'OTHER']).map(t => (
                <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Start Date *</label>
              <Input type="date" value={form.startDate} onChange={e => setForm({ ...form, startDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">End Date *</label>
              <Input type="date" value={form.endDate} onChange={e => setForm({ ...form, endDate: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason</label>
            <textarea
              className="w-full border rounded px-2 py-1.5 text-sm"
              rows={2}
              value={form.reason}
              onChange={e => setForm({ ...form, reason: e.target.value })}
              placeholder="e.g., Family vacation, medical appointment..."
            />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Submitting...' : 'Submit Request'}</Button>
        </div>
      </div>
    </div>
  )
}

// ============ useFetch (inline) ============
function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const refetch = useCallback(() => {
    setLoading(true)
    fetch(url, { cache: 'no-store' })
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [url])
  useEffect(() => { refetch() }, [refetch])
  return { data, loading, refetch }
}
