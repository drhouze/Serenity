'use client'

import React, { useState, useEffect } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPost, apiPatch, apiDelete, withFacility } from './api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StatusBadge } from './Badges'
import { fmtDate, fmtDateTime, fmtMoney } from '@/lib/types'
import {
  DollarSign, TrendingUp, TrendingDown, FileText, Receipt, AlertCircle,
  Plus, Trash2, Send, CheckCircle, CreditCard, Copy, Package,
  Repeat, CalendarPlus, Edit, Printer,
  GripVertical, ChevronUp, ChevronDown, RotateCcw, Check, Loader2, Pencil,
  BookOpen, ExternalLink, X, ScanLine
} from 'lucide-react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Legend, LineChart, Line
} from 'recharts'
import { toast } from 'sonner'
import { useAppDropdowns } from './useAppDropdowns'
import { StandardSearchBar } from './StandardSearchBar'
import { ResidentSelect } from './ResidentSelect'
import { ChartOfAccounts, JournalEntries, Vendors, VendorPayments, BankAccounts, AccountingReports } from './Accounting'

const PIE_COLORS = ['#10b981', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899', '#84cc16']

export function Finance({ facilityId }: { facilityId?: string }) {
  const defaultTabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'unbilled', label: 'Unbilled' },
    { id: 'invoices', label: 'Invoices' },
    { id: 'expenses', label: 'Expenses' },
    { id: 'payments', label: 'Payments' },
    { id: 'receipts', label: 'Receipts' },
    { id: 'accounts', label: 'Chart of Accounts' },
    { id: 'journal', label: 'Journal Entries' },
    { id: 'vendors', label: 'Vendors' },
    { id: 'vendorPayments', label: 'Vendor Payments' },
    { id: 'banks', label: 'Bank Accounts' },
    { id: 'reports', label: 'Reports' },
  ] as const

  const [tab, setTab] = useState<string>('overview')
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const { data: settings } = useFetch<any>(facilityId ? `/api/settings?facilityId=${facilityId}` : '/api/settings')
  const billingSettings = settings ? { taxRate: settings.taxRate ?? 5, invoiceDueDays: settings.invoiceDueDays ?? 30, invoicePrefix: settings.invoicePrefix ?? 'INV-' } : { taxRate: 5, invoiceDueDays: 30, invoicePrefix: 'INV-' }

  // Tab reordering (per-user, same pattern as Settings)
  const [tabOrder, setTabOrder] = useState<string[] | null>(null)
  const [editMode, setEditMode] = useState(false)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)

  // Load per-user tab order
  // Version check: if the saved order doesn't include 'receipts' (added in v2),
  // discard it and use the new default order.
  useEffect(() => {
    if (currentUser?.user?.id && settings) {
      const key = `user:${currentUser.user.id}:financeTabOrder`
      const order = settings[key]
      if (Array.isArray(order) && order.includes('receipts')) {
        setTabOrder(order)
      } else if (Array.isArray(order)) {
        // Stale order (missing 'receipts') — reset to new default
        setTabOrder(null)
      }
    }
  }, [currentUser?.user?.id, settings])

  const allTabs = tabOrder
    ? [
        ...tabOrder.filter(id => defaultTabs.find(t => t.id === id)).map(id => defaultTabs.find(t => t.id === id)!),
        ...defaultTabs.filter(t => !tabOrder.includes(t.id)),
      ]
    : defaultTabs

  const moveTab = (id: string, direction: 'up' | 'down') => {
    const ids = allTabs.map(t => t.id)
    const idx = ids.indexOf(id)
    if (idx === -1) return
    const newIdx = direction === 'up' ? idx - 1 : idx + 1
    if (newIdx < 0 || newIdx >= ids.length) return
    ;[ids[idx], ids[newIdx]] = [ids[newIdx], ids[idx]]
    setTabOrder(ids)
  }

  const handleDragStart = (id: string) => setDraggedId(id)
  const handleDragOver = (e: React.DragEvent, overId: string) => {
    e.preventDefault()
    if (!draggedId || draggedId === overId) return
    const ids = allTabs.map(t => t.id)
    const fromIdx = ids.indexOf(draggedId)
    const toIdx = ids.indexOf(overId)
    if (fromIdx === -1 || toIdx === -1) return
    ids.splice(fromIdx, 1)
    ids.splice(toIdx, 0, draggedId)
    setTabOrder(ids)
  }
  const handleDragEnd = () => setDraggedId(null)

  const saveTabOrder = async () => {
    setSavingOrder(true)
    const order = allTabs.map(t => t.id)
    const userId = currentUser?.user?.id
    if (userId) {
      const key = `user:${userId}:financeTabOrder`
      try {
        await fetch('/api/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key, value: order }),
        })
        toast.success('Tab order saved')
      } catch (e: any) { toast.error(e.message) }
    }
    setTabOrder(order)
    setEditMode(false)
    setSavingOrder(false)
  }

  const resetTabOrder = async () => {
    setSavingOrder(true)
    const userId = currentUser?.user?.id
    if (userId) {
      const key = `user:${userId}:financeTabOrder`
      try {
        await fetch(`/api/settings?key=${encodeURIComponent(key)}`, { method: 'DELETE' })
        toast.success('Reset to default order')
      } catch (e: any) { toast.error(e.message) }
    }
    setTabOrder(null)
    setEditMode(false)
    setSavingOrder(false)
  }

  const role = currentUser?.user?.role
  const canRearrange = role === 'APP_DEVELOPER' || role === 'OWNER' || role === 'MANAGER'

  return (
    <div className="space-y-4">
      {/* Edit mode toolbar */}
      {editMode && canRearrange && (
        <div className="flex items-center gap-2 p-2 rounded-md bg-primary/5 border border-primary/20">
          <Pencil className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs text-primary font-medium">Rearrange tabs — drag or use arrows</span>
          <div className="ml-auto flex gap-1">
            <Button size="sm" className="h-7 text-xs" onClick={saveTabOrder} disabled={savingOrder}>
              {savingOrder ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
              Save
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={resetTabOrder} disabled={savingOrder}>
              <RotateCcw className="h-3 w-3 mr-1" /> Reset
            </Button>
          </div>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b pb-px items-center scrollbar-thin">
        {allTabs.map((t, idx) => (
          <div
            key={t.id}
            draggable={editMode}
            onDragStart={() => editMode && handleDragStart(t.id)}
            onDragOver={(e) => editMode && handleDragOver(e, t.id)}
            onDragEnd={handleDragEnd}
            className={`flex items-center gap-1 flex-shrink-0 ${editMode ? 'cursor-grab active:cursor-grabbing' : ''} ${draggedId === t.id ? 'opacity-50' : ''}`}
          >
            {editMode && <GripVertical className="h-3 w-3 text-muted-foreground/60 flex-shrink-0" />}
            <button
              onClick={() => { if (!editMode) setTab(t.id) }}
              className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                !editMode && tab === t.id
                  ? 'border-primary font-medium text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              } ${editMode ? 'cursor-default' : ''}`}
            >
              {t.label}
            </button>
            {editMode && (
              <div className="flex flex-col flex-shrink-0">
                <button onClick={() => moveTab(t.id, 'up')} disabled={idx === 0} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                  <ChevronUp className="h-3 w-3" />
                </button>
                <button onClick={() => moveTab(t.id, 'down')} disabled={idx === allTabs.length - 1} className="text-muted-foreground hover:text-foreground disabled:opacity-30 p-0.5">
                  <ChevronDown className="h-3 w-3" />
                </button>
              </div>
            )}
          </div>
        ))}
        {!editMode && canRearrange && (
          <button
            onClick={() => setEditMode(true)}
            className="ml-auto flex items-center gap-1 px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/30 rounded-md whitespace-nowrap"
          >
            <Pencil className="h-3 w-3" /> Edit
          </button>
        )}
      </div>

      {tab === 'overview' && <FinanceOverview facilityId={facilityId} />}
      {tab === 'invoices' && <Invoices facilityId={facilityId} billingSettings={billingSettings} />}
      {tab === 'expenses' && <Expenses facilityId={facilityId} />}
      {tab === 'unbilled' && <UnbilledItems facilityId={facilityId} billingSettings={billingSettings} />}
      {tab === 'payments' && <Payments facilityId={facilityId} />}
      {tab === 'receipts' && <Receipts facilityId={facilityId} />}
      {tab === 'accounts' && <ChartOfAccounts facilityId={facilityId} />}
      {tab === 'journal' && <JournalEntries facilityId={facilityId} />}
      {tab === 'vendors' && <Vendors facilityId={facilityId} />}
      {tab === 'vendorPayments' && <VendorPayments facilityId={facilityId} />}
      {tab === 'banks' && <BankAccounts facilityId={facilityId} />}
      {tab === 'reports' && <AccountingReports facilityId={facilityId} />}
    </div>
  )
}

function FinanceOverview({ facilityId }: { facilityId?: string }) {
  const [range, setRange] = useState(90)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading } = useFetch<any>(`/api/finance?range=${range}${facilityParam}`)
  if (loading || !data) return <Skeleton className="h-96" />

  const s = data.summary
  const kpis = [
    { label: 'Total Billed', value: fmtMoney(s.totalBilled), icon: FileText, color: 'text-sky-600', bg: 'bg-sky-50' },
    { label: 'Collected', value: fmtMoney(s.totalCollected), icon: TrendingUp, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Payments Received', value: fmtMoney(s.totalPaymentsReceived || 0), sub: `${s.paymentCount || 0} payment(s)`, icon: CreditCard, color: 'text-teal-600', bg: 'bg-teal-50' },
    { label: 'Unapplied Credit', value: fmtMoney(s.totalUnappliedCredit || 0), sub: 'Available to allocate', icon: DollarSign, color: 'text-amber-600', bg: 'bg-amber-50' },
    { label: 'Outstanding', value: fmtMoney(s.totalOutstanding), icon: AlertCircle, color: 'text-orange-600', bg: 'bg-orange-50' },
    { label: 'Unbilled', value: fmtMoney(s.totalUnbilled), icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50' },
    { label: 'Expenses', value: fmtMoney(s.totalExpenses), icon: TrendingDown, color: 'text-rose-600', bg: 'bg-rose-50' },
    { label: 'Net Income', value: fmtMoney(s.netIncome), icon: TrendingUp, color: s.netIncome >= 0 ? 'text-emerald-600' : 'text-red-600', bg: s.netIncome >= 0 ? 'bg-emerald-50' : 'bg-red-50' },
  ]

  const expensePieData = Object.entries(data.expenseByCategory).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value: value as number }))
  const timelineData = data.timeline.map((t: any) => ({
    month: new Date(t.month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    Revenue: Math.round(t.revenue),
    Expenses: Math.round(t.expenses),
  }))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-sm text-muted-foreground">Range:</span>
        {[30, 90, 365].map(d => (
          <Button key={d} size="sm" variant={range === d ? 'default' : 'outline'} onClick={() => setRange(d)}>
            {d === 30 ? '30 days' : d === 90 ? '90 days' : '1 year'}
          </Button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {kpis.map((k, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className={`p-1.5 rounded-md inline-block ${k.bg} mb-2`}>
                <k.icon className={`h-3.5 w-3.5 ${k.color}`} />
              </div>
              <div className="text-lg font-bold">{k.value}</div>
              <div className="text-xs text-muted-foreground">{k.label}</div>
              {k.sub && <div className="text-[10px] text-muted-foreground/80 mt-0.5">{k.sub}</div>}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Revenue vs Expenses</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={timelineData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="month" fontSize={12} />
                <YAxis fontSize={11} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmtMoney(v)} />
                <Legend />
                <Bar dataKey="Revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Expense Breakdown by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={expensePieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e: any) => `${e.name}`}>
                    {expensePieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Net Income Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={timelineData.map((t: any) => ({ ...t, Net: t.Revenue - t.Expenses }))}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={11} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip formatter={(v: number) => fmtMoney(v)} />
                  <Line dataKey="Net" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function Invoices({ facilityId, billingSettings }: any) {
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=invoices${statusFilter ? `&status=${statusFilter}` : ''}${facilityParam}`)
  const { data: settings } = useFetch<any>('/api/settings')
  const [showCreate, setShowCreate] = useState(false)
  const [printInvoice, setPrintInvoice] = useState<any | null>(null)
  const [editInvoice, setEditInvoice] = useState<any | null>(null)
  const [payInvoice, setPayInvoice] = useState<any | null>(null)
  const [submittingLHDN, setSubmittingLHDN] = useState<string | null>(null) // invoiceId being submitted

  const lhdnEnabled = settings?.lhdnEnabled === true

  if (loading) return <Skeleton className="h-96" />

  const handleLHDNSubmit = async (invoiceId: string) => {
    setSubmittingLHDN(invoiceId)
    try {
      const res = await fetch('/api/e-invoice/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(data.message || 'Submitted to LHDN')
      refetch()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSubmittingLHDN(null)
  }

  const handleLHDNStatus = async (invoiceId: string) => {
    try {
      const res = await fetch('/api/e-invoice/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoiceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      toast.success(`LHDN status: ${data.status}`)
      refetch()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const all = data || []
  const list = all.filter(i => {
    // Date range filter (by issue date)
    if (dateFrom || dateTo) {
      const iDate = new Date(i.issueDate)
      if (dateFrom && iDate < new Date(dateFrom + 'T00:00:00')) return false
      if (dateTo && iDate > new Date(dateTo + 'T23:59:59')) return false
    }
    if (!search) return true
    const s = search.toLowerCase()
    return (
      i.invoiceNumber?.toLowerCase().includes(s) ||
      i.recipient?.toLowerCase().includes(s) ||
      i.status?.toLowerCase().includes(s) ||
      i.notes?.toLowerCase().includes(s) ||
      `${i.resident?.firstName} ${i.resident?.lastName}`.toLowerCase().includes(s) ||
      i.resident?.code?.toLowerCase().includes(s)
    )
  })
  const totalOutstanding = list.filter(i => i.status !== 'PAID' && i.status !== 'CANCELLED').reduce((s, i) => s + Math.round((i.total - i.amountPaid) * 100) / 100, 0)

  return (
    <div className="space-y-4">
      <StandardSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search invoices by number, resident, recipient, status..."
        totalCount={all.length}
        filteredCount={list.length}
      />
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          {['', 'UNPAID', 'PARTIAL', 'OVERDUE', 'PAID'].map(s => (
            <Button key={s || 'all'} size="sm" variant={statusFilter === s ? 'default' : 'outline'} onClick={() => setStatusFilter(s)}>
              {s || 'All'}
            </Button>
          ))}
          <div className="flex items-center gap-1 text-xs ml-2">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded px-1.5 py-1 text-xs" title="From issue date" />
            <span className="text-muted-foreground">→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded px-1.5 py-1 text-xs" title="To issue date" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-red-500 hover:text-red-700 ml-1" title="Clear dates">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <span className="text-sm whitespace-nowrap">Outstanding: <span className="font-semibold text-red-600">{fmtMoney(totalOutstanding)}</span></span>
          <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1" /> New Invoice</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Invoice #</th>
                  <th className="text-left p-2 font-medium">Customer</th>
                  <th className="text-left p-2 font-medium">Issued</th>
                  <th className="text-left p-2 font-medium">Due</th>
                  <th className="text-right p-2 font-medium">Total</th>
                  <th className="text-right p-2 font-medium">Paid</th>
                  <th className="text-right p-2 font-medium">Balance</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  {lhdnEnabled && <th className="text-left p-2 font-medium">E-Invoice</th>}
                  <th className="text-left p-2 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {list.map(inv => (
                  <tr key={inv.id} className="border-t hover:bg-muted/30">
                    <td className="p-2 font-mono text-xs">{inv.invoiceNumber}</td>
                    <td className="p-2">
                      {inv.resident?.code && <span className="text-xs font-mono text-primary block">{inv.resident.code}</span>}
                      {inv.resident?.firstName} {inv.resident?.lastName}
                    </td>
                    <td className="p-2 text-xs">{fmtDate(inv.issueDate)}</td>
                    <td className="p-2 text-xs">{fmtDate(inv.dueDate)}</td>
                    <td className="p-2 text-right">{fmtMoney(Math.round(inv.total * 100) / 100)}</td>
                    <td className="p-2 text-right text-emerald-600">{fmtMoney(Math.round(inv.amountPaid * 100) / 100)}</td>
                    <td className="p-2 text-right font-medium text-red-600">{fmtMoney(Math.round((inv.total - inv.amountPaid) * 100) / 100)}</td>
                    <td className="p-2"><StatusBadge status={inv.status} /></td>
                    {lhdnEnabled && (
                      <td className="p-2">
                        {inv.lhdnStatus === 'VALIDATED' && (
                          <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-[10px]" title={`UUID: ${inv.lhdnUUID}`}>
                            ✅ Validated
                          </Badge>
                        )}
                        {inv.lhdnStatus === 'PENDING' && (
                          <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-[10px]" title="Waiting for LHDN validation">
                            ⏳ Pending
                          </Badge>
                        )}
                        {inv.lhdnStatus === 'REJECTED' && (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-[10px]" title={inv.lhdnError || 'Rejected by LHDN'}>
                            ❌ Rejected
                          </Badge>
                        )}
                        {inv.lhdnStatus === 'CANCELLED' && (
                          <Badge variant="secondary" className="text-[10px]">
                            🚫 Cancelled
                          </Badge>
                        )}
                        {(!inv.lhdnStatus || inv.lhdnStatus === 'NOT_SUBMITTED') && (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">
                            Not submitted
                          </Badge>
                        )}
                      </td>
                    )}
                    <td className="p-2 whitespace-nowrap">
                      {lhdnEnabled && (!inv.lhdnStatus || inv.lhdnStatus === 'NOT_SUBMITTED' || inv.lhdnStatus === 'REJECTED') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-sky-600"
                          title="Submit to LHDN for e-invoice validation"
                          disabled={submittingLHDN === inv.id}
                          onClick={() => handleLHDNSubmit(inv.id)}
                        >
                          {submittingLHDN === inv.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}
                          {submittingLHDN === inv.id ? 'Submitting...' : 'LHDN'}
                        </Button>
                      )}
                      {lhdnEnabled && inv.lhdnStatus === 'PENDING' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          title="Check LHDN validation status"
                          onClick={() => handleLHDNStatus(inv.id)}
                        >
                          <Loader2 className="h-3 w-3 mr-1" /> Check
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7" title="Print / Save as PDF" onClick={() => setPrintInvoice(inv)}>
                        <Printer className="h-3 w-3 mr-1" /> Print
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => setEditInvoice(inv)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      {inv.status !== 'PAID' && inv.status !== 'CANCELLED' && (
                        <Button size="sm" variant="ghost" className="h-7" title="Record payment" onClick={() => setPayInvoice(inv)}>
                          <CreditCard className="h-3 w-3 mr-1" /> Pay
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" title="Delete" onClick={async () => {
                        if (confirm(`Delete invoice ${inv.invoiceNumber}? This cannot be undone.`)) {
                          try {
                            await apiDelete(`/api/data?type=invoices&id=${inv.id}`)
                            toast.success('Invoice deleted')
                            refetch()
                          } catch (e: any) { toast.error(e.message) }
                        }
                      }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showCreate && <CreateInvoiceDialog facilityId={facilityId} billingSettings={billingSettings} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); refetch() }} />}
      {printInvoice && <PrintInvoiceDialog invoice={printInvoice} settings={settings} onClose={() => setPrintInvoice(null)} />}
      {editInvoice && <EditInvoiceDialog invoice={editInvoice} onClose={() => setEditInvoice(null)} onSaved={() => { setEditInvoice(null); refetch() }} />}
      {payInvoice && <PayInvoiceDialog invoice={payInvoice} facilityId={facilityId} onClose={() => setPayInvoice(null)} onSaved={() => { setPayInvoice(null); refetch() }} />}
    </div>
  )
}

// ============ EDIT INVOICE DIALOG ============
function EditInvoiceDialog({ invoice, onClose, onSaved }: { invoice: any; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const { invoiceStatuses } = useAppDropdowns()
  const [form, setForm] = useState({
    invoiceNumber: invoice.invoiceNumber || '',
    recipient: invoice.recipient || '',
    issueDate: invoice.issueDate ? new Date(invoice.issueDate).toISOString().slice(0, 10) : '',
    dueDate: invoice.dueDate ? new Date(invoice.dueDate).toISOString().slice(0, 10) : '',
    subtotal: String(invoice.subtotal ?? 0),
    tax: String(invoice.tax ?? 0),
    total: String(invoice.total ?? 0),
    amountPaid: String(invoice.amountPaid ?? 0),
    status: invoice.status || 'UNPAID',
    notes: invoice.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.invoiceNumber) { toast.error('Invoice number required'); return }
    setSaving(true)
    try {
      const payload = {
        invoiceNumber: form.invoiceNumber,
        recipient: form.recipient || null,
        issueDate: form.issueDate ? new Date(form.issueDate) : undefined,
        dueDate: form.dueDate ? new Date(form.dueDate) : undefined,
        subtotal: parseFloat(form.subtotal) || 0,
        tax: parseFloat(form.tax) || 0,
        total: parseFloat(form.total) || 0,
        amountPaid: parseFloat(form.amountPaid) || 0,
        status: form.status,
        notes: form.notes || null,
      }
      await apiPatch(`/api/data?type=invoices&id=${invoice.id}`, payload)
      toast.success('Invoice updated')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><Edit className="h-4 w-4" /> Edit Invoice</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Invoice Number *</label>
              <Input value={form.invoiceNumber} disabled className="font-mono text-xs bg-muted/50" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Recipient</label>
              <Input value={form.recipient} onChange={e => setForm({ ...form, recipient: e.target.value })} placeholder="Bill to" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Issue Date</label>
              <Input type="date" value={form.issueDate} onChange={e => setForm({ ...form, issueDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Due Date</label>
              <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Subtotal (RM)</label>
              <Input type="number" step="0.01" min="0" value={form.subtotal} onChange={e => setForm({ ...form, subtotal: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tax (RM)</label>
              <Input type="number" step="0.01" min="0" value={form.tax} onChange={e => setForm({ ...form, tax: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Total (RM)</label>
              <Input type="number" step="0.01" min="0" value={form.total} onChange={e => setForm({ ...form, total: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount Paid (RM)</label>
              <Input type="number" step="0.01" min="0" value={form.amountPaid} onChange={e => setForm({ ...form, amountPaid: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
                {(invoiceStatuses.length > 0 ? invoiceStatuses : ['UNPAID', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED']).map(s => (
                  <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </div>
    </div>
  )
}

// ============ PAY INVOICE DIALOG ============
// Full payment dialog with all fields — replaces the old prompt()-based payment
function PayInvoiceDialog({ invoice, facilityId, onClose, onSaved }: { invoice: any; facilityId?: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const balance = Math.round((invoice.total - invoice.amountPaid) * 100) / 100
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: bankAccounts } = useFetch<any[]>(`/api/data?type=bankAccounts${facilityParam}`)
  const [form, setForm] = useState({
    amount: String(balance),
    paymentDate: new Date().toISOString().slice(0, 10),
    method: 'BANK_TRANSFER',
    payerName: invoice.recipient || (invoice.resident ? `${invoice.resident.firstName} ${invoice.resident.lastName}` : ''),
    reference: '',
    bankAccount: '',
    status: 'CLEARED',
    notes: '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    const amt = parseFloat(form.amount)
    if (!amt || amt <= 0) { toast.error('Enter a valid amount'); return }
    if (amt > balance + 0.01) { toast.error(`Amount exceeds invoice balance of ${fmtMoney(balance)}`); return }
    setSaving(true)
    try {
      await apiPost(withFacility('/api/data?type=payments', facilityId), {
        invoiceId: invoice.id,
        residentId: invoice.residentId,
        payerName: form.payerName || null,
        amount: amt,
        paymentDate: form.paymentDate ? new Date(form.paymentDate) : new Date(),
        method: form.method,
        reference: form.reference || null,
        bankAccount: form.bankAccount || null,
        status: form.status,
        notes: form.notes || null,
        applyToInvoice: true,
        facilityId: facilityId || null,
      })
      toast.success(`Payment of ${fmtMoney(amt)} recorded and applied to ${invoice.invoiceNumber}`)
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title={`Record Payment — ${invoice.invoiceNumber}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        {/* Invoice summary */}
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2 grid grid-cols-2 gap-2">
          <div>Invoice Total: <span className="font-medium text-foreground">{fmtMoney(invoice.total)}</span></div>
          <div>Already Paid: <span className="font-medium text-emerald-600">{fmtMoney(invoice.amountPaid)}</span></div>
          <div>Balance Due: <span className="font-medium text-red-600">{fmtMoney(balance)}</span></div>
          <div>Status: <span className="font-medium text-foreground">{invoice.status}</span></div>
          {invoice.resident && (
            <div className="col-span-2">Customer: {invoice.resident.code && <span className="font-mono text-primary">{invoice.resident.code}</span>} {invoice.resident.firstName} {invoice.resident.lastName}</div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Amount (RM) *">
            <Input type="number" step="0.01" min="0.01" max={balance} value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Payment Date">
            <Input type="date" value={form.paymentDate} onChange={e => setForm({ ...form, paymentDate: e.target.value })} />
          </Field>
          <Field label="Payer Name">
            <Input value={form.payerName} onChange={e => setForm({ ...form, payerName: e.target.value })} placeholder="Who paid (resident, family, insurance)" />
          </Field>
          <Field label="Method">
            <select className="w-full border rounded px-2 py-1.5" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
              {PAYMENT_METHODS_FALLBACK.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="w-full border rounded px-2 py-1.5" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {PAYMENT_STATUSES_FALLBACK.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Reference (cheque #, txn id)">
            <Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="e.g. MBB-TXN-12345" />
          </Field>
          <Field label="Bank Account">
            <select className="w-full border rounded px-2 py-1.5" value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })}>
              <option value="">— Select bank account —</option>
              {(bankAccounts || []).map(b => <option key={b.id} value={b.name}>{b.code} — {b.name}{b.bankName ? ` (${b.bankName})` : ''}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
        </Field>
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
          A payment record with auto-generated code (PMT-XXXXXX) will be created and automatically applied to this invoice. The invoice status will update to PAID or PARTIAL accordingly.
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Recording...' : 'Record Payment'}</Button>
      </div>
    </Modal>
  )
}

function PrintInvoiceDialog({ invoice, settings, onClose }: { invoice: any; settings?: any; onClose: () => void }) {
  useEscClose(onClose)
  const orgName = settings?.organizationName || settings?.appName || 'Serenity Care Home'
  const orgLogoUrl = settings?.organizationLogoUrl || settings?.appLogoUrl || ''
  const orgAddress = settings?.organizationAddress || ''
  const orgAddress2 = settings?.organizationAddress2 || ''
  const orgCity = settings?.organizationCity || ''
  const orgState = settings?.organizationState || ''
  const orgPostal = settings?.organizationPostalCode || ''
  const orgCountry = settings?.organizationCountry || 'Malaysia'
  const orgPhone = settings?.organizationPhone || ''
  const orgEmail = settings?.organizationEmail || ''
  const orgRegNumber = settings?.organizationRegistrationNumber || ''
  const orgTIN = settings?.organizationTIN || ''
  const orgMSIC = settings?.organizationMSIC || ''
  const orgBusinessActivity = settings?.organizationBusinessActivity || ''
  const orgSSTNumber = settings?.organizationSSTNumber || ''
  const orgSSTRegistered = settings?.organizationSSTRegistered || false
  const lhdnEnabled = settings?.lhdnEnabled === true
  const invoiceHeader = settings?.invoiceHeaderText || ''
  const invoiceFooter = settings?.invoiceFooterText || `Thank you for choosing ${orgName}`
  const currency = settings?.currency || 'RM'
  const taxRate = settings?.taxRate ?? 0
  const taxMode = settings?.taxMode || 'EXCLUSIVE'
  const primaryColor = settings?.primaryColor || settings?.appPrimaryColor || '#e11d48'

  // Build full address
  const addressLines = [
    orgAddress,
    orgAddress2,
    [orgCity, orgState, orgPostal].filter(Boolean).join(', '),
    orgCountry
  ].filter(Boolean)

  const fmtMoney = (n: number) => `${currency} ${(Math.round(n * 100) / 100).toFixed(2)}`

  const handlePrint = () => {
    const w = window.open('', '_blank', 'width=800,height=600')
    if (!w) { toast.error('Please allow popups to print the invoice'); return }
    const items = invoice.items || []
    const residentName = invoice.recipient
      || (invoice.resident?.billingName)
      || (invoice.resident ? `${invoice.resident?.firstName} ${invoice.resident?.lastName}` : '') || '—'
    const residentCode = invoice.resident?.code || ''
    const residentRoom = invoice.resident?.room?.roomNumber || ''
    const balanceDue = (invoice.total || 0) - (invoice.amountPaid || 0)

    // LHDN validation link — for validated invoices, this is the URL buyers can use to verify the e-invoice
    const lhdnValidationUrl = invoice.lhdnUUID
      ? `https://myinvois.hasil.gov.my/documents/${invoice.lhdnUUID}/share/${invoice.lhdnLongId || ''}`
      : ''

    // Build QR code (using a public QR API service for the LHDN validation URL)
    const lhdnQrUrl = lhdnValidationUrl
      ? `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(lhdnValidationUrl)}`
      : ''

    // Seller info block (for LHDN compliance)
    const showLhdnPanel = lhdnEnabled || invoice.lhdnStatus

    const html = `
<!DOCTYPE html>
<html><head><title>Invoice ${invoice.invoiceNumber}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; padding: 40px; max-width: 800px; margin: 0 auto; position: relative; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; border-bottom: 3px solid ${primaryColor}; padding-bottom: 20px; }
  .logo { font-size: 24px; font-weight: bold; color: ${primaryColor}; }
  .logo-sub { font-size: 11px; color: #666; margin-top: 2px; line-height: 1.4; }
  .org-details { font-size: 10px; color: #666; margin-top: 4px; line-height: 1.5; }
  .invoice-meta { text-align: right; font-size: 12px; }
  .invoice-num { font-size: 20px; font-weight: bold; color: ${primaryColor}; margin-bottom: 5px; }
  .status-badge { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; margin-top: 5px; }
  .status-PAID { background: #d1fae5; color: #065f46; }
  .status-UNPAID { background: #fef3c7; color: #92400e; }
  .status-OVERDUE { background: #fee2e2; color: #991b1b; }
  .status-PARTIAL { background: #ffedd5; color: #9a3412; }
  .status-CANCELLED { background: #f3f4f6; color: #6b7280; }
  .bill-section { display: flex; justify-content: space-between; margin-bottom: 25px; gap: 30px; }
  .bill-to { flex: 1; }
  .bill-to-label { font-size: 10px; text-transform: uppercase; color: #999; margin-bottom: 4px; letter-spacing: 0.5px; }
  .bill-to-name { font-size: 14px; font-weight: 600; margin-bottom: 2px; }
  .bill-to-detail { font-size: 11px; color: #666; line-height: 1.4; }
  .invoice-info { flex: 1; text-align: right; }
  .invoice-info-row { display: flex; justify-content: flex-end; gap: 8px; font-size: 12px; margin-bottom: 3px; }
  .invoice-info-label { color: #999; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }
  .invoice-info-value { font-weight: 500; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 25px; }
  th { background: #f8f8f8; padding: 10px; text-align: left; font-size: 10px; text-transform: uppercase; color: #666; border-bottom: 2px solid #ddd; letter-spacing: 0.5px; }
  td { padding: 10px; border-bottom: 1px solid #eee; font-size: 13px; }
  .right { text-align: right; }
  .totals { margin-left: auto; width: 280px; }
  .totals-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .totals-label { color: #555; }
  .totals-total { border-top: 2px solid #1a1a1a; margin-top: 5px; padding-top: 10px; font-size: 16px; font-weight: bold; }
  .totals-due { color: ${primaryColor}; }
  .payment-info { margin-top: 20px; padding: 12px; background: #f9fafb; border-radius: 6px; font-size: 11px; color: #555; }
  .payment-info-title { font-weight: 600; margin-bottom: 4px; color: #333; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center; }
  .tax-info { font-size: 10px; color: #999; margin-top: 8px; }
  .e-invoice-panel { margin-top: 15px; padding: 14px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; font-size: 11px; color: #1e40af; display: flex; gap: 14px; }
  .e-invoice-qr { flex-shrink: 0; width: 90px; height: 90px; border: 1px solid #bfdbfe; border-radius: 4px; background: #fff; padding: 4px; }
  .e-invoice-content { flex: 1; }
  .e-invoice-title { font-weight: 600; font-size: 12px; margin-bottom: 4px; color: #1e3a8a; }
  .e-invoice-row { margin-bottom: 2px; }
  .e-invoice-row strong { display: inline-block; min-width: 80px; }
  .seller-buyer-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 20px 0; padding: 14px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 6px; font-size: 11px; }
  .seller-buyer-col h4 { font-size: 10px; text-transform: uppercase; color: #6b7280; margin-bottom: 6px; letter-spacing: 0.5px; font-weight: 600; }
  .seller-buyer-col .name { font-weight: 600; font-size: 12px; color: #1a1a1a; margin-bottom: 2px; }
  .seller-buyer-col .row { margin-bottom: 2px; color: #555; }
  .seller-buyer-col .row strong { display: inline-block; min-width: 36px; color: #6b7280; font-weight: 500; }
  .paid-stamp { position: absolute; top: 200px; right: 80px; font-size: 48px; color: rgba(16, 185, 129, 0.2); font-weight: bold; transform: rotate(-20deg); border: 4px solid rgba(16, 185, 129, 0.2); padding: 10px 20px; border-radius: 8px; }
  @media print { body { padding: 20px; } .no-print { display: none; } }
</style>
</head><body>
  <div class="header">
    <div>
      ${orgLogoUrl ? `<img src="${orgLogoUrl}" alt="${orgName}" style="max-height:60px; max-width:200px; object-fit:contain;" />` : `<div class="logo">${orgName}</div>`}
      ${addressLines.length > 0 ? `<div class="logo-sub">${addressLines.join('<br/>')}</div>` : ''}
      <div class="org-details">
        ${orgPhone ? `Tel: ${orgPhone}` : ''}
        ${orgEmail ? `${orgPhone ? ' | ' : ''}Email: ${orgEmail}` : ''}
        ${orgRegNumber ? `<br/>Company Reg No: ${orgRegNumber}` : ''}
        ${orgTIN ? `<br/>TIN: ${orgTIN}` : ''}
        ${orgSSTRegistered && orgSSTNumber ? `<br/>SST No: ${orgSSTNumber}` : ''}
        ${orgMSIC && showLhdnPanel ? `<br/>MSIC: ${orgMSIC}${orgBusinessActivity ? ` — ${orgBusinessActivity}` : ''}` : ''}
      </div>
      ${invoiceHeader ? `<div style="font-size:12px; color:#888; margin-top:6px; font-style:italic;">${invoiceHeader}</div>` : ''}
    </div>
    <div class="invoice-meta">
      <div class="invoice-num">INVOICE</div>
      <div style="font-size: 14px; font-weight: 600; margin-bottom: 8px;">${invoice.invoiceNumber}</div>
      <span class="status-badge status-${invoice.status}">${invoice.status}</span>
      ${invoice.lhdnStatus === 'VALIDATED' ? `<div style="margin-top:6px; font-size:10px; color:#1e40af; font-weight:600;">✓ E-Invoice Validated</div>` : ''}
    </div>
  </div>

  ${invoice.status === 'PAID' ? '<div class="paid-stamp">PAID</div>' : ''}

  <div class="bill-section">
    <div class="bill-to">
      <div class="bill-to-label">Billed To</div>
      <div class="bill-to-name">${residentName}</div>
      ${residentCode ? `<div class="bill-to-detail">Customer Code: ${residentCode}</div>` : ''}
      ${residentRoom ? `<div class="bill-to-detail">Room: ${residentRoom}</div>` : ''}
      ${invoice.resident?.billingTIN ? `<div class="bill-to-detail">TIN: ${invoice.resident.billingTIN}</div>` : ''}
      ${invoice.resident?.billingPhone ? `<div class="bill-to-detail">Phone: ${invoice.resident.billingPhone}</div>` : ''}
      ${invoice.resident?.billingEmail ? `<div class="bill-to-detail">Email: ${invoice.resident.billingEmail}</div>` : ''}
      ${invoice.resident?.billingAddress ? `<div class="bill-to-detail">${invoice.resident.billingAddress}</div>` : ''}
    </div>
    <div class="invoice-info">
      <div class="invoice-info-row"><span class="invoice-info-label">Issue Date:</span><span class="invoice-info-value">${new Date(invoice.issueDate).toLocaleDateString('en-MY')}</span></div>
      <div class="invoice-info-row"><span class="invoice-info-label">Due Date:</span><span class="invoice-info-value">${new Date(invoice.dueDate).toLocaleDateString('en-MY')}</span></div>
      <div class="invoice-info-row"><span class="invoice-info-label">Currency:</span><span class="invoice-info-value">${currency}</span></div>
      ${orgSSTRegistered ? `<div class="invoice-info-row"><span class="invoice-info-label">Tax Mode:</span><span class="invoice-info-value">${taxMode} (${taxRate}%)</span></div>` : ''}
      ${showLhdnPanel && orgMSIC ? `<div class="invoice-info-row"><span class="invoice-info-label">MSIC:</span><span class="invoice-info-value">${orgMSIC}</span></div>` : ''}
      ${invoice.notes ? `<div class="invoice-info-row"><span class="invoice-info-label">Notes:</span><span class="invoice-info-value">${invoice.notes}</span></div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 5%;">#</th>
        <th>Description</th>
        <th>Category</th>
        <th class="right" style="width: 10%;">Qty</th>
        <th class="right" style="width: 15%;">Unit Price</th>
        <th class="right" style="width: 15%;">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${items.map((item: any, idx: number) => `
        <tr>
          <td>${idx + 1}</td>
          <td>${item.description}</td>
          <td>${item.category?.replace(/_/g, ' ') || '—'}</td>
          <td class="right">${item.quantity}</td>
          <td class="right">${fmtMoney(item.unitPrice)}</td>
          <td class="right">${fmtMoney(item.total)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row"><span class="totals-label">Subtotal</span><span>${fmtMoney(invoice.subtotal)}</span></div>
    ${orgSSTRegistered ? `<div class="totals-row"><span class="totals-label">Tax (${taxRate}%)</span><span>${fmtMoney(invoice.tax)}</span></div>` : ''}
    <div class="totals-row"><span class="totals-label">Total</span><span>${fmtMoney(invoice.total)}</span></div>
    <div class="totals-row"><span class="totals-label">Amount Paid</span><span>${fmtMoney(invoice.amountPaid)}</span></div>
    <div class="totals-row totals-total ${balanceDue > 0 ? 'totals-due' : ''}">
      <span>${balanceDue > 0 ? 'Balance Due' : 'Fully Paid'}</span>
      <span>${fmtMoney(Math.max(balanceDue, 0))}</span>
    </div>
  </div>

  ${!orgSSTRegistered ? `<div class="tax-info">This supply is not subject to SST (Sales &amp; Service Tax).</div>` : ''}

  ${showLhdnPanel ? `
  <div class="seller-buyer-grid">
    <div class="seller-buyer-col">
      <h4>Seller (Supplier)</h4>
      <div class="name">${orgName}</div>
      ${orgTIN ? `<div class="row"><strong>TIN:</strong> ${orgTIN}</div>` : ''}
      ${orgRegNumber ? `<div class="row"><strong>Reg:</strong> ${orgRegNumber}</div>` : ''}
      ${orgSSTRegistered && orgSSTNumber ? `<div class="row"><strong>SST:</strong> ${orgSSTNumber}</div>` : ''}
      ${orgMSIC ? `<div class="row"><strong>MSIC:</strong> ${orgMSIC}</div>` : ''}
      ${addressLines.length > 0 ? `<div class="row" style="margin-top:4px;">${addressLines.join(', ')}</div>` : ''}
      ${orgPhone ? `<div class="row"><strong>Tel:</strong> ${orgPhone}</div>` : ''}
      ${orgEmail ? `<div class="row"><strong>Email:</strong> ${orgEmail}</div>` : ''}
    </div>
    <div class="seller-buyer-col">
      <h4>Buyer (Customer)</h4>
      <div class="name">${residentName}</div>
      ${invoice.resident?.billingTIN ? `<div class="row"><strong>TIN:</strong> ${invoice.resident.billingTIN}</div>` : '<div class="row" style="color:#999;font-style:italic;">TIN: —</div>'}
      ${residentCode ? `<div class="row"><strong>Code:</strong> ${residentCode}</div>` : ''}
      ${residentRoom ? `<div class="row"><strong>Room:</strong> ${residentRoom}</div>` : ''}
      ${invoice.resident?.billingPhone ? `<div class="row"><strong>Tel:</strong> ${invoice.resident.billingPhone}</div>` : ''}
      ${invoice.resident?.billingEmail ? `<div class="row"><strong>Email:</strong> ${invoice.resident.billingEmail}</div>` : ''}
      ${invoice.resident?.billingAddress ? `<div class="row" style="margin-top:4px;">${invoice.resident.billingAddress}</div>` : ''}
    </div>
  </div>` : ''}

  ${invoice.lhdnStatus === 'VALIDATED' ? `
  <div class="e-invoice-panel">
    ${lhdnQrUrl ? `<img src="${lhdnQrUrl}" alt="LHDN Validation QR" class="e-invoice-qr" />` : ''}
    <div class="e-invoice-content">
      <div class="e-invoice-title">✓ LHDN E-Invoice Validated</div>
      <div class="e-invoice-row"><strong>UUID:</strong> ${invoice.lhdnUUID || '—'}</div>
      ${invoice.lhdnLongId ? `<div class="e-invoice-row"><strong>Long ID:</strong> ${invoice.lhdnLongId}</div>` : ''}
      <div class="e-invoice-row"><strong>Submitted:</strong> ${invoice.lhdnSubmittedAt ? new Date(invoice.lhdnSubmittedAt).toLocaleString('en-MY') : '—'}</div>
      <div class="e-invoice-row"><strong>Validated:</strong> ${invoice.lhdnValidatedAt ? new Date(invoice.lhdnValidatedAt).toLocaleString('en-MY') : '—'}</div>
      ${lhdnValidationUrl ? `<div class="e-invoice-row" style="margin-top:6px;font-size:10px;color:#1e40af;">Scan the QR code or visit the LHDN portal to verify this e-invoice.</div>` : ''}
    </div>
  </div>` : ''}

  ${invoice.lhdnStatus === 'PENDING' ? `
  <div class="e-invoice-panel">
    <div class="e-invoice-content">
      <div class="e-invoice-title">⧗ LHDN E-Invoice Pending Validation</div>
      <div class="e-invoice-row"><strong>UUID:</strong> ${invoice.lhdnUUID || '—'}</div>
      <div class="e-invoice-row"><strong>Submitted:</strong> ${invoice.lhdnSubmittedAt ? new Date(invoice.lhdnSubmittedAt).toLocaleString('en-MY') : '—'}</div>
      <div class="e-invoice-row" style="margin-top:4px;">This e-invoice has been submitted to LHDN and is awaiting validation.</div>
    </div>
  </div>` : ''}

  ${invoice.lhdnStatus === 'REJECTED' ? `
  <div class="e-invoice-panel" style="background:#fef2f2;border-color:#fecaca;color:#991b1b;">
    <div class="e-invoice-content">
      <div class="e-invoice-title" style="color:#7f1d1d;">✗ LHDN E-Invoice Rejected</div>
      <div class="e-invoice-row"><strong>UUID:</strong> ${invoice.lhdnUUID || '—'}</div>
      ${invoice.lhdnError ? `<div class="e-invoice-row"><strong>Error:</strong> ${invoice.lhdnError}</div>` : ''}
      <div class="e-invoice-row" style="margin-top:4px;">Please correct the issue and resubmit to LHDN.</div>
    </div>
  </div>` : ''}

  ${lhdnEnabled && !invoice.lhdnStatus ? `
  <div class="e-invoice-panel" style="background:#f3f4f6;border-color:#d1d5db;color:#374151;">
    <div class="e-invoice-content">
      <div class="e-invoice-title" style="color:#1f2937;">E-Invoice not yet submitted</div>
      <div class="e-invoice-row">LHDN e-invoicing is enabled but this invoice has not yet been submitted. Submit it from the Invoices tab to obtain LHDN validation.</div>
    </div>
  </div>` : ''}

  <div class="payment-info">
    <div class="payment-info-title">Payment Instructions</div>
    Please make payment via bank transfer, cheque, or cash to ${orgName}.<br/>
    ${orgPhone ? `For payment inquiries, call ${orgPhone}.` : 'For payment inquiries, please contact our reception.'}<br/>
    Please quote invoice number <strong>${invoice.invoiceNumber}</strong> when making payment.
  </div>

  <div class="footer">
    <p>${invoiceFooter}</p>
    <p>This is a computer-generated invoice. No signature required.</p>
    ${invoice.lhdnStatus === 'VALIDATED' ? '<p style="margin-top:4px;color:#1e40af;">This is a validated LHDN e-invoice under Malaysia\'s MyInvois system.</p>' : ''}
    <p style="margin-top: 8px;">Generated on ${new Date().toLocaleString('en-MY')} by ${orgName}</p>
  </div>

  <div class="no-print" style="text-align: center; margin-top: 30px;">
    <button onclick="window.print()" style="padding: 10px 30px; font-size: 14px; background: ${primaryColor}; color: white; border: none; border-radius: 6px; cursor: pointer;">Print / Save as PDF</button>
  </div>
</body></html>`
    w.document.write(html)
    w.document.close()
    setTimeout(() => { w.focus(); w.print() }, 500)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><Printer className="h-4 w-4" /> Invoice {invoice.invoiceNumber}</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4">
          {/* Preview */}
          <div className="border rounded-lg p-6 bg-white">
            <div className="flex justify-between items-start mb-6 pb-4" style={{ borderBottom: `3px solid ${primaryColor}` }}>
              <div>
                {orgLogoUrl ? (
                  <img src={orgLogoUrl} alt={orgName} style={{ maxHeight: 48, maxWidth: 180, objectFit: 'contain' }} />
                ) : (
                  <div className="text-xl font-bold" style={{ color: primaryColor }}>{orgName}</div>
                )}
                {addressLines.length > 0 && (
                  <div className="text-xs text-muted-foreground mt-1 leading-tight">{addressLines.join(' • ')}</div>
                )}
                <div className="text-[10px] text-muted-foreground mt-1">
                  {orgPhone && <span>Tel: {orgPhone}</span>}
                  {orgEmail && <span>{orgPhone ? ' | ' : ''}Email: {orgEmail}</span>}
                  {orgTIN && <span className="block">TIN: {orgTIN}</span>}
                  {orgSSTRegistered && orgSSTNumber && <span className="block">SST: {orgSSTNumber}</span>}
                  {lhdnEnabled && orgMSIC && <span className="block">MSIC: {orgMSIC}</span>}
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="text-lg font-bold" style={{ color: primaryColor }}>INVOICE</div>
                <div className="font-semibold">{invoice.invoiceNumber}</div>
                <div className="text-xs mt-1">Issued: {fmtDate(invoice.issueDate)}</div>
                <div className="text-xs">Due: {fmtDate(invoice.dueDate)}</div>
                {invoice.lhdnStatus === 'VALIDATED' && (
                  <div className="mt-1 text-[10px] text-blue-700 font-semibold bg-blue-50 border border-blue-200 rounded px-2 py-0.5 inline-block">
                    ✓ LHDN Validated
                  </div>
                )}
                {invoice.lhdnStatus === 'PENDING' && (
                  <div className="mt-1 text-[10px] text-amber-700 font-semibold bg-amber-50 border border-amber-200 rounded px-2 py-0.5 inline-block">
                    ⧗ LHDN Pending
                  </div>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
              <div className="bg-muted/30 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase mb-0.5">Billed To</div>
                <div className="font-semibold text-sm">{invoice.recipient || invoice.resident?.billingName || `${invoice.resident?.firstName} ${invoice.resident?.lastName}`}</div>
                {invoice.resident?.code && <div className="text-muted-foreground">Code: {invoice.resident.code}</div>}
                {invoice.resident?.room?.roomNumber && <div className="text-muted-foreground">Room: {invoice.resident.room.roomNumber}</div>}
                {invoice.resident?.billingTIN && <div className="text-muted-foreground">TIN: {invoice.resident.billingTIN}</div>}
                {invoice.resident?.billingAddress && <div className="text-muted-foreground">{invoice.resident.billingAddress}</div>}
              </div>
              <div className="bg-muted/30 rounded p-2">
                <div className="text-[10px] text-muted-foreground uppercase mb-0.5">Invoice Info</div>
                <div className="flex justify-between"><span className="text-muted-foreground">Currency:</span><span className="font-medium">{currency}</span></div>
                {orgSSTRegistered && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Tax:</span><span className="font-medium">{taxMode} ({taxRate}%)</span></div>
                )}
                {lhdnEnabled && orgMSIC && (
                  <div className="flex justify-between"><span className="text-muted-foreground">MSIC:</span><span className="font-medium">{orgMSIC}</span></div>
                )}
                {invoice.lhdnUUID && (
                  <div className="flex flex-wrap justify-between gap-2"><span className="text-muted-foreground">UUID:</span><span className="font-mono text-[10px] truncate" title={invoice.lhdnUUID}>{invoice.lhdnUUID.slice(0, 12)}…</span></div>
                )}
              </div>
            </div>
            <div className="overflow-x-auto -mx-1 px-1">
              <table className="w-full text-sm mb-4">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 text-xs uppercase text-muted-foreground">Description</th>
                    <th className="text-right p-2 text-xs uppercase text-muted-foreground">Qty</th>
                    <th className="text-right p-2 text-xs uppercase text-muted-foreground">Price</th>
                    <th className="text-right p-2 text-xs uppercase text-muted-foreground">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoice.items || []).map((item: any) => (
                    <tr key={item.id} className="border-b">
                      <td className="p-2">{item.description}</td>
                      <td className="p-2 text-right">{item.quantity}</td>
                      <td className="p-2 text-right">{fmtMoney(item.unitPrice)}</td>
                      <td className="p-2 text-right">{fmtMoney(item.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="ml-auto w-full sm:w-64 space-y-1 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtMoney(Math.round(invoice.subtotal * 100) / 100)}</span></div>
              {orgSSTRegistered && (
                <div className="flex justify-between"><span className="text-muted-foreground">Tax ({taxRate}%)</span><span>{fmtMoney(Math.round(invoice.tax * 100) / 100)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Amount Paid</span><span className="text-emerald-600">{fmtMoney(Math.round(invoice.amountPaid * 100) / 100)}</span></div>
              <div className="flex justify-between font-bold text-base border-t pt-2"><span>Balance Due</span><span style={{ color: primaryColor }}>{fmtMoney(Math.round((invoice.total - invoice.amountPaid) * 100) / 100)}</span></div>
            </div>
            {invoice.lhdnStatus === 'VALIDATED' && (
              <div className="mt-4 p-2 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-800">
                <strong>✓ LHDN E-Invoice Validated</strong> — UUID: <span className="font-mono">{invoice.lhdnUUID}</span>
                {invoice.lhdnLongId && <span className="block">Long ID: <span className="font-mono text-[10px]">{invoice.lhdnLongId}</span></span>}
                <span className="block text-[10px] mt-1">A QR code linking to the LHDN validation portal will be included in the printed PDF.</span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap justify-end gap-2 mt-4">
            <Button variant="outline" onClick={onClose}>Close</Button>
            <Button onClick={handlePrint}><Printer className="h-4 w-4 mr-1" /> Print / Save as PDF</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function CreateInvoiceDialog({ facilityId, billingSettings, onClose, onSaved }: any) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: residents } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)
  const { data: unbilledItems } = useFetch<any[]>(`/api/data?type=invoiceItems&unbilled=true${facilityParam}`)
  const [residentId, setResidentId] = useState('')
  const [saving, setSaving] = useState(false)

  const taxRate = billingSettings?.taxRate ?? 5
  const dueDays = billingSettings?.invoiceDueDays ?? 30
  const invoicePrefix = billingSettings?.invoicePrefix ?? 'INV-'

  const residentUnbilled = (unbilledItems || []).filter((i: any) => !residentId || i.residentId === residentId)
  const total = residentUnbilled.reduce((s: number, i: any) => s + i.total, 0)

  // Round to 2 decimal places to avoid floating point issues
  const round2 = (n: number) => Math.round(n * 100) / 100

  const submit = async () => {
    if (!residentId) { toast.error('Select a resident'); return }
    if (residentUnbilled.length === 0) { toast.error('No unbilled items for this resident'); return }
    setSaving(true)
    try {
      const r = (residents || []).find((x: any) => x.id === residentId)
      const issueDate = new Date()
      const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + dueDays)
      const subtotal = round2(total)
      const tax = round2(subtotal * taxRate / 100)
      const totalAmount = round2(subtotal + tax)
      const inv = await apiPost(withFacility('/api/data?type=invoices', facilityId), {
        // Server generates the invoice number using the shared helper
        // (respects prefix + codeIncludeDate settings)
        residentId,
        recipient: `${r.firstName} ${r.lastName}`,
        issueDate,
        dueDate,
        status: 'UNPAID',
        subtotal,
        tax,
        total: totalAmount,
        amountPaid: 0,
        notes: 'Includes unbilled service items',
        facilityId: facilityId || null,
      })
      // Mark items as billed and link to invoice
      for (const item of residentUnbilled) {
        await apiPatch(`/api/data?type=invoiceItems&id=${item.id}`, { billed: true, invoiceId: inv.id })
      }
      toast.success('Invoice created')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title="Create Invoice from Unbilled Items" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Field label="Resident *">
          <ResidentSelect
            residents={residents || []}
            value={residentId}
            onChange={setResidentId}
            placeholder="— Select —"
            required
          />
        </Field>
        {residentId && (
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1">Unbilled items for this resident:</div>
            <div className="border rounded max-h-48 overflow-y-auto">
              {residentUnbilled.length === 0 && <p className="p-3 text-xs text-muted-foreground">No unbilled items</p>}
              {residentUnbilled.map((i: any) => (
                <div key={i.id} className="flex justify-between p-2 border-b text-xs">
                  <div>
                    <div>{i.description}</div>
                    <div className="text-muted-foreground">{i.category} • {fmtDate(i.serviceDate)}</div>
                  </div>
                  <div className="font-medium">{fmtMoney(i.total)}</div>
                </div>
              ))}
            </div>
          </div>
        )}
        {residentUnbilled.length > 0 && (
          <div className="flex justify-between font-semibold border-t pt-2">
            <span>Subtotal</span><span>{fmtMoney(round2(total))}</span>
          </div>
        )}
        {residentUnbilled.length > 0 && (
          <div className="flex justify-between text-sm">
            <span>Tax ({taxRate}%)</span><span>{fmtMoney(round2(total * taxRate / 100))}</span>
          </div>
        )}
        {residentUnbilled.length > 0 && (
          <div className="flex justify-between font-bold border-t pt-2">
            <span>Total</span><span>{fmtMoney(round2(total + total * taxRate / 100))}</span>
          </div>
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving || residentUnbilled.length === 0}>{saving ? 'Creating...' : 'Create Invoice'}</Button>
      </div>
    </Modal>
  )
}

function Expenses({ facilityId }: { facilityId?: string }) {
  const [search, setSearch] = useState('')
  const [reimbFilter, setReimbFilter] = useState('')
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=expenses${facilityParam}`)
  const { data: staffData } = useFetch<any[]>(`/api/data?type=staff${facilityParam}`)
  const { data: vendorData } = useFetch<any[]>(`/api/data?type=vendors&includeInactive=true${facilityParam}`)
  const { data: currentUser } = useFetch<any>('/api/auth/me')
  const [showAdd, setShowAdd] = useState(false)
  const [editExpense, setEditExpense] = useState<any | null>(null)
  const [reimbursing, setReimbursing] = useState<string | null>(null)

  if (loading) return <Skeleton className="h-96" />

  const allStaff = staffData || []
  const allVendors = vendorData || []
  const myRole = currentUser?.user?.role
  const canApprove = myRole === 'APP_DEVELOPER' || myRole === 'OWNER' || myRole === 'MANAGER'

  const all = data || []
  const list = all.filter(e => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      e.description?.toLowerCase().includes(s) ||
      e.category?.toLowerCase().includes(s) ||
      e.vendorName?.toLowerCase().includes(s) ||
      e.paidBy?.toLowerCase().includes(s) ||
      e.receiptNumber?.toLowerCase().includes(s)
    )
  }).filter(e => {
    if (!reimbFilter) return true
    if (reimbFilter === 'none') return !e.reimbursementStatus
    return e.reimbursementStatus === reimbFilter
  })
  const total = list.reduce((s, e) => s + e.amount, 0)
  const pendingReimb = all.filter(e => e.reimbursementStatus === 'PENDING').reduce((s, e) => s + e.amount, 0)
  const approvedReimb = all.filter(e => e.reimbursementStatus === 'APPROVED').reduce((s, e) => s + e.amount, 0)

  // Resolve staff name from staffId
  const getStaffName = (staffId?: string) => {
    if (!staffId) return null
    const s = allStaff.find(st => st.id === staffId)
    return s ? `${s.firstName} ${s.lastName}` : null
  }

  const handleReimbAction = async (expenseId: string, action: 'approve' | 'reimburse' | 'reject') => {
    setReimbursing(expenseId)
    try {
      const updates: any = {}
      if (action === 'approve') {
        updates.reimbursementStatus = 'APPROVED'
        updates.approvedById = currentUser?.user?.id
        updates.approvedAt = new Date().toISOString()
      } else if (action === 'reimburse') {
        updates.reimbursementStatus = 'REIMBURSED'
        updates.reimbursementDate = new Date().toISOString()
      } else if (action === 'reject') {
        updates.reimbursementStatus = null
        updates.approvedById = null
        updates.approvedAt = null
      }
      await apiPatch(`/api/data?type=expenses&id=${expenseId}`, updates)
      toast.success(`Expense ${action === 'approve' ? 'approved' : action === 'reimburse' ? 'reimbursed' : 'rejected'}`)
      refetch()
    } catch (e: any) { toast.error(e.message) }
    setReimbursing(null)
  }

  return (
    <div className="space-y-4">
      <StandardSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search expenses by description, category, vendor, paid by..."
        totalCount={all.length}
        filteredCount={list.length}
      />
      <div className="flex flex-wrap justify-between items-center flex-wrap gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="text-sm">Total: <span className="font-semibold text-rose-600">{fmtMoney(total)}</span> ({list.length})</div>
          {pendingReimb > 0 && <div className="text-xs text-amber-700">Pending reimbursement: <strong>{fmtMoney(pendingReimb)}</strong></div>}
          {approvedReimb > 0 && <div className="text-xs text-emerald-700">Approved (awaiting payment): <strong>{fmtMoney(approvedReimb)}</strong></div>}
        </div>
        <div className="flex items-center gap-2">
          <select className="border rounded px-2 py-1.5 text-xs bg-background" value={reimbFilter} onChange={e => setReimbFilter(e.target.value)}>
            <option value="">All Expenses</option>
            <option value="none">Not Reimbursable</option>
            <option value="PENDING">Pending Approval</option>
            <option value="APPROVED">Approved (unpaid)</option>
            <option value="REIMBURSED">Reimbursed</option>
          </select>
          <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Add Expense</Button>
        </div>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Date</th>
                  <th className="text-left p-2 font-medium">Category</th>
                  <th className="text-left p-2 font-medium">Description</th>
                  <th className="text-left p-2 font-medium">Vendor</th>
                  <th className="text-right p-2 font-medium">Amount</th>
                  <th className="text-left p-2 font-medium">Paid By</th>
                  <th className="text-left p-2 font-medium">Reimbursement</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.map(e => {
                  // Prefer the staff relation (paidByStaff) over the free-text paidBy field
                  const paidByName = e.paidByStaff
                    ? `${e.paidByStaff.firstName} ${e.paidByStaff.lastName}`
                    : (e.paidBy || null)
                  // Prefer the vendor relation (vendor.name) over the free-text vendorName field
                  const vendorDisplay = e.vendor
                    ? `${e.vendor.code ? e.vendor.code + ' — ' : ''}${e.vendor.name}`
                    : (e.vendorName || null)
                  return (
                    <tr key={e.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 text-xs">{fmtDate(e.date)}</td>
                      <td className="p-2"><Badge variant="outline" className="text-xs">{e.category.replace(/_/g, ' ')}</Badge></td>
                      <td className="p-2">{e.description}</td>
                      <td className="p-2 text-xs">{vendorDisplay || '—'}</td>
                      <td className="p-2 text-right font-medium">{fmtMoney(e.amount)}</td>
                      <td className="p-2 text-xs">{paidByName || '—'}</td>
                      <td className="p-2">
                        {!e.reimbursementStatus && <span className="text-xs text-muted-foreground">—</span>}
                        {e.reimbursementStatus === 'PENDING' && <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">⏳ Pending</Badge>}
                        {e.reimbursementStatus === 'APPROVED' && <Badge className="bg-sky-100 text-sky-700 border-sky-200 text-xs">✅ Approved</Badge>}
                        {e.reimbursementStatus === 'REIMBURSED' && <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">💰 Reimbursed</Badge>}
                        {e.reimbursementStatus === 'REIMBURSED' && e.reimbursementDate && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">{fmtDate(e.reimbursementDate)}</div>
                        )}
                      </td>
                      <td className="p-2 whitespace-nowrap">
                        {/* Reimbursement action buttons */}
                        {canApprove && e.reimbursementStatus === 'PENDING' && (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600" disabled={reimbursing === e.id} onClick={() => handleReimbAction(e.id, 'approve')}>
                              {reimbursing === e.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                              Approve
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-red-600" onClick={() => handleReimbAction(e.id, 'reject')}>
                              Reject
                            </Button>
                          </>
                        )}
                        {canApprove && e.reimbursementStatus === 'APPROVED' && (
                          <Button size="sm" variant="ghost" className="h-7 text-xs text-emerald-600" disabled={reimbursing === e.id} onClick={() => handleReimbAction(e.id, 'reimburse')}>
                            {reimbursing === e.id ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <DollarSign className="h-3 w-3 mr-1" />}
                            Mark Paid
                          </Button>
                        )}
                        {e.receiptImageUrl && (
                          <a href={e.receiptImageUrl} target="_blank" rel="noopener noreferrer">
                            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-violet-600" title="View Receipt">
                              <ScanLine className="h-3 w-3" />
                            </Button>
                          </a>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditExpense(e)} title="Edit">
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={async () => {
                          if (confirm(`Delete expense "${e.description}"?`)) {
                            try {
                              await apiDelete(`/api/data?type=expenses&id=${e.id}`)
                              toast.success('Expense deleted')
                              refetch()
                            } catch (err: any) { toast.error(err.message) }
                          }
                        }} title="Delete">
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {showAdd && <AddExpenseDialog facilityId={facilityId} staffList={allStaff} vendorList={allVendors} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refetch() }} />}
      {editExpense && <EditExpenseDialog expense={editExpense} facilityId={facilityId} staffList={allStaff} vendorList={allVendors} onClose={() => setEditExpense(null)} onSaved={() => { setEditExpense(null); refetch() }} />}
    </div>
  )
}

function AddExpenseDialog({ facilityId, staffList, vendorList, onClose, onSaved }: any) {
  useEscClose(onClose)
  const { expenseCategories } = useAppDropdowns(facilityId)
  const [form, setForm] = useState<any>({
    category: 'SUPPLIES',
    description: '',
    vendorId: '',         // FK to Vendor (resolved from dropdown)
    amount: '',
    paidByStaffId: '',    // FK to Staff who paid (unified — replaces free-text paidBy)
    date: new Date().toISOString().slice(0, 10),
    receiptNumber: '',
    needsReimbursement: false,
    receiptImageUrl: '',  // set when a receipt is scanned
  })
  const [saving, setSaving] = useState(false)

  // When the user selects a staff from the "Paid By" dropdown, we set BOTH
  // paidByStaffId (the FK) AND paidBy (denormalized name, for backwards compat
  // and quick text display in lists/exports).
  const handleStaffChange = (staffId: string) => {
    if (!staffId) {
      setForm({ ...form, paidByStaffId: '', needsReimbursement: false })
      return
    }
    const s = staffList.find((st: any) => st.id === staffId)
    setForm({
      ...form,
      paidByStaffId: staffId,
      paidBy: s ? `${s.firstName} ${s.lastName}`.trim() : '',
    })
  }

  const submit = async () => {
    if (!form.description || !form.amount) { toast.error('Description and amount required'); return }
    setSaving(true)
    try {
      await apiPost(withFacility('/api/data?type=expenses', facilityId), {
        date: new Date(form.date),
        category: form.category,
        description: form.description,
        vendorId: form.vendorId || null,
        amount: parseFloat(form.amount),
        paidByStaffId: form.paidByStaffId || null,
        paidBy: form.paidBy || null,  // denormalized name, kept in sync with paidByStaffId
        receiptNumber: form.receiptNumber || null,
        reimbursementStatus: form.needsReimbursement && form.paidByStaffId ? 'PENDING' : null,
        facilityId: facilityId || null,
      })
      toast.success('Expense added')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }
  return (
    <Modal title="Add Expense" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Field label="Date"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Category">
          <select className="w-full border rounded px-2 py-1.5" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {expenseCategories.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="Description *"><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div>
        <Field label="Vendor">
          <select className="w-full border rounded px-2 py-1.5" value={form.vendorId} onChange={e => setForm({ ...form, vendorId: e.target.value })}>
            <option value="">— No vendor (cash/custom) —</option>
            {vendorList.map((v: any) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
          </select>
        </Field>
        <Field label="Amount *"><Input type="number" step="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Paid By (staff)">
          <select className="w-full border rounded px-2 py-1.5" value={form.paidByStaffId} onChange={e => handleStaffChange(e.target.value)}>
            <option value="">— Not specified —</option>
            {staffList.map((s: any) => <option key={s.id} value={s.id}>{s.code} {s.firstName} {s.lastName} ({s.role.replace(/_/g, ' ')})</option>)}
          </select>
        </Field>
        <Field label="Receipt #"><Input value={form.receiptNumber} onChange={e => setForm({ ...form, receiptNumber: e.target.value })} /></Field>
      </div>
      {/* Reimbursement section — only shows if a staff is selected as "Paid By" */}
      {form.paidByStaffId && (
        <div className="mt-3 p-2 border rounded-md bg-amber-50/50 space-y-2">
          <div className="text-xs font-semibold text-amber-800">STAFF REIMBURSEMENT</div>
          <div className="text-[10px] text-amber-700">
            Since a staff member paid for this expense, you can mark it for reimbursement.
            The expense will go through an approval workflow before being reimbursed.
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.needsReimbursement} onChange={e => setForm({ ...form, needsReimbursement: e.target.checked })} className="h-4 w-4" />
            <span className="text-xs">This expense needs reimbursement to staff</span>
          </label>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>Add Expense</Button>
      </div>
    </Modal>
  )
}

// ============ EDIT EXPENSE DIALOG ============
function EditExpenseDialog({ expense, facilityId, staffList, vendorList, onClose, onSaved }: any) {
  useEscClose(onClose)
  const { expenseCategories } = useAppDropdowns(facilityId)
  const [form, setForm] = useState<any>({
    category: expense.category || 'SUPPLIES',
    description: expense.description || '',
    vendorId: expense.vendorId || '',
    amount: String(expense.amount || ''),
    paidByStaffId: expense.paidByStaffId || '',
    paidBy: expense.paidBy || '',
    date: expense.date ? new Date(expense.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    receiptNumber: expense.receiptNumber || '',
    reimbursementStatus: expense.reimbursementStatus || null,
    reimbursementNote: expense.reimbursementNote || '',
  })
  const [saving, setSaving] = useState(false)

  // When the user selects a staff from the "Paid By" dropdown, we set BOTH
  // paidByStaffId (the FK) AND paidBy (denormalized name).
  const handleStaffChange = (staffId: string) => {
    if (!staffId) {
      setForm({ ...form, paidByStaffId: '', paidBy: '' })
      return
    }
    const s = staffList.find((st: any) => st.id === staffId)
    setForm({
      ...form,
      paidByStaffId: staffId,
      paidBy: s ? `${s.firstName} ${s.lastName}`.trim() : '',
    })
  }

  const submit = async () => {
    if (!form.description) { toast.error('Description required'); return }
    if (!form.amount || parseFloat(form.amount) < 0) { toast.error('Valid amount required'); return }
    setSaving(true)
    try {
      await apiPatch(`/api/data?type=expenses&id=${expense.id}`, {
        date: new Date(form.date),
        category: form.category,
        description: form.description,
        vendorId: form.vendorId || null,
        amount: parseFloat(form.amount),
        paidByStaffId: form.paidByStaffId || null,
        paidBy: form.paidBy || null,
        receiptNumber: form.receiptNumber || null,
        reimbursementStatus: form.reimbursementStatus || null,
        reimbursementNote: form.reimbursementNote || null,
      })
      toast.success('Expense updated')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title="Edit Expense" onClose={onClose}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <Field label="Date"><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></Field>
        <Field label="Category">
          <select className="w-full border rounded px-2 py-1.5" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
            {expenseCategories.map(o => <option key={o} value={o}>{o.replace(/_/g, ' ')}</option>)}
          </select>
        </Field>
        <div className="sm:col-span-2"><Field label="Description *"><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></Field></div>
        <Field label="Vendor">
          <select className="w-full border rounded px-2 py-1.5" value={form.vendorId} onChange={e => setForm({ ...form, vendorId: e.target.value })}>
            <option value="">— No vendor (cash/custom) —</option>
            {vendorList.map((v: any) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
          </select>
        </Field>
        <Field label="Amount *"><Input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></Field>
        <Field label="Paid By (staff)">
          <select className="w-full border rounded px-2 py-1.5" value={form.paidByStaffId} onChange={e => handleStaffChange(e.target.value)}>
            <option value="">— Not specified —</option>
            {staffList.map((s: any) => <option key={s.id} value={s.id}>{s.code} {s.firstName} {s.lastName} ({s.role.replace(/_/g, ' ')})</option>)}
          </select>
        </Field>
        <Field label="Receipt #"><Input value={form.receiptNumber} onChange={e => setForm({ ...form, receiptNumber: e.target.value })} /></Field>
      </div>
      {/* View Receipt link — shown if the expense has a scanned receipt image */}
      {expense.receiptImageUrl && (
        <div className="mt-3 flex items-center gap-2 p-2 rounded-md border border-violet-200 bg-violet-50/50">
          <ScanLine className="h-4 w-4 text-violet-600" />
          <a href={expense.receiptImageUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-violet-700 hover:underline">
            View Scanned Receipt
          </a>
          <span className="text-[10px] text-violet-600">opens in new tab</span>
        </div>
      )}
      {/* Reimbursement section — only relevant if a staff is selected as Paid By */}
      {form.paidByStaffId && (
        <div className="mt-3 p-2 border rounded-md bg-muted/30 space-y-2">
          <div className="text-xs font-semibold text-muted-foreground">STAFF REIMBURSEMENT</div>
          <div className="text-[10px] text-muted-foreground">
            Track expenses that staff paid out of pocket and need to be reimbursed.
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Reimbursement Status</label>
            <select className="w-full border rounded px-2 py-1.5 text-sm" value={form.reimbursementStatus || ''} onChange={e => setForm({ ...form, reimbursementStatus: e.target.value || null })}>
              <option value="">Not reimbursable</option>
              <option value="PENDING">Pending approval</option>
              <option value="APPROVED">Approved (awaiting payment)</option>
              <option value="REIMBURSED">Reimbursed (paid back to staff)</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Reimbursement Note</label>
            <Input value={form.reimbursementNote} onChange={e => setForm({ ...form, reimbursementNote: e.target.value })} placeholder="e.g. Paid via bank transfer on 15 July" />
          </div>
        </div>
      )}
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
      </div>
    </Modal>
  )
}

function UnbilledItems({ facilityId, billingSettings }: any) {
  const [search, setSearch] = useState('')
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=invoiceItems&unbilled=true${facilityParam}`)
  const [showAdd, setShowAdd] = useState(false)
  const [addResidentId, setAddResidentId] = useState<string | null>(null)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [generating, setGenerating] = useState(false)

  if (loading) return <Skeleton className="h-96" />
  const all = data || []
  const list = all.filter(i => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      i.description?.toLowerCase().includes(s) ||
      i.category?.toLowerCase().includes(s) ||
      `${i.resident?.firstName} ${i.resident?.lastName}`.toLowerCase().includes(s) ||
      i.resident?.code?.toLowerCase().includes(s)
    )
  })
  const total = list.reduce((s, i) => s + i.total, 0)

  // Group by resident
  const grouped: Record<string, any[]> = {}
  for (const i of list) {
    const key = i.residentId
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(i)
  }

  const handleRepeat = async (item: any) => {
    try {
      await apiPost(withFacility('/api/data?type=invoiceItems', facilityId), {
        residentId: item.residentId,
        description: item.description,
        category: item.category,
        serviceDate: new Date().toISOString(),
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        total: item.quantity * item.unitPrice,
        billed: false,
      })
      toast.success(`Repeated: ${item.description}`)
      refetch()
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleRepeatLastMonth = async (residentId: string, residentName: string) => {
    if (!confirm(`Repeat all unbilled items from last month for ${residentName}?`)) return
    try {
      const r = await fetch('/api/billing?action=repeatLastMonth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residentId }),
      }).then(r => r.json())
      if (r.success > 0) {
        toast.success(r.message)
        refetch()
      } else {
        toast.info(r.message || 'No items from last month found')
      }
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleGenerateMonthlyForResident = async (residentId: string, residentName: string) => {
    if (!confirm(`Generate monthly room + care charges for ${residentName}?`)) return
    try {
      const r = await fetch('/api/billing?action=generateMonthlyForResident', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ residentId }),
      }).then(r => r.json())
      if (r.success > 0) {
        toast.success(r.message)
        refetch()
      } else {
        toast.error(r.error || 'Failed')
      }
    } catch (e: any) {
      toast.error(e.message)
    }
  }

  const handleGenerateMonthlyAll = async () => {
    if (!confirm(`Generate monthly room + care charges for ALL active residents?\nThis will create 2 items per resident (room + care).`)) return
    setGenerating(true)
    try {
      const r = await fetch('/api/billing?action=generateMonthly', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ facilityId }),
      }).then(r => r.json())
      if (r.success > 0) {
        toast.success(r.message)
        refetch()
      } else {
        toast.error(r.error || 'Failed')
      }
    } catch (e: any) {
      toast.error(e.message)
    }
    setGenerating(false)
  }

  return (
    <div className="space-y-4">
      <StandardSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search unbilled items by description, category, resident..."
        totalCount={all.length}
        filteredCount={list.length}
      />
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-semibold text-amber-900">Total Unbilled Services</div>
          <div className="text-2xl font-bold text-amber-700">{fmtMoney(total)}</div>
          <div className="text-xs text-amber-700 mt-0.5">{list.length} items across {Object.keys(grouped).length} residents</div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" onClick={handleGenerateMonthlyAll} disabled={generating}>
            <CalendarPlus className="h-4 w-4 mr-1" /> {generating ? 'Generating...' : 'Generate Monthly (All)'}
          </Button>
          <Button size="sm" onClick={() => { setShowAdd(true); setAddResidentId(null) }}>
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
          <AlertCircle className="h-8 w-8 text-amber-500" />
        </div>
      </div>

      {Object.entries(grouped).map(([rid, items]) => {
        const r = items[0].resident
        const subtotal = items.reduce((s, i) => s + i.total, 0)
        return (
          <Card key={rid}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-2">
                <span>
                  {r?.code && <span className="text-xs font-mono text-primary mr-1">{r.code}</span>}
                  {r?.firstName} {r?.lastName} <span className="text-xs text-muted-foreground">Room {r?.room?.roomNumber || '—'}</span>
                </span>
                <div className="flex items-center gap-1 flex-wrap">
                  <Button size="sm" variant="ghost" className="text-xs h-7 text-purple-600" title="Generate monthly room + care charges for this resident" onClick={() => handleGenerateMonthlyForResident(rid, `${r?.firstName} ${r?.lastName}`)}>
                    <CalendarPlus className="h-3 w-3 mr-1" /> Monthly
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7 text-blue-600" title="Repeat all unbilled items from last month" onClick={() => handleRepeatLastMonth(rid, `${r?.firstName} ${r?.lastName}`)}>
                    <Repeat className="h-3 w-3 mr-1" /> Repeat Last Month
                  </Button>
                  <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => { setShowAdd(true); setAddResidentId(rid) }}>
                    <Plus className="h-3 w-3 mr-1" /> Add item
                  </Button>
                  <span className="text-base text-red-600 ml-1">{fmtMoney(subtotal)}</span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="divide-y">
                {items.map(i => (
                  <div key={i.id} className="p-2 flex items-center justify-between text-sm">
                    <div className="flex-1 min-w-0">
                      <div>{i.description}</div>
                      <div className="text-xs text-muted-foreground">{i.category} • Qty {i.quantity} × {fmtMoney(i.unitPrice)} • {fmtDate(i.serviceDate)}</div>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-medium mr-2">{fmtMoney(i.total)}</span>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-amber-600" title="Edit this item" onClick={() => setEditItem(i)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600" title="Repeat this item at current price" onClick={() => handleRepeat(i)}>
                        <Copy className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" title="Delete" onClick={async () => {
                        if (confirm('Delete this item?')) {
                          await apiDelete(`/api/data?type=invoiceItems&id=${i.id}`)
                          toast.success('Item deleted')
                          refetch()
                        }
                      }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )
      })}
      {list.length === 0 && (
        <div className="text-center py-12">
          <Package className="h-12 w-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-sm text-muted-foreground mb-4">No unbilled services yet</p>
          <div className="flex gap-2 justify-center">
            <Button variant="outline" onClick={handleGenerateMonthlyAll} disabled={generating}>
              <CalendarPlus className="h-4 w-4 mr-1" /> {generating ? 'Generating...' : 'Generate Monthly Charges'}
            </Button>
            <Button onClick={() => setShowAdd(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add First Item
            </Button>
          </div>
        </div>
      )}

      {showAdd && (
        <AddUnbilledItemDialog
          initialResidentId={addResidentId}
          facilityId={facilityId}
          onClose={() => { setShowAdd(false); setAddResidentId(null) }}
          onSaved={() => { setShowAdd(false); setAddResidentId(null); refetch() }}
        />
      )}
      {editItem && (
        <EditUnbilledItemDialog
          item={editItem}
          facilityId={facilityId}
          onClose={() => setEditItem(null)}
          onSaved={() => { setEditItem(null); refetch() }}
        />
      )}
    </div>
  )
}

function EditUnbilledItemDialog({ item, facilityId, onClose, onSaved }: { item: any; facilityId?: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const { productCategories } = useAppDropdowns(facilityId)
  const [description, setDescription] = useState(item.description)
  const [category, setCategory] = useState(item.category)
  const [quantity, setQuantity] = useState(String(item.quantity))
  const [unitPrice, setUnitPrice] = useState(String(item.unitPrice))
  const [serviceDate, setServiceDate] = useState(new Date(item.serviceDate).toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  const qty = parseFloat(quantity) || 0
  const price = parseFloat(unitPrice) || 0
  const total = qty * price

  const submit = async () => {
    if (!description) { toast.error('Description required'); return }
    if (qty <= 0) { toast.error('Quantity must be > 0'); return }
    setSaving(true)
    try {
      await apiPatch(`/api/data?type=invoiceItems&id=${item.id}`, {
        description,
        category,
        quantity: qty,
        unitPrice: price,
        total,
        serviceDate: new Date(serviceDate).toISOString(),
      })
      toast.success('Item updated')
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
          <h3 className="font-semibold flex items-center gap-2"><Edit className="h-4 w-4" /> Edit Unbilled Item</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Customer</label>
            <div className="text-sm text-muted-foreground">{item.resident?.firstName} {item.resident?.lastName}</div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description *</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
              <select className="w-full border rounded px-2 py-1.5" value={category} onChange={e => setCategory(e.target.value)}>
                {productCategories.map(c => (
                  <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Service Date</label>
              <Input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Quantity *</label>
              <Input type="number" step="0.01" min="0" value={quantity} onChange={e => setQuantity(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit Price *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input type="number" step="0.01" min="0" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} className="pl-7" />
              </div>
            </div>
          </div>
          <div className="flex justify-between font-semibold border-t pt-3">
            <span>Total</span>
            <span className="text-lg">{fmtMoney(total)}</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
        </div>
      </div>
    </div>
  )
}

function AddUnbilledItemDialog({ initialResidentId, facilityId, onClose, onSaved }: { initialResidentId: string | null; facilityId?: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { productCategories } = useAppDropdowns(facilityId)
  const { data: residents } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)
  const { data: products } = useFetch<any[]>(`/api/data?type=products${facilityParam}`)
  const [residentId, setResidentId] = useState(initialResidentId || '')
  const [productId, setProductId] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('OTHER')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('0')
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().slice(0, 10))
  // Date range support
  const [dateMode, setDateMode] = useState<'single' | 'range'>('single')
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10))
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [saving, setSaving] = useState(false)

  // When a product is selected, auto-fill description, category, and price
  const onProductChange = (pid: string) => {
    setProductId(pid)
    if (pid === '__custom') {
      // Custom item — clear fields for manual entry
      setDescription('')
      setCategory('OTHER')
      setUnitPrice('0')
    } else {
      const p = (products || []).find(x => x.id === pid)
      if (p) {
        setDescription(p.name)
        setCategory(p.category)
        setUnitPrice(String(p.unitPrice))
      }
    }
  }

  const qty = parseFloat(quantity) || 0
  const price = parseFloat(unitPrice) || 0
  const totalAmount = qty * price

  // Compute the list of service dates based on the date range + frequency.
  // In range mode, this is used to SUGGEST a quantity (the count of dates in
  // the range), which the user can then adjust. Only ONE item is created.
  const rangeDates: string[] = (() => {
    if (dateMode !== 'range') return []
    const start = new Date(startDate)
    const end = new Date(endDate)
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return []
    const dates: string[] = []
    const cur = new Date(start)
    // Safety cap to avoid accidental huge loops
    let iterations = 0
    while (cur <= end && iterations < 1000) {
      dates.push(cur.toISOString().slice(0, 10))
      if (frequency === 'daily') cur.setDate(cur.getDate() + 1)
      else if (frequency === 'weekly') cur.setDate(cur.getDate() + 7)
      else if (frequency === 'monthly') cur.setMonth(cur.getMonth() + 1)
      iterations++
    }
    return dates
  })()

  const suggestedQty = rangeDates.length
  const isRangeValid = dateMode === 'single' || rangeDates.length > 0

  // Auto-suggest quantity when the date range changes (range mode only).
  // The user can still override this — the effect only fires when the
  // range actually changes, not on every render.
  useEffect(() => {
    if (dateMode === 'range' && suggestedQty > 0) {
      setQuantity(String(suggestedQty))
    }
  }, [dateMode, suggestedQty])

  const submit = async () => {
    if (!residentId) { toast.error('Please select a resident'); return }
    if (!description) { toast.error('Description is required'); return }
    if (qty <= 0) { toast.error('Quantity must be greater than 0'); return }
    if (price < 0) { toast.error('Price cannot be negative'); return }
    if (dateMode === 'range' && rangeDates.length === 0) { toast.error('Invalid date range — check start/end dates'); return }

    setSaving(true)
    try {
      // In both single and range mode, we create exactly ONE unbilled item.
      // In range mode, the service date is the start date of the range and
      // the quantity is the (possibly user-adjusted) value from the form.
      const finalServiceDate = dateMode === 'range' ? startDate : serviceDate
      // In range mode, append the date range to the description so the
      // invoice shows what period the charge covers.
      const finalDescription = dateMode === 'range' && rangeDates.length > 0
        ? `${description} (${startDate} to ${endDate}, ${frequency})`
        : description

      await apiPost(withFacility('/api/data?type=invoiceItems', facilityId), {
        residentId,
        description: finalDescription,
        category,
        serviceDate: new Date(finalServiceDate).toISOString(),
        quantity: qty,
        unitPrice: price,
        total: totalAmount,
        billed: false,
      })
      toast.success('Unbilled item added')
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
            <Plus className="h-4 w-4" /> Add Unbilled Item
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          {/* Resident */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Customer *</label>
            <ResidentSelect
              residents={residents || []}
              value={residentId}
              onChange={setResidentId}
              placeholder="— Select resident —"
              required
            />
          </div>

          {/* Product picker */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block flex items-center gap-1">
              <Package className="h-3 w-3" /> Select from Product Catalog
            </label>
            <select className="w-full border rounded px-2 py-1.5" value={productId} onChange={e => onProductChange(e.target.value)}>
              <option value="">— Choose a product (optional) —</option>
              <option value="__custom">✏️ Custom item (manual entry)</option>
              <optgroup label="Products">
                {(products || []).map((p: any) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {fmtMoney(p.unitPrice)}/{p.unit} ({p.category})
                  </option>
                ))}
              </optgroup>
            </select>
          </div>

          {/* Description (editable) */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description *</label>
            <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Physiotherapy session" />
          </div>

          {/* Date mode toggle: Single vs Range */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Service Date(s) *</label>
            <div className="inline-flex rounded-md border overflow-hidden mb-2">
              <button
                type="button"
                onClick={() => setDateMode('single')}
                className={`px-3 py-1.5 text-xs font-medium ${dateMode === 'single' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
              >
                Single Date
              </button>
              <button
                type="button"
                onClick={() => setDateMode('range')}
                className={`px-3 py-1.5 text-xs font-medium ${dateMode === 'range' ? 'bg-primary text-primary-foreground' : 'bg-background hover:bg-muted'}`}
              >
                Date Range (recurring)
              </button>
            </div>

            {dateMode === 'single' ? (
              <Input type="date" value={serviceDate} onChange={e => setServiceDate(e.target.value)} />
            ) : (
              <div className="space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">Start Date</label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground block mb-0.5">End Date</label>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
                  </div>
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground block mb-0.5">Frequency (how often the service recurs)</label>
                  <select className="w-full border rounded px-2 py-1.5" value={frequency} onChange={e => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly')}>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                  </select>
                </div>
                {rangeDates.length > 0 && (
                  <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
                    Date range covers <span className="font-semibold text-foreground">{rangeDates.length}</span> {frequency} period{rangeDates.length !== 1 ? 's' : ''}
                    {' '}from <span className="font-medium">{rangeDates[0]}</span> to <span className="font-medium">{rangeDates[rangeDates.length - 1]}</span>.
                    {' '}Quantity has been auto-filled with this count — adjust below if needed.
                  </div>
                )}
                {dateMode === 'range' && rangeDates.length === 0 && (
                  <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded p-2">
                    Invalid date range — end date must be on or after start date.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
            <select className="w-full border rounded px-2 py-1.5" value={category} onChange={e => setCategory(e.target.value)}>
              {productCategories.map(c => (
                <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>

          {/* Qty + Unit Price */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">
                Quantity *
                {dateMode === 'range' && suggestedQty > 0 && (
                  <span className="text-[10px] text-primary ml-1 font-normal">
                    (suggested: {suggestedQty})
                  </span>
                )}
              </label>
              <Input type="number" step="0.01" min="0" value={quantity} onChange={e => setQuantity(e.target.value)} />
              {dateMode === 'range' && suggestedQty > 0 && (
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Adjust to the actual amount to bill for this period.
                </div>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit Price *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input type="number" step="0.01" min="0" value={unitPrice} onChange={e => setUnitPrice(e.target.value)} className="pl-7" />
              </div>
            </div>
          </div>

          {/* Total preview */}
          <div className="flex justify-between font-semibold border-t pt-3">
            <span>Total</span>
            <span className="text-lg">{fmtMoney(totalAmount)}</span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !isRangeValid}>
            {saving ? 'Adding...' : 'Add Item'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEscClose(onClose)
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold">{title}</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  )
}

// ============ PAYMENTS ============
// Payment methods and statuses are now loaded from Settings via useAppDropdowns.
// These fallback arrays are only used if the hook hasn't loaded yet.
const PAYMENT_METHODS_FALLBACK = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'INSURANCE', 'ONLINE', 'OTHER']
const PAYMENT_STATUSES_FALLBACK = ['PENDING', 'CLEARED', 'BOUNCED', 'REFUNDED']

function Payments({ facilityId }: { facilityId?: string }) {
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [methodFilter, setMethodFilter] = useState<string>('')
  // NEW: Application status filter — "unmatched" = no invoice applied (unapplied credit),
  // "partial" = partially applied, "full" = fully applied to invoices
  const [applyFilter, setApplyFilter] = useState<string>('')
  // NEW: Invoice link filter — "with" = linked to an invoice, "without" = no invoice link
  const [invoiceFilter, setInvoiceFilter] = useState<string>('')
  // NEW: Date range filter
  const [dateFrom, setDateFrom] = useState<string>('')
  const [dateTo, setDateTo] = useState<string>('')
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=payments${statusFilter ? `&status=${statusFilter}` : ''}${methodFilter ? `&method=${methodFilter}` : ''}${facilityParam}`)
  const { paymentMethods, paymentStatuses } = useAppDropdowns(facilityId)
  const PMETHODS = paymentMethods.length > 0 ? paymentMethods : PAYMENT_METHODS_FALLBACK
  const PSTATUSES = paymentStatuses.length > 0 ? paymentStatuses : PAYMENT_STATUSES_FALLBACK
  const [showAdd, setShowAdd] = useState(false)
  const [editPayment, setEditPayment] = useState<any | null>(null)
  const [applyPayment, setApplyPayment] = useState<any | null>(null)
  const [viewPayment, setViewPayment] = useState<any | null>(null)

  if (loading) return <Skeleton className="h-96" />

  const all = data || []
  const list = all.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false
    if (methodFilter && p.method !== methodFilter) return false
    // Application status filter
    const applied = p.appliedAmount || 0
    const amount = p.amount || 0
    const unapplied = amount - applied
    if (applyFilter === 'unmatched' && applied > 0.01) return false           // fully unapplied
    if (applyFilter === 'partial' && (applied <= 0.01 || unapplied <= 0.01)) return false  // partially applied
    if (applyFilter === 'full' && unapplied > 0.01) return false              // fully applied
    // Invoice link filter
    const hasInvoice = !!(p.invoiceId || (p.applications && p.applications.length > 0))
    if (invoiceFilter === 'with' && !hasInvoice) return false
    if (invoiceFilter === 'without' && hasInvoice) return false
    // Date range filter
    if (dateFrom || dateTo) {
      const pDate = new Date(p.paymentDate)
      if (dateFrom && pDate < new Date(dateFrom + 'T00:00:00')) return false
      if (dateTo && pDate > new Date(dateTo + 'T23:59:59')) return false
    }
    // Text search
    if (!search) return true
    const s = search.toLowerCase()
    return (
      p.paymentCode?.toLowerCase().includes(s) ||
      p.payerName?.toLowerCase().includes(s) ||
      p.reference?.toLowerCase().includes(s) ||
      p.bankAccount?.toLowerCase().includes(s) ||
      p.notes?.toLowerCase().includes(s) ||
      p.method?.toLowerCase().includes(s) ||
      p.invoice?.invoiceNumber?.toLowerCase().includes(s) ||
      `${p.resident?.firstName} ${p.resident?.lastName}`.toLowerCase().includes(s) ||
      p.resident?.code?.toLowerCase().includes(s)
    )
  })

  const totalReceived = list.reduce((s, p) => s + (p.status !== 'BOUNCED' && p.status !== 'REFUNDED' ? p.amount : 0), 0)
  const totalApplied = list.reduce((s, p) => s + (p.appliedAmount || 0), 0)
  const totalUnapplied = totalReceived - totalApplied

  // Quick-filter chip helper
  const activeFilterCount = (statusFilter ? 1 : 0) + (methodFilter ? 1 : 0) + (applyFilter ? 1 : 0) + (invoiceFilter ? 1 : 0) + (dateFrom ? 1 : 0) + (dateTo ? 1 : 0)
  const clearAllFilters = () => {
    setStatusFilter('')
    setMethodFilter('')
    setApplyFilter('')
    setInvoiceFilter('')
    setDateFrom('')
    setDateTo('')
  }

  return (
    <div className="space-y-4">
      <StandardSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search payments by code, payer, invoice, reference, method..."
        totalCount={all.length}
        filteredCount={list.length}
      />

      {/* Quick-filter chips — most common scenarios */}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => { setApplyFilter(applyFilter === 'unmatched' ? '' : 'unmatched'); setInvoiceFilter('') }}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            applyFilter === 'unmatched'
              ? 'bg-amber-100 border-amber-300 text-amber-800 font-medium'
              : 'bg-background border-border text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Unmatched ({all.filter(p => (p.appliedAmount || 0) <= 0.01).length})
        </button>
        <button
          onClick={() => { setApplyFilter(applyFilter === 'partial' ? '' : 'partial') }}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            applyFilter === 'partial'
              ? 'bg-sky-100 border-sky-300 text-sky-800 font-medium'
              : 'bg-background border-border text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Partially Applied ({all.filter(p => { const a = p.appliedAmount || 0; const u = (p.amount || 0) - a; return a > 0.01 && u > 0.01 }).length})
        </button>
        <button
          onClick={() => setApplyFilter(applyFilter === 'full' ? '' : 'full')}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            applyFilter === 'full'
              ? 'bg-emerald-100 border-emerald-300 text-emerald-800 font-medium'
              : 'bg-background border-border text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Fully Applied ({all.filter(p => (p.amount || 0) - (p.appliedAmount || 0) <= 0.01).length})
        </button>
        <button
          onClick={() => setInvoiceFilter(invoiceFilter === 'without' ? '' : 'without')}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            invoiceFilter === 'without'
              ? 'bg-purple-100 border-purple-300 text-purple-800 font-medium'
              : 'bg-background border-border text-muted-foreground hover:bg-muted/50'
          }`}
        >
          No Invoice ({all.filter(p => !p.invoiceId && !(p.applications && p.applications.length > 0)).length})
        </button>
        <button
          onClick={() => setInvoiceFilter(invoiceFilter === 'with' ? '' : 'with')}
          className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
            invoiceFilter === 'with'
              ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-medium'
              : 'bg-background border-border text-muted-foreground hover:bg-muted/50'
          }`}
        >
          Has Invoice ({all.filter(p => !!(p.invoiceId || (p.applications && p.applications.length > 0))).length})
        </button>
        {activeFilterCount > 0 && (
          <button
            onClick={clearAllFilters}
            className="text-xs px-2.5 py-1 rounded-full border border-red-200 bg-red-50 text-red-700 hover:bg-red-100 transition-colors flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear ({activeFilterCount})
          </button>
        )}
      </div>

      {/* Dropdown filters + date range */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          <select className="border rounded px-2 py-1.5 text-sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            {PSTATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="border rounded px-2 py-1.5 text-sm" value={methodFilter} onChange={e => setMethodFilter(e.target.value)}>
            <option value="">All Methods</option>
            {PMETHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="border rounded px-2 py-1.5 text-sm" value={applyFilter} onChange={e => setApplyFilter(e.target.value)}>
            <option value="">All (applied)</option>
            <option value="unmatched">Unmatched (unapplied)</option>
            <option value="partial">Partially Applied</option>
            <option value="full">Fully Applied</option>
          </select>
          <select className="border rounded px-2 py-1.5 text-sm" value={invoiceFilter} onChange={e => setInvoiceFilter(e.target.value)}>
            <option value="">All (invoice)</option>
            <option value="with">Has Invoice</option>
            <option value="without">No Invoice</option>
          </select>
          <div className="flex items-center gap-1 text-xs">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded px-1.5 py-1 text-xs" title="From date" />
            <span className="text-muted-foreground">→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded px-1.5 py-1 text-xs" title="To date" />
          </div>
        </div>
        <Button onClick={() => setShowAdd(true)}><Plus className="h-4 w-4 mr-1" /> Receive Payment</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Received</div>
            <div className="text-lg font-bold text-emerald-600">{fmtMoney(totalReceived)}</div>
            <div className="text-[10px] text-muted-foreground/80 mt-0.5">{list.length} payment(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Applied to Invoices</div>
            <div className="text-lg font-bold text-sky-600">{fmtMoney(totalApplied)}</div>
            <div className="text-[10px] text-muted-foreground/80 mt-0.5">{Math.round(totalReceived > 0 ? (totalApplied / totalReceived) * 100 : 0)}% allocated</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Unapplied Credit</div>
            <div className="text-lg font-bold text-amber-600">{fmtMoney(totalUnapplied)}</div>
            <div className="text-[10px] text-muted-foreground/80 mt-0.5">Available to allocate</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Payment #</th>
                  <th className="text-left p-2 font-medium">Date</th>
                  <th className="text-left p-2 font-medium">Payer / Customer</th>
                  <th className="text-left p-2 font-medium">Method</th>
                  <th className="text-left p-2 font-medium">Invoice</th>
                  <th className="text-right p-2 font-medium">Amount</th>
                  <th className="text-right p-2 font-medium">Applied</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No payments match the current filters. {activeFilterCount > 0 && <button onClick={clearAllFilters} className="text-primary hover:underline">Clear filters</button>}.</td></tr>
                )}
                {list.map(p => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="p-2 font-mono text-xs">{p.paymentCode}</td>
                    <td className="p-2 text-xs">{fmtDate(p.paymentDate)}</td>
                    <td className="p-2">
                      <div className="font-medium">{p.payerName || '—'}</div>
                      {p.resident && (
                        <div className="text-xs text-muted-foreground">
                          {p.resident.code && <span className="font-mono text-primary mr-1">{p.resident.code}</span>}
                          {p.resident.firstName} {p.resident.lastName}
                        </div>
                      )}
                    </td>
                    <td className="p-2"><Badge variant="outline" className="text-xs">{p.method.replace(/_/g, ' ')}</Badge></td>
                    <td className="p-2 font-mono text-xs">
                      {p.invoice?.invoiceNumber || (p.applications && p.applications.length > 0 ? p.applications.map(a => a.invoice?.invoiceNumber).filter(Boolean).join(', ') : '—')}
                      {p.applications && p.applications.length > 1 && <span className="text-xs text-muted-foreground"> ({p.applications.length})</span>}
                    </td>
                    <td className="p-2 text-right font-medium">{fmtMoney(p.amount)}</td>
                    <td className="p-2 text-right">
                      <span className={p.appliedAmount >= p.amount - 0.01 ? 'text-emerald-600 font-medium' : p.appliedAmount > 0 ? 'text-amber-600' : 'text-muted-foreground'}>
                        {fmtMoney(p.appliedAmount)}
                      </span>
                    </td>
                    <td className="p-2">
                      <Badge variant="outline" className={
                        p.status === 'CLEARED' ? 'bg-emerald-50 text-emerald-700 text-xs' :
                        p.status === 'PENDING' ? 'bg-amber-50 text-amber-700 text-xs' :
                        p.status === 'BOUNCED' ? 'bg-red-50 text-red-700 text-xs' :
                        p.status === 'REFUNDED' ? 'bg-purple-50 text-purple-700 text-xs' : 'text-xs'
                      }>{p.status}</Badge>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <Button size="sm" variant="ghost" className="h-7" title="View details" onClick={() => setViewPayment(p)}>
                        View
                      </Button>
                      {p.amount - p.appliedAmount > 0.01 && p.status === 'CLEARED' && (
                        <Button size="sm" variant="ghost" className="h-7" title="Apply to invoice" onClick={() => setApplyPayment(p)}>
                          <CreditCard className="h-3 w-3 mr-1" /> Apply
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => setEditPayment(p)}>
                        <Edit className="h-3 w-3" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" title="Delete" onClick={async () => {
                        if (confirm(`Delete payment ${p.paymentCode}? This will reverse any allocations made to invoices.`)) {
                          try {
                            await apiDelete(`/api/data?type=payments&id=${p.id}`)
                            toast.success('Payment deleted')
                            refetch()
                          } catch (err: any) { toast.error(err.message) }
                        }
                      }}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showAdd && <AddPaymentDialog facilityId={facilityId} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refetch() }} />}
      {editPayment && <EditPaymentDialog payment={editPayment} facilityId={facilityId} onClose={() => setEditPayment(null)} onSaved={() => { setEditPayment(null); refetch() }} />}
      {applyPayment && <ApplyPaymentDialog payment={applyPayment} facilityId={facilityId} onClose={() => setApplyPayment(null)} onSaved={() => { setApplyPayment(null); refetch() }} />}
      {viewPayment && <ViewPaymentDialog payment={viewPayment} onClose={() => setViewPayment(null)} />}
    </div>
  )
}

function AddPaymentDialog({ facilityId, onClose, onSaved }: any) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: residents } = useFetch<any[]>(`/api/data?type=residents${facilityParam}`)
  const { data: invoices } = useFetch<any[]>(`/api/data?type=invoices${facilityParam}`)
  const { data: bankAccounts } = useFetch<any[]>(`/api/data?type=bankAccounts${facilityParam}`)
  const [form, setForm] = useState({
    residentId: '',
    invoiceId: '',
    payerName: '',
    amount: '',
    paymentDate: new Date().toISOString().slice(0, 10),
    method: 'CASH',
    reference: '',
    bankAccount: '',
    status: 'CLEARED',
    notes: '',
    applyToInvoice: true,
  })
  const [saving, setSaving] = useState(false)

  // When resident is selected, default payerName to resident's name
  const selectedResident = (residents || []).find((r: any) => r.id === form.residentId)
  const selectedInvoice = form.invoiceId ? (invoices || []).find((i: any) => i.id === form.invoiceId) : null

  // Invoices dropdown: filtered to the selected resident (if any) and not fully paid
  const availableInvoices = (invoices || []).filter((i: any) => {
    if (i.status === 'PAID' || i.status === 'CANCELLED') return false
    if (form.residentId && i.residentId !== form.residentId) return false
    return true
  })

  const invoiceBalance = selectedInvoice ? Math.max(0, selectedInvoice.total - selectedInvoice.amountPaid) : 0

  const submit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return }
    setSaving(true)
    try {
      const payload: any = {
        residentId: form.residentId || null,
        invoiceId: form.invoiceId || null,
        payerName: form.payerName || (selectedResident ? `${selectedResident.firstName} ${selectedResident.lastName}` : null),
        amount: parseFloat(form.amount),
        paymentDate: form.paymentDate ? new Date(form.paymentDate) : new Date(),
        method: form.method,
        reference: form.reference || null,
        bankAccount: form.bankAccount || null,
        status: form.status,
        notes: form.notes || null,
        applyToInvoice: form.applyToInvoice,
        facilityId: facilityId || null,
      }
      await apiPost(withFacility('/api/data?type=payments', facilityId), payload)
      toast.success('Payment recorded')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title="Receive Payment" onClose={onClose}>
      <div className="space-y-3 text-sm">
        <Field label="Resident (optional — leave blank for non-resident payer)">
          <ResidentSelect
            residents={residents || []}
            value={form.residentId}
            onChange={(id) => setForm({ ...form, residentId: id, invoiceId: '', payerName: '' })}
            placeholder="— Select resident (optional) —"
            allowClear
          />
        </Field>

        <Field label="Payer Name (defaults to resident name if blank)">
          <Input value={form.payerName} onChange={e => setForm({ ...form, payerName: e.target.value })}
            placeholder={selectedResident ? `${selectedResident.firstName} ${selectedResident.lastName}` : 'e.g. John Tan / Medicare / BlueCross'} />
        </Field>

        <Field label="Match to Invoice (optional)">
          <select className="w-full border rounded px-2 py-1.5" value={form.invoiceId} onChange={e => setForm({ ...form, invoiceId: e.target.value })}>
            <option value="">— No specific invoice (unapplied credit) —</option>
            {availableInvoices.map((i: any) => (
              <option key={i.id} value={i.id}>
                {i.invoiceNumber} — balance {fmtMoney(i.total - i.amountPaid)} ({i.status})
              </option>
            ))}
          </select>
          {selectedInvoice && (
            <div className="text-xs text-muted-foreground mt-1">
              Invoice total: {fmtMoney(selectedInvoice.total)} • Already paid: {fmtMoney(selectedInvoice.amountPaid)} • Balance: <span className="font-medium text-red-600">{fmtMoney(invoiceBalance)}</span>
            </div>
          )}
          {form.invoiceId && invoiceBalance > 0 && (
            <label className="flex items-center gap-2 mt-1 text-xs">
              <input type="checkbox" checked={form.applyToInvoice} onChange={e => setForm({ ...form, applyToInvoice: e.target.checked })} />
              Auto-apply {fmtMoney(Math.min(parseFloat(form.amount) || 0, invoiceBalance))} to this invoice
            </label>
          )}
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Amount (RM) *">
            <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Payment Date">
            <Input type="date" value={form.paymentDate} onChange={e => setForm({ ...form, paymentDate: e.target.value })} />
          </Field>
          <Field label="Method">
            <select className="w-full border rounded px-2 py-1.5" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
              {PAYMENT_METHODS_FALLBACK.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="w-full border rounded px-2 py-1.5" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {PAYMENT_STATUSES_FALLBACK.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Reference (cheque #, txn id)">
            <Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} placeholder="e.g. CHQ-001234" />
          </Field>
          <Field label="Bank Account">
            <select className="w-full border rounded px-2 py-1.5" value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })}>
              <option value="">— Select bank account —</option>
              {(bankAccounts || []).map(b => <option key={b.id} value={b.name}>{b.code} — {b.name}{b.bankName ? ` (${b.bankName})` : ''}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Notes">
          <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
        </Field>

        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
          Payment will be auto-assigned code <span className="font-mono font-medium">PMT-XXXXXX</span> (generated server-side).
          {form.invoiceId && form.applyToInvoice && (
            <> It will also auto-apply to invoice <span className="font-mono">{selectedInvoice?.invoiceNumber}</span> and update its status.</>
          )}
        </div>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Record Payment'}</Button>
      </div>
    </Modal>
  )
}

function EditPaymentDialog({ payment, facilityId, onClose, onSaved }: { payment: any; facilityId?: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: bankAccounts } = useFetch<any[]>(`/api/data?type=bankAccounts${facilityParam}`)
  const [form, setForm] = useState({
    payerName: payment.payerName || '',
    amount: String(payment.amount ?? ''),
    paymentDate: payment.paymentDate ? new Date(payment.paymentDate).toISOString().slice(0, 10) : '',
    method: payment.method || 'CASH',
    reference: payment.reference || '',
    bankAccount: payment.bankAccount || '',
    status: payment.status || 'CLEARED',
    notes: payment.notes || '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    setSaving(true)
    try {
      const payload = {
        payerName: form.payerName || null,
        amount: parseFloat(form.amount) || 0,
        paymentDate: form.paymentDate ? new Date(form.paymentDate) : undefined,
        method: form.method,
        reference: form.reference || null,
        bankAccount: form.bankAccount || null,
        status: form.status,
        notes: form.notes || null,
      }
      await apiPatch(`/api/data?type=payments&id=${payment.id}`, payload)
      toast.success('Payment updated')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title={`Edit Payment ${payment.paymentCode}`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
          Payment Code: <span className="font-mono font-medium">{payment.paymentCode}</span> • Applied: <span className="font-medium">{fmtMoney(payment.appliedAmount)}</span> of <span className="font-medium">{fmtMoney(payment.amount)}</span>
          {payment.appliedAmount > 0 && <div className="text-amber-600 mt-1">Note: This payment has been applied to invoices. Reducing the amount below the applied total will cap the applied amount; you may need to manually unapply allocations.</div>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Payer Name">
            <Input value={form.payerName} onChange={e => setForm({ ...form, payerName: e.target.value })} />
          </Field>
          <Field label="Amount (RM)">
            <Input type="number" step="0.01" min="0" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </Field>
          <Field label="Payment Date">
            <Input type="date" value={form.paymentDate} onChange={e => setForm({ ...form, paymentDate: e.target.value })} />
          </Field>
          <Field label="Method">
            <select className="w-full border rounded px-2 py-1.5" value={form.method} onChange={e => setForm({ ...form, method: e.target.value })}>
              {PAYMENT_METHODS_FALLBACK.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
            </select>
          </Field>
          <Field label="Status">
            <select className="w-full border rounded px-2 py-1.5" value={form.status} onChange={e => setForm({ ...form, status: e.target.value })}>
              {PAYMENT_STATUSES_FALLBACK.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
          <Field label="Reference">
            <Input value={form.reference} onChange={e => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <Field label="Bank Account">
            <select className="w-full border rounded px-2 py-1.5" value={form.bankAccount} onChange={e => setForm({ ...form, bankAccount: e.target.value })}>
              <option value="">— Select bank account —</option>
              {(bankAccounts || []).map(b => <option key={b.id} value={b.name}>{b.code} — {b.name}{b.bankName ? ` (${b.bankName})` : ''}</option>)}
              {/* Include the current value if it's not in the list (e.g. bank account was deleted) */}
              {form.bankAccount && !(bankAccounts || []).some(b => b.name === form.bankAccount) && (
                <option value={form.bankAccount}>{form.bankAccount} (deleted)</option>
              )}
            </select>
          </Field>
        </div>
        <Field label="Notes">
          <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
      </div>
    </Modal>
  )
}

function ApplyPaymentDialog({ payment, facilityId, onClose, onSaved }: any) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: invoices } = useFetch<any[]>(`/api/data?type=invoices${facilityParam}`)
  const [residentId, setResidentId] = useState<string>(payment.residentId || '')
  const [invoiceId, setInvoiceId] = useState<string>('')
  const [amount, setAmount] = useState<string>(String(Math.round((payment.amount - payment.appliedAmount) * 100) / 100))
  const [saving, setSaving] = useState(false)

  const unapplied = payment.amount - payment.appliedAmount
  const availableInvoices = (invoices || []).filter((i: any) => {
    if (i.status === 'PAID' || i.status === 'CANCELLED') return false
    if (residentId && i.residentId !== residentId) return false
    return true
  })
  const selectedInvoice = invoiceId ? (invoices || []).find((i: any) => i.id === invoiceId) : null
  const invoiceBalance = selectedInvoice ? Math.max(0, selectedInvoice.total - selectedInvoice.amountPaid) : 0

  const submit = async () => {
    if (!invoiceId) { toast.error('Select an invoice'); return }
    if (!amount || parseFloat(amount) <= 0) { toast.error('Enter a valid amount'); return }
    if (parseFloat(amount) > unapplied + 0.01) { toast.error(`Amount exceeds unapplied balance (${fmtMoney(unapplied)})`); return }
    if (parseFloat(amount) > invoiceBalance + 0.01) { toast.error(`Amount exceeds invoice balance (${fmtMoney(invoiceBalance)})`); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=paymentApplications', {
        paymentId: payment.id,
        invoiceId,
        amount: parseFloat(amount),
      })
      toast.success(`Applied ${fmtMoney(parseFloat(amount))} to invoice ${selectedInvoice?.invoiceNumber}`)
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <Modal title={`Apply Payment ${payment.paymentCode} to Invoice`} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
          Payment: <span className="font-mono font-medium">{payment.paymentCode}</span> • Total: <span className="font-medium">{fmtMoney(payment.amount)}</span> • Unapplied: <span className="font-medium text-amber-600">{fmtMoney(unapplied)}</span>
        </div>
        <Field label="Filter by Resident (optional)">
          <ResidentSelect
            residents={(invoices || [])
              .filter((i: any) => i.resident)
              .reduce((acc: any[], i: any) => acc.find(x => x.residentId === i.residentId) ? acc : [...acc, i], [])
              .map((i: any) => i.resident)}
            value={residentId}
            onChange={(id) => { setResidentId(id); setInvoiceId('') }}
            placeholder="All residents"
            allowAll
            allLabel="All residents"
          />
        </Field>
        <Field label="Invoice to Apply To *">
          <select className="w-full border rounded px-2 py-1.5" value={invoiceId} onChange={e => setInvoiceId(e.target.value)}>
            <option value="">— Select invoice —</option>
            {availableInvoices.map((i: any) => (
              <option key={i.id} value={i.id}>
                {i.invoiceNumber} — {i.resident?.firstName} {i.resident?.lastName} — balance {fmtMoney(i.total - i.amountPaid)} ({i.status})
              </option>
            ))}
          </select>
          {selectedInvoice && (
            <div className="text-xs text-muted-foreground mt-1">
              Invoice total: {fmtMoney(selectedInvoice.total)} • Already paid: {fmtMoney(selectedInvoice.amountPaid)} • Balance: <span className="font-medium text-red-600">{fmtMoney(invoiceBalance)}</span>
            </div>
          )}
        </Field>
        <Field label="Amount to Apply (RM) *">
          <Input type="number" step="0.01" min="0.01" max={unapplied} value={amount} onChange={e => setAmount(e.target.value)} />
          <div className="text-xs text-muted-foreground mt-1">Max: {fmtMoney(Math.min(unapplied, invoiceBalance))}</div>
        </Field>
      </div>
      <div className="flex flex-wrap justify-end gap-2 mt-4">
        <Button variant="outline" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} disabled={saving}>{saving ? 'Applying...' : 'Apply to Invoice'}</Button>
      </div>
    </Modal>
  )
}

function ViewPaymentDialog({ payment, onClose }: { payment: any; onClose: () => void }) {
  useEscClose(onClose)
  // Local state for navigation — when user clicks an invoice number or JE number,
  // we open a nested dialog showing the full details.
  const [viewInvoice, setViewInvoice] = useState<any | null>(null)
  const [viewJE, setViewJE] = useState<any | null>(null)
  // Fetch settings so the PrintInvoiceDialog (opened when user clicks an invoice)
  // shows the correct org name, logo, TIN, SST, etc.
  const { data: settings } = useFetch<any>('/api/settings')

  // When user clicks an invoice in the applications list, we need to fetch the
  // full invoice with items. The payment GET already includes a summary (id,
  // invoiceNumber, total, amountPaid, status) but not the items. We fetch on click.
  const handleInvoiceClick = async (invoiceId: string) => {
    try {
      const res = await fetch(`/api/data?type=invoices&id=${invoiceId}`)
      if (!res.ok) throw new Error('Failed to load invoice')
      const inv = await res.json()
      setViewInvoice(inv)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load invoice')
    }
  }

  return (
    <>
      <Modal title={`Payment ${payment.paymentCode}`} onClose={onClose}>
        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-muted-foreground">Payment Code</div>
              <div className="font-mono font-medium">{payment.paymentCode}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Date</div>
              <div>{fmtDate(payment.paymentDate)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Payer</div>
              <div>{payment.payerName || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Customer</div>
              <div>
                {payment.resident ? (
                  <>
                    {payment.resident.code && <span className="font-mono text-primary mr-1">{payment.resident.code}</span>}
                    {payment.resident.firstName} {payment.resident.lastName}
                  </>
                ) : '—'}
              </div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Amount</div>
              <div className="font-bold text-lg">{fmtMoney(payment.amount)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Applied</div>
              <div className="font-semibold">{fmtMoney(payment.appliedAmount)}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Method</div>
              <div><Badge variant="outline">{payment.method.replace(/_/g, ' ')}</Badge></div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Status</div>
              <div><Badge variant="outline" className={
                payment.status === 'CLEARED' ? 'bg-emerald-50 text-emerald-700' :
                payment.status === 'PENDING' ? 'bg-amber-50 text-amber-700' :
                payment.status === 'BOUNCED' ? 'bg-red-50 text-red-700' : ''
              }>{payment.status}</Badge></div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Reference</div>
              <div className="font-mono text-xs">{payment.reference || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Bank Account</div>
              <div className="text-xs">{payment.bankAccount || '—'}</div>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Received By</div>
              <div>{payment.receivedBy || '—'}</div>
            </div>
          </div>

          {payment.notes && (
            <div>
              <div className="text-xs text-muted-foreground">Notes</div>
              <div className="text-sm">{payment.notes}</div>
            </div>
          )}

          {/* === Linked Invoices === */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3" /> Linked Invoices
              ({(payment.applications?.length || 0) + (payment.invoice ? 1 : 0)})
            </div>
            {(() => {
              // Build a combined list of linked invoices:
              // 1. The directly-linked invoice (payment.invoice) — if invoiceId is set
              // 2. All PaymentApplication invoices (payment.applications)
              const linkedInvoices: { invoiceId: string; invoiceNumber: string; amount: number; appliedAt?: string; recipient?: string; resident?: any; isDirect: boolean }[] = []

              // Direct invoice link (set when payment was created with an invoice)
              if (payment.invoice && payment.invoice.id) {
                linkedInvoices.push({
                  invoiceId: payment.invoice.id,
                  invoiceNumber: payment.invoice.invoiceNumber,
                  amount: payment.appliedAmount || 0,
                  recipient: payment.invoice.recipient,
                  resident: payment.invoice.resident,
                  isDirect: true,
                })
              }

              // PaymentApplication records (created via "Apply" button or during creation)
              if (payment.applications && payment.applications.length > 0) {
                for (const a of payment.applications) {
                  // Skip if this application's invoice is the same as the direct link (avoid duplicates)
                  if (payment.invoice && a.invoiceId === payment.invoice.id) continue
                  linkedInvoices.push({
                    invoiceId: a.invoice?.id,
                    invoiceNumber: a.invoice?.invoiceNumber,
                    amount: a.amount,
                    appliedAt: a.appliedAt,
                    recipient: a.invoice?.recipient,
                    resident: a.invoice?.resident,
                    isDirect: false,
                  })
                }
              }

              if (linkedInvoices.length === 0) {
                return <div className="text-xs text-muted-foreground">No invoices linked — this payment is fully unapplied credit.</div>
              }

              return (
                <div className="border rounded">
                  {linkedInvoices.map((li, idx) => (
                    <div key={idx} className="flex justify-between items-center p-2 border-b last:border-0 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <button
                          onClick={() => li.invoiceId && handleInvoiceClick(li.invoiceId)}
                          className="font-mono text-primary hover:underline flex items-center gap-1 flex-shrink-0"
                          title="Click to view invoice details"
                        >
                          {li.invoiceNumber || '—'}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                        {li.isDirect && <Badge variant="outline" className="text-[9px] text-blue-600 border-blue-200">Direct</Badge>}
                        {li.recipient && <span className="text-muted-foreground truncate">{li.recipient}</span>}
                        {li.resident && (
                          <span className="text-muted-foreground text-[10px]">
                            ({li.resident.code} {li.resident.firstName} {li.resident.lastName})
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
                        <span className="font-medium">{fmtMoney(li.amount)}</span>
                        {li.appliedAt && <span className="text-[10px] text-muted-foreground">{fmtDate(li.appliedAt)}</span>}
                        {!li.isDirect && (
                          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-600" title="Unapply" onClick={async () => {
                            const app = payment.applications?.find((a: any) => a.invoiceId === li.invoiceId)
                            if (!app) return
                            if (confirm(`Unapply ${fmtMoney(li.amount)} from ${li.invoiceNumber}?`)) {
                              try {
                                await apiDelete(`/api/data?type=paymentApplications&id=${app.id}`)
                                toast.success('Unapplied')
                                onClose()
                              } catch (e: any) { toast.error(e.message) }
                            }
                          }}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>

          {/* === Journal Entries (auto-posted to GL) === */}
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
              <BookOpen className="h-3 w-3" /> Journal Entries ({payment.journalEntries?.length || 0})
            </div>
            {payment.journalEntries && payment.journalEntries.length > 0 ? (
              <div className="border rounded">
                {payment.journalEntries.map((je: any) => {
                  const totalDebit = je.lines.reduce((s: number, l: any) => s + (l.debit || 0), 0)
                  return (
                    <div key={je.id} className="p-2 border-b last:border-0">
                      <div className="flex justify-between items-center">
                        <button
                          onClick={() => setViewJE(je)}
                          className="font-mono text-primary hover:underline flex items-center gap-1 text-xs"
                          title="Click to view full journal entry"
                        >
                          {je.entryNumber}
                          <ExternalLink className="h-2.5 w-2.5" />
                        </button>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                          <span>{fmtDate(je.entryDate)}</span>
                          <Badge variant="outline" className="text-[9px]">{je.source.replace(/_/g, ' ')}</Badge>
                          <span className="font-medium">{fmtMoney(totalDebit)}</span>
                        </div>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-0.5 truncate" title={je.memo}>{je.memo}</div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                No journal entries — this payment may not have been posted to the GL yet.
              </div>
            )}
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 mt-4">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </Modal>

      {/* Nested: Invoice detail (PrintInvoiceDialog shows full invoice with items + print) */}
      {viewInvoice && (
        <PrintInvoiceDialog
          invoice={viewInvoice}
          settings={settings}
          onClose={() => setViewInvoice(null)}
        />
      )}

      {/* Nested: Journal Entry detail */}
      {viewJE && (
        <ViewJournalEntryFromPaymentDialog entry={viewJE} onClose={() => setViewJE(null)} />
      )}
    </>
  )
}

// Lightweight JE viewer (used inside ViewPaymentDialog when user clicks a JE number).
// Shows the full JE with all lines + account details.
function ViewJournalEntryFromPaymentDialog({ entry, onClose }: { entry: any; onClose: () => void }) {
  useEscClose(onClose)
  const totalDebit = entry.lines.reduce((s: number, l: any) => s + (l.debit || 0), 0)
  const totalCredit = entry.lines.reduce((s: number, l: any) => s + (l.credit || 0), 0)
  return (
    <div className="fixed inset-0 bg-black/60 z-[60] flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Journal Entry {entry.entryNumber}
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-3">
            <div><span className="text-muted-foreground text-xs">Date:</span> {fmtDate(entry.entryDate)}</div>
            <div><span className="text-muted-foreground text-xs">Source:</span> {entry.source.replace(/_/g, ' ')}</div>
            <div className="col-span-2"><span className="text-muted-foreground text-xs">Memo:</span> {entry.memo}</div>
            {entry.reference && <div><span className="text-muted-foreground text-xs">Reference:</span> {entry.reference}</div>}
            {entry.createdByName && <div><span className="text-muted-foreground text-xs">Created by:</span> {entry.createdByName}</div>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border rounded">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Account</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2">Debit</th>
                  <th className="text-right p-2">Credit</th>
                </tr>
              </thead>
            <tbody>
              {entry.lines.map((l: any) => (
                <tr key={l.id} className="border-t">
                  <td className="p-2 font-mono text-xs">{l.account?.code} — {l.account?.name}</td>
                  <td className="p-2">{l.description || '—'}</td>
                  <td className="p-2 text-right">{l.debit > 0 ? fmtMoney(l.debit) : ''}</td>
                  <td className="p-2 text-right">{l.credit > 0 ? fmtMoney(l.credit) : ''}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 font-bold">
              <tr>
                <td colSpan={2} className="p-2 text-right">Totals:</td>
                <td className="p-2 text-right">{fmtMoney(totalDebit)}</td>
                <td className="p-2 text-right">{fmtMoney(totalCredit)}</td>
              </tr>
            </tfoot>
          </table>
          </div>
          <div className={`text-center font-medium ${Math.abs(totalDebit - totalCredit) < 0.01 ? 'text-emerald-600' : 'text-red-600'}`}>
            {Math.abs(totalDebit - totalCredit) < 0.01 ? '✓ Entry is balanced' : `⚠ Out of balance by ${fmtMoney(Math.abs(totalDebit - totalCredit))}`}
          </div>
        </div>
        <div className="flex justify-end p-4 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}


// ============ RECEIPTS ============
// A "Receipt" is a payment presented from the customer's perspective.
// It shows: receipt number (= payment code), date, amount, method, linked invoices,
// and the auto-posted journal entry — all clickable for navigation.
function Receipts({ facilityId }: { facilityId?: string }) {
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [methodFilter, setMethodFilter] = useState('')
  const [viewReceipt, setViewReceipt] = useState<any | null>(null)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=payments${methodFilter ? `&method=${methodFilter}` : ''}${facilityParam}`)
  const { paymentMethods } = useAppDropdowns(facilityId)
  const PMETHODS = paymentMethods.length > 0 ? paymentMethods : PAYMENT_METHODS_FALLBACK

  if (loading) return <Skeleton className="h-96" />

  const all = data || []
  const list = all.filter(p => {
    if (methodFilter && p.method !== methodFilter) return false
    if (dateFrom || dateTo) {
      const pDate = new Date(p.paymentDate)
      if (dateFrom && pDate < new Date(dateFrom + 'T00:00:00')) return false
      if (dateTo && pDate > new Date(dateTo + 'T23:59:59')) return false
    }
    if (!search) return true
    const s = search.toLowerCase()
    return (
      p.paymentCode?.toLowerCase().includes(s) ||
      p.payerName?.toLowerCase().includes(s) ||
      p.reference?.toLowerCase().includes(s) ||
      p.invoice?.invoiceNumber?.toLowerCase().includes(s) ||
      `${p.resident?.firstName} ${p.resident?.lastName}`.toLowerCase().includes(s) ||
      p.resident?.code?.toLowerCase().includes(s)
    )
  })

  const totalReceived = list.reduce((s, p) => s + (p.status !== 'BOUNCED' && p.status !== 'REFUNDED' ? p.amount : 0), 0)
  const totalApplied = list.reduce((s, p) => s + (p.appliedAmount || 0), 0)
  const countWithInvoice = list.filter(p => p.invoiceId || (p.applications && p.applications.length > 0)).length
  const countWithJE = list.filter(p => p.journalEntries && p.journalEntries.length > 0).length

  return (
    <div className="space-y-4">
      <StandardSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search receipts by code, payer, invoice, reference..."
        totalCount={all.length}
        filteredCount={list.length}
      />

      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <div className="flex gap-2 flex-wrap items-center">
          <select className="border rounded px-2 py-1.5 text-sm" value={methodFilter} onChange={e => setMethodFilter(e.target.value)}>
            <option value="">All Methods</option>
            {PMETHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
          </select>
          <div className="flex items-center gap-1 text-xs">
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="border rounded px-1.5 py-1 text-xs" title="From date" />
            <span className="text-muted-foreground">→</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="border rounded px-1.5 py-1 text-xs" title="To date" />
            {(dateFrom || dateTo) && (
              <button onClick={() => { setDateFrom(''); setDateTo('') }} className="text-red-500 hover:text-red-700 ml-1" title="Clear dates">
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Total Received</div>
            <div className="text-lg font-bold text-emerald-600">{fmtMoney(totalReceived)}</div>
            <div className="text-[10px] text-muted-foreground/80 mt-0.5">{list.length} receipt(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Applied to Invoices</div>
            <div className="text-lg font-bold text-sky-600">{fmtMoney(totalApplied)}</div>
            <div className="text-[10px] text-muted-foreground/80 mt-0.5">{countWithInvoice} linked to invoice(s)</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Unapplied Credit</div>
            <div className="text-lg font-bold text-amber-600">{fmtMoney(totalReceived - totalApplied)}</div>
            <div className="text-[10px] text-muted-foreground/80 mt-0.5">Available to allocate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Posted to GL</div>
            <div className="text-lg font-bold text-purple-600">{countWithJE}</div>
            <div className="text-[10px] text-muted-foreground/80 mt-0.5">journal entries auto-posted</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Receipt #</th>
                  <th className="text-left p-2 font-medium">Date</th>
                  <th className="text-left p-2 font-medium">Payer / Customer</th>
                  <th className="text-left p-2 font-medium">Method</th>
                  <th className="text-left p-2 font-medium">Invoice</th>
                  <th className="text-left p-2 font-medium">JE</th>
                  <th className="text-right p-2 font-medium">Amount</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No receipts found.</td></tr>
                )}
                {list.map(p => (
                  <tr key={p.id} className="border-t hover:bg-muted/30">
                    <td className="p-2 font-mono text-xs">{p.paymentCode}</td>
                    <td className="p-2 text-xs">{fmtDate(p.paymentDate)}</td>
                    <td className="p-2">
                      <div className="font-medium">{p.payerName || '—'}</div>
                      {p.resident && (
                        <div className="text-xs text-muted-foreground">
                          {p.resident.code && <span className="font-mono text-primary mr-1">{p.resident.code}</span>}
                          {p.resident.firstName} {p.resident.lastName}
                        </div>
                      )}
                    </td>
                    <td className="p-2"><Badge variant="outline" className="text-xs">{p.method.replace(/_/g, ' ')}</Badge></td>
                    <td className="p-2 font-mono text-xs">
                      {p.invoice?.invoiceNumber || (p.applications && p.applications.length > 0 ? p.applications.map(a => a.invoice?.invoiceNumber).filter(Boolean).join(', ') : <span className="text-muted-foreground">—</span>)}
                      {p.applications && p.applications.length > 1 && <span className="text-xs text-muted-foreground"> ({p.applications.length})</span>}
                    </td>
                    <td className="p-2 font-mono text-xs">
                      {p.journalEntries && p.journalEntries.length > 0 ? (
                        <span className="text-primary">{p.journalEntries[0].entryNumber}</span>
                      ) : <span className="text-muted-foreground">—</span>}
                      {p.journalEntries && p.journalEntries.length > 1 && <span className="text-xs text-muted-foreground"> +{p.journalEntries.length - 1}</span>}
                    </td>
                    <td className="p-2 text-right font-medium">{fmtMoney(p.amount)}</td>
                    <td className="p-2">
                      <Badge variant="outline" className={
                        p.status === 'CLEARED' ? 'bg-emerald-50 text-emerald-700 text-xs' :
                        p.status === 'PENDING' ? 'bg-amber-50 text-amber-700 text-xs' :
                        p.status === 'BOUNCED' ? 'bg-red-50 text-red-700 text-xs' :
                        p.status === 'REFUNDED' ? 'bg-purple-50 text-purple-700 text-xs' : 'text-xs'
                      }>{p.status}</Badge>
                    </td>
                    <td className="p-2 whitespace-nowrap">
                      <Button size="sm" variant="ghost" className="h-7" title="View receipt details" onClick={() => setViewReceipt(p)}>
                        View
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {viewReceipt && (
        <ViewPaymentDialog payment={viewReceipt} onClose={() => setViewReceipt(null)} />
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>{children}</div>
}
