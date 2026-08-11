'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ArrowLeft, CheckCircle2, PackageCheck, Search, Warehouse } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'

type InventoryItem = {
  id: string
  item_name: string
  category?: string | null
  unit?: string | null
  location?: string | null
  stock_quantity?: number | string | null
  reorder_level?: number | string | null
  notes?: string | null
}

export default function MaintenanceInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadInventory()

    const refresh = () => loadInventory(false)
    const timer = window.setInterval(refresh, 30_000)
    window.addEventListener('focus', refresh)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  async function loadInventory(showLoading = true) {
    if (showLoading) setLoading(true)

    const { data, error } = await supabase
      .from('maintenance_inventory_items')
      .select('id,item_name,category,unit,location,stock_quantity,reorder_level,notes')
      .eq('active', true)
      .order('item_name', { ascending: true })

    if (error) {
      setMessage(error.message)
    } else {
      setItems(data || [])
      setMessage('')
    }
    setLoading(false)
  }

  const visibleItems = useMemo(() => {
    const query = search.trim().toLowerCase()
    if (!query) return items
    return items.filter((item) =>
      [item.item_name, item.category, item.location, item.notes]
        .some((value) => String(value || '').toLowerCase().includes(query))
    )
  }, [items, search])

  const lowStockCount = items.filter(
    (item) => Number(item.stock_quantity || 0) <= Number(item.reorder_level || 0)
  ).length

  if (loading) {
    return <main className="maintenance-staff-page"><div className="maintenance-stock-loading">Loading supply inventory…</div></main>
  }

  return (
    <main className="maintenance-staff-page maintenance-stock-page">
      <section className="maintenance-staff-detail-hero maintenance-stock-hero">
        <Link href="/maintenance/dashboard"><ArrowLeft size={16} /> Back to work orders</Link>
        <span><Warehouse size={17} /> SUPPLY INVENTORY</span>
        <h1>Know what is on hand before you start.</h1>
        <p>The office controls starting totals. When you record supplies on a work order, the amount shown here automatically counts down.</p>
      </section>

      <section className="maintenance-stock-summary">
        <article><PackageCheck size={20} /><div><small>Inventory items</small><strong>{items.length}</strong></div></article>
        <article className={lowStockCount ? 'warning' : ''}><AlertTriangle size={20} /><div><small>Low or out</small><strong>{lowStockCount}</strong></div></article>
        <article><CheckCircle2 size={20} /><div><small>How to record use</small><strong>Open the work order</strong></div></article>
      </section>

      <section className="maintenance-stock-panel">
        <div className="maintenance-stock-heading">
          <div>
            <span>CURRENT STOCKROOM</span>
            <h2>Supplies and parts</h2>
          </div>
          <label>
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search inventory" />
          </label>
        </div>

        {message && <p className="maintenance-submit-message">{message}</p>}

        <div className="maintenance-stock-list">
          {visibleItems.map((item) => {
            const stock = Number(item.stock_quantity || 0)
            const reorder = Number(item.reorder_level || 0)
            const low = stock <= reorder

            return (
              <article className={low ? 'low' : ''} key={item.id}>
                <div>
                  <small>{item.category || 'General'}{item.location ? ` · ${item.location}` : ''}</small>
                  <h3>{item.item_name}</h3>
                  {item.notes && <p>{item.notes}</p>}
                </div>
                <div className="maintenance-stock-count">
                  <strong>{stock.toFixed(2)}</strong>
                  <span>{item.unit || 'each'} on hand</span>
                  {low && <em>{stock <= 0 ? 'Out of stock' : `Low · reorder at ${reorder.toFixed(2)}`}</em>}
                </div>
              </article>
            )
          })}

          {visibleItems.length === 0 && (
            <div className="maintenance-stock-empty">No inventory items match this search.</div>
          )}
        </div>

        <footer className="maintenance-stock-footer">
          <p>Used something? Return to the work-order list, open that ticket, and choose <strong>Record supplies used on this work order.</strong></p>
          <Link href="/maintenance/dashboard">Open work orders</Link>
        </footer>
      </section>

      <style>{`
        .maintenance-stock-loading{min-height:60vh;display:grid;place-items:center;color:#315f3d;font-weight:900}
        .maintenance-stock-hero>a{display:inline-flex;align-items:center;gap:7px;width:max-content;min-height:38px;margin-bottom:20px;padding:0 13px;border:1px solid rgba(255,255,255,.25);border-radius:999px;background:rgba(255,255,255,.12);color:#fff;font-size:12px;font-weight:900;text-decoration:none}
        .maintenance-stock-summary,.maintenance-stock-panel{max-width:1220px;margin-right:auto;margin-left:auto}
        .maintenance-stock-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-bottom:18px}
        .maintenance-stock-summary article{display:flex;align-items:center;gap:13px;padding:17px;border:1px solid #ddd8ca;border-radius:20px;background:#fff;box-shadow:0 12px 32px rgba(38,59,45,.07)}
        .maintenance-stock-summary article>svg{color:#315f3d}.maintenance-stock-summary article.warning{border-color:#eccd8b;background:#fff9ea}.maintenance-stock-summary article.warning>svg{color:#a87316}
        .maintenance-stock-summary small{display:block;color:#8a938c;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.maintenance-stock-summary strong{display:block;margin-top:4px;color:#263d2e;font:500 25px Georgia,serif}
        .maintenance-stock-panel{overflow:hidden;border:1px solid #ddd8ca;border-radius:24px;background:#fff;box-shadow:0 14px 34px rgba(34,54,38,.08)}
        .maintenance-stock-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:22px;border-bottom:1px solid #e8e4da}.maintenance-stock-heading span{color:#9a7834;font-size:9px;font-weight:900;letter-spacing:.13em}.maintenance-stock-heading h2{margin:5px 0 0;color:#263d2e;font:500 31px Georgia,serif}
        .maintenance-stock-heading label{display:flex;align-items:center;gap:8px;width:min(360px,100%);padding:0 12px;border:1px solid #dfe4dc;border-radius:13px;background:#f8faf7;color:#718078}.maintenance-stock-heading input{width:100%;min-height:43px;border:0!important;background:transparent!important;box-shadow:none!important}
        .maintenance-stock-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.maintenance-stock-list article{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:15px;align-items:center;padding:19px 22px;border-right:1px solid #ebe7dd;border-bottom:1px solid #ebe7dd}.maintenance-stock-list article:nth-child(even){border-right:0}.maintenance-stock-list article.low{background:#fff9ea}
        .maintenance-stock-list small{color:#9a7834;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.maintenance-stock-list h3{margin:5px 0 0;color:#263d2e;font-size:18px}.maintenance-stock-list p{margin:5px 0 0;color:#6c776f;font-size:11px}
        .maintenance-stock-count{text-align:right}.maintenance-stock-count strong{display:block;color:#263d2e;font:500 27px Georgia,serif}.maintenance-stock-count span,.maintenance-stock-count em{display:block;color:#6c776f;font-size:10px;font-style:normal;font-weight:850}.maintenance-stock-count em{margin-top:4px;color:#9a5b15}
        .maintenance-stock-empty{grid-column:1/-1;padding:40px;color:#718078;text-align:center}.maintenance-stock-footer{display:flex;align-items:center;justify-content:space-between;gap:20px;padding:18px 22px;background:#f2f6ef}.maintenance-stock-footer p{margin:0;color:#526458;font-size:12px;line-height:1.5}.maintenance-stock-footer a{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:11px;background:#315f3d;color:#fff;font-size:11px;font-weight:900;text-decoration:none;white-space:nowrap}
        @media(max-width:760px){.maintenance-stock-summary,.maintenance-stock-list{grid-template-columns:1fr}.maintenance-stock-list article{border-right:0}.maintenance-stock-heading,.maintenance-stock-footer{align-items:stretch;flex-direction:column}.maintenance-stock-heading label{width:100%}.maintenance-stock-footer a{width:100%}}
      `}</style>
    </main>
  )
}
