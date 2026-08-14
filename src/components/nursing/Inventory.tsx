'use client'

import { useState } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPost, apiPatch, apiDelete, withFacility } from './api'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Plus, Edit, Trash2, Search, Package, AlertTriangle,
  ArrowDownCircle, ArrowUpCircle, History, Boxes,
  ShoppingCart, Eye, CheckCircle, XCircle, Truck, FileText,
  ArrowRightLeft, Building2, Wallet, Loader2,
} from 'lucide-react'
import { fmtDate, fmtMoney } from '@/lib/types'
import { toast } from 'sonner'
import { useAppDropdowns } from './useAppDropdowns'
import { StandardSearchBar } from './StandardSearchBar'

// ============== INVENTORY MODULE SHELL ==============
// Wraps the items list + purchase orders + stock transfers in a tabbed layout.
export function Inventory({ facilityId }: { facilityId?: string }) {
  const [tab, setTab] = useState<'items' | 'purchaseOrders' | 'stockTransfers'>('items')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 overflow-x-auto border-b pb-px items-center scrollbar-thin">
        <button
          onClick={() => setTab('items')}
          className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
            tab === 'items'
              ? 'border-primary font-medium text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <Boxes className="h-3.5 w-3.5" /> Items
        </button>
        <button
          onClick={() => setTab('purchaseOrders')}
          className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
            tab === 'purchaseOrders'
              ? 'border-primary font-medium text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ShoppingCart className="h-3.5 w-3.5" /> Purchase Orders
        </button>
        <button
          onClick={() => setTab('stockTransfers')}
          className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors flex items-center gap-1.5 ${
            tab === 'stockTransfers'
              ? 'border-primary font-medium text-primary'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" /> Stock Transfers
        </button>
      </div>

      {tab === 'items' && <InventoryItems facilityId={facilityId} />}
      {tab === 'purchaseOrders' && <PurchaseOrders facilityId={facilityId} />}
      {tab === 'stockTransfers' && <StockTransfers facilityId={facilityId} />}
    </div>
  )
}

// ============== INVENTORY ITEMS (existing list) ==============
function InventoryItems({ facilityId }: { facilityId?: string }) {
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [filter, setFilter] = useState<'all' | 'low'>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [editItem, setEditItem] = useState<any | null>(null)
  const [adjustItem, setAdjustItem] = useState<any | null>(null)
  const [historyItem, setHistoryItem] = useState<any | null>(null)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=inventory${showInactive ? '&includeInactive=true' : ''}${facilityParam}`)

  if (loading) return <Skeleton className="h-96" />

  const allItems = data || []
  const lowStockItems = allItems.filter(i => i.currentStock <= i.reorderLevel)
  const displayItems = filter === 'low' ? lowStockItems : allItems

  const filtered = displayItems.filter(i => {
    if (!search) return true
    const s = search.toLowerCase()
    return i.name.toLowerCase().includes(s) ||
      i.sku?.toLowerCase().includes(s) ||
      i.category.toLowerCase().includes(s) ||
      i.location?.toLowerCase().includes(s)
  })

  // Group by category
  const byCategory: Record<string, any[]> = {}
  for (const i of filtered) {
    if (!byCategory[i.category]) byCategory[i.category] = []
    byCategory[i.category].push(i)
  }

  const totalValue = allItems.reduce((s, i) => s + i.currentStock * i.unitCost, 0)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Items</div>
          <div className="text-2xl font-bold">{allItems.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Low Stock</div>
          <div className="text-2xl font-bold text-amber-600">{lowStockItems.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Inventory Value</div>
          <div className="text-2xl font-bold text-emerald-600">{fmtMoney(totalValue)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Categories</div>
          <div className="text-2xl font-bold">{Object.keys(byCategory).length}</div>
        </CardContent></Card>
      </div>

      {/* Low stock alert */}
      {lowStockItems.length > 0 && filter !== 'low' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-medium text-amber-900">{lowStockItems.length} items need reordering:</span>{' '}
            <span className="text-amber-800">{lowStockItems.slice(0, 3).map(i => i.name).join(', ')}{lowStockItems.length > 3 && ` +${lowStockItems.length - 3} more`}</span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setFilter('low')}>View all</Button>
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <StandardSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by name, SKU, location, category..."
          totalCount={allItems.length}
          filteredCount={filtered.length}
        />
        <div className="flex gap-2 flex-wrap">
          <Button variant={filter === 'all' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('all')}>All</Button>
          <Button variant={filter === 'low' ? 'default' : 'outline'} size="sm" onClick={() => setFilter('low')}>
            <AlertTriangle className="h-3 w-3 mr-1" /> Low Stock ({lowStockItems.length})
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
            {showInactive ? 'Hide inactive' : 'Show inactive'}
          </Button>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> Add Item
          </Button>
        </div>
      </div>

      {/* Items by category */}
      {Object.entries(byCategory).map(([cat, list]) => (
        <Card key={cat}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Boxes className="h-4 w-4" /> {cat.charAt(0) + cat.slice(1).toLowerCase()}
              </span>
              <Badge variant="outline">{list.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Item</th>
                    <th className="text-left p-2 font-medium hidden md:table-cell">SKU</th>
                    <th className="text-left p-2 font-medium hidden lg:table-cell">Location</th>
                    <th className="text-right p-2 font-medium">Stock</th>
                    <th className="text-right p-2 font-medium hidden sm:table-cell">Reorder Level</th>
                    <th className="text-right p-2 font-medium hidden md:table-cell">Value</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(i => {
                    const isLow = i.currentStock <= i.reorderLevel
                    const isOut = i.currentStock <= 0
                    return (
                      <tr key={i.id} className={`border-t hover:bg-muted/30 ${!i.active ? 'opacity-60' : ''}`}>
                        <td className="p-2">
                          <div className="font-medium">
                            {i.code && <span className="text-xs font-mono text-primary mr-1">{i.code}</span>}
                            {i.name}
                          </div>
                          {i.supplier && <div className="text-xs text-muted-foreground">{i.supplier}</div>}
                        </td>
                        <td className="p-2 text-xs font-mono hidden md:table-cell">{i.sku || '—'}</td>
                        <td className="p-2 text-xs hidden lg:table-cell">{i.location || '—'}</td>
                        <td className={`p-2 text-right font-medium ${isLow ? 'text-amber-600' : ''}`}>
                          {i.currentStock} <span className="text-xs text-muted-foreground font-normal">{i.unit}</span>
                        </td>
                        <td className="p-2 text-right text-xs hidden sm:table-cell">{i.reorderLevel}</td>
                        <td className="p-2 text-right text-xs hidden md:table-cell">{fmtMoney(i.currentStock * i.unitCost)}</td>
                        <td className="p-2">
                          {isOut ? (
                            <Badge variant="destructive" className="text-xs">Out of stock</Badge>
                          ) : isLow ? (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-200 text-xs">Low</Badge>
                          ) : (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">OK</Badge>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-blue-600" title="Stock in/out" onClick={() => setAdjustItem(i)}>
                            <ArrowUpCircle className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="History" onClick={() => setHistoryItem(i)}>
                            <History className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => setEditItem(i)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" title="Delete" onClick={async () => {
                            if (confirm(`Delete "${i.name}"? This also deletes its transaction history.`)) {
                              try {
                                await apiDelete(`/api/data?type=inventory&id=${i.id}`)
                                toast.success('Item deleted')
                                refetch()
                              } catch (e: any) { toast.error(e.message) }
                            }
                          }}>
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
      ))}

      {filtered.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No inventory items found.</p>
          </CardContent>
        </Card>
      )}

      {showAdd && <ItemDialog mode="add" facilityId={facilityId} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refetch() }} />}
      {editItem && <ItemDialog mode="edit" item={editItem} facilityId={facilityId} onClose={() => setEditItem(null)} onSaved={() => { setEditItem(null); refetch() }} />}
      {adjustItem && <AdjustStockDialog item={adjustItem} facilityId={facilityId} onClose={() => setAdjustItem(null)} onSaved={() => { setAdjustItem(null); refetch() }} />}
      {historyItem && <HistoryDialog item={historyItem} facilityId={facilityId} onClose={() => setHistoryItem(null)} />}
    </div>
  )
}

function ItemDialog({ mode, item, facilityId, onClose, onSaved }: { mode: 'add' | 'edit'; item?: any; facilityId?: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const { inventoryCategories, inventoryUnits } = useAppDropdowns(facilityId)
  const [form, setForm] = useState<any>({
    name: item?.name || '',
    category: item?.category || 'MEDICAL',
    sku: item?.sku || '',
    unit: item?.unit || 'each',
    currentStock: item?.currentStock ?? 0,
    reorderLevel: item?.reorderLevel ?? 10,
    reorderQty: item?.reorderQty ?? 50,
    location: item?.location || '',
    unitCost: item?.unitCost ?? 0,
    supplier: item?.supplier || '',
    notes: item?.notes || '',
    active: item?.active ?? true,
  })
  const [saving, setSaving] = useState(false)

  const submit = async () => {
    if (!form.name) { toast.error('Name required'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        category: form.category,
        sku: form.sku || null,
        unit: form.unit,
        currentStock: parseFloat(form.currentStock) || 0,
        reorderLevel: parseFloat(form.reorderLevel) || 0,
        reorderQty: parseFloat(form.reorderQty) || 0,
        location: form.location || null,
        unitCost: parseFloat(form.unitCost) || 0,
        supplier: form.supplier || null,
        notes: form.notes || null,
        active: form.active,
      }
      if (mode === 'add') {
        await apiPost('/api/data?type=inventory', { ...payload, lastCountDate: new Date().toISOString(), facilityId: facilityId || null })
        toast.success('Item added')
      } else {
        await apiPatch(`/api/data?type=inventory&id=${item.id}`, payload)
        toast.success('Item updated')
      }
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2"><Package className="h-4 w-4" /> {mode === 'add' ? 'Add Inventory Item' : 'Edit Item'}</h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Disposable Gloves" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
            <select className="w-full border rounded px-2 py-1.5" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
              {inventoryCategories.map(c => <option key={c} value={c}>{c.charAt(0) + c.slice(1).toLowerCase()}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">SKU</label>
            <Input value={form.sku} onChange={e => setForm({ ...form, sku: e.target.value })} placeholder="e.g. MED-GLV-001" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit</label>
            <select className="w-full border rounded px-2 py-1.5" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
              {inventoryUnits.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Location</label>
            <Input value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Store Room A" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Current Stock</label>
            <Input type="number" step="0.01" value={form.currentStock} onChange={e => setForm({ ...form, currentStock: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Reorder Level</label>
            <Input type="number" step="0.01" value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Reorder Qty</label>
            <Input type="number" step="0.01" value={form.reorderQty} onChange={e => setForm({ ...form, reorderQty: e.target.value })} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit Cost ($)</label>
            <Input type="number" step="0.01" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Supplier</label>
            <Input value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
            <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : (mode === 'add' ? 'Add Item' : 'Save Changes')}</Button>
        </div>
      </div>
    </div>
  )
}

function AdjustStockDialog({ item, facilityId, onClose, onSaved }: { item: any; facilityId?: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const [type, setType] = useState<'STOCK_IN' | 'STOCK_OUT' | 'ADJUSTMENT'>('STOCK_IN')
  const [quantity, setQuantity] = useState('0')
  const [reason, setReason] = useState('')
  const [saving, setSaving] = useState(false)

  const qty = parseFloat(quantity) || 0
  const effectiveQty = type === 'STOCK_OUT' ? -Math.abs(qty) : type === 'ADJUSTMENT' ? qty : Math.abs(qty)
  const newStock = item.currentStock + effectiveQty

  const submit = async () => {
    if (qty <= 0 && type !== 'ADJUSTMENT') { toast.error('Quantity must be greater than 0'); return }
    setSaving(true)
    try {
      await apiPost('/api/data?type=inventoryTransactions', {
        itemId: item.id,
        type,
        quantity: effectiveQty,
        reason: reason || null,
        date: new Date().toISOString(),
      })
      toast.success('Stock adjusted')
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-md my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2">
            <ArrowUpCircle className="h-4 w-4" /> Adjust Stock
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div className="rounded-md bg-muted/50 p-3">
            <div className="font-medium">{item.name}</div>
            <div className="text-xs text-muted-foreground mt-0.5">Current stock: {item.currentStock} {item.unit}</div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Transaction Type</label>
            <div className="grid grid-cols-3 gap-1">
              <button onClick={() => setType('STOCK_IN')} className={`px-2 py-1.5 rounded-md border text-xs font-medium ${type === 'STOCK_IN' ? 'bg-emerald-100 border-emerald-300 text-emerald-700' : 'border-border'}`}>
                <ArrowDownCircle className="h-3 w-3 inline mr-1" />Stock In
              </button>
              <button onClick={() => setType('STOCK_OUT')} className={`px-2 py-1.5 rounded-md border text-xs font-medium ${type === 'STOCK_OUT' ? 'bg-rose-100 border-rose-300 text-rose-700' : 'border-border'}`}>
                <ArrowUpCircle className="h-3 w-3 inline mr-1" />Stock Out
              </button>
              <button onClick={() => setType('ADJUSTMENT')} className={`px-2 py-1.5 rounded-md border text-xs font-medium ${type === 'ADJUSTMENT' ? 'bg-blue-100 border-blue-300 text-blue-700' : 'border-border'}`}>
                Adjust
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">
              {type === 'ADJUSTMENT' ? 'New stock level' : 'Quantity'} ({item.unit})
            </label>
            <Input type="number" step="0.01" value={quantity} onChange={e => setQuantity(e.target.value)} />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason</label>
            <Input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Monthly restock, Used for room 105" />
          </div>
          <div className="rounded-md bg-muted/50 p-2 text-sm flex justify-between">
            <span className="text-muted-foreground">New stock level:</span>
            <span className={`font-medium ${newStock < 0 ? 'text-red-600' : newStock <= item.reorderLevel ? 'text-amber-600' : 'text-emerald-600'}`}>
              {newStock} {item.unit}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || newStock < 0}>{saving ? 'Saving...' : 'Adjust Stock'}</Button>
        </div>
      </div>
    </div>
  )
}

function HistoryDialog({ item, facilityId, onClose }: { item: any; facilityId?: string; onClose: () => void }) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading } = useFetch<any[]>(`/api/data?type=inventoryTransactions&itemId=${item.id}${facilityParam}`)
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-2xl my-8">
        <div className="flex justify-between items-center border-b p-4">
          <h3 className="font-semibold flex items-center gap-2">
            <History className="h-4 w-4" /> Transaction History — {item.name}
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4">
          {loading ? (
            <Skeleton className="h-48" />
          ) : (data || []).length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-8">No transactions yet</p>
          ) : (
            <div className="max-h-96 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 sticky top-0">
                  <tr>
                    <th className="text-left p-2 font-medium">Date</th>
                    <th className="text-left p-2 font-medium">Type</th>
                    <th className="text-right p-2 font-medium">Qty</th>
                    <th className="text-left p-2 font-medium">Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {(data || []).map(t => (
                    <tr key={t.id} className="border-t">
                      <td className="p-2 text-xs">{fmtDate(t.date, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className="p-2">
                        <Badge variant="outline" className={
                          t.type === 'STOCK_IN' ? 'bg-emerald-100 text-emerald-700' :
                          t.type === 'STOCK_OUT' ? 'bg-rose-100 text-rose-700' :
                          'bg-blue-100 text-blue-700'
                        }>{t.type.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className={`p-2 text-right font-medium ${t.quantity > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {t.quantity > 0 ? '+' : ''}{t.quantity}
                      </td>
                      <td className="p-2 text-xs text-muted-foreground">{t.reason || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ============== PURCHASE ORDERS LIST ==============
const PO_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  SUBMITTED: 'bg-blue-100 text-blue-700 border-blue-200',
  RECEIVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200',
}

const PAYMENT_STATUS_COLORS: Record<string, string> = {
  UNPAID: 'bg-rose-100 text-rose-700 border-rose-200',
  PARTIAL: 'bg-amber-100 text-amber-700 border-amber-200',
  PAID: 'bg-emerald-100 text-emerald-700 border-emerald-200',
}

const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CHEQUE', 'CARD', 'ONLINE', 'CREDIT']

function PurchaseOrders({ facilityId }: { facilityId?: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=purchaseOrders${facilityParam}`)
  // Fetch accessible facilities so we can show the facility name in the table.
  // /api/facilities/accessible is auto-scoped to the user's org, so it returns all
  // facilities the user is allowed to see (used for resolving facilityId → name).
  const { data: facData } = useFetch<any>('/api/facilities/accessible')
  const facilities = facData?.facilities || []
  const facilityName = (fid: string | null | undefined) => fid
    ? (facilities.find(f => f.id === fid)?.name || fid.slice(0, 8))
    : '—'
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showAdd, setShowAdd] = useState(false)
  const [viewPo, setViewPo] = useState<any | null>(null)
  const [payingPo, setPayingPo] = useState<any | null>(null)

  if (loading) return <Skeleton className="h-96" />

  const allPos = data || []
  const filtered = allPos.filter(po => {
    if (statusFilter !== 'all' && po.status !== statusFilter) return false
    if (!search) return true
    const s = search.toLowerCase()
    return po.poNumber?.toLowerCase().includes(s) ||
      po.vendor?.name?.toLowerCase().includes(s) ||
      po.notes?.toLowerCase().includes(s) ||
      facilityName(po.facilityId).toLowerCase().includes(s)
  })

  // Summary cards
  const total = allPos.reduce((s, po) => s + (po.status === 'RECEIVED' ? po.total : 0), 0)
  const pending = allPos.filter(po => po.status === 'DRAFT' || po.status === 'SUBMITTED').length
  const received = allPos.filter(po => po.status === 'RECEIVED').length
  const unpaid = allPos.filter(po => po.paymentStatus === 'UNPAID' || po.paymentStatus === 'PARTIAL')
    .reduce((s, po) => s + (po.total - po.paidAmount), 0)

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total POs</div>
          <div className="text-2xl font-bold">{allPos.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Pending</div>
          <div className="text-2xl font-bold text-blue-600">{pending}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Received (Value)</div>
          <div className="text-2xl font-bold text-emerald-600">{fmtMoney(total)}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Unpaid Balance</div>
          <div className="text-2xl font-bold text-amber-600">{fmtMoney(unpaid)}</div>
        </CardContent></Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <StandardSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by PO #, vendor, notes..."
          totalCount={allPos.length}
          filteredCount={filtered.length}
        />
        <div className="flex gap-2 flex-wrap">
          <select
            className="border rounded px-2 py-1.5 text-sm"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="SUBMITTED">Submitted</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <Button size="sm" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4 mr-1" /> New PO
          </Button>
        </div>
      </div>

      {/* PO list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ShoppingCart className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No purchase orders yet.</p>
            <p className="text-xs mt-1">Click "New PO" to create one — link a vendor, add line items, and post to accounting automatically when received.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">PO #</th>
                    <th className="text-left p-2 font-medium hidden md:table-cell">Order Date</th>
                    <th className="text-left p-2 font-medium">Facility</th>
                    <th className="text-left p-2 font-medium">Vendor</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium hidden sm:table-cell">Payment</th>
                    <th className="text-right p-2 font-medium">Total</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(po => (
                    <tr key={po.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setViewPo(po)}>
                      <td className="p-2 font-mono text-xs text-primary">{po.poNumber}</td>
                      <td className="p-2 text-xs hidden md:table-cell">{fmtDate(po.orderDate)}</td>
                      <td className="p-2">
                        <div className="text-xs font-medium flex items-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {facilityName(po.facilityId)}
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="font-medium">{po.vendor?.name || <span className="text-muted-foreground italic">No vendor</span>}</div>
                        {po.lines?.length > 0 && (
                          <div className="text-xs text-muted-foreground">{po.lines.length} line item{po.lines.length === 1 ? '' : 's'}</div>
                        )}
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className={`text-xs ${PO_STATUS_COLORS[po.status] || ''}`}>{po.status}</Badge>
                      </td>
                      <td className="p-2 hidden sm:table-cell">
                        <Badge variant="outline" className={`text-xs ${PAYMENT_STATUS_COLORS[po.paymentStatus] || ''}`}>{po.paymentStatus}</Badge>
                      </td>
                      <td className="p-2 text-right font-medium">{fmtMoney(po.total)}</td>
                      <td className="p-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        {po.status !== 'RECEIVED' && po.status !== 'CANCELLED' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-emerald-600"
                            title="Mark as Received (posts to accounting + updates stock)"
                            onClick={async () => {
                              if (!confirm(`Receive PO ${po.poNumber}? This will:\n• Add ${po.lines?.length || 0} item(s) to inventory\n• Post a journal entry to accounting\n• Mark the PO as Received`)) return
                              try {
                                await apiPatch(withFacility(`/api/data?type=purchaseOrders&id=${po.id}`, facilityId), { status: 'RECEIVED' })
                                toast.success(`PO ${po.poNumber} received — inventory updated, journal entry posted`)
                                refetch()
                              } catch (e: any) { toast.error(e.message) }
                            }}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" /> Receive
                          </Button>
                        )}
                        {po.status === 'RECEIVED' && (po.paymentStatus === 'UNPAID' || po.paymentStatus === 'PARTIAL') && (
                          <Button
                            size="sm"
                            variant="default"
                            className="h-7 px-2 mr-1"
                            title={`Pay ${fmtMoney(po.total - (po.paidAmount || 0))} outstanding (posts Dr AP / Cr Cash JE)`}
                            onClick={() => setPayingPo(po)}
                          >
                            <Wallet className="h-3 w-3 mr-1" /> Pay
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="View" onClick={() => setViewPo(po)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        {(po.status === 'DRAFT' || po.status === 'SUBMITTED') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-rose-600"
                            title="Cancel PO"
                            onClick={async () => {
                              if (!confirm(`Cancel PO ${po.poNumber}?`)) return
                              try {
                                await apiPatch(withFacility(`/api/data?type=purchaseOrders&id=${po.id}`, facilityId), { status: 'CANCELLED' })
                                toast.success(`PO ${po.poNumber} cancelled`)
                                refetch()
                              } catch (e: any) { toast.error(e.message) }
                            }}
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showAdd && (
        <PurchaseOrderDialog
          facilityId={facilityId}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); refetch() }}
        />
      )}
      {viewPo && (
        <ViewPurchaseOrderDialog
          po={viewPo}
          facilityId={facilityId}
          onClose={() => setViewPo(null)}
          onUpdated={() => { setViewPo(null); refetch() }}
          onPay={(p) => { setViewPo(null); setPayingPo(p) }}
        />
      )}
      {payingPo && (
        <PayPurchaseOrderDialog
          po={payingPo}
          facilityId={facilityId}
          onClose={() => setPayingPo(null)}
          onSaved={() => { setPayingPo(null); refetch() }}
        />
      )}
    </div>
  )
}

// ============== PURCHASE ORDER CREATE/EDIT DIALOG ==============
function PurchaseOrderDialog({ facilityId, onClose, onSaved }: { facilityId?: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  // Fetch vendors (from accounting) and products (from product catalogue) and inventory items
  const { data: vendors } = useFetch<any[]>(`/api/data?type=vendors${facilityParam}`)
  const { data: products } = useFetch<any[]>(`/api/data?type=products${facilityParam}`)
  const { data: inventoryItems } = useFetch<any[]>(`/api/data?type=inventory&includeInactive=true${facilityParam}`)

  const [vendorId, setVendorId] = useState('')
  const [orderDate, setOrderDate] = useState(new Date().toISOString().slice(0, 10))
  const [expectedDate, setExpectedDate] = useState('')
  const [paymentMethod, setPaymentMethod] = useState('CREDIT')
  const [paidAmount, setPaidAmount] = useState('0')
  const [tax, setTax] = useState('0')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState<Array<{
    itemId?: string
    productId?: string
    description: string
    quantity: string
    unitPrice: string
  }>>([{ description: '', quantity: '1', unitPrice: '0' }])
  const [saving, setSaving] = useState(false)

  const round2 = (n: number) => Math.round(n * 100) / 100
  const subtotal = round2(lines.reduce((s, l) => s + (parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0), 0))
  const taxAmount = round2(parseFloat(tax) || 0)
  const total = round2(subtotal + taxAmount)

  const updateLine = (idx: number, field: string, value: any) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  const addLine = () => {
    setLines(prev => [...prev, { description: '', quantity: '1', unitPrice: '0' }])
  }

  const removeLine = (idx: number) => {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  // When a product is selected from dropdown, auto-fill description + unitPrice
  const onProductChange = (idx: number, productId: string) => {
    const product = (products || []).find(p => p.id === productId)
    if (product) {
      setLines(prev => prev.map((l, i) => i === idx ? {
        ...l,
        productId,
        itemId: undefined, // a product line is not auto-linked to inventory
        description: product.name,
        unitPrice: String(product.unitPrice || 0),
      } : l))
    } else {
      updateLine(idx, 'productId', undefined)
    }
  }

  // When an inventory item is selected, auto-fill description + unitCost
  const onItemChange = (idx: number, itemId: string) => {
    const item = (inventoryItems || []).find(i => i.id === itemId)
    if (item) {
      setLines(prev => prev.map((l, i) => i === idx ? {
        ...l,
        itemId,
        productId: undefined,
        description: item.name,
        unitPrice: String(item.unitCost || 0),
      } : l))
    } else {
      updateLine(idx, 'itemId', undefined)
    }
  }

  const submit = async () => {
    const validLines = lines.filter(l => (l.description || l.itemId || l.productId) && (parseFloat(l.quantity) || 0) > 0)
    if (validLines.length === 0) { toast.error('Add at least 1 line item with a description and quantity > 0'); return }
    setSaving(true)
    try {
      const payload: any = {
        vendorId: vendorId || null,
        orderDate,
        expectedDate: expectedDate || null,
        paymentMethod,
        paidAmount: parseFloat(paidAmount) || 0,
        tax: taxAmount,
        notes: notes || null,
        status: 'DRAFT',
        lines: validLines.map(l => ({
          itemId: l.itemId || null,
          productId: l.productId || null,
          description: l.description || '',
          quantity: parseFloat(l.quantity) || 0,
          unitPrice: parseFloat(l.unitPrice) || 0,
        })),
        facilityId: facilityId || null,
      }
      const res = await apiPost(withFacility('/api/data?type=purchaseOrders', facilityId), payload)
      toast.success(`PO ${res.poNumber} created as Draft`)
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-4xl my-8">
        <div className="flex justify-between items-center border-b p-4 sticky top-0 bg-background z-10">
          <h3 className="font-semibold flex items-center gap-2">
            <ShoppingCart className="h-4 w-4" /> New Purchase Order
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-4">
          {/* Header fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Vendor (from Accounting)</label>
              <select
                className="w-full border rounded px-2 py-1.5"
                value={vendorId}
                onChange={e => setVendorId(e.target.value)}
              >
                <option value="">— No vendor —</option>
                {(vendors || []).map(v => (
                  <option key={v.id} value={v.id}>
                    {v.code} — {v.name}{v.paymentTerms ? ` (${v.paymentTerms})` : ''}
                  </option>
                ))}
              </select>
              {(vendors || []).length === 0 && (
                <p className="text-xs text-amber-600 mt-1">No vendors yet. Add them in Accounting → Vendors.</p>
              )}
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Order Date</label>
              <Input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Expected Date</label>
              <Input type="date" value={expectedDate} onChange={e => setExpectedDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Method</label>
              <select
                className="w-full border rounded px-2 py-1.5"
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
              >
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
          </div>

          {/* Line items */}
          <div className="border rounded-md">
            <div className="bg-muted/50 px-3 py-2 text-xs font-medium flex items-center justify-between">
              <span>Line Items</span>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={addLine}>
                <Plus className="h-3 w-3 mr-1" /> Add Line
              </Button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {lines.map((l, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1.5 p-2 border-t text-xs items-end">
                  <div className="col-span-12 md:col-span-3">
                    <label className="text-[10px] text-muted-foreground">Inventory Item (optional)</label>
                    <select
                      className="w-full border rounded px-1.5 py-1 text-xs"
                      value={l.itemId || ''}
                      onChange={e => e.target.value ? onItemChange(idx, e.target.value) : updateLine(idx, 'itemId', undefined)}
                    >
                      <option value="">— none —</option>
                      {(inventoryItems || []).map(i => (
                        <option key={i.id} value={i.id}>{i.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <label className="text-[10px] text-muted-foreground">Product (optional)</label>
                    <select
                      className="w-full border rounded px-1.5 py-1 text-xs"
                      value={l.productId || ''}
                      onChange={e => e.target.value ? onProductChange(idx, e.target.value) : updateLine(idx, 'productId', undefined)}
                    >
                      <option value="">— none —</option>
                      {(products || []).map(p => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="col-span-12 md:col-span-3">
                    <label className="text-[10px] text-muted-foreground">Description</label>
                    <Input
                      className="h-7 text-xs"
                      value={l.description}
                      onChange={e => updateLine(idx, 'description', e.target.value)}
                      placeholder="Auto-filled, or type custom"
                    />
                  </div>
                  <div className="col-span-4 md:col-span-1">
                    <label className="text-[10px] text-muted-foreground">Qty</label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-7 text-xs"
                      value={l.quantity}
                      onChange={e => updateLine(idx, 'quantity', e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-1">
                    <label className="text-[10px] text-muted-foreground">Unit Price</label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-7 text-xs"
                      value={l.unitPrice}
                      onChange={e => updateLine(idx, 'unitPrice', e.target.value)}
                    />
                  </div>
                  <div className="col-span-3 md:col-span-1 text-right">
                    <label className="text-[10px] text-muted-foreground">Total</label>
                    <div className="font-medium pt-1">
                      {fmtMoney((parseFloat(l.quantity) || 0) * (parseFloat(l.unitPrice) || 0))}
                    </div>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {lines.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-600"
                        onClick={() => removeLine(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Totals + notes */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
              <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional PO notes..." />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Tax</label>
                  <Input type="number" step="0.01" value={tax} onChange={e => setTax(e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1 block">Paid Amount</label>
                  <Input type="number" step="0.01" value={paidAmount} onChange={e => setPaidAmount(e.target.value)} />
                </div>
              </div>
            </div>
            <div className="rounded-md border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">{fmtMoney(subtotal)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium">{fmtMoney(taxAmount)}</span>
              </div>
              <div className="flex justify-between border-t pt-1.5">
                <span className="font-medium">Total</span>
                <span className="font-bold text-base">{fmtMoney(total)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Paid</span>
                <span className="font-medium">{fmtMoney(parseFloat(paidAmount) || 0)}</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Balance Due</span>
                <span className={`font-medium ${total - (parseFloat(paidAmount) || 0) > 0.01 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  {fmtMoney(total - (parseFloat(paidAmount) || 0))}
                </span>
              </div>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-2 p-4 border-t sticky bottom-0 bg-background">
          <p className="text-xs text-muted-foreground">
            <FileText className="h-3 w-3 inline mr-1" />
            PO will be saved as <strong>Draft</strong>. Click <em>Receive</em> on the PO row later to update inventory + post to accounting.
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Create PO'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== VIEW PURCHASE ORDER DIALOG ==============
function ViewPurchaseOrderDialog({ po, facilityId, onClose, onUpdated, onPay }: { po: any; facilityId?: string; onClose: () => void; onUpdated: () => void; onPay?: (po: any) => void }) {
  useEscClose(onClose)
  // Re-fetch the PO with full details (including journal entry if posted)
  const { data: fullPo, loading, refetch } = useFetch<any>(`/api/data?type=purchaseOrders&id=${po.id}${facilityId ? `&facilityId=${facilityId}` : ''}`)
  // Fetch facilities so we can show the facility name in the dialog header
  const { data: facData } = useFetch<any>('/api/facilities/accessible')
  const facilities = facData?.facilities || []
  const facilityName = (fid: string | null | undefined) => fid
    ? (facilities.find(f => f.id === fid)?.name || fid.slice(0, 8))
    : '—'

  if (loading) return <Skeleton className="h-96" />
  const p = fullPo || po

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-4xl my-8">
        <div className="flex justify-between items-center border-b p-4 sticky top-0 bg-background z-10">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" /> {p.poNumber}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
              <span className="flex items-center gap-1"><Building2 className="h-3 w-3" /> {facilityName(p.facilityId)}</span>
              <span>•</span>
              <span>{fmtDate(p.orderDate)}</span>
              <span>•</span>
              <span>{p.vendor ? `${p.vendor.code} — ${p.vendor.name}` : 'No vendor'}</span>
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={PO_STATUS_COLORS[p.status] || ''}>
              {p.status === 'RECEIVED' && <CheckCircle className="h-3 w-3 mr-1" />}
              {p.status === 'CANCELLED' && <XCircle className="h-3 w-3 mr-1" />}
              {p.status}
            </Badge>
            <Badge variant="outline" className={PAYMENT_STATUS_COLORS[p.paymentStatus] || ''}>
              {p.paymentStatus}
            </Badge>
            {p.paymentMethod && (
              <Badge variant="outline" className="text-xs">{p.paymentMethod.replace(/_/g, ' ')}</Badge>
            )}
            {p.journalEntryId && (
              <Badge variant="outline" className="bg-violet-100 text-violet-700 border-violet-200 text-xs">
                <FileText className="h-3 w-3 mr-1" /> JE posted
              </Badge>
            )}
          </div>

          {/* Line items */}
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Description</th>
                  <th className="text-left p-2 font-medium hidden sm:table-cell">Linked</th>
                  <th className="text-right p-2 font-medium">Qty</th>
                  <th className="text-right p-2 font-medium">Unit Price</th>
                  <th className="text-right p-2 font-medium">Total</th>
                  {p.status === 'RECEIVED' && <th className="text-right p-2 font-medium">Received</th>}
                </tr>
              </thead>
              <tbody>
                {(p.lines || []).map((l: any) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2">{l.description || <span className="text-muted-foreground italic">No description</span>}</td>
                    <td className="p-2 text-xs hidden sm:table-cell">
                      {l.item ? <Badge variant="outline" className="text-xs"><Boxes className="h-3 w-3 mr-1" />{l.item.name}</Badge>
                        : l.product ? <Badge variant="outline" className="text-xs"><Package className="h-3 w-3 mr-1" />{l.product.name}</Badge>
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="p-2 text-right">{l.quantity}</td>
                    <td className="p-2 text-right">{fmtMoney(l.unitPrice)}</td>
                    <td className="p-2 text-right font-medium">{fmtMoney(l.total)}</td>
                    {p.status === 'RECEIVED' && (
                      <td className="p-2 text-right text-xs text-emerald-700">
                        {l.receivedQty >= l.quantity ? <CheckCircle className="h-3 w-3 inline mr-1" /> : null}
                        {l.receivedQty} / {l.quantity}
                      </td>
                    )}
                  </tr>
                ))}
                {(p.lines || []).length === 0 && (
                  <tr><td colSpan={p.status === 'RECEIVED' ? 6 : 5} className="p-6 text-center text-muted-foreground text-sm">No line items</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              {p.notes && (
                <div className="rounded-md bg-muted/30 p-3 text-sm">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Notes</div>
                  {p.notes}
                </div>
              )}
              {p.receivedDate && (
                <div className="mt-2 text-xs text-emerald-700 flex items-center gap-1">
                  <Truck className="h-3 w-3" /> Received on {fmtDate(p.receivedDate)}
                </div>
              )}
              {p.expectedDate && (
                <div className="mt-1 text-xs text-muted-foreground">Expected: {fmtDate(p.expectedDate)}</div>
              )}
            </div>
            <div className="rounded-md border p-3 space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtMoney(p.subtotal)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tax</span><span>{fmtMoney(p.tax)}</span></div>
              <div className="flex justify-between border-t pt-1.5"><span className="font-medium">Total</span><span className="font-bold">{fmtMoney(p.total)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Paid</span><span>{fmtMoney(p.paidAmount)}</span></div>
              <div className="flex justify-between text-xs"><span className="text-muted-foreground">Balance</span><span className={p.total - p.paidAmount > 0.01 ? 'text-amber-600 font-medium' : 'text-emerald-600 font-medium'}>{fmtMoney(p.total - p.paidAmount)}</span></div>
            </div>
          </div>

          {/* Linked Journal Entry */}
          {p.journalEntry && (
            <div>
              <h4 className="text-sm font-semibold mb-2 flex items-center gap-1.5">
                <FileText className="h-3.5 w-3.5" /> Linked Journal Entry: {p.journalEntry.entryNumber}
              </h4>
              <div className="border rounded-md overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2 font-medium">Account</th>
                      <th className="text-left p-2 font-medium hidden md:table-cell">Description</th>
                      <th className="text-right p-2 font-medium">Debit</th>
                      <th className="text-right p-2 font-medium">Credit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.journalEntry.lines?.map((l: any) => (
                      <tr key={l.id} className="border-t">
                        <td className="p-2 font-mono text-xs">{l.account?.code} — {l.account?.name}</td>
                        <td className="p-2 text-xs text-muted-foreground hidden md:table-cell">{l.description || '—'}</td>
                        <td className="p-2 text-right font-medium">{l.debit > 0 ? fmtMoney(l.debit) : '—'}</td>
                        <td className="p-2 text-right font-medium">{l.credit > 0 ? fmtMoney(l.credit) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          {p.status !== 'RECEIVED' && p.status !== 'CANCELLED' && (
            <Button
              variant="default"
              onClick={async () => {
                if (!confirm(`Receive PO ${p.poNumber}? This will update inventory + post to accounting.`)) return
                try {
                  await apiPatch(withFacility(`/api/data?type=purchaseOrders&id=${p.id}`, facilityId), { status: 'RECEIVED' })
                  toast.success(`PO ${p.poNumber} received`)
                  refetch()
                  onUpdated()
                } catch (e: any) { toast.error(e.message) }
              }}
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Mark as Received
            </Button>
          )}
          {p.status === 'RECEIVED' && (p.paymentStatus === 'UNPAID' || p.paymentStatus === 'PARTIAL') && (
            <Button
              variant="default"
              onClick={() => onPay(p)}
            >
              <Wallet className="h-3.5 w-3.5 mr-1" /> Pay {fmtMoney(p.total - (p.paidAmount || 0))}
            </Button>
          )}
          {(p.status === 'DRAFT' || p.status === 'SUBMITTED') && (
            <Button
              variant="outline"
              className="text-rose-600"
              onClick={async () => {
                if (!confirm(`Cancel PO ${p.poNumber}?`)) return
                try {
                  await apiPatch(withFacility(`/api/data?type=purchaseOrders&id=${p.id}`, facilityId), { status: 'CANCELLED' })
                  toast.success(`PO ${p.poNumber} cancelled`)
                  refetch()
                  onUpdated()
                } catch (e: any) { toast.error(e.message) }
              }}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel PO
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

// ============== STOCK TRANSFERS LIST ==============
const TRANSFER_STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  IN_TRANSIT: 'bg-blue-100 text-blue-700 border-blue-200',
  RECEIVED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CANCELLED: 'bg-rose-100 text-rose-700 border-rose-200',
}

function StockTransfers({ facilityId }: { facilityId?: string }) {
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=stockTransfers${facilityParam}`)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [showCreate, setShowCreate] = useState(false)
  const [viewTx, setViewTx] = useState<any | null>(null)

  if (loading) return <Skeleton className="h-96" />

  const allTx = data || []
  const filtered = allTx.filter(tx => {
    if (statusFilter !== 'all' && tx.status !== statusFilter) return false
    if (!search) return true
    const s = search.toLowerCase()
    return tx.transferNumber?.toLowerCase().includes(s) ||
      tx.fromFacility?.name?.toLowerCase().includes(s) ||
      tx.toFacility?.name?.toLowerCase().includes(s) ||
      tx.notes?.toLowerCase().includes(s)
  })

  // Summary cards
  const inTransit = allTx.filter(t => t.status === 'IN_TRANSIT').length
  const received = allTx.filter(t => t.status === 'RECEIVED').length
  const drafts = allTx.filter(t => t.status === 'DRAFT').length

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Total Transfers</div>
          <div className="text-2xl font-bold">{allTx.length}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Drafts</div>
          <div className="text-2xl font-bold text-slate-600">{drafts}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">In Transit</div>
          <div className="text-2xl font-bold text-blue-600">{inTransit}</div>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <div className="text-xs text-muted-foreground">Received</div>
          <div className="text-2xl font-bold text-emerald-600">{received}</div>
        </CardContent></Card>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <StandardSearchBar
          value={search}
          onChange={setSearch}
          placeholder="Search by transfer #, facility, notes..."
          totalCount={allTx.length}
          filteredCount={filtered.length}
        />
        <div className="flex gap-2 flex-wrap">
          <select
            className="border rounded px-2 py-1.5 text-sm"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
          >
            <option value="all">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="IN_TRANSIT">In Transit</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" /> New Transfer
          </Button>
        </div>
      </div>

      {/* Transfers list */}
      {filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <ArrowRightLeft className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No stock transfers yet.</p>
            <p className="text-xs mt-1">Click "New Transfer" to move stock between facilities in your organization.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Transfer #</th>
                    <th className="text-left p-2 font-medium hidden md:table-cell">Date</th>
                    <th className="text-left p-2 font-medium">From → To</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="text-left p-2 font-medium hidden sm:table-cell">Items</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(tx => (
                    <tr key={tx.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setViewTx(tx)}>
                      <td className="p-2 font-mono text-xs text-primary">{tx.transferNumber}</td>
                      <td className="p-2 text-xs hidden md:table-cell">{fmtDate(tx.transferDate)}</td>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5 text-sm">
                          <span className="font-medium">{tx.fromFacility?.name || '—'}</span>
                          <ArrowRightLeft className="h-3 w-3 text-muted-foreground" />
                          <span className="font-medium">{tx.toFacility?.name || '—'}</span>
                        </div>
                      </td>
                      <td className="p-2">
                        <Badge variant="outline" className={`text-xs ${TRANSFER_STATUS_COLORS[tx.status] || ''}`}>{tx.status.replace(/_/g, ' ')}</Badge>
                      </td>
                      <td className="p-2 text-xs hidden sm:table-cell">
                        {tx.lines?.length || 0} item{(tx.lines?.length || 0) === 1 ? '' : 's'}
                      </td>
                      <td className="p-2 whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        {/* Quick action: Send (DRAFT → IN_TRANSIT) */}
                        {tx.status === 'DRAFT' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-blue-600"
                            title="Send transfer (decrements source stock)"
                            onClick={async () => {
                              if (!confirm(`Send transfer ${tx.transferNumber}? Source stock will be decremented.`)) return
                              try {
                                await apiPatch(withFacility(`/api/data?type=stockTransfers&id=${tx.id}`, facilityId), { status: 'IN_TRANSIT' })
                                toast.success(`Transfer ${tx.transferNumber} sent — in transit`)
                                refetch()
                              } catch (e: any) { toast.error(e.message) }
                            }}
                          >
                            <Truck className="h-3 w-3 mr-1" /> Send
                          </Button>
                        )}
                        {/* Quick action: Receive (IN_TRANSIT → RECEIVED) */}
                        {tx.status === 'IN_TRANSIT' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-emerald-600"
                            title="Receive transfer (increments destination stock)"
                            onClick={async () => {
                              if (!confirm(`Receive transfer ${tx.transferNumber}? Destination stock will be incremented.`)) return
                              try {
                                await apiPatch(withFacility(`/api/data?type=stockTransfers&id=${tx.id}`, facilityId), { status: 'RECEIVED' })
                                toast.success(`Transfer ${tx.transferNumber} received`)
                                refetch()
                              } catch (e: any) { toast.error(e.message) }
                            }}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" /> Receive
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="View" onClick={() => setViewTx(tx)}>
                          <Eye className="h-3 w-3" />
                        </Button>
                        {(tx.status === 'DRAFT' || tx.status === 'IN_TRANSIT') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-rose-600"
                            title="Cancel transfer"
                            onClick={async () => {
                              if (!confirm(`Cancel transfer ${tx.transferNumber}?${tx.status === 'IN_TRANSIT' ? ' Source stock will be restored.' : ''}`)) return
                              try {
                                await apiPatch(withFacility(`/api/data?type=stockTransfers&id=${tx.id}`, facilityId), { status: 'CANCELLED' })
                                toast.success(`Transfer ${tx.transferNumber} cancelled`)
                                refetch()
                              } catch (e: any) { toast.error(e.message) }
                            }}
                          >
                            <XCircle className="h-3 w-3" />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {showCreate && (
        <StockTransferDialog
          facilityId={facilityId}
          onClose={() => setShowCreate(false)}
          onSaved={() => { setShowCreate(false); refetch() }}
        />
      )}
      {viewTx && (
        <ViewStockTransferDialog
          transfer={viewTx}
          facilityId={facilityId}
          onClose={() => setViewTx(null)}
          onUpdated={() => { setViewTx(null); refetch() }}
        />
      )}
    </div>
  )
}

// ============== STOCK TRANSFER CREATE DIALOG ==============
function StockTransferDialog({ facilityId, onClose, onSaved }: { facilityId?: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  // Fetch all facilities in the user's org (so they can pick from + to within the org)
  const { data: facData } = useFetch<any>('/api/facilities/accessible')
  const facilities = facData?.facilities || []
  const { data: inventoryItems } = useFetch<any[]>(`/api/data?type=inventory&includeInactive=false${facilityParam}`)

  const [fromFacilityId, setFromFacilityId] = useState<string>(facilityId || '')
  const [toFacilityId, setToFacilityId] = useState<string>('')
  const [transferDate, setTransferDate] = useState(new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState<'DRAFT' | 'IN_TRANSIT'>('DRAFT')
  const [lines, setLines] = useState<Array<{ itemId: string; quantity: string }>>([{ itemId: '', quantity: '1' }])
  const [saving, setSaving] = useState(false)

  // When fromFacilityId changes, refresh inventory items for that facility
  const { data: fromFacilityItems, refetch: refetchFromItems } = useFetch<any[]>(
    fromFacilityId ? `/api/data?type=inventory&includeInactive=false&facilityId=${fromFacilityId}` : null
  )

  const addLine = () => setLines(prev => [...prev, { itemId: '', quantity: '1' }])
  const removeLine = (idx: number) => setLines(prev => prev.filter((_, i) => i !== idx))
  const updateLine = (idx: number, field: string, value: any) => {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  const submit = async () => {
    if (!fromFacilityId) { toast.error('Source facility is required'); return }
    if (!toFacilityId) { toast.error('Destination facility is required'); return }
    if (fromFacilityId === toFacilityId) { toast.error('Source and destination must be different'); return }
    const validLines = lines.filter(l => l.itemId && (parseFloat(l.quantity) || 0) > 0)
    if (validLines.length === 0) { toast.error('Add at least 1 item with quantity > 0'); return }
    setSaving(true)
    try {
      const payload: any = {
        fromFacilityId,
        toFacilityId,
        transferDate,
        notes: notes || null,
        status,
        lines: validLines.map(l => ({
          itemId: l.itemId,
          quantity: parseFloat(l.quantity) || 0,
        })),
      }
      const res = await apiPost(withFacility('/api/data?type=stockTransfers', facilityId), payload)
      toast.success(`Stock transfer ${res.transferNumber} created (${status})`)
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-3xl my-8">
        <div className="flex justify-between items-center border-b p-4 sticky top-0 bg-background z-10">
          <h3 className="font-semibold flex items-center gap-2">
            <ArrowRightLeft className="h-4 w-4" /> New Stock Transfer
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-4">
          {facilities.length < 2 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              You need at least 2 facilities in your organization to transfer stock between them.
              Currently you have access to {facilities.length} facilit{facilities.length === 1 ? 'y' : 'ies'}.
            </div>
          )}

          {/* Facility selectors */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">From Facility *</label>
              <select
                className="w-full border rounded px-2 py-1.5"
                value={fromFacilityId}
                onChange={e => { setFromFacilityId(e.target.value); setLines([{ itemId: '', quantity: '1' }]) }}
              >
                <option value="">— select source —</option>
                {facilities.map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
            <div className="flex items-end justify-center pb-1.5">
              <ArrowRightLeft className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">To Facility *</label>
              <select
                className="w-full border rounded px-2 py-1.5"
                value={toFacilityId}
                onChange={e => setToFacilityId(e.target.value)}
              >
                <option value="">— select destination —</option>
                {facilities.filter((f: any) => f.id !== fromFacilityId).map((f: any) => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date + status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Transfer Date</label>
              <Input type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select
                className="w-full border rounded px-2 py-1.5"
                value={status}
                onChange={e => setStatus(e.target.value as 'DRAFT' | 'IN_TRANSIT')}
              >
                <option value="DRAFT">Draft (save for later — stock not moved yet)</option>
                <option value="IN_TRANSIT">In Transit (decrement source stock now)</option>
              </select>
            </div>
          </div>

          {/* Line items */}
          <div className="border rounded-md">
            <div className="bg-muted/50 px-3 py-2 text-xs font-medium flex items-center justify-between">
              <span>Items to Transfer (from source facility)</span>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={addLine} disabled={!fromFacilityId}>
                <Plus className="h-3 w-3 mr-1" /> Add Item
              </Button>
            </div>
            {!fromFacilityId ? (
              <div className="p-4 text-xs text-muted-foreground text-center">Select a source facility to see its inventory items.</div>
            ) : (
              <div className="max-h-80 overflow-y-auto">
                {lines.map((l, idx) => {
                  const item = (fromFacilityItems || []).find((i: any) => i.id === l.itemId)
                  return (
                    <div key={idx} className="grid grid-cols-12 gap-2 p-2 border-t text-xs items-end">
                      <div className="col-span-12 md:col-span-7">
                        <label className="text-[10px] text-muted-foreground">Item</label>
                        <select
                          className="w-full border rounded px-1.5 py-1 text-xs"
                          value={l.itemId}
                          onChange={e => updateLine(idx, 'itemId', e.target.value)}
                        >
                          <option value="">— select item —</option>
                          {(fromFacilityItems || []).map((i: any) => (
                            <option key={i.id} value={i.id}>
                              {i.name} ({i.currentStock} {i.unit} in stock{i.code ? ` · ${i.code}` : ''})
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-7 md:col-span-3">
                        <label className="text-[10px] text-muted-foreground">Quantity</label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          className="h-7 text-xs"
                          value={l.quantity}
                          onChange={e => updateLine(idx, 'quantity', e.target.value)}
                        />
                      </div>
                      <div className="col-span-5 md:col-span-1 text-right">
                        <label className="text-[10px] text-muted-foreground">Avail.</label>
                        <div className="font-medium pt-1 text-muted-foreground">{item?.currentStock ?? '—'}</div>
                      </div>
                      <div className="col-span-12 md:col-span-1 flex justify-end">
                        {lines.length > 1 && (
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" onClick={() => removeLine(idx)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      {item && parseFloat(l.quantity) > item.currentStock && (
                        <div className="col-span-12 text-[10px] text-amber-700 -mt-1">
                          ⚠ Quantity exceeds available stock ({item.currentStock} {item.unit})
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Notes</label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Optional transfer notes..." />
          </div>
        </div>
        <div className="flex flex-wrap justify-between items-center gap-2 p-4 border-t sticky bottom-0 bg-background">
          <p className="text-xs text-muted-foreground">
            <FileText className="h-3 w-3 inline mr-1" />
            {status === 'DRAFT'
              ? 'Draft saves the transfer without moving stock. Click "Send" later to decrement source stock.'
              : 'In Transit immediately decrements source stock. Receiver marks it Received to increment destination stock.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={saving || !fromFacilityId || !toFacilityId}>{saving ? 'Saving...' : 'Create Transfer'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ============== VIEW STOCK TRANSFER DIALOG ==============
function ViewStockTransferDialog({ transfer, facilityId, onClose, onUpdated }: { transfer: any; facilityId?: string; onClose: () => void; onUpdated: () => void }) {
  useEscClose(onClose)
  const { data: fullTx, loading, refetch } = useFetch<any>(`/api/data?type=stockTransfers&id=${transfer.id}${facilityId ? `&facilityId=${facilityId}` : ''}`)
  const tx = fullTx || transfer

  if (loading) return <Skeleton className="h-96" />

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-3xl my-8">
        <div className="flex justify-between items-center border-b p-4 sticky top-0 bg-background z-10">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4" /> {tx.transferNumber}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {fmtDate(tx.transferDate)} • {tx.fromFacility?.name} → {tx.toFacility?.name}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Status badges */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="outline" className={TRANSFER_STATUS_COLORS[tx.status] || ''}>
              {tx.status === 'RECEIVED' && <CheckCircle className="h-3 w-3 mr-1" />}
              {tx.status === 'CANCELLED' && <XCircle className="h-3 w-3 mr-1" />}
              {tx.status.replace(/_/g, ' ')}
            </Badge>
            {tx.receivedDate && (
              <Badge variant="outline" className="text-xs text-emerald-700">
                Received {fmtDate(tx.receivedDate)}
              </Badge>
            )}
          </div>

          {/* Facilities summary */}
          <div className="rounded-md border p-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">SOURCE FACILITY</div>
              <div className="font-medium flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> {tx.fromFacility?.name || '—'}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-muted-foreground mb-1">DESTINATION FACILITY</div>
              <div className="font-medium flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5" /> {tx.toFacility?.name || '—'}
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="border rounded-md overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 font-medium">Item</th>
                  <th className="text-left p-2 font-medium hidden sm:table-cell">Source</th>
                  <th className="text-right p-2 font-medium">Qty</th>
                  <th className="text-left p-2 font-medium hidden sm:table-cell">Destination Item</th>
                  {tx.status === 'RECEIVED' && <th className="text-right p-2 font-medium">Received</th>}
                </tr>
              </thead>
              <tbody>
                {(tx.lines || []).map((l: any) => (
                  <tr key={l.id} className="border-t">
                    <td className="p-2">
                      <div className="font-medium">{l.itemName}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.itemCategory} · {l.itemUnit} · {fmtMoney(l.itemUnitCost)}/unit
                      </div>
                    </td>
                    <td className="p-2 text-xs hidden sm:table-cell">
                      {l.item ? (
                        <span className="font-mono text-primary">{l.item.code || '—'}</span>
                      ) : (
                        <span className="text-muted-foreground italic">deleted</span>
                      )}
                      {l.item && <div className="text-[10px] text-muted-foreground">{l.item.currentStock} now</div>}
                    </td>
                    <td className="p-2 text-right font-medium">{l.quantity}</td>
                    <td className="p-2 text-xs hidden sm:table-cell">
                      {l.destinationItem ? (
                        <span className="font-mono text-primary">{l.destinationItem.code || '—'}</span>
                      ) : tx.status === 'RECEIVED' ? (
                        <span className="text-muted-foreground italic">auto-created</span>
                      ) : (
                        <span className="text-muted-foreground">— pending receipt —</span>
                      )}
                      {l.destinationItem && <div className="text-[10px] text-muted-foreground">{l.destinationItem.currentStock} now</div>}
                    </td>
                    {tx.status === 'RECEIVED' && (
                      <td className="p-2 text-right text-xs text-emerald-700">
                        {l.receivedQty >= l.quantity && <CheckCircle className="h-3 w-3 inline mr-1" />}
                        {l.receivedQty} / {l.quantity}
                      </td>
                    )}
                  </tr>
                ))}
                {(tx.lines || []).length === 0 && (
                  <tr><td colSpan={tx.status === 'RECEIVED' ? 5 : 4} className="p-6 text-center text-muted-foreground text-sm">No line items</td></tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Notes */}
          {tx.notes && (
            <div className="rounded-md bg-muted/30 p-3 text-sm">
              <div className="text-xs font-medium text-muted-foreground mb-1">Notes</div>
              {tx.notes}
            </div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          {tx.status === 'DRAFT' && (
            <Button
              variant="default"
              onClick={async () => {
                if (!confirm(`Send transfer ${tx.transferNumber}? Source stock will be decremented.`)) return
                try {
                  await apiPatch(withFacility(`/api/data?type=stockTransfers&id=${tx.id}`, facilityId), { status: 'IN_TRANSIT' })
                  toast.success(`Transfer ${tx.transferNumber} sent`)
                  refetch()
                  onUpdated()
                } catch (e: any) { toast.error(e.message) }
              }}
            >
              <Truck className="h-3.5 w-3.5 mr-1" /> Send (In Transit)
            </Button>
          )}
          {tx.status === 'IN_TRANSIT' && (
            <Button
              variant="default"
              onClick={async () => {
                if (!confirm(`Receive transfer ${tx.transferNumber}? Destination stock will be incremented.`)) return
                try {
                  await apiPatch(withFacility(`/api/data?type=stockTransfers&id=${tx.id}`, facilityId), { status: 'RECEIVED' })
                  toast.success(`Transfer ${tx.transferNumber} received`)
                  refetch()
                  onUpdated()
                } catch (e: any) { toast.error(e.message) }
              }}
            >
              <CheckCircle className="h-3.5 w-3.5 mr-1" /> Mark as Received
            </Button>
          )}
          {(tx.status === 'DRAFT' || tx.status === 'IN_TRANSIT') && (
            <Button
              variant="outline"
              className="text-rose-600"
              onClick={async () => {
                if (!confirm(`Cancel transfer ${tx.transferNumber}?${tx.status === 'IN_TRANSIT' ? ' Source stock will be restored.' : ''}`)) return
                try {
                  await apiPatch(withFacility(`/api/data?type=stockTransfers&id=${tx.id}`, facilityId), { status: 'CANCELLED' })
                  toast.success(`Transfer ${tx.transferNumber} cancelled`)
                  refetch()
                  onUpdated()
                } catch (e: any) { toast.error(e.message) }
              }}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" /> Cancel Transfer
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  )
}

// ============== PAY PURCHASE ORDER DIALOG ==============
// Records an AP payment for a single PO. Posts a journal entry:
//   Dr 2000 (Accounts Payable) / Cr {bank.glAccountId}
// Then updates the PO's paidAmount + paymentStatus (PAID when fully paid, PARTIAL otherwise).
// Visible on PO rows with status=RECEIVED and paymentStatus in (UNPAID, PARTIAL).
function PayPurchaseOrderDialog({ po, facilityId, onClose, onSaved }: {
  po: any
  facilityId?: string
  onClose: () => void
  onSaved: () => void
}) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  // Fetch bank accounts (so user can pick which bank/cash to pay from)
  const { data: banks } = useFetch<any[]>(`/api/data?type=bankAccounts${facilityParam}`)
  // Fetch chart of accounts to find AP (2000) + Cash (1010) as fallbacks
  const { data: accounts } = useFetch<any[]>(`/api/data?type=accounts${facilityParam}`)

  const outstanding = po.total - (po.paidAmount || 0)
  const [bankAccountId, setBankAccountId] = useState<string>('')
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10))
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState<string>(outstanding.toFixed(2))
  const [saving, setSaving] = useState(false)

  // Resolve AP account (2000) + the selected bank's GL account
  const apAccount = (accounts || []).find((a: any) => a.code === '2000')
  const selectedBank = (banks || []).find((b: any) => b.id === bankAccountId)

  const payAmount = parseFloat(amount) || 0
  const isBalanced = payAmount > 0 && payAmount <= outstanding + 0.01 && (selectedBank || (accounts || []).find((a: any) => a.code === '1010'))

  const submit = async () => {
    if (!payAmount || payAmount <= 0) {
      toast.error('Payment amount must be greater than 0')
      return
    }
    if (payAmount > outstanding + 0.01) {
      toast.error(`Amount cannot exceed outstanding balance of ${fmtMoney(outstanding)}`)
      return
    }
    // Resolve the credit-side GL account: prefer the selected bank's GL account, fallback to 1010
    let creditAccountId: string | null = null
    let creditAccountName = ''
    if (selectedBank?.glAccountId) {
      creditAccountId = selectedBank.glAccountId
      creditAccountName = `Bank — ${selectedBank.name}`
    } else {
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
      const jePayload: any = {
        memo: `PO Payment — ${po.poNumber}${po.vendor?.name ? ` — ${po.vendor.name}` : ''}${reference ? ` (ref: ${reference})` : ''}`,
        entryDate: paymentDate,
        source: 'AUTO_VENDOR_PAYMENT',
        reference: po.vendor?.code || po.poNumber,
        lines: [
          { accountId: apAccount.id, debit: payAmount, description: `AP payment — ${po.poNumber}` },
          { accountId: creditAccountId, credit: payAmount, description: `Paid ${po.poNumber} — ${creditAccountName}` },
        ],
        facilityId: facilityId || null,
      }
      const jeRes = await fetch(withFacility('/api/data?type=journalEntries', facilityId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jePayload),
      })
      const jeData = await jeRes.json()
      if (!jeRes.ok) throw new Error(jeData.error || `JE creation failed (HTTP ${jeRes.status})`)

      // 2. Update the PO's paidAmount + paymentStatus
      const newPaidAmount = (po.paidAmount || 0) + payAmount
      const newPaymentStatus = newPaidAmount >= po.total - 0.01 ? 'PAID' : 'PARTIAL'
      const patchRes = await fetch(withFacility(`/api/data?type=purchaseOrders&id=${po.id}`, facilityId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paidAmount: newPaidAmount,
          paymentStatus: newPaymentStatus,
          notes: [po.notes, `Paid ${payAmount.toFixed(2)} on ${paymentDate}${reference ? ` (ref: ${reference})` : ''} — JE ${jeData.entryNumber}`].filter(Boolean).join('\n').slice(0, 1000),
        }),
      })
      if (!patchRes.ok) {
        const patchErr = await patchRes.json().catch(() => ({}))
        throw new Error(`JE posted but PO update failed: ${patchErr.error || patchRes.status}. The AP balance in the GL is correct, but the PO's paidAmount may need a manual update.`)
      }

      toast.success(`Payment of ${fmtMoney(payAmount)} recorded for ${po.poNumber} — JE ${jeData.entryNumber} posted. PO marked ${newPaymentStatus}.`)
      onSaved()
    } catch (e: any) {
      toast.error(e.message)
    }
    setSaving(false)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-background rounded-lg shadow-xl w-full max-w-lg my-8">
        <div className="flex justify-between items-center border-b p-4 sticky top-0 bg-background z-10">
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Wallet className="h-4 w-4" /> Pay Purchase Order
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {po.poNumber}
              {po.vendor?.name && <> · {po.vendor.name}</>}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>

        <div className="p-4 space-y-4">
          {/* Outstanding summary */}
          <div className="rounded-md border border-amber-200 bg-amber-50/50 p-3 grid grid-cols-3 gap-2 text-sm">
            <div>
              <div className="text-[10px] font-semibold text-amber-900">PO TOTAL</div>
              <div className="font-bold">{fmtMoney(po.total)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-amber-900">ALREADY PAID</div>
              <div className="font-bold text-muted-foreground">{fmtMoney(po.paidAmount || 0)}</div>
            </div>
            <div>
              <div className="text-[10px] font-semibold text-amber-900">OUTSTANDING</div>
              <div className="font-bold text-amber-700">{fmtMoney(outstanding)}</div>
            </div>
          </div>

          {/* Payment fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Pay From (Bank/Cash) *</label>
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
            <div className="sm:col-span-2">
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Payment Amount *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max={outstanding.toFixed(2)}
                  className="pl-7"
                  value={amount}
                  onChange={e => setAmount(e.target.value)}
                />
              </div>
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Outstanding: {fmtMoney(outstanding)}</span>
                <button
                  type="button"
                  className="text-primary hover:underline"
                  onClick={() => setAmount(outstanding.toFixed(2))}
                >
                  Pay full amount
                </button>
              </div>
            </div>
          </div>

          {/* Info panel */}
          <div className="rounded-md bg-muted/30 p-2.5 text-[11px] text-muted-foreground">
            <strong>What happens:</strong>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              <li>A journal entry is posted: <strong>Dr 2000 (Accounts Payable)</strong> / <strong>Cr {selectedBank ? selectedBank.account?.code || selectedBank.code : '1010'} ({selectedBank ? selectedBank.name : 'Cash/Bank'})</strong></li>
              <li>The PO&apos;s <strong>paidAmount</strong> increases by {fmtMoney(payAmount)}; status becomes <strong>{(po.paidAmount || 0) + payAmount >= po.total - 0.01 ? 'PAID' : 'PARTIAL'}</strong></li>
              <li>The vendor&apos;s Outstanding AP balance decreases by {fmtMoney(payAmount)}</li>
              <li>Find the JE later in Accounting → Vendor Payments tab</li>
            </ul>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 p-4 border-t sticky bottom-0 bg-background">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !isBalanced}>
            {saving ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Recording...</> : <><Wallet className="h-3.5 w-3.5 mr-1" /> Record Payment ({fmtMoney(payAmount)})</>}
          </Button>
        </div>
      </div>
    </div>
  )
}
