'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Archive, PackagePlus, Save, Search, Warehouse } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'

const EMPTY_FORM = {
  item_name: '',
  category: 'General',
  unit: 'each',
  sku: '',
  location: '',
  stock_quantity: '0',
  reorder_level: '0',
  unit_cost: '',
  notes: '',
}

export default function AdminMaintenanceInventoryPage() {
  const [items, setItems] = useState<any[]>([])
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    loadItems()
  }, [])

  async function loadItems() {
    const { data } = await supabase
      .from('maintenance_inventory_items')
      .select('*')
      .eq('active', true)
      .order('item_name', { ascending: true })

    setItems(data || [])
  }

  function updateField(field: string, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
  }

  function editItem(item: any) {
    setEditingId(item.id)
    setForm({
      item_name: item.item_name || '',
      category: item.category || 'General',
      unit: item.unit || 'each',
      sku: item.sku || '',
      location: item.location || '',
      stock_quantity: String(item.stock_quantity ?? 0),
      reorder_level: String(item.reorder_level ?? 0),
      unit_cost: item.unit_cost === null || item.unit_cost === undefined ? '' : String(item.unit_cost),
      notes: item.notes || '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  async function saveItem() {
    if (!form.item_name.trim()) {
      setMessage('Add an item name first.')
      return
    }

    setSaving(true)
    setMessage(editingId ? 'Updating inventory item…' : 'Adding inventory item…')

    const payload = {
      item_name: form.item_name.trim(),
      category: form.category.trim() || 'General',
      unit: form.unit.trim() || 'each',
      sku: form.sku.trim() || null,
      location: form.location.trim() || null,
      stock_quantity: Number(form.stock_quantity || 0),
      reorder_level: Number(form.reorder_level || 0),
      unit_cost: form.unit_cost.trim() ? Number(form.unit_cost) : null,
      notes: form.notes.trim() || null,
      active: true,
    }

    const result = editingId
      ? await supabase.from('maintenance_inventory_items').update(payload).eq('id', editingId)
      : await supabase.from('maintenance_inventory_items').insert(payload)

    if (result.error) {
      setMessage(result.error.message)
      setSaving(false)
      return
    }

    setMessage(editingId ? 'Inventory item updated.' : 'Inventory item added.')
    setSaving(false)
    resetForm()
    loadItems()
  }

  async function archiveItem(id: string) {
    if (!confirm('Archive this inventory item? It will stop showing for new work orders.')) return

    const { error } = await supabase
      .from('maintenance_inventory_items')
      .update({ active: false })
      .eq('id', id)

    setMessage(error ? error.message : 'Inventory item archived.')
    if (!error) loadItems()
  }

  const filteredItems = items.filter((item) => {
    const query = search.trim().toLowerCase()
    if (!query) return true

    return [
      item.item_name,
      item.category,
      item.location,
      item.sku,
      item.notes,
    ].some((value) => String(value || '').toLowerCase().includes(query))
  })

  const lowStockItems = useMemo(
    () => items.filter((item) => Number(item.stock_quantity || 0) <= Number(item.reorder_level || 0)),
    [items]
  )

  const totalValue = items.reduce(
    (sum, item) => sum + Number(item.stock_quantity || 0) * Number(item.unit_cost || 0),
    0
  )

  return (
    <main className="admin-maintenance-inventory-page">
      <style>{`
        .admin-maintenance-inventory-page{display:grid;gap:18px;color:#273a2e}
        .admin-maintenance-inventory-hero{padding:31px;border-radius:28px;background:radial-gradient(circle at 86% 12%,rgba(230,202,127,.2),transparent 30%),linear-gradient(135deg,#173722,#315f3d);color:#fff;box-shadow:0 22px 56px rgba(34,54,38,.16)}
        .admin-maintenance-inventory-hero span,.admin-maintenance-inventory-form span,.admin-maintenance-inventory-list-top span{display:inline-flex;align-items:center;gap:8px;color:#e6ca7f;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
        .admin-maintenance-inventory-form span,.admin-maintenance-inventory-list-top span{color:#9a7834}
        .admin-maintenance-inventory-hero h1{max-width:880px;margin:10px 0 0;color:#fff;font:500 clamp(38px,5vw,62px)/1.02 Georgia,serif}
        .admin-maintenance-inventory-hero p{max-width:820px;margin:14px 0 0;color:rgba(255,255,255,.84);line-height:1.6}
        .admin-maintenance-inventory-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
        .admin-maintenance-inventory-stats article{padding:18px;border:1px solid #dfddd3;border-radius:20px;background:#fff;box-shadow:0 12px 30px rgba(34,54,38,.07)}
        .admin-maintenance-inventory-stats article.warning{border-color:#eccd8b;background:#fff9ea}
        .admin-maintenance-inventory-stats small{color:#9a7834;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}
        .admin-maintenance-inventory-stats strong{display:block;margin-top:5px;color:#263d2e;font:500 30px Georgia,serif}
        .admin-maintenance-inventory-grid{display:grid;grid-template-columns:minmax(320px,.38fr) minmax(0,1fr);gap:18px}
        .admin-maintenance-inventory-form,.admin-maintenance-inventory-list{padding:22px;border:1px solid #dfddd3;border-radius:24px;background:#fff;box-shadow:0 14px 34px rgba(34,54,38,.07)}
        .admin-maintenance-inventory-form{align-self:start;position:sticky;top:18px}
        .admin-maintenance-inventory-form h2,.admin-maintenance-inventory-list-top h2{margin:5px 0 14px;color:#263d2e;font:500 30px Georgia,serif}
        .admin-maintenance-inventory-form input,.admin-maintenance-inventory-form select,.admin-maintenance-inventory-form textarea{width:100%;margin-top:10px}
        .admin-maintenance-inventory-form textarea{min-height:96px}
        .admin-maintenance-inventory-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .admin-maintenance-inventory-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:13px}
        .admin-maintenance-inventory-actions button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px;background:#315f3d!important;color:#fff!important}
        .admin-maintenance-inventory-list{overflow:hidden;padding:0}
        .admin-maintenance-inventory-list-top{display:flex;align-items:end;justify-content:space-between;gap:14px;padding:22px;border-bottom:1px solid #ebe7dd}
        .admin-maintenance-inventory-list-top label{display:flex;align-items:center;gap:8px;min-width:min(360px,100%);padding:0 12px;border:1px solid #dfe4dc;border-radius:14px;background:#f8faf7;color:#718078}
        .admin-maintenance-inventory-list-top input{width:100%;min-height:42px;border:0!important;background:transparent!important;box-shadow:none!important}
        .admin-maintenance-low-stock{display:grid;gap:4px;margin:18px 22px 0;padding:13px;border:1px solid #edd29b;border-radius:16px;background:#fff9ea;color:#684f1f}
        .admin-maintenance-low-stock strong{font-size:12px}.admin-maintenance-low-stock span{font-size:12px;line-height:1.4}
        .admin-maintenance-inventory-items{display:grid}
        .admin-maintenance-inventory-items section{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:14px;align-items:center;padding:18px 22px;border-top:1px solid #ebe7dd}
        .admin-maintenance-inventory-items section.low{background:#fff9ea}
        .admin-maintenance-inventory-items small{color:#9a7834;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}
        .admin-maintenance-inventory-items h3{margin:5px 0 0;color:#263d2e}.admin-maintenance-inventory-items p{margin:5px 0 0;color:#657168;font-size:12px}
        .admin-maintenance-inventory-items strong{display:block;color:#263d2e;font:500 24px Georgia,serif;text-align:right}
        .admin-maintenance-inventory-items span{display:block;margin-top:4px;color:#68746c;font-size:11px;font-weight:900;text-align:right}
        .admin-maintenance-inventory-items nav{display:flex;gap:8px}.admin-maintenance-inventory-items button{min-height:36px;font-size:11px}
        .admin-maintenance-inventory-empty{padding:32px;color:#68746c;text-align:center}
        @media(max-width:920px){.admin-maintenance-inventory-grid{grid-template-columns:1fr}.admin-maintenance-inventory-form{position:static}.admin-maintenance-inventory-items section{grid-template-columns:1fr}.admin-maintenance-inventory-items strong,.admin-maintenance-inventory-items span{text-align:left}}
        @media(max-width:640px){.admin-maintenance-inventory-stats,.admin-maintenance-inventory-row{grid-template-columns:1fr}.admin-maintenance-inventory-list-top{align-items:stretch;flex-direction:column}}
      `}</style>
      <section className="admin-maintenance-inventory-hero">
        <span><Warehouse size={18} /> MAINTENANCE INVENTORY</span>
        <h1>Parts, supplies, receipts, and real stock counts.</h1>
        <p>Keep the shop organized. When maintenance records parts on a work order, inventory automatically counts down.</p>
      </section>

      <section className="admin-maintenance-inventory-stats">
        <article><small>Active items</small><strong>{items.length}</strong></article>
        <article className={lowStockItems.length ? 'warning' : ''}><small>Low stock</small><strong>{lowStockItems.length}</strong></article>
        <article><small>Estimated value</small><strong>${totalValue.toFixed(2)}</strong></article>
      </section>

      <section className="admin-maintenance-inventory-grid">
        <article className="admin-maintenance-inventory-form">
          <div>
            <span><PackagePlus size={17} /> {editingId ? 'EDIT ITEM' : 'NEW ITEM'}</span>
            <h2>{editingId ? 'Update stock item' : 'Add inventory item'}</h2>
          </div>

          <input placeholder="Item name — example: 20 amp breaker" value={form.item_name} onChange={(event) => updateField('item_name', event.target.value)} />

          <div className="admin-maintenance-inventory-row">
            <select value={form.category} onChange={(event) => updateField('category', event.target.value)}>
              <option>General</option>
              <option>Electric</option>
              <option>Plumbing</option>
              <option>Grounds</option>
              <option>Gate</option>
              <option>Cleaning</option>
              <option>Tools</option>
              <option>Other</option>
            </select>
            <input placeholder="Unit — each, ft, box..." value={form.unit} onChange={(event) => updateField('unit', event.target.value)} />
          </div>

          <div className="admin-maintenance-inventory-row">
            <input placeholder="Current stock" inputMode="decimal" value={form.stock_quantity} onChange={(event) => updateField('stock_quantity', event.target.value)} />
            <input placeholder="Reorder level" inputMode="decimal" value={form.reorder_level} onChange={(event) => updateField('reorder_level', event.target.value)} />
          </div>

          <div className="admin-maintenance-inventory-row">
            <input placeholder="Location — shop shelf, gate shed..." value={form.location} onChange={(event) => updateField('location', event.target.value)} />
            <input placeholder="Cost per unit" inputMode="decimal" value={form.unit_cost} onChange={(event) => updateField('unit_cost', event.target.value)} />
          </div>

          <input placeholder="SKU / part number optional" value={form.sku} onChange={(event) => updateField('sku', event.target.value)} />
          <textarea placeholder="Notes — where it fits, what it is used for, vendor, etc." value={form.notes} onChange={(event) => updateField('notes', event.target.value)} />

          <div className="admin-maintenance-inventory-actions">
            <button type="button" onClick={saveItem} disabled={saving}>
              <Save size={16} /> {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Add Item'}
            </button>
            {editingId && <button type="button" onClick={resetForm}>Cancel edit</button>}
          </div>

          {message && <p className="maintenance-parts-message">{message}</p>}
        </article>

        <article className="admin-maintenance-inventory-list">
          <div className="admin-maintenance-inventory-list-top">
            <div>
              <span><AlertTriangle size={17} /> STOCK ROOM</span>
              <h2>Inventory list</h2>
            </div>
            <label>
              <Search size={15} />
              <input placeholder="Search parts..." value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </div>

          {lowStockItems.length > 0 && (
            <div className="admin-maintenance-low-stock">
              <strong>Low-stock watch list</strong>
              <span>{lowStockItems.map((item) => item.item_name).join(', ')}</span>
            </div>
          )}

          <div className="admin-maintenance-inventory-items">
            {filteredItems.map((item) => {
              const stock = Number(item.stock_quantity || 0)
              const reorder = Number(item.reorder_level || 0)
              const isLow = stock <= reorder

              return (
                <section className={isLow ? 'low' : ''} key={item.id}>
                  <div>
                    <small>{item.category || 'General'}{item.location ? ` · ${item.location}` : ''}</small>
                    <h3>{item.item_name}</h3>
                    <p>{item.notes || 'No notes.'}</p>
                  </div>
                  <div>
                    <strong>{stock.toFixed(2)} {item.unit || 'each'}</strong>
                    <span>{isLow ? 'Low stock' : `Reorder at ${reorder.toFixed(2)}`}</span>
                  </div>
                  <nav>
                    <button type="button" onClick={() => editItem(item)}>Edit</button>
                    <button type="button" onClick={() => archiveItem(item.id)}><Archive size={14} /> Archive</button>
                  </nav>
                </section>
              )
            })}

            {filteredItems.length === 0 && (
              <p className="admin-maintenance-inventory-empty">No inventory items found.</p>
            )}
          </div>
        </article>
      </section>
    </main>
  )
}
