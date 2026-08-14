'use client'

import { useState } from 'react'
import { useEscClose } from './useEscClose'
import { useFetch, apiPost, apiPatch, apiDelete, withFacility } from './api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Plus, Edit, Trash2, Package, Search, Tags } from 'lucide-react'
import { fmtMoney } from '@/lib/types'
import { toast } from 'sonner'
import { useAppDropdowns } from './useAppDropdowns'

export function ProductCatalog({ facilityId }: { facilityId?: string }) {
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editProduct, setEditProduct] = useState<any | null>(null)
  const [vendorPricesFor, setVendorPricesFor] = useState<any | null>(null)  // product whose vendor prices are being viewed/edited
  const [view, setView] = useState<'products' | 'vendorPrices'>('products')  // toggle between list views
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data, loading, refetch } = useFetch<any[]>(`/api/data?type=products${showInactive ? '&includeInactive=true' : ''}${facilityParam}`)
  // Fetch all vendor prices so we can show "from $X" or "N vendors" per product in the list
  const { data: allVendorPrices, refetch: refetchVendorPrices } = useFetch<any[]>(`/api/data?type=productVendorPrices${facilityParam}`)

  if (loading) return <Skeleton className="h-96" />

  const filtered = (data || []).filter(p => {
    if (!search) return true
    const s = search.toLowerCase()
    return p.name.toLowerCase().includes(s) || p.description?.toLowerCase().includes(s) || p.category.toLowerCase().includes(s)
  })

  // Group by category
  const byCategory: Record<string, any[]> = {}
  for (const p of filtered) {
    if (!byCategory[p.category]) byCategory[p.category] = []
    byCategory[p.category].push(p)
  }

  // Helper: get vendor prices for a product
  const getVendorPricesFor = (productId: string) => (allVendorPrices || []).filter(vp => vp.productId === productId)
  const getCheapestVendorPrice = (productId: string) => {
    const prices = getVendorPricesFor(productId).filter((vp: any) => vp.effectiveTo == null || new Date(vp.effectiveTo) > new Date())
    if (prices.length === 0) return null
    return prices.reduce((min: any, vp: any) => vp.unitCost < min.unitCost ? vp : min, prices[0])
  }

  // Flatten vendor prices for the "Vendor Prices" view (sorted by product name, then by unitCost ascending)
  const flatVendorPrices = (allVendorPrices || [])
    .filter(vp => {
      if (!search) return true
      const s = search.toLowerCase()
      return vp.product?.name?.toLowerCase().includes(s) ||
        vp.vendor?.name?.toLowerCase().includes(s) ||
        vp.vendor?.code?.toLowerCase().includes(s) ||
        vp.product?.code?.toLowerCase().includes(s)
    })
    .sort((a, b) => {
      const pn = (a.product?.name || '').localeCompare(b.product?.name || '')
      if (pn !== 0) return pn
      return (a.unitCost || 0) - (b.unitCost || 0)
    })

  return (
    <div className="space-y-4">
      {/* View toggle + search + actions */}
      <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-between">
        <div className="flex gap-1 border rounded-md p-0.5 self-start">
          <button
            onClick={() => setView('products')}
            className={`px-3 py-1 text-xs rounded ${view === 'products' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <Package className="h-3 w-3 inline mr-1" /> Products ({(data || []).length})
          </button>
          <button
            onClick={() => setView('vendorPrices')}
            className={`px-3 py-1 text-xs rounded ${view === 'vendorPrices' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
          >
            <Tags className="h-3 w-3 inline mr-1" /> Vendor Prices ({(allVendorPrices || []).length})
          </button>
        </div>
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={view === 'products' ? "Search products by name, description, category..." : "Search by product/vendor name or code..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {view === 'products' && (
            <>
              <Button variant="outline" size="sm" onClick={() => setShowInactive(!showInactive)}>
                {showInactive ? 'Hide inactive' : 'Show inactive'}
              </Button>
              <Button size="sm" onClick={() => setShowAdd(true)}>
                <Plus className="h-4 w-4 mr-1" /> Add Product
              </Button>
            </>
          )}
        </div>
      </div>

      {/* === VENDOR PRICES VIEW === */}
      {view === 'vendorPrices' && (
        <>
          {flatVendorPrices.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <Tags className="h-12 w-12 mx-auto mb-3 opacity-40" />
                <p className="text-sm">No vendor prices recorded yet.</p>
                <p className="text-xs mt-1">Switch to the <strong>Products</strong> tab → click the <Tags className="inline h-3 w-3" /> icon on a product to add vendor-specific cost prices.</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">Product</th>
                        <th className="text-left p-2 font-medium">Vendor</th>
                        <th className="text-right p-2 font-medium">Unit Cost</th>
                        <th className="text-right p-2 font-medium hidden md:table-cell">Min Order</th>
                        <th className="text-right p-2 font-medium hidden md:table-cell">Lead Time</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Effective</th>
                        <th className="text-left p-2 font-medium hidden lg:table-cell">Notes</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {flatVendorPrices.map(vp => {
                        const product = (data || []).find(p => p.id === vp.productId)
                        const isCheapest = product && getCheapestVendorPrice(product.id)?.id === vp.id
                        return (
                          <tr key={vp.id} className="border-t hover:bg-muted/30">
                            <td className="p-2">
                              {vp.product?.code && <span className="text-[10px] font-mono text-primary block">{vp.product.code}</span>}
                              <span className="font-medium">{vp.product?.name || '—'}</span>
                              <div className="text-[10px] text-muted-foreground">{vp.product?.unit}</div>
                            </td>
                            <td className="p-2">
                              {vp.vendor?.code && <span className="text-[10px] font-mono text-muted-foreground block">{vp.vendor.code}</span>}
                              <span>{vp.vendor?.name || '—'}</span>
                            </td>
                            <td className="p-2 text-right">
                              <span className={`font-medium ${isCheapest ? 'text-emerald-700' : ''}`}>{fmtMoney(vp.unitCost)}</span>
                              {isCheapest && <Badge className="ml-1 text-[9px] bg-emerald-100 text-emerald-700 border-emerald-200">cheapest</Badge>}
                            </td>
                            <td className="p-2 text-right text-xs hidden md:table-cell">{vp.minOrderQty ?? '—'}</td>
                            <td className="p-2 text-right text-xs hidden md:table-cell">{vp.leadTimeDays != null ? `${vp.leadTimeDays}d` : '—'}</td>
                            <td className="p-2 text-xs hidden lg:table-cell">
                              {vp.effectiveFrom && <div>from {new Date(vp.effectiveFrom).toLocaleDateString()}</div>}
                              {vp.effectiveTo && <div className="text-muted-foreground">to {new Date(vp.effectiveTo).toLocaleDateString()}</div>}
                              {!vp.effectiveTo && <div className="text-emerald-700 text-[10px]">active</div>}
                            </td>
                            <td className="p-2 text-xs hidden lg:table-cell truncate max-w-xs">{vp.notes || '—'}</td>
                            <td className="p-2 whitespace-nowrap">
                              {product && (
                                <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-violet-600" title="Edit vendor prices" onClick={() => setVendorPricesFor(product)}>
                                  <Edit className="h-3 w-3" />
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" title="Delete this vendor price" onClick={async () => {
                                if (!confirm(`Delete vendor price: ${vp.vendor?.name} → ${vp.product?.name} @ ${fmtMoney(vp.unitCost)}?`)) return
                                try {
                                  await apiDelete(`/api/data?type=productVendorPrices&id=${vp.id}`)
                                  toast.success('Vendor price deleted')
                                  refetchVendorPrices()
                                } catch (e: any) { toast.error(e.message) }
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
          )}
        </>
      )}

      {/* === PRODUCTS VIEW (existing) === */}
      {view === 'products' && (
        <>
      {(data || []).length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No products in catalog yet.</p>
            <p className="text-xs mt-1">Add products with default prices to speed up billing.</p>
          </CardContent>
        </Card>
      )}

      {Object.entries(byCategory).map(([cat, list]) => (
        <Card key={cat}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>{cat.replace(/_/g, ' ')}s</span>
              <Badge variant="outline">{list.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-2 font-medium">Name</th>
                    <th className="text-left p-2 font-medium hidden md:table-cell">Description</th>
                    <th className="text-left p-2 font-medium">Unit</th>
                    <th className="text-right p-2 font-medium">Default Price</th>
                    <th className="text-right p-2 font-medium hidden md:table-cell">Vendor Prices</th>
                    <th className="text-left p-2 font-medium hidden lg:table-cell">Revenue GL</th>
                    <th className="text-left p-2 font-medium">Status</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {list.map(p => {
                    const vendorPrices = getVendorPricesFor(p.id)
                    const cheapest = getCheapestVendorPrice(p.id)
                    return (
                      <tr key={p.id} className={`border-t hover:bg-muted/30 ${!p.active ? 'opacity-60' : ''}`}>
                        <td className="p-2">
                          {p.code && <span className="text-xs font-mono text-primary block">{p.code}</span>}
                          <span className="font-medium">{p.name}</span>
                        </td>
                        <td className="p-2 text-xs text-muted-foreground hidden md:table-cell">{p.description || '—'}</td>
                        <td className="p-2 text-xs">{p.unit}</td>
                        <td className="p-2 text-right font-medium">{fmtMoney(p.unitPrice)}</td>
                        <td className="p-2 text-right hidden md:table-cell">
                          {vendorPrices.length === 0 ? (
                            <span className="text-muted-foreground text-xs">—</span>
                          ) : (
                            <div className="flex flex-col items-end">
                              <Badge variant="outline" className="text-[10px] bg-violet-50 text-violet-700 border-violet-200">
                                {vendorPrices.length} vendor{vendorPrices.length === 1 ? '' : 's'}
                              </Badge>
                              {cheapest && (
                                <span className="text-[10px] text-muted-foreground mt-0.5">
                                  from <strong className="text-emerald-700">{fmtMoney(cheapest.unitCost)}</strong>
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="p-2 text-xs hidden lg:table-cell">
                          {p.revenueAccount ? (
                            <span className="font-mono text-primary">{p.revenueAccount.code}</span>
                          ) : (
                            <span className="text-muted-foreground/50">Auto (4000)</span>
                          )}
                        </td>
                        <td className="p-2">
                          {p.active ? (
                            <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 text-xs">Active</Badge>
                          ) : (
                            <Badge variant="secondary" className="text-xs">Inactive</Badge>
                          )}
                        </td>
                        <td className="p-2 whitespace-nowrap">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 w-7 p-0 text-violet-600"
                            title="Manage vendor prices"
                            onClick={() => setVendorPricesFor(p)}
                          >
                            <Tags className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" title="Edit" onClick={() => setEditProduct(p)}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-600" title="Delete" onClick={async () => {
                            if (confirm(`Delete product "${p.name}"? This also deletes its vendor prices. This cannot be undone.`)) {
                              try {
                                await apiDelete(`/api/data?type=products&id=${p.id}`)
                                toast.success('Product deleted')
                                refetch()
                                refetchVendorPrices()
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
      </>
      )}

      {showAdd && <ProductDialog mode="add" facilityId={facilityId} onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); refetch() }} />}
      {editProduct && <ProductDialog mode="edit" product={editProduct} facilityId={facilityId} onClose={() => setEditProduct(null)} onSaved={() => { setEditProduct(null); refetch() }} />}
      {vendorPricesFor && (
        <VendorPricesDialog
          product={vendorPricesFor}
          facilityId={facilityId}
          existingPrices={getVendorPricesFor(vendorPricesFor.id)}
          onClose={() => setVendorPricesFor(null)}
          onSaved={() => { refetchVendorPrices(); setVendorPricesFor(null) }}
        />
      )}
    </div>
  )
}

function ProductDialog({ mode, product, facilityId, onClose, onSaved }: { mode: 'add' | 'edit'; product?: any; facilityId?: string; onClose: () => void; onSaved: () => void }) {
  useEscClose(onClose)
  const { productCategories, productUnits } = useAppDropdowns(facilityId)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: accounts } = useFetch<any[]>(`/api/data?type=accounts${facilityParam}`)
  const [form, setForm] = useState<any>({
    name: product?.name || '',
    description: product?.description || '',
    category: product?.category || 'OTHER',
    unitPrice: product?.unitPrice ?? 0,
    unit: product?.unit || 'each',
    active: product?.active ?? true,
    revenueAccountId: product?.revenueAccountId || '',
    expenseAccountId: product?.expenseAccountId || '',
    taxRate: product?.taxRate ?? '',
  })
  const [saving, setSaving] = useState(false)

  const revenueAccounts = (accounts || []).filter((a: any) => a.type === 'REVENUE')
  const expenseAccounts = (accounts || []).filter((a: any) => a.type === 'EXPENSE')

  // Auto-suggest GL accounts based on product category
  const suggestAccounts = () => {
    const categoryMap: Record<string, { revenue?: string; expense?: string }> = {
      ROOM: { revenue: '4000', expense: undefined },
      CARE: { revenue: '4010', expense: undefined },
      MEDICATION: { revenue: '4040', expense: '5120' },
      THERAPY: { revenue: '4030', expense: undefined },
      SUPPLIES: { revenue: undefined, expense: '5100' },
      FOOD: { revenue: undefined, expense: '5200' },
      OTHER: { revenue: '4050', expense: '5999' },
    }
    const suggestion = categoryMap[form.category] || {}
    if (suggestion.revenue) {
      const acct = (accounts || []).find((a: any) => a.code === suggestion.revenue)
      if (acct) setForm(prev => ({ ...prev, revenueAccountId: acct.id }))
    }
    if (suggestion.expense) {
      const acct = (accounts || []).find((a: any) => a.code === suggestion.expense)
      if (acct) setForm(prev => ({ ...prev, expenseAccountId: acct.id }))
    }
    toast.info('Auto-filled GL accounts based on category')
  }

  const submit = async () => {
    if (!form.name) { toast.error('Name required'); return }
    if (form.unitPrice < 0) { toast.error('Price cannot be negative'); return }
    setSaving(true)
    try {
      const payload = {
        name: form.name,
        description: form.description || null,
        category: form.category,
        unitPrice: parseFloat(form.unitPrice) || 0,
        unit: form.unit,
        active: form.active,
        revenueAccountId: form.revenueAccountId || null,
        expenseAccountId: form.expenseAccountId || null,
        taxRate: form.taxRate !== '' ? parseFloat(form.taxRate) : null,
        ...(mode === 'add' && facilityId ? { facilityId } : {}),
      }
      if (mode === 'add') {
        await apiPost(withFacility('/api/data?type=products', facilityId), payload)
        toast.success('Product added')
      } else {
        await apiPatch(`/api/data?type=products&id=${product.id}`, payload)
        toast.success('Product updated')
      }
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
            <Package className="h-4 w-4" /> {mode === 'add' ? 'Add Product' : 'Edit Product'}
          </h3>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
            <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Physiotherapy Session" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Description</label>
            <Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Optional description" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Category</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {productCategories.map(c => <option key={c} value={c}>{c.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Unit</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })}>
                {productUnits.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Default Price *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input type="number" step="0.01" min="0" value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })} className="pl-7" />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Tax Rate % (override facility default)</label>
              <Input type="number" step="0.01" min="0" max="100" value={form.taxRate} onChange={e => setForm({ ...form, taxRate: e.target.value })} placeholder="Leave blank = use facility default" />
            </div>
          </div>

          {/* Accounting links */}
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-muted-foreground">ACCOUNTING LINKS</label>
              <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={suggestAccounts}>Auto-suggest</Button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Revenue Account (when invoiced)</label>
                <select className="w-full border rounded px-2 py-1.5" value={form.revenueAccountId} onChange={e => setForm({ ...form, revenueAccountId: e.target.value })}>
                  <option value="">— Auto (facility default) —</option>
                  {revenueAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1 block">Expense Account (when purchased)</label>
                <select className="w-full border rounded px-2 py-1.5" value={form.expenseAccountId} onChange={e => setForm({ ...form, expenseAccountId: e.target.value })}>
                  <option value="">— None —</option>
                  {expenseAccounts.map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                </select>
              </div>
            </div>
            <div className="text-[10px] text-muted-foreground">
              When this product is billed on an invoice, revenue is posted to the linked Revenue account instead of the default (4000).
              When purchased/restocked, cost is posted to the linked Expense account.
            </div>
          </div>

          {mode === 'edit' && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Status</label>
              <select className="w-full border rounded px-2 py-1.5" value={form.active ? '1' : '0'} onChange={e => setForm({ ...form, active: e.target.value === '1' })}>
                <option value="1">Active</option>
                <option value="0">Inactive</option>
              </select>
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2 p-4 border-t">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : (mode === 'add' ? 'Add Product' : 'Save Changes')}</Button>
        </div>
      </div>
    </div>
  )
}

// ============== VENDOR PRICES DIALOG ==============
// Shows + edits all vendor-specific cost prices for one product. Each row links
// the product to a vendor with a unit cost, MOQ, lead time, and effective date
// range. The same product can be sourced from multiple vendors at different
// prices — the cheapest is shown in the product list as "from $X".
function VendorPricesDialog({ product, facilityId, existingPrices, onClose, onSaved }: {
  product: any
  facilityId?: string
  existingPrices: any[]
  onClose: () => void
  onSaved: () => void
}) {
  useEscClose(onClose)
  const facilityParam = facilityId ? `&facilityId=${facilityId}` : ''
  const { data: vendors } = useFetch<any[]>(`/api/data?type=vendors&includeInactive=true${facilityParam}`)
  const [prices, setPrices] = useState<any[]>(existingPrices.length > 0
    ? existingPrices.map(p => ({
        id: p.id,
        vendorId: p.vendorId,
        unitCost: String(p.unitCost),
        minOrderQty: p.minOrderQty != null ? String(p.minOrderQty) : '',
        leadTimeDays: p.leadTimeDays != null ? String(p.leadTimeDays) : '',
        effectiveFrom: p.effectiveFrom ? p.effectiveFrom.slice(0, 10) : new Date().toISOString().slice(0, 10),
        effectiveTo: p.effectiveTo ? p.effectiveTo.slice(0, 10) : '',
        notes: p.notes || '',
        _existing: true,
      }))
    : [{ vendorId: '', unitCost: '', minOrderQty: '', leadTimeDays: '', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: '', notes: '', _existing: false }]
  )
  const [saving, setSaving] = useState(false)
  const [deletedIds, setDeletedIds] = useState<string[]>([])

  const updatePrice = (idx: number, field: string, value: any) => {
    setPrices(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }
  const addPriceRow = () => {
    setPrices(prev => [...prev, { vendorId: '', unitCost: '', minOrderQty: '', leadTimeDays: '', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveTo: '', notes: '', _existing: false }])
  }
  const removePriceRow = (idx: number) => {
    const row = prices[idx]
    if (row._existing && row.id) {
      setDeletedIds(prev => [...prev, row.id])
    }
    setPrices(prev => prev.filter((_, i) => i !== idx))
  }

  const submit = async () => {
    const validRows = prices.filter(p => p.vendorId && p.unitCost !== '')
    if (validRows.length === 0) { toast.error('Add at least 1 vendor price'); return }
    // Check for duplicate vendor selections
    const vendorIds = validRows.map(p => p.vendorId)
    if (new Set(vendorIds).size !== vendorIds.length) {
      toast.error('Each vendor can only appear once for this product')
      return
    }
    setSaving(true)
    try {
      // Delete removed prices
      for (const id of deletedIds) {
        try {
          await apiDelete(`/api/data?type=productVendorPrices&id=${id}`)
        } catch (e: any) {
          console.error('Failed to delete vendor price:', e.message)
        }
      }
      // Upsert remaining rows
      for (const row of validRows) {
        const payload: any = {
          productId: product.id,
          vendorId: row.vendorId,
          unitCost: parseFloat(row.unitCost) || 0,
          minOrderQty: row.minOrderQty !== '' ? parseFloat(row.minOrderQty) : null,
          leadTimeDays: row.leadTimeDays !== '' ? parseInt(row.leadTimeDays) : null,
          effectiveFrom: row.effectiveFrom || null,
          effectiveTo: row.effectiveTo || null,
          notes: row.notes || null,
          facilityId: facilityId || null,
        }
        try {
          await apiPost(withFacility('/api/data?type=productVendorPrices', facilityId), payload)
        } catch (e: any) {
          throw new Error(`Vendor ${vendors?.find(v => v.id === row.vendorId)?.name || row.vendorId}: ${e.message}`)
        }
      }
      toast.success(`Saved ${validRows.length} vendor price(s) for ${product.name}`)
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
          <div>
            <h3 className="font-semibold flex items-center gap-2">
              <Tags className="h-4 w-4 text-violet-600" /> Vendor Prices
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {product.code && <span className="font-mono text-primary mr-1">{product.code}</span>}
              {product.name}
            </p>
          </div>
          <Button variant="ghost" onClick={onClose} className="h-9 w-9 p-0 text-xl leading-none text-muted-foreground hover:text-foreground hover:bg-muted rounded-full flex-shrink-0" aria-label="Close">×</Button>
        </div>
        <div className="p-4 space-y-4">
          <div className="rounded-md border border-violet-200 bg-violet-50/50 p-3 text-xs text-violet-900">
            <strong>Why vendor prices?</strong> A product can be sourced from different vendors at different prices.
            When you create a Purchase Order, you&apos;ll see all vendor options so you can pick the cheapest or fastest one.
            The cheapest active price is shown as &quot;from $X&quot; in the product list.
          </div>

          <div className="space-y-2">
            {prices.map((p, idx) => {
              const vendor = (vendors || []).find(v => v.id === p.vendorId)
              return (
                <div key={idx} className="grid grid-cols-12 gap-2 items-end p-2 border rounded-md">
                  <div className="col-span-12 md:col-span-4">
                    <label className="text-[10px] text-muted-foreground block">Vendor *</label>
                    <select
                      className="w-full border rounded px-1.5 py-1 text-sm"
                      value={p.vendorId}
                      onChange={e => updatePrice(idx, 'vendorId', e.target.value)}
                    >
                      <option value="">— select vendor —</option>
                      {(vendors || []).map(v => (
                        <option key={v.id} value={v.id}>
                          {v.code} — {v.name}{v.paymentTerms ? ` (${v.paymentTerms})` : ''}
                        </option>
                      ))}
                    </select>
                    {vendor?.leadTimeDays != null && p.leadTimeDays === '' && (
                      <p className="text-[10px] text-muted-foreground mt-0.5">Vendor default lead time: {vendor.leadTimeDays} days</p>
                    )}
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className="text-[10px] text-muted-foreground block">Unit Cost *</label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 text-sm"
                      value={p.unitCost}
                      onChange={e => updatePrice(idx, 'unitCost', e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className="text-[10px] text-muted-foreground block">Min Order Qty</label>
                    <Input
                      type="number"
                      step="0.01"
                      className="h-8 text-sm"
                      value={p.minOrderQty}
                      onChange={e => updatePrice(idx, 'minOrderQty', e.target.value)}
                      placeholder="—"
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <label className="text-[10px] text-muted-foreground block">Lead Time (days)</label>
                    <Input
                      type="number"
                      className="h-8 text-sm"
                      value={p.leadTimeDays}
                      onChange={e => updatePrice(idx, 'leadTimeDays', e.target.value)}
                      placeholder="—"
                    />
                  </div>
                  <div className="col-span-6 md:col-span-1">
                    <label className="text-[10px] text-muted-foreground block">Effective From</label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={p.effectiveFrom}
                      onChange={e => updatePrice(idx, 'effectiveFrom', e.target.value)}
                    />
                  </div>
                  <div className="col-span-6 md:col-span-1">
                    <label className="text-[10px] text-muted-foreground block">Effective To</label>
                    <Input
                      type="date"
                      className="h-8 text-xs"
                      value={p.effectiveTo}
                      onChange={e => updatePrice(idx, 'effectiveTo', e.target.value)}
                    />
                  </div>
                  <div className="col-span-12 md:col-span-11">
                    <label className="text-[10px] text-muted-foreground block">Notes</label>
                    <Input
                      className="h-8 text-sm"
                      value={p.notes}
                      onChange={e => updatePrice(idx, 'notes', e.target.value)}
                      placeholder="Optional — e.g. 'Bulk discount', 'Faster delivery'"
                    />
                  </div>
                  <div className="col-span-12 md:col-span-1 flex justify-end">
                    {prices.length > 1 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-red-600"
                        onClick={() => removePriceRow(idx)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <Button size="sm" variant="outline" onClick={addPriceRow}>
            <Plus className="h-3 w-3 mr-1" /> Add Another Vendor
          </Button>

          {(vendors || []).length === 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
              No vendors yet — add them in <strong>Accounting → Vendors</strong> first.
            </div>
          )}
        </div>
        <div className="flex flex-wrap justify-between items-center gap-2 p-4 border-t sticky bottom-0 bg-background">
          <p className="text-xs text-muted-foreground">
            {prices.length} vendor price(s) • {deletedIds.length} marked for deletion
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={submit} disabled={saving}>{saving ? 'Saving...' : 'Save Vendor Prices'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
