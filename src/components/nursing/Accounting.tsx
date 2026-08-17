'use client'

import { useState, useMemo } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPost, apiPatch, apiDelete, withFacility } from './api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { StandardSearchBar } from './StandardSearchBar'
import { DateRangeFilter, type DateRangeValue } from './DateRangeFilter'
import { useAppDropdowns } from './useAppDropdowns'
import { fmtMoney, fmtDate } from '@/lib/types'
import {
  BookOpen, FileText, Building2, Landmark, BarChart3, Plus, Trash2, Edit,
  CheckCircle, AlertTriangle, Loader2, RefreshCw, Download, Minus, Wallet, Calendar, X
} from 'lucide-react'
import { toast } from 'sonner'

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']
const ACCOUNT_TYPE_COLORS: Record<string, string> = {
  ASSET: 'text-emerald-600 bg-emerald-50',
  LIABILITY: 'text-red-600 bg-red-50',
  EQUITY: 'text-purple-600 bg-purple-50',
  REVENUE: 'text-sky-600 bg-sky-50',
  EXPENSE: 'text-orange-600 bg-orange-50',
}

// ============ CHART OF ACCOUNTS ============
export function ChartOfAccounts({ facilityId }: { facilityId?: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=accounts&includeInactive=true${facilityParam}`)
  const { data: facilities } = useFetch<any[]>('/api/facilities')
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)

  if (loading) return <Skeleton className="h-96" />

  const all = data || []
  const grouped = ACCOUNT_TYPES.reduce((acc, type) => {
    acc[type] = all.filter(a => a.type === type)
    return acc
  }, {} as Record<string, any[]>)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {all.length} accounts — grouped by type
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={async () => {
            try {
              const res = await fetch(`/api/accounting/reports?type=seed_coa${facilityParam}`)
              const data = await res.json()
              if (data.seeded) {
                toast.success(`Seeded ${data.count} accounts`)
                refetch()
              } else {
                toast.info(`Chart of accounts already exists (${data.count} accounts)`)
              }
            } catch (e: any) { toast.error(e.message) }
          }}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" /> Seed Defaults
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Add Account
          </Button>
        </div>
      </div>

      {all.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center">
            <BookOpen className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            <p className="font-medium">No accounts yet</p>
            <p className="text-sm text-muted-foreground mt-1">Click "Seed Defaults" to create a standard chart of accounts for a nursing home.</p>
          </CardContent>
        </Card>
      )}

      {ACCOUNT_TYPES.map(type => (
        grouped[type] && grouped[type].length > 0 && (
          <Card key={type}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge className={ACCOUNT_TYPE_COLORS[type]}>{type}</Badge>
                <span className="text-muted-foreground font-normal">({grouped[type].length})</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Code</th>
                      <th className="text-left p-2 font-medium">Name</th>
                      <th className="text-left p-2 font-medium">Facility</th>
                      <th className="text-left p-2 font-medium">Subtype</th>
                      <th className="text-left p-2 font-medium">Normal Balance</th>
                      <th className="text-left p-2 font-medium">Status</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {grouped[type].map(a => (
                      <tr key={a.id} className="border-t hover:bg-muted/30">
                        <td className="p-2 font-mono text-xs">{a.code}</td>
                        <td className="p-2 font-medium">{a.name}</td>
                        <td className="p-2 text-xs text-muted-foreground">{a.facilityId ? (facilities || []).find(f => f.id === a.facilityId)?.name || a.facilityId.slice(0, 8) : 'Global'}</td>
                        <td className="p-2 text-xs text-muted-foreground">{a.subtype?.replace(/_/g, ' ') || '—'}</td>
                        <td className="p-2"><Badge variant="outline" className="text-xs">{a.normalBalance}</Badge></td>
                        <td className="p-2">{a.active ? <Badge className="bg-emerald-50 text-emerald-700 text-xs">Active</Badge> : <Badge variant="outline" className="text-xs">Inactive</Badge>}</td>
                        <td className="p-2 whitespace-nowrap">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(a)} title="Edit">
                            <Edit className="h-3 w-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        )
      ))}

      {showAdd && <AccountDialog facilityId={facilityId} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refetch() }} />}
      {editing && <AccountDialog facilityId={facilityId} account={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch() }} />}
    </div>
  )
}

function AccountDialog({ facilityId, account, onClose, onSaved }: any) {
  useEscClose(onClose)
  const [form, setForm] = useState({
    code: account?.code || '',
    name: account?.name || '',
    type: account?.type || 'EXPENSE',
    subtype: account?.subtype || '',
    normalBalance: account?.normalBalance || 'DEBIT',
    active: account?.active !== false,
    description: account?.description || '',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.code || !form.name) { toast.error('Code and name required'); return }
    setSaving(true)
    try {
      if (account) {
        await apiPatch(`/api/data?type=accounts&id=${account.id}`, form)
        toast.success('Account updated')
      } else {
        await apiPost(withFacility('/api/data?type=accounts', facilityId), { ...form, facilityId: facilityId || null })
        toast.success('Account created')
      }
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold">{account ? 'Edit Account' : 'Add Account'}</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Code *</label>
              <Input value={form.code} onChange={e => setForm({ ...form, code: e.target.value })} disabled={!!account} placeholder="e.g. 6010" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Software Subscriptions" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type *</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.type} onChange={e => setForm({ ...form, type: e.target.value, normalBalance: (e.target.value === 'ASSET' || e.target.value === 'EXPENSE') ? 'DEBIT' : 'CREDIT' })}>
                {ACCOUNT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Subtype (optional)</label>
              <Input value={form.subtype} onChange={e => setForm({ ...form, subtype: e.target.value })} placeholder="e.g. CURRENT_ASSET" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Normal Balance</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.normalBalance} onChange={e => setForm({ ...form, normalBalance: e.target.value })}>
                <option value="DEBIT">DEBIT</option>
                <option value="CREDIT">CREDIT</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.active ? '1' : '0'} onChange={e => setForm({ ...form, active: e.target.value === '1' })}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
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

// ============ JOURNAL ENTRIES ============
export function JournalEntries({ facilityId }: { facilityId?: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=journalEntries${facilityParam}`)
  const { data: facilities } = useFetch<any[]>('/api/facilities')
  const [showAdd, setShowAdd] = useState(false)
  const [viewEntry, setViewEntry] = useState<any | null>(null)
  const [search, setSearch] = useState('')
  const [sourceFilter, setSourceFilter] = useState<string>('all')

  if (loading) return <Skeleton className="h-96" />

  const all = data || []
  // Apply source filter first, then text search
  const sourceFiltered = sourceFilter === 'all' ? all : all.filter(je => je.source === sourceFilter)
  const list = sourceFiltered.filter(je => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      je.entryNumber?.toLowerCase().includes(s) ||
      je.memo?.toLowerCase().includes(s) ||
      je.source?.toLowerCase().includes(s) ||
      je.reference?.toLowerCase().includes(s) ||
      je.lines.some((l: any) => l.account?.name?.toLowerCase().includes(s) || l.account?.code?.includes(s) || l.description?.toLowerCase().includes(s))
    )
  })

  // Count by source for the filter dropdown labels
  const sourceCounts: Record<string, number> = {}
  for (const je of all) {
    sourceCounts[je.source || 'MANUAL'] = (sourceCounts[je.source || 'MANUAL'] || 0) + 1
  }

  return (
    <div className="space-y-4">
      <StandardSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by JE #, memo, source, account code/name..."
        totalCount={sourceFiltered.length}
        filteredCount={list.length}
      />
      <div className="flex flex-col sm:flex-row gap-2 justify-between items-stretch sm:items-center">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{list.length} entries</span>
          <select
            className="border rounded px-2 py-1 text-xs"
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value)}
          >
            <option value="all">All Sources ({all.length})</option>
            <option value="MANUAL">Manual ({sourceCounts['MANUAL'] || 0})</option>
            <option value="AUTO_INVOICE">Invoices ({sourceCounts['AUTO_INVOICE'] || 0})</option>
            <option value="AUTO_EXPENSE">Expenses ({sourceCounts['AUTO_EXPENSE'] || 0})</option>
            <option value="AUTO_PAYMENT">Payments ({sourceCounts['AUTO_PAYMENT'] || 0})</option>
            <option value="AUTO_PURCHASE_ORDER">Purchase Orders ({sourceCounts['AUTO_PURCHASE_ORDER'] || 0})</option>
            <option value="AUTO_VENDOR_PAYMENT">Vendor Payments ({sourceCounts['AUTO_VENDOR_PAYMENT'] || 0})</option>
            <option value="AUTO_DEPOSIT">Deposits ({sourceCounts['AUTO_DEPOSIT'] || 0})</option>
            <option value="AUTO_RECURRING">Recurring ({sourceCounts['AUTO_RECURRING'] || 0})</option>
          </select>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> New Journal Entry
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">JE #</th>
                  <th className="text-left p-2 font-medium">Date</th>
                  <th className="text-left p-2 font-medium">Facility</th>
                  <th className="text-left p-2 font-medium">Memo</th>
                  <th className="text-left p-2 font-medium">Source</th>
                  <th className="text-right p-2 font-medium">Debit</th>
                  <th className="text-right p-2 font-medium">Credit</th>
                  <th className="text-left p-2 font-medium">Lines</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">{all.length === 0 ? 'No journal entries yet. Create invoices, expenses, or payments to auto-post, or create a manual entry.' : 'No entries match your filters.'}</td></tr>
                )}
                {list.map(je => {
                  const totalDebit = je.lines.reduce((s: number, l: any) => s + l.debit, 0)
                  const totalCredit = je.lines.reduce((s: number, l: any) => s + l.credit, 0)
                  return (
                    <tr key={je.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setViewEntry(je)}>
                      <td className="p-2 font-mono text-xs">{je.entryNumber}</td>
                      <td className="p-2 text-xs">{fmtDate(je.entryDate)}</td>
                      <td className="p-2 text-xs text-muted-foreground">{je.facilityId ? (facilities || []).find(f => f.id === je.facilityId)?.name || je.facilityId.slice(0, 8) : 'Global'}</td>
                      <td className="p-2 truncate max-w-xs">{je.memo}</td>
                      <td className="p-2">
                        <Badge variant="outline" className={`text-xs ${
                          je.source === 'AUTO_PURCHASE_ORDER' ? 'bg-violet-50 text-violet-700 border-violet-200' :
                          je.source === 'AUTO_VENDOR_PAYMENT' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                          je.source === 'AUTO_INVOICE' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          je.source === 'AUTO_EXPENSE' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                          je.source === 'AUTO_PAYMENT' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          je.source === 'AUTO_DEPOSIT' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          ''
                        }`}>
                          {je.source === 'AUTO_INVOICE' ? 'Invoice' :
                           je.source === 'AUTO_EXPENSE' ? 'Expense' :
                           je.source === 'AUTO_PAYMENT' ? 'Payment' :
                           je.source === 'AUTO_PURCHASE_ORDER' ? 'Purchase Order' :
                           je.source === 'AUTO_VENDOR_PAYMENT' ? 'Vendor Payment' :
                           je.source === 'AUTO_DEPOSIT' ? 'Deposit' :
                           je.source === 'AUTO_RECURRING' ? 'Recurring' : 'Manual'}
                        </Badge>
                      </td>
                      <td className="p-2 text-right font-medium">{fmtMoney(totalDebit)}</td>
                      <td className="p-2 text-right font-medium">{fmtMoney(totalCredit)}</td>
                      <td className="p-2 text-xs text-muted-foreground">{je.lines.length}</td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" className="h-7" onClick={(e) => { e.stopPropagation(); setViewEntry(je) }}>View</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {showAdd && <JournalEntryDialog facilityId={facilityId} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refetch() }} />}
      {viewEntry && <ViewJournalEntryDialog entry={viewEntry} onClose={() => setViewEntry(null)} />}
    </div>
  )
}

function JournalEntryDialog({ facilityId, onClose, onSaved }: any) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: accounts } = useFetch<any[]>(`/api/data?type=accounts${facilityParam}`)
  const [memo, setMemo] = useState('')
  const [entryDate, setEntryDate] = useState(new Date().toISOString().slice(0, 10))
  const [lines, setLines] = useState([
    { accountId: '', debit: '', credit: '', description: '' },
    { accountId: '', debit: '', credit: '', description: '' },
  ])
  const [saving, setSaving] = useState(false)

  const totalDebit = lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0)
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0

  const updateLine = (i: number, field: string, value: string) => {
    const next = [...lines]
    next[i] = { ...next[i], [field]: value }
    // If user enters a debit, clear credit and vice versa
    if (field === 'debit' && value) next[i].credit = ''
    if (field === 'credit' && value) next[i].debit = ''
    setLines(next)
  }

  const addLine = () => setLines([...lines, { accountId: '', debit: '', credit: '', description: '' }])
  const removeLine = (i: number) => lines.length > 2 && setLines(lines.filter((_, idx) => idx !== i))

  const submit = async () => {
    if (!memo) { toast.error('Memo required'); return }
    if (!isBalanced) { toast.error(`Entry not balanced — debits (${fmtMoney(totalDebit)}) ≠ credits (${fmtMoney(totalCredit)})`); return }
    const validLines = lines.filter(l => l.accountId && (parseFloat(l.debit) > 0 || parseFloat(l.credit) > 0))
    if (validLines.length < 2) { toast.error('At least 2 valid lines required'); return }
    setSaving(true)
    try {
      await apiPost(withFacility('/api/data?type=journalEntries', facilityId), {
        memo,
        entryDate,
        lines: validLines.map(l => ({
          accountId: l.accountId,
          debit: parseFloat(l.debit) || 0,
          credit: parseFloat(l.credit) || 0,
          description: l.description || null,
        })),
        facilityId: facilityId || null,
      })
      toast.success('Journal entry posted')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-3xl my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold">New Journal Entry</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Memo *</label>
              <Input value={memo} onChange={e => setMemo(e.target.value)} placeholder="e.g. Monthly depreciation" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
              <Input type="date" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
            </div>
          </div>

          <div className="border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2">Account</th>
                  <th className="text-left p-2">Description</th>
                  <th className="text-right p-2 w-24">Debit</th>
                  <th className="text-right p-2 w-24">Credit</th>
                  <th className="p-2 w-8"></th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, i) => (
                  <tr key={i} className="border-t">
                    <td className="p-1">
                      <select className="w-full border rounded px-1 py-1 text-xs" value={l.accountId} onChange={e => updateLine(i, 'accountId', e.target.value)}>
                        <option value="">— Select —</option>
                        {(accounts || []).map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                      </select>
                    </td>
                    <td className="p-1">
                      <Input className="h-7 text-xs" value={l.description} onChange={e => updateLine(i, 'description', e.target.value)} />
                    </td>
                    <td className="p-1">
                      <Input type="number" step="0.01" className="h-7 text-xs text-right" value={l.debit} onChange={e => updateLine(i, 'debit', e.target.value)} />
                    </td>
                    <td className="p-1">
                      <Input type="number" step="0.01" className="h-7 text-xs text-right" value={l.credit} onChange={e => updateLine(i, 'credit', e.target.value)} />
                    </td>
                    <td className="p-1 text-center">
                      {lines.length > 2 && <button onClick={() => removeLine(i)} className="text-red-500 hover:text-red-700">×</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 font-semibold">
                <tr>
                  <td colSpan={2} className="p-2 text-right">Totals:</td>
                  <td className="p-2 text-right">{fmtMoney(totalDebit)}</td>
                  <td className="p-2 text-right">{fmtMoney(totalCredit)}</td>
                  <td></td>
                </tr>
                <tr>
                  <td colSpan={2} className="p-2 text-right">Difference:</td>
                  <td colSpan={2} className={`p-2 text-center ${isBalanced ? 'text-emerald-600' : 'text-red-600'}`}>
                    {isBalanced ? '✓ Balanced' : fmtMoney(Math.abs(totalDebit - totalCredit))}
                  </td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          <Button size="sm" variant="outline" onClick={addLine}><Plus className="h-3 w-3 mr-1" /> Add Line</Button>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !isBalanced}>{saving ? 'Posting...' : 'Post Entry'}</Button>
        </div>
      </div>
    </div>
  )
}

function ViewJournalEntryDialog({ entry, onClose }: { entry: any; onClose: () => void }) {
  useEscClose(onClose)
  const totalDebit = entry.lines.reduce((s: number, l: any) => s + l.debit, 0)
  const totalCredit = entry.lines.reduce((s: number, l: any) => s + l.credit, 0)
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold">Journal Entry {entry.entryNumber}</h3>
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

// ============ VENDORS ============
export function Vendors({ facilityId }: { facilityId?: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=vendors${facilityParam}`)
  // Fetch received POs to compute outstanding AP per vendor
  const { data: pos, refetch: refetchPos } = useFetch<any[]>(`/api/data?type=purchaseOrders&status=RECEIVED${facilityParam}`)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<any | null>(null)
  const [payingVendor, setPayingVendor] = useState<any | null>(null)

  if (loading) return <Skeleton className="h-96" />

  const all = data || []
  const receivedPos = (pos || [])

  // Compute AP balance per vendor: total of received POs minus paid amount
  // (Only CREDIT-payment-method POs contribute to AP — cash-paid POs don't owe anything)
  const apByVendor: Record<string, number> = {}
  for (const po of receivedPos) {
    if (!po.vendorId) continue
    // Only count POs where payment method was CREDIT (unpaid balance remains)
    if (po.paymentMethod === 'CREDIT' || (!po.paymentMethod && po.paidAmount < po.total)) {
      const outstanding = po.total - (po.paidAmount || 0)
      if (outstanding > 0.01) {
        apByVendor[po.vendorId] = (apByVendor[po.vendorId] || 0) + outstanding
      }
    }
  }
  const totalAP = Object.values(apByVendor).reduce((s, v) => s + v, 0)

  return (
    <div className="space-y-4">
      {/* AP summary card */}
      <Card><CardContent className="p-4 flex items-center justify-between">
        <div>
          <div className="text-xs text-muted-foreground">Total Accounts Payable (unpaid POs)</div>
          <div className="text-2xl font-bold text-amber-600">{fmtMoney(totalAP)}</div>
        </div>
        <div className="text-xs text-muted-foreground text-right">
          {Object.keys(apByVendor).length} vendor{Object.keys(apByVendor).length === 1 ? '' : 's'} with outstanding balance
          <div className="mt-1">
            <Badge variant="outline" className="text-[10px]">
              Click &quot;Pay&quot; on a vendor row below to record a payment (auto-posts Dr 2000 AP / Cr Bank)
            </Badge>
          </div>
        </div>
      </CardContent></Card>

      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">{all.length} vendors</div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Vendor
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Code</th>
                  <th className="text-left p-2 font-medium">Name</th>
                  <th className="text-left p-2 font-medium">Contact</th>
                  <th className="text-left p-2 font-medium">Payment Terms</th>
                  <th className="text-right p-2 font-medium">Outstanding AP</th>
                  <th className="text-left p-2 font-medium">Status</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {all.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No vendors yet. Add one to link to expenses or purchase orders.</td></tr>}
                {all.map(v => {
                  const ap = apByVendor[v.id] || 0
                  return (
                    <tr key={v.id} className="border-t hover:bg-muted/30">
                      <td className="p-2 font-mono text-xs">{v.code}</td>
                      <td className="p-2 font-medium">{v.name}</td>
                      <td className="p-2 text-xs text-muted-foreground">
                        {v.contactPerson && <div>{v.contactPerson}</div>}
                        {v.phone && <div>{v.phone}</div>}
                        {v.email && <div>{v.email}</div>}
                      </td>
                      <td className="p-2 text-xs">{v.paymentTerms || '—'}</td>
                      <td className={`p-2 text-right font-medium ${ap > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {ap > 0 ? fmtMoney(ap) : '—'}
                      </td>
                      <td className="p-2">{v.active ? <Badge className="bg-emerald-50 text-emerald-700 text-xs">Active</Badge> : <Badge variant="outline" className="text-xs">Inactive</Badge>}</td>
                      <td className="p-2 whitespace-nowrap">
                        {ap > 0 && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 text-xs mr-1"
                            title="Pay this vendor (records AP payment + auto-posts JE)"
                            onClick={() => setPayingVendor(v)}
                          >
                            <Wallet className="h-3 w-3 mr-1" /> Pay
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditing(v)}><Edit className="h-3 w-3" /></Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
      {showAdd && <VendorDialog facilityId={facilityId} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refetch() }} />}
      {editing && <VendorDialog facilityId={facilityId} vendor={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch() }} />}
      {payingVendor && (
        <PayVendorDialog
          vendor={payingVendor}
          pos={receivedPos.filter(po => po.vendorId === payingVendor.id)}
          facilityId={facilityId}
          onClose={() => setPayingVendor(null)}
          onSaved={() => { setPayingVendor(null); refetchPos(); refetch() }}
        />
      )}
    </div>
  )
}

// ============ PAY VENDOR DIALOG (record AP payment) ============
// Records a payment to a vendor that pays down their Accounts Payable balance.
// Posts a journal entry: Dr 2000 (Accounts Payable) / Cr {bank.glAccountId}.
// Optionally allocates the payment to specific POs (updates paidAmount + paymentStatus).
function PayVendorDialog({ vendor, pos, facilityId, onClose, onSaved }: {
  vendor: any
  pos: any[]
  facilityId?: string
  onClose: () => void
  onSaved: () => void
}) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  // Outstanding POs (received, with unpaid balance, credit method)
  const outstandingPos = pos.filter(po => {
    const outstanding = po.total - (po.paidAmount || 0)
    return outstanding > 0.01 && (po.paymentMethod === 'CREDIT' || !po.paymentMethod)
  })
  const totalOutstanding = outstandingPos.reduce((s, po) => s + (po.total - (po.paidAmount || 0)), 0)

  // Fetch bank accounts (so user can pick which bank/cash to pay from)
  const { data: banks } = useFetch<any[]>(`/api/data?type=bankAccounts${facilityParam}`)
  // Fetch chart of accounts to find the AP account (2000) as a fallback if no bank is selected
  const { data: accounts } = useFetch<any[]>(`/api/data?type=accounts${facilityParam}`)

  const [bankAccountId, setBankAccountId] = useState<string>('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [notes, setNotes] = useState('')
  // Allocation state: { [poId]: amount } — defaults to fully paying each PO
  const [allocations, setAllocations] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {}
    for (const po of outstandingPos) {
      init[po.id] = String((po.total - (po.paidAmount || 0)).toFixed(2))
    }
    return init
  })
  const [saving, setSaving] = useState(false)

  // Resolve AP account (2000) and bank GL account
  const apAccount = (accounts || []).find((a: any) => a.code === '2000')
  const selectedBank = (banks || []).find((b: any) => b.id === bankAccountId)

  // Total payment = sum of allocations
  const totalPayment = Object.values(allocations).reduce((s, v) => s + (parseFloat(v) || 0), 0)
  const isBalanced = totalPayment > 0 && (selectedBank || apAccount)

  const updateAllocation = (poId: string, value: string) => {
    setAllocations(prev => ({ ...prev, [poId]: value }))
  }

  const submit = async () => {
    if (!totalPayment || totalPayment <= 0) {
      toast.error('Enter at least one allocation amount greater than 0')
      return
    }
    // Resolve the credit-side GL account: prefer the selected bank's GL account, fallback to AP account
    // Wait — that's wrong. The credit side MUST be a cash/bank account (1010 / bank's GL).
    // If no bank is selected, we can't post the payment — we need a cash account.
    let creditAccountId: string | null = null
    let creditAccountName = ''
    if (selectedBank?.glAccountId) {
      creditAccountId = selectedBank.glAccountId
      creditAccountName = `Bank — ${selectedBank.name}`
    } else {
      // Fallback: look up account 1010 (Bank — Operating) directly
      const cashAccount = (accounts || []).find((a: any) => a.code === '1010')
      if (cashAccount) {
        creditAccountId = cashAccount.id
        creditAccountName = `Cash/Bank — ${cashAccount.name}`
      }
    }
    if (!creditAccountId) {
      toast.error('No bank account selected and no default cash account (1010) found. Add a bank account in Accounting → Bank Accounts, or seed the chart of accounts.')
      return
    }
    if (!apAccount) {
      toast.error('Accounts Payable account (2000) not found in chart of accounts. Seed the chart of accounts first.')
      return
    }
    setSaving(true)
    try {
      // 1. Create the journal entry: Dr 2000 (AP) / Cr {bank.glAccountId}
      const jeLines = [
        { accountId: apAccount.id, debit: totalPayment, description: `AP payment — ${vendor.name}` },
        { accountId: creditAccountId, credit: totalPayment, description: `Paid ${vendor.name} — ${creditAccountName}` },
      ]
      const jePayload: any = {
        memo: `Vendor Payment — ${vendor.name}${reference ? ` (ref: ${reference})` : ''}`,
        entryDate: paymentDate,
        source: 'AUTO_VENDOR_PAYMENT',
        reference: vendor.code || vendor.name,
        lines: jeLines,
        facilityId: facilityId || null,
      }
      const jeRes = await fetch(withFacility('/api/data?type=journalEntries', facilityId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jePayload),
      })
      const jeData = await jeRes.json()
      if (!jeRes.ok) throw new Error(jeData.error || `JE creation failed (HTTP ${jeRes.status})`)

      // 2. Allocate the payment to each PO (update paidAmount + paymentStatus)
      let allocatedCount = 0
      for (const [poId, amountStr] of Object.entries(allocations)) {
        const amount = parseFloat(amountStr) || 0
        if (amount <= 0) continue
        const po = outstandingPos.find(p => p.id === poId)
        if (!po) continue
        const newPaidAmount = (po.paidAmount || 0) + amount
        const newPaymentStatus = newPaidAmount >= po.total - 0.01 ? 'PAID' : 'PARTIAL'
        try {
          await fetch(withFacility(`/api/data?type=purchaseOrders&id=${poId}`, facilityId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              paidAmount: newPaidAmount,
              paymentStatus: newPaymentStatus,
              notes: [po.notes, `Paid ${amount.toFixed(2)} on ${paymentDate}${reference ? ` (ref: ${reference})` : ''} — JE ${jeData.entryNumber}`].filter(Boolean).join('\n').slice(0, 1000),
            }),
          })
          allocatedCount++
        } catch (e: any) {
          console.error(`Failed to allocate to PO ${po.poNumber}:`, e.message)
          // Continue — the JE was already posted, so the AP balance is reduced in the GL
          // even if we couldn't update the PO's paidAmount
        }
      }

      toast.success(`Payment of ${fmtMoney(totalPayment)} recorded to ${vendor.name} — JE ${jeData.entryNumber} posted (allocated to ${allocatedCount} PO(s))`)
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl my-8">
        <div className="flex justify-between items-center border-b p-4 sticky top-0 bg-background z-10">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Pay Vendor
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {vendor.code} — {vendor.name}
              {vendor.paymentTerms && <> · {vendor.paymentTerms}</>}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Outstanding summary */}
          <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-amber-900">TOTAL OUTSTANDING</div>
              <div className="text-2xl font-bold text-amber-700">{fmtMoney(totalOutstanding)}</div>
            </div>
            <div className="text-xs text-amber-800 text-right">
              Across {outstandingPos.length} unpaid PO(s)
              <div className="mt-1">
                <Badge variant="outline" className="text-[10px] bg-white">
                  Dr 2000 (AP) / Cr {selectedBank ? selectedBank.account?.code || selectedBank.code : '1010'} (Cash/Bank)
                </Badge>
              </div>
            </div>
          </div>

          {/* Payment header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Pay From *</label>
              <select
                className="w-full border rounded px-2 py-1.5 text-sm"
                value={bankAccountId}
                onChange={e => setBankAccountId(e.target.value)}
              >
                <option value="">— select bank/cash —</option>
                {(banks || []).map((b: any) => (
                  <option key={b.id} value={b.id}>
                    {b.code} — {b.name} ({fmtMoney(b.currentBalance || 0)})
                  </option>
                ))}
              </select>
              {(banks || []).length === 0 && (
                <p className="text-[10px] text-amber-700 mt-1">
                  No bank accounts set up. Add one in Accounting → Bank Accounts, or the system will use account 1010 as a fallback.
                </p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Date</label>
              <Input type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Reference (cheque #, txn id)</label>
              <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. CHQ-00123" />
            </div>
          </div>

          {/* Allocation table */}
          <div className="border rounded-md">
            <div className="bg-muted/50 px-3 py-2 text-xs font-medium flex items-center justify-between">
              <span>Allocate Payment to PO(s)</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-xs"
                onClick={() => {
                  // Reset to fully paying each PO
                  const init: Record<string, string> = {}
                  for (const po of outstandingPos) {
                    init[po.id] = String((po.total - (po.paidAmount || 0)).toFixed(2))
                  }
                  setAllocations(init)
                }}
              >
                Pay All In Full
              </Button>
            </div>
            {outstandingPos.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground text-center">
                No outstanding POs for this vendor.
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/30 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">PO #</th>
                      <th className="text-left p-2 font-medium hidden sm:table-cell">Date</th>
                      <th className="text-right p-2 font-medium">Total</th>
                      <th className="text-right p-2 font-medium">Already Paid</th>
                      <th className="text-right p-2 font-medium">Outstanding</th>
                      <th className="text-right p-2 font-medium">Pay Now</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outstandingPos.map(po => {
                      const outstanding = po.total - (po.paidAmount || 0)
                      return (
                        <tr key={po.id} className="border-t">
                          <td className="p-2 font-mono text-xs">{po.poNumber}</td>
                          <td className="p-2 text-xs hidden sm:table-cell">{fmtDate(po.orderDate)}</td>
                          <td className="p-2 text-right">{fmtMoney(po.total)}</td>
                          <td className="p-2 text-right text-xs text-muted-foreground">{fmtMoney(po.paidAmount || 0)}</td>
                          <td className="p-2 text-right font-medium text-amber-700">{fmtMoney(outstanding)}</td>
                          <td className="p-2 text-right">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              max={outstanding.toFixed(2)}
                              className="h-7 w-24 text-right text-sm ml-auto"
                              value={allocations[po.id] || ''}
                              onChange={e => updateAllocation(po.id, e.target.value)}
                            />
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-muted/30 font-medium">
                      <td colSpan={5} className="p-2 text-right">Total Payment:</td>
                      <td className="p-2 text-right text-base">{fmtMoney(totalPayment)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes (optional)</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Partial payment for July invoice batch" />
          </div>

          <div className="rounded-md bg-muted/30 p-2 text-[11px] text-muted-foreground">
            <strong>What happens:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>A journal entry is posted: <strong>Dr 2000 (Accounts Payable)</strong> / <strong>Cr {selectedBank ? selectedBank.account?.code || selectedBank.code : '1010'} ({selectedBank ? selectedBank.name : 'Cash/Bank'})</strong></li>
              <li>Each PO&apos;s <strong>paidAmount</strong> is updated; PO is marked <strong>PAID</strong> when fully paid, <strong>PARTIAL</strong> otherwise</li>
              <li>The vendor&apos;s Outstanding AP balance decreases by the total payment amount</li>
              <li>Find the JE later in Accounting → Journal Entries → filter by &quot;Vendor Payments&quot;</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 p-4 border-t sticky bottom-0 bg-background">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !isBalanced}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Recording...</> : <><Wallet className="h-3.5 w-3.5 mr-1" /> Record Payment ({fmtMoney(totalPayment)})</>}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ============ VENDOR PAYMENTS (list view of AUTO_VENDOR_PAYMENT JEs) ============
// A thin browseable view over journal entries with source = 'AUTO_VENDOR_PAYMENT'.
// Each row shows: JE #, date, vendor (resolved from the reference = vendor code),
// the cash/bank account that was credited, the amount, the reference, and the
// underlying JE memo. Click a row to open the JE detail dialog.
export function VendorPayments({ facilityId }: { facilityId?: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=journalEntries&source=AUTO_VENDOR_PAYMENT${facilityParam}`)
  const { data: vendors } = useFetch<any[]>(`/api/data?type=vendors&includeInactive=true${facilityParam}`)
  const { data: facilities } = useFetch<any[]>('/api/facilities')
  const [search, setSearch] = useState('')
  const [viewEntry, setViewEntry] = useState<any | null>(null)

  if (loading) return <Skeleton className="h-96" />

  const all = data || []
  // Resolve vendor from the JE's `reference` field (we set it to the vendor code in PayVendorDialog)
  const vendorByCode: Record<string, any> = {}
  for (const v of (vendors || [])) {
    vendorByCode[v.code] = v
  }

  const list = all.filter(je => {
    if (!search) return true
    const s = search.toLowerCase()
    const vendor = vendorByCode[je.reference || '']
    return (
      je.entryNumber?.toLowerCase().includes(s) ||
      je.memo?.toLowerCase().includes(s) ||
      je.reference?.toLowerCase().includes(s) ||
      vendor?.name?.toLowerCase().includes(s) ||
      je.lines.some((l: any) => l.account?.name?.toLowerCase().includes(s) || l.account?.code?.includes(s) || l.description?.toLowerCase().includes(s))
    )
  })

  // Summary
  const totalPaid = list.reduce((s, je) => s + je.lines.reduce((sd: number, l: any) => sd + (l.credit || 0), 0), 0)
  const uniqueVendors = new Set(list.map(je => je.reference).filter(Boolean)).size

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Paid (filtered)</div>
          <div className="text-2xl font-bold text-emerald-600">{fmtMoney(totalPaid)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Vendor Payments</div>
          <div className="text-2xl font-bold">{list.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Vendors Paid</div>
          <div className="text-2xl font-bold">{uniqueVendors}</div>
        </CardContent></Card>
      </div>

      <StandardSearchBar
        value={search}
        onChange={setSearch}
        placeholder="Search by JE #, vendor name/code, memo, account..."
        totalCount={all.length}
        filteredCount={list.length}
      />

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">JE #</th>
                  <th className="text-left p-2 font-medium">Date</th>
                  <th className="text-left p-2 font-medium">Facility</th>
                  <th className="text-left p-2 font-medium">Vendor</th>
                  <th className="text-left p-2 font-medium">Paid From (Bank/Cash)</th>
                  <th className="text-left p-2 font-medium hidden md:table-cell">Memo</th>
                  <th className="text-left p-2 font-medium hidden sm:table-cell">Reference</th>
                  <th className="text-right p-2 font-medium">Amount</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {list.length === 0 && (
                  <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">
                    {all.length === 0
                      ? 'No vendor payments recorded yet. Pay a vendor from the Vendors tab → Outstanding AP column → "Pay" button.'
                      : 'No payments match your search.'}
                  </td></tr>
                )}
                {list.map(je => {
                  const totalCredit = je.lines.reduce((s: number, l: any) => s + (l.credit || 0), 0)
                  const totalDebit = je.lines.reduce((s: number, l: any) => s + (l.debit || 0), 0)
                  const vendor = vendorByCode[je.reference || '']
                  // Find the credit line (the bank/cash account paid from)
                  const creditLine = je.lines.find((l: any) => l.credit > 0)
                  const debitLine = je.lines.find((l: any) => l.debit > 0)
                  return (
                    <tr key={je.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setViewEntry(je)}>
                      <td className="p-2 font-mono text-xs">{je.entryNumber}</td>
                      <td className="p-2 text-xs">{fmtDate(je.entryDate)}</td>
                      <td className="p-2 text-xs text-muted-foreground">{je.facilityId ? (facilities || []).find(f => f.id === je.facilityId)?.name || je.facilityId.slice(0, 8) : 'Global'}</td>
                      <td className="p-2">
                        {vendor ? (
                          <>
                            <div className="font-medium">{vendor.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{vendor.code}</div>
                          </>
                        ) : je.reference ? (
                          <span className="text-xs text-muted-foreground">{je.reference}</span>
                        ) : '—'}
                      </td>
                      <td className="p-2 text-xs">
                        {creditLine ? (
                          <>
                            <div className="font-mono text-primary">{creditLine.account?.code}</div>
                            <div className="text-muted-foreground">{creditLine.account?.name}</div>
                          </>
                        ) : '—'}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground hidden md:table-cell truncate max-w-xs">{je.memo}</td>
                      <td className="p-2 text-xs font-mono hidden sm:table-cell">{je.reference || '—'}</td>
                      <td className="p-2 text-right font-medium text-emerald-700">{fmtMoney(totalCredit)}</td>
                      <td className="p-2">
                        <Button size="sm" variant="ghost" className="h-7" onClick={(e) => { e.stopPropagation(); setViewEntry(je) }}>View</Button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              {list.length > 0 && (
                <tfoot>
                  <tr className="border-t bg-muted/30 font-medium">
                    <td colSpan={7} className="p-2 text-right">Total Paid:</td>
                    <td className="p-2 text-right text-emerald-700">{fmtMoney(totalPaid)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
        <strong>How these get created:</strong> Each row is a journal entry posted when you click &quot;Pay&quot; on a vendor in the <strong>Vendors</strong> tab.
        The entry debits Accounts Payable (2000) and credits your selected bank/cash account, then the matching PO(s) are marked PAID or PARTIAL.
        To audit a single payment, click &quot;View&quot; to see all the JE lines.
      </div>

      {viewEntry && <ViewJournalEntryDialog entry={viewEntry} onClose={() => setViewEntry(null)} />}
    </div>
  )
}

function VendorDialog({ facilityId, vendor, onClose, onSaved }: any) {
  useEscClose(onClose)
  const [form, setForm] = useState({
    name: vendor?.name || '',
    email: vendor?.email || '',
    phone: vendor?.phone || '',
    address: vendor?.address || '',
    contactPerson: vendor?.contactPerson || '',
    paymentTerms: vendor?.paymentTerms || '',
    taxId: vendor?.taxId || '',
    notes: vendor?.notes || '',
    active: vendor?.active !== false,
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.name) { toast.error('Name required'); return }
    setSaving(true)
    try {
      if (vendor) {
        await apiPatch(`/api/data?type=vendors&id=${vendor.id}`, form)
        toast.success('Vendor updated')
      } else {
        await apiPost(withFacility('/api/data?type=vendors', facilityId), { ...form, facilityId: facilityId || null })
        toast.success('Vendor created')
      }
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold">{vendor ? 'Edit Vendor' : 'Add Vendor'}</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Contact Person</label>
              <Input value={form.contactPerson} onChange={e => setForm({ ...form, contactPerson: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Phone</label>
              <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
              <Input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Terms</label>
              <Input value={form.paymentTerms} onChange={e => setForm({ ...form, paymentTerms: e.target.value })} placeholder="e.g. Net 30" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tax ID (SST/GST)</label>
              <Input value={form.taxId} onChange={e => setForm({ ...form, taxId: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Address</label>
              <Input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} />
            </div>
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

// ============ BANK ACCOUNTS ============
export function BankAccounts({ facilityId }: { facilityId?: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: banks, loading, refetch } = useFetch<any[]>(`/api/data?type=bankAccounts${facilityParam}`)
  const { data: accounts } = useFetch<any[]>(`/api/data?type=accounts&accountType=ASSET${facilityParam}`)
  const [showAdd, setShowAdd] = useState(false)
  const [selectedBank, setSelectedBank] = useState<any | null>(null)
  const [showTransaction, setShowTransaction] = useState(false)

  if (loading) return <Skeleton className="h-96" />

  const assetAccounts = (accounts || []).filter((a: any) => a.code.startsWith('10') || a.code.startsWith('11'))
  const totalBalance = (banks || []).reduce((s: number, b: any) => s + (b.currentBalance || 0), 0)

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="text-sm text-muted-foreground">
          {(banks || []).length} bank/cash accounts • Combined balance: <span className="font-semibold text-foreground">{fmtMoney(totalBalance)}</span>
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Bank Account
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {(banks || []).map((b: any) => (
          <Card
            key={b.id}
            className="cursor-pointer hover:shadow-md transition-shadow"
            onClick={() => { setSelectedBank(b); setShowTransaction(true) }}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Landmark className="h-5 w-5 text-muted-foreground" />
                  <Badge variant="outline" className="text-xs">{b.type}</Badge>
                </div>
                <Badge variant="outline" className={`text-xs ${b.currentBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {b.transactionCount || 0} txn{(b.transactionCount || 0) !== 1 ? 's' : ''}
                </Badge>
              </div>
              <div className="font-semibold">{b.name}</div>
              <div className="text-xs text-muted-foreground font-mono">{b.code}</div>
              {b.bankName && <div className="text-xs text-muted-foreground mt-0.5">{b.bankName}</div>}
              {b.accountNumber && <div className="text-xs text-muted-foreground font-mono">****{b.accountNumber.slice(-4)}</div>}
              <div className="mt-2 pt-2 border-t">
                <div className="text-xs text-muted-foreground">Current Balance</div>
                <div className={`text-xl font-bold ${b.currentBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{fmtMoney(b.currentBalance)}</div>
              </div>
              <div className="grid grid-cols-2 gap-1 mt-2 text-[10px]">
                <div className="text-muted-foreground">In: <span className="font-medium text-emerald-600">{fmtMoney(b.totalDebit || 0)}</span></div>
                <div className="text-muted-foreground">Out: <span className="font-medium text-red-600">{fmtMoney(b.totalCredit || 0)}</span></div>
              </div>
              {b.account && <div className="text-[10px] text-muted-foreground mt-1.5">GL: {b.account.code} — {b.account.name}</div>}
              <div className="text-[10px] text-primary mt-1 flex items-center gap-0.5">
                Click to view transactions →
              </div>
            </CardContent>
          </Card>
        ))}
        {(banks || []).length === 0 && (
          <Card className="col-span-full">
            <CardContent className="py-8 text-center">
              <Landmark className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="font-medium">No bank accounts yet</p>
              <p className="text-sm text-muted-foreground mt-1">Add a bank or cash account to track balances and link to the general ledger.</p>
            </CardContent>
          </Card>
        )}
      </div>

      {showAdd && <BankAccountDialog facilityId={facilityId} accounts={assetAccounts} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refetch() }} />}
      {showTransaction && selectedBank && (
        <BankTransactionDialog
          bank={selectedBank}
          facilityId={facilityId}
          onClose={() => { setShowTransaction(false); setSelectedBank(null) }}
          onRefresh={refetch}
        />
      )}
    </div>
  )
}

// ============ BANK TRANSACTION DIALOG ============
// Shows all journal entries that hit this bank account's GL account,
// plus allows deposit (money in) and withdrawal (money out).
function BankTransactionDialog({ bank, facilityId, onClose, onRefresh }: any) {
  useEscClose(onClose)
  const glAccountId = bank.account?.id
  const { data: entries, loading } = useFetch<any[]>(
    `/api/data?type=journalEntries&accountId=${glAccountId}${facilityId ? `&facilityId=${facilityId}` : ''}`
  )
  const [showDeposit, setShowDeposit] = useState(false)
  const [showWithdraw, setShowWithdraw] = useState(false)

  const allEntries = entries || []
  // Running balance: start from opening balance, apply each entry chronologically
  const sortedAsc = [...allEntries].sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime())
  let runningBalance = bank.openingBalance || 0
  const entriesWithBalance = sortedAsc.map((je: any) => {
    const line = je.lines?.find((l: any) => l.accountId === glAccountId)
    if (line) {
      runningBalance += line.debit - line.credit
    }
    return { ...je, line, runningBalance: Math.round(runningBalance * 100) / 100 }
  }).reverse() // back to desc order for display

  const totalIn = allEntries.reduce((s: number, je: any) => {
    const line = je.lines?.find((l: any) => l.accountId === glAccountId)
    return s + (line?.debit || 0)
  }, 0)
  const totalOut = allEntries.reduce((s: number, je: any) => {
    const line = je.lines?.find((l: any) => l.accountId === glAccountId)
    return s + (line?.credit || 0)
  }, 0)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-4xl my-8">
        <div className="flex justify-between items-center border-b p-4">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Landmark className="h-4 w-4" /> {bank.name}
            </h3>
            <div className="text-xs text-muted-foreground mt-0.5">
              {bank.code} • {bank.bankName || bank.type} • GL: {bank.account?.code} {bank.account?.name}
            </div>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Balance summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Opening Balance</div>
              <div className="text-lg font-bold">{fmtMoney(bank.openingBalance || 0)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Total In (Debits)</div>
              <div className="text-lg font-bold text-emerald-600">{fmtMoney(totalIn)}</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Total Out (Credits)</div>
              <div className="text-lg font-bold text-red-600">{fmtMoney(totalOut)}</div>
            </div>
            <div className="rounded-md border p-3 bg-primary/5">
              <div className="text-xs text-muted-foreground">Current Balance</div>
              <div className={`text-lg font-bold ${(bank.openingBalance + totalIn - totalOut) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {fmtMoney(bank.openingBalance + totalIn - totalOut)}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setShowDeposit(true)}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Deposit (Money In)
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowWithdraw(true)}>
              <Minus className="h-3.5 w-3.5 mr-1" /> Withdraw (Money Out)
            </Button>
          </div>

          {/* Transaction list */}
          <div>
            <div className="text-sm font-medium mb-2">Transaction History ({allEntries.length} entries)</div>
            {loading ? (
              <div className="text-center py-8 text-sm text-muted-foreground">Loading transactions...</div>
            ) : allEntries.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No transactions yet for this account.</div>
            ) : (
              <div className="border rounded-md max-h-96 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 sticky top-0">
                    <tr>
                      <th className="text-left p-2 font-medium">Date</th>
                      <th className="text-left p-2 font-medium">JE #</th>
                      <th className="text-left p-2 font-medium">Memo</th>
                      <th className="text-left p-2 font-medium">Source</th>
                      <th className="text-right p-2 font-medium">In</th>
                      <th className="text-right p-2 font-medium">Out</th>
                      <th className="text-right p-2 font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {entriesWithBalance.map((je: any) => (
                      <tr key={je.id} className="border-t hover:bg-muted/30">
                        <td className="p-2 text-xs">{fmtDate(je.entryDate)}</td>
                        <td className="p-2 font-mono text-xs">{je.entryNumber}</td>
                        <td className="p-2 truncate max-w-xs">{je.memo}</td>
                        <td className="p-2">
                          <Badge variant="outline" className="text-[10px]">
                            {je.source === 'AUTO_INVOICE' ? 'Invoice' :
                             je.source === 'AUTO_EXPENSE' ? 'Expense' :
                             je.source === 'AUTO_PAYMENT' ? 'Payment' :
                             je.source === 'AUTO_DEPOSIT' ? 'Deposit' :
                             je.source === 'AUTO_RECURRING' ? 'Recurring' :
                             'Manual'}
                          </Badge>
                        </td>
                        <td className="p-2 text-right text-emerald-600 font-medium">
                          {je.line?.debit > 0 ? fmtMoney(je.line.debit) : ''}
                        </td>
                        <td className="p-2 text-right text-red-600 font-medium">
                          {je.line?.credit > 0 ? fmtMoney(je.line.credit) : ''}
                        </td>
                        <td className="p-2 text-right font-medium">{fmtMoney(je.runningBalance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end p-4 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>

      {showDeposit && (
        <BankTransactionEntryDialog
          bank={bank}
          facilityId={facilityId}
          type="DEPOSIT"
          onClose={() => setShowDeposit(false)}
          onSaved={() => { setShowDeposit(false); onRefresh() }}
        />
      )}
      {showWithdraw && (
        <BankTransactionEntryDialog
          bank={bank}
          facilityId={facilityId}
          type="WITHDRAWAL"
          onClose={() => setShowWithdraw(false)}
          onSaved={() => { setShowWithdraw(false); onRefresh() }}
        />
      )}
    </div>
  )
}

// ============ BANK TRANSACTION ENTRY (Deposit / Withdrawal) ============
function BankTransactionEntryDialog({ bank, facilityId, type, onClose, onSaved }: any) {
  useEscClose(onClose)
  const { data: accounts } = useFetch<any[]>(`/api/data?type=accounts${facilityId ? `&facilityId=${facilityId}` : ''}`)
  const [form, setForm] = useState({
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    description: type === 'DEPOSIT' ? 'Bank deposit' : 'Bank withdrawal',
    contraAccountId: '',
  })
  const [saving, setSaving] = useState(false)

  const isDeposit = type === 'DEPOSIT'
  const glAccountId = bank.account?.id

  // For deposits: Dr. Bank / Cr. Contra account
  // For withdrawals: Dr. Contra account / Cr. Bank
  const submit = async () => {
    if (!form.amount || parseFloat(form.amount) <= 0) { toast.error('Enter a valid amount'); return }
    if (!form.contraAccountId) { toast.error('Select a contra account'); return }
    setSaving(true)
    try {
      const amt = parseFloat(form.amount)
      const lines = isDeposit
        ? [
            { accountId: glAccountId, debit: amt, description: form.description },
            { accountId: form.contraAccountId, credit: amt, description: form.description },
          ]
        : [
            { accountId: form.contraAccountId, debit: amt, description: form.description },
            { accountId: glAccountId, credit: amt, description: form.description },
          ]
      await apiPost(withFacility('/api/data?type=journalEntries', facilityId), {
        memo: `${isDeposit ? 'Deposit' : 'Withdrawal'} — ${bank.name}: ${form.description}`,
        entryDate: form.date,
        lines,
        facilityId: facilityId || null,
      })
      toast.success(`${isDeposit ? 'Deposit' : 'Withdrawal'} of ${fmtMoney(amt)} recorded`)
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  // Filter out the bank's own GL account from the contra dropdown
  const contraAccounts = (accounts || []).filter((a: any) => a.id !== glAccountId && a.active)

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto" style={{ zIndex: 60 }}>
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold">{isDeposit ? 'Deposit (Money In)' : 'Withdrawal (Money Out)'}</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="text-xs text-muted-foreground bg-muted/30 rounded p-2">
            {isDeposit ? 'Increases' : 'Decreases'} the balance of <strong>{bank.name}</strong> ({bank.code}).
            Current balance: {fmtMoney(bank.currentBalance)}
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Amount (RM) *</label>
            <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Date</label>
            <Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {isDeposit ? 'From Account (credit) *' : 'To Account (debit) *'}
            </label>
            <select className="w-full border rounded px-2 py-1.5" value={form.contraAccountId} onChange={e => setForm({ ...form, contraAccountId: e.target.value })}>
              <option value="">— Select account —</option>
              {contraAccounts.map((a: any) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name} ({a.type})</option>
              ))}
            </select>
            <div className="text-[10px] text-muted-foreground mt-0.5">
              {isDeposit
                ? 'The account the money is coming FROM (e.g. Revenue, Accounts Receivable)'
                : 'The account the money is going TO (e.g. Expense, Accounts Payable)'}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : `Record ${isDeposit ? 'Deposit' : 'Withdrawal'}`}</Button>
        </div>
      </div>
    </div>
  )
}

function BankAccountDialog({ facilityId, accounts, onClose, onSaved }: any) {
  useEscClose(onClose)
  const { bankAccountTypes } = useAppDropdowns(facilityId)
  const [form, setForm] = useState({
    name: '',
    type: 'BANK',
    bankName: '',
    accountNumber: '',
    branch: '',
    glAccountId: '',
    openingBalance: '0',
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.name) { toast.error('Name required'); return }
    if (!form.glAccountId) { toast.error('GL account required — link to a cash/bank account in the chart of accounts'); return }
    setSaving(true)
    try {
      await apiPost(withFacility('/api/data?type=bankAccounts', facilityId), { ...form, facilityId: facilityId || null })
      toast.success('Bank account created')
      onSaved()
    } catch (e: any) { toast.error(e.message) }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold">Add Bank Account</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Maybank Operating" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Type</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {(bankAccountTypes.length > 0 ? bankAccountTypes : ['BANK', 'CASH', 'SAVINGS']).map(t => (
                  <option key={t} value={t}>{t.charAt(0) + t.slice(1).toLowerCase()}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Bank Name</label>
              <Input value={form.bankName} onChange={e => setForm({ ...form, bankName: e.target.value })} placeholder="e.g. Maybank" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Account Number</label>
              <Input value={form.accountNumber} onChange={e => setForm({ ...form, accountNumber: e.target.value })} placeholder="e.g. 1234567890" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Branch</label>
              <Input value={form.branch} onChange={e => setForm({ ...form, branch: e.target.value })} />
            </div>
            <div className="col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">GL Account (cash/bank) *</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.glAccountId} onChange={e => setForm({ ...form, glAccountId: e.target.value })}>
                <option value="">— Select GL account —</option>
                {accounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Opening Balance</label>
              <Input type="number" step="0.01" value={form.openingBalance} onChange={e => setForm({ ...form, openingBalance: e.target.value })} />
            </div>
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

// ============ REPORTS ============
//
// Report types and their date-filter needs:
//   - trial_balance  → "As of" date (single date — balances AT that point)
//   - income_statement → Date range (start + end — activity WITHIN the period)
//   - balance_sheet  → "As of" date (snapshot AT that point)
//   - ar_aging       → "As of" date (outstanding invoices AT that point)
//
// The filter bar shows:
//   - Quick presets (This Month / Last Month / This Quarter / Last Quarter / This Year / Last Year / Custom)
//   - When "Custom" is selected: a date range picker (for income_statement) or a single
//     date picker (for the as-of reports)
//
// When no report is selected yet, the filter bar is hidden (no point filtering nothing).
// When a report IS selected, the filter bar appears above the report card so the user
// can adjust the period without going back to the report grid.

// Quick-preset definitions. Each returns a DateRangeValue (yyyy-MM-dd strings).
// For as-of reports, only `endDate` is used (the preset's end becomes the "as of" date).
const REPORT_DATE_PRESETS: Array<{ id: string; label: string; build: () => DateRangeValue }> = [
  {
    id: 'thisMonth',
    label: 'This Month',
    build: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
    },
  },
  {
    id: 'lastMonth',
    label: 'Last Month',
    build: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
    },
  },
  {
    id: 'thisQuarter',
    label: 'This Quarter',
    build: () => {
      const now = new Date()
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), q * 3, 1)
      const end = new Date(now.getFullYear(), q * 3 + 3, 0)
      return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
    },
  },
  {
    id: 'lastQuarter',
    label: 'Last Quarter',
    build: () => {
      const now = new Date()
      const q = Math.floor(now.getMonth() / 3)
      const start = new Date(now.getFullYear(), q * 3 - 3, 1)
      const end = new Date(now.getFullYear(), q * 3, 0)
      return { startDate: start.toISOString().slice(0, 10), endDate: end.toISOString().slice(0, 10) }
    },
  },
  {
    id: 'thisYear',
    label: 'This Year',
    build: () => {
      const y = new Date().getFullYear()
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` }
    },
  },
  {
    id: 'lastYear',
    label: 'Last Year',
    build: () => {
      const y = new Date().getFullYear() - 1
      return { startDate: `${y}-01-01`, endDate: `${y}-12-31` }
    },
  },
  {
    id: 'allTime',
    label: 'All Time',
    build: () => ({ startDate: '', endDate: '' }),
  },
]

// Reports that take a single "as of" date (vs. a date range)
const AS_OF_REPORTS = new Set(['trial_balance', 'balance_sheet', 'ar_aging'])

export function AccountingReports({ facilityId }: { facilityId?: string }) {
  const [reportType, setReportType] = useState<string>('')
  const [reportData, setReportData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  // Date filter state — defaults to "This Month" preset for the income statement,
  // and "today" for as-of reports. We store both startDate + endDate in one object
  // so the same state drives both the range picker (income_statement) and the
  // single-date picker (as-of reports, which only use endDate).
  const [dateRange, setDateRange] = useState<DateRangeValue>(() => {
    // Default to "This Month" — covers the most common case (current period P&L)
    const thisMonth = REPORT_DATE_PRESETS.find(p => p.id === 'thisMonth')!
    return thisMonth.build()
  })
  const [activePresetId, setActivePresetId] = useState<string>('thisMonth')
  const [showCustomRange, setShowCustomRange] = useState(false)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''

  // True when the current report uses a single "as of" date (vs. a range)
  const isAsOfReport = AS_OF_REPORTS.has(reportType)

  const runReport = async (type: string) => {
    setReportType(type)
    setLoading(true)
    setReportData(null)
    try {
      // Build query string based on report type:
      //   - As-of reports: pass ?asOf=endDate (single date)
      //   - Range reports: pass ?startDate=...&endDate=...
      //   - If user picked "All Time" (empty dates), omit the date params —
      //     the backend will default to "now" for as-of, or "this month" for range
      let dateQ = ''
      const isAsOf = AS_OF_REPORTS.has(type)
      if (isAsOf) {
        if (dateRange.endDate) dateQ = `&asOf=${dateRange.endDate}`
      } else {
        if (dateRange.startDate) dateQ += `&startDate=${dateRange.startDate}`
        if (dateRange.endDate) dateQ += `&endDate=${dateRange.endDate}`
      }
      const res = await fetch(`/api/accounting/reports?type=${type}${facilityParam}${dateQ}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`)
      setReportData(data)
    } catch (e: any) {
      toast.error(e.message)
    }
    setLoading(false)
  }

  // Apply a quick preset (This Month / Last Month / This Quarter / etc.)
  // Sets the date range + marks the preset as active + hides the custom picker
  const applyPreset = (presetId: string) => {
    const preset = REPORT_DATE_PRESETS.find(p => p.id === presetId)
    if (!preset) return
    setDateRange(preset.build())
    setActivePresetId(presetId)
    setShowCustomRange(false)
    // Re-run the current report with the new dates (if a report is selected)
    if (reportType) runReport(reportType)
  }

  // When the user picks a custom range via the calendar, switch off the preset
  // highlighting and re-run the report
  const onCustomRangeChange = (next: DateRangeValue) => {
    setDateRange(next)
    setActivePresetId('custom')
    if (reportType) runReport(reportType)
  }

  // When the user picks a single "as of" date via the date input
  const onAsOfDateChange = (dateStr: string) => {
    setDateRange({ startDate: dateStr, endDate: dateStr })
    setActivePresetId('custom')
    if (reportType) runReport(reportType)
  }

  const reports = [
    { type: 'trial_balance', label: 'Trial Balance', icon: BarChart3, desc: 'All accounts with debit/credit balances' },
    { type: 'income_statement', label: 'Income Statement (P&L)', icon: FileText, desc: 'Revenue − Expenses for a period' },
    { type: 'balance_sheet', label: 'Balance Sheet', icon: BookOpen, desc: 'Assets = Liabilities + Equity snapshot' },
    { type: 'ar_aging', label: 'Accounts Receivable Aging', icon: AlertTriangle, desc: 'Invoices grouped by how long unpaid' },
  ]

  // Human-readable summary of the current date filter (shown next to the report title)
  const dateSummary = useMemo(() => {
    if (!dateRange.startDate && !dateRange.endDate) return 'All time'
    if (isAsOfReport) {
      return dateRange.endDate ? `As of ${fmtDate(dateRange.endDate)}` : 'As of today'
    }
    if (dateRange.startDate && dateRange.endDate) {
      return `${fmtDate(dateRange.startDate)} → ${fmtDate(dateRange.endDate)}`
    }
    return 'Custom'
  }, [dateRange, isAsOfReport])

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {reports.map(r => (
          <Card key={r.type} className={`cursor-pointer hover:shadow-md transition-shadow ${reportType === r.type ? 'ring-2 ring-primary' : ''}`} onClick={() => runReport(r.type)}>
            <CardContent className="p-4">
              <r.icon className="h-5 w-5 text-primary mb-2" />
              <div className="font-medium text-sm">{r.label}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{r.desc}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Date filter bar — only shown after a report is selected */}
      {reportType && (
        <Card>
          <CardContent className="p-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground flex-shrink-0">
                <Calendar className="h-3.5 w-3.5" />
                <span>Date:</span>
              </div>

              {/* Quick presets — apply instantly + re-run report */}
              <div className="flex flex-wrap gap-1">
                {REPORT_DATE_PRESETS.map(p => (
                  <button
                    key={p.id}
                    onClick={() => applyPreset(p.id)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                      activePresetId === p.id && !showCustomRange
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border hover:bg-muted'
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowCustomRange(s => !s)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                    showCustomRange || activePresetId === 'custom'
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-muted'
                  }`}
                >
                  Custom
                </button>
              </div>

              {/* Custom date picker — shown when "Custom" is toggled on */}
              {showCustomRange && (
                <div className="flex items-center gap-2 flex-wrap">
                  {isAsOfReport ? (
                    // As-of reports: single date input
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground">As of:</span>
                      <Input
                        type="date"
                        value={dateRange.endDate || ''}
                        onChange={e => onAsOfDateChange(e.target.value)}
                        className="h-8 text-xs w-[150px]"
                      />
                    </div>
                  ) : (
                    // Range reports: full date range picker
                    <DateRangeFilter
                      value={dateRange}
                      onChange={onCustomRangeChange}
                      label="Period"
                      align="start"
                    />
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs"
                    onClick={() => { setShowCustomRange(false) }}
                  >
                    <X className="h-3 w-3 mr-1" /> Close
                  </Button>
                </div>
              )}

              {/* Current selection summary (always visible) */}
              <div className="text-xs text-muted-foreground ml-auto flex items-center gap-1">
                <Badge variant="outline" className="text-xs font-normal">{dateSummary}</Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {loading && <Card><CardContent className="p-8 text-center"><Loader2 className="h-6 w-6 animate-spin inline mr-2" /> Generating report...</CardContent></Card>}

      {reportData && !loading && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{reports.find(r => r.type === reportType)?.label}</CardTitle>
            <CardDescription>
              {reportData.asOfDate && `As of ${fmtDate(reportData.asOfDate)}`}
              {reportData.startDate && `Period: ${fmtDate(reportData.startDate)} to ${fmtDate(reportData.endDate)}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {reportType === 'trial_balance' && <TrialBalanceReport data={reportData} />}
            {reportType === 'income_statement' && <IncomeStatementReport data={reportData} />}
            {reportType === 'balance_sheet' && <BalanceSheetReport data={reportData} />}
            {reportType === 'ar_aging' && <ARAgingReport data={reportData} />}
          </CardContent>
        </Card>
      )}

      {!reportData && !loading && (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            <BarChart3 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
            Select a report above to generate it.
          </CardContent>
        </Card>
      )}
    </div>
  )
}

function TrialBalanceReport({ data }: { data: any }) {
  return (
    <div className="space-y-2">
      <table className="w-full text-sm">
        <thead className="bg-muted/50">
          <tr>
            <th className="text-left p-2">Code</th>
            <th className="text-left p-2">Account</th>
            <th className="text-left p-2">Type</th>
            <th className="text-right p-2">Debit</th>
            <th className="text-right p-2">Credit</th>
          </tr>
        </thead>
        <tbody>
          {data.rows.map((r: any, i: number) => (
            <tr key={i} className="border-t">
              <td className="p-2 font-mono text-xs">{r.code}</td>
              <td className="p-2">{r.name}</td>
              <td className="p-2"><Badge variant="outline" className="text-xs">{r.type}</Badge></td>
              <td className="p-2 text-right">{r.debitBalance > 0 ? fmtMoney(r.debitBalance) : ''}</td>
              <td className="p-2 text-right">{r.creditBalance > 0 ? fmtMoney(r.creditBalance) : ''}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 font-bold">
          <tr>
            <td colSpan={3} className="p-2 text-right">Totals:</td>
            <td className="p-2 text-right">{fmtMoney(data.totalDebits)}</td>
            <td className="p-2 text-right">{fmtMoney(data.totalCredits)}</td>
          </tr>
        </tfoot>
      </table>
      <div className={`text-center font-medium ${data.balanced ? 'text-emerald-600' : 'text-red-600'}`}>
        {data.balanced ? '✓ Trial balance is balanced' : `⚠ Out of balance by ${fmtMoney(Math.abs(data.totalDebits - data.totalCredits))}`}
      </div>
    </div>
  )
}

function IncomeStatementReport({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="font-semibold text-sm mb-1 text-emerald-600">REVENUE</div>
        <table className="w-full text-sm">
          <tbody>
            {data.revenue.rows.map((r: any, i: number) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-mono text-xs">{r.code}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right">{fmtMoney(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 font-bold">
            <tr><td colSpan={2} className="p-2 text-right">Total Revenue:</td><td className="p-2 text-right">{fmtMoney(data.revenue.total)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div>
        <div className="font-semibold text-sm mb-1 text-orange-600">EXPENSES</div>
        <table className="w-full text-sm">
          <tbody>
            {data.expenses.rows.map((r: any, i: number) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-mono text-xs">{r.code}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right">{fmtMoney(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 font-bold">
            <tr><td colSpan={2} className="p-2 text-right">Total Expenses:</td><td className="p-2 text-right">{fmtMoney(data.expenses.total)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className={`text-center text-lg font-bold p-3 rounded ${data.netIncome >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
        NET INCOME: {fmtMoney(data.netIncome)}
      </div>
    </div>
  )
}

function BalanceSheetReport({ data }: { data: any }) {
  return (
    <div className="space-y-4">
      <div>
        <div className="font-semibold text-sm mb-1 text-emerald-600">ASSETS</div>
        <table className="w-full text-sm">
          <tbody>
            {data.assets.rows.map((r: any, i: number) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-mono text-xs">{r.code}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right">{fmtMoney(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 font-bold">
            <tr><td colSpan={2} className="p-2 text-right">Total Assets:</td><td className="p-2 text-right">{fmtMoney(data.assets.total)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div>
        <div className="font-semibold text-sm mb-1 text-red-600">LIABILITIES</div>
        <table className="w-full text-sm">
          <tbody>
            {data.liabilities.rows.map((r: any, i: number) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-mono text-xs">{r.code}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right">{fmtMoney(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 font-bold">
            <tr><td colSpan={2} className="p-2 text-right">Total Liabilities:</td><td className="p-2 text-right">{fmtMoney(data.liabilities.total)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div>
        <div className="font-semibold text-sm mb-1 text-purple-600">EQUITY</div>
        <table className="w-full text-sm">
          <tbody>
            {data.equity.rows.map((r: any, i: number) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-mono text-xs">{r.code}</td>
                <td className="p-2">{r.name}</td>
                <td className="p-2 text-right">{fmtMoney(r.balance)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 font-bold">
            <tr><td colSpan={2} className="p-2 text-right">Total Equity:</td><td className="p-2 text-right">{fmtMoney(data.equity.total)}</td></tr>
            <tr><td colSpan={2} className="p-2 text-right">Total Liabilities + Equity:</td><td className="p-2 text-right">{fmtMoney(data.totalLiabilitiesAndEquity)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div className={`text-center font-medium ${data.balanced ? 'text-emerald-600' : 'text-red-600'}`}>
        {data.balanced ? '✓ Balance sheet balances (Assets = L + E)' : `⚠ Out of balance by ${fmtMoney(Math.abs(data.assets.total - data.totalLiabilitiesAndEquity))}`}
      </div>
    </div>
  )
}

function ARAgingReport({ data }: { data: any }) {
  const buckets = [
    { label: 'Current (0-30 days)', rows: data.buckets.current, total: data.totals.current },
    { label: '31-60 days', rows: data.buckets.days31_60, total: data.totals.days31_60 },
    { label: '61-90 days', rows: data.buckets.days61_90, total: data.totals.days61_90 },
    { label: '90+ days', rows: data.buckets.days90plus, total: data.totals.days90plus },
  ]
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {buckets.map((b, i) => (
          <Card key={i}>
            <CardContent className="p-3">
              <div className="text-xs text-muted-foreground">{b.label}</div>
              <div className="text-lg font-bold">{fmtMoney(b.total)}</div>
              <div className="text-[10px] text-muted-foreground">{b.rows.length} invoice(s)</div>
            </CardContent>
          </Card>
        ))}
        <Card className="bg-primary/5">
          <CardContent className="p-3">
            <div className="text-xs text-muted-foreground">Total Outstanding</div>
            <div className="text-lg font-bold text-red-600">{fmtMoney(data.totals.total)}</div>
          </CardContent>
        </Card>
      </div>
      {buckets.map((b, i) => b.rows.length > 0 && (
        <div key={i}>
          <div className="font-semibold text-sm mb-1">{b.label}</div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left p-2">Invoice</th>
                <th className="text-left p-2">Customer</th>
                <th className="text-left p-2">Issued</th>
                <th className="text-right p-2">Total</th>
                <th className="text-right p-2">Paid</th>
                <th className="text-right p-2">Balance</th>
                <th className="text-right p-2">Age (days)</th>
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r: any, j: number) => (
                <tr key={j} className="border-t">
                  <td className="p-2 font-mono text-xs">{r.invoiceNumber}</td>
                  <td className="p-2">{r.resident}</td>
                  <td className="p-2 text-xs">{fmtDate(r.issueDate)}</td>
                  <td className="p-2 text-right">{fmtMoney(r.total)}</td>
                  <td className="p-2 text-right text-emerald-600">{fmtMoney(r.paid)}</td>
                  <td className="p-2 text-right font-medium text-red-600">{fmtMoney(r.balance)}</td>
                  <td className="p-2 text-right text-xs">{r.ageDays}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}
