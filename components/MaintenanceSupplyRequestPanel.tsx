'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, PackagePlus, ShoppingBasket } from 'lucide-react'
import { supabase } from '../lib/supabase'

const commonSupplies = ['Hand soap', 'Bleach', 'Toilet paper', 'Paper towels', 'Trash bags', 'Mop bucket']

export default function MaintenanceSupplyRequestPanel() {
  const [itemName, setItemName] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unit, setUnit] = useState('each')
  const [urgency, setUrgency] = useState('Normal')
  const [notes, setNotes] = useState('')
  const [requests, setRequests] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadRequests()
  }, [])

  async function loadRequests() {
    const { data } = await supabase
      .from('maintenance_supply_requests')
      .select('*')
      .in('status', ['Requested', 'Ordered'])
      .order('requested_at', { ascending: false })
      .limit(8)

    setRequests(data || [])
  }

  async function submitRequest() {
    if (!itemName.trim()) {
      setMessage('Choose or type the item you need.')
      return
    }

    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token

    if (!token) {
      setMessage('Please sign out and back in before requesting supplies.')
      return
    }

    setSaving(true)
    setMessage('Sending request to the office…')

    const response = await fetch('/api/maintenance-supply-requests', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ itemName, quantity, unit, urgency, notes }),
    })

    const result = await response.json().catch(() => null)
    setSaving(false)

    if (!response.ok || !result?.success) {
      setMessage(result?.error || 'Unable to send the supply request. Please try again.')
      return
    }

    setItemName('')
    setQuantity('1')
    setUnit('each')
    setUrgency('Normal')
    setNotes('')
    setMessage('Supply request sent to the office.')
    loadRequests()
  }

  return (
    <section className="maintenance-supply-card">
      <style>{`
        .maintenance-supply-card{max-width:1220px;margin:0 auto 18px;overflow:hidden;border:1px solid #d9d4c7;border-radius:24px;background:linear-gradient(135deg,#fffdf8,#f3f7f0);box-shadow:0 12px 32px rgba(38,59,45,.08)}
        .maintenance-supply-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;padding:22px;border-bottom:1px solid #e7e3d9}
        .maintenance-supply-heading span{display:inline-flex;align-items:center;gap:7px;color:#9a7834;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}
        .maintenance-supply-heading h2{margin:6px 0 0;color:#263d2e;font:500 29px Georgia,serif}
        .maintenance-supply-heading p{margin:5px 0 0;color:#68746c;font-size:12px}
        .maintenance-supply-heading>strong{padding:9px 13px;border-radius:999px;background:#315f3d;color:#fff;font-size:11px;white-space:nowrap}
        .maintenance-supply-body{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);gap:18px;padding:20px 22px 22px}
        .maintenance-supply-form{display:grid;gap:11px}.maintenance-supply-quick{display:flex;flex-wrap:wrap;gap:8px}
        .maintenance-supply-quick button{min-height:36px;padding:0 11px;border:1px solid #d5ddd2!important;border-radius:999px!important;background:#fff!important;color:#315f3d!important;font-size:11px;font-weight:900}
        .maintenance-supply-quick button.selected{border-color:#315f3d!important;background:#315f3d!important;color:#fff!important}
        .maintenance-supply-fields{display:grid;grid-template-columns:minmax(0,1fr) 90px 120px 120px;gap:9px}
        .maintenance-supply-form input,.maintenance-supply-form select,.maintenance-supply-form textarea{width:100%;border:1px solid #d6ddd3!important;border-radius:12px!important;background:#fff!important}.maintenance-supply-form textarea{min-height:74px}
        .maintenance-supply-submit{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;border:0!important;border-radius:12px!important;background:#315f3d!important;color:#fff!important;font-weight:900}.maintenance-supply-submit:disabled{opacity:.65}
        .maintenance-supply-message{margin:0;color:#526458;font-size:12px;font-weight:800}
        .maintenance-supply-active{padding:16px;border-radius:18px;background:#fff;border:1px solid #e1e5dd}.maintenance-supply-active h3{display:flex;align-items:center;gap:8px;margin:0 0 10px;color:#263d2e;font-size:15px}
        .maintenance-supply-active article{padding:10px 0;border-top:1px solid #ece9df}.maintenance-supply-active article:first-of-type{border-top:0}.maintenance-supply-active strong{display:block;color:#263d2e;font-size:13px}.maintenance-supply-active small{display:block;margin-top:3px;color:#77837b;font-size:10px}.maintenance-supply-active .urgent{color:#a33f31}.maintenance-supply-empty{color:#718078;font-size:12px;line-height:1.5}
        @media(max-width:850px){.maintenance-supply-body{grid-template-columns:1fr}.maintenance-supply-fields{grid-template-columns:1fr 1fr}.maintenance-supply-fields input:first-child{grid-column:1/-1}}
        @media(max-width:560px){.maintenance-supply-heading{align-items:stretch;flex-direction:column}.maintenance-supply-body{padding:16px}.maintenance-supply-fields{grid-template-columns:1fr}.maintenance-supply-fields input:first-child{grid-column:auto}.maintenance-supply-quick{display:grid;grid-template-columns:1fr 1fr}.maintenance-supply-quick button{height:auto;min-height:42px;white-space:normal}}
      `}</style>

      <div className="maintenance-supply-heading">
        <div>
          <span><ShoppingBasket size={17} /> SUPPLIES RUNNING LOW?</span>
          <h2>Request supplies from the office</h2>
          <p>Soap, bleach, cleaning tools, paper products, parts, or anything else the team needs.</p>
        </div>
        <strong>{requests.length} active request{requests.length === 1 ? '' : 's'}</strong>
      </div>

      <div className="maintenance-supply-body">
        <div className="maintenance-supply-form">
          <div className="maintenance-supply-quick">
            {commonSupplies.map((item) => (
              <button type="button" className={itemName === item ? 'selected' : ''} onClick={() => setItemName(item)} key={item}>{item}</button>
            ))}
          </div>

          <div className="maintenance-supply-fields">
            <input aria-label="Supply item" placeholder="Or type another item…" value={itemName} onChange={(event) => setItemName(event.target.value)} />
            <input aria-label="Quantity" inputMode="decimal" placeholder="Qty" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            <select aria-label="Unit" value={unit} onChange={(event) => setUnit(event.target.value)}>
              <option value="each">Each</option><option value="bottle">Bottle</option><option value="box">Box</option><option value="case">Case</option><option value="roll">Roll</option><option value="bag">Bag</option><option value="gallon">Gallon</option>
            </select>
            <select aria-label="Urgency" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
              <option>Normal</option><option>Urgent</option>
            </select>
          </div>

          <textarea aria-label="Supply request notes" placeholder="Optional note — where it is used, preferred size or brand, etc." value={notes} onChange={(event) => setNotes(event.target.value)} />
          <button className="maintenance-supply-submit" type="button" onClick={submitRequest} disabled={saving}><PackagePlus size={17} /> {saving ? 'Sending…' : 'Send Supply Request'}</button>
          {message && <p className="maintenance-supply-message">{message}</p>}
        </div>

        <aside className="maintenance-supply-active">
          <h3><CheckCircle2 size={17} /> What the office sees</h3>
          {requests.map((request) => (
            <article key={request.id}>
              <strong className={request.urgency === 'Urgent' ? 'urgent' : ''}>{request.item_name} · {Number(request.quantity)} {request.unit}</strong>
              <small>{request.status === 'Ordered' ? 'Office marked this ordered' : 'Waiting for office'} · {new Date(request.requested_at).toLocaleDateString()}</small>
            </article>
          ))}
          {requests.length === 0 && <p className="maintenance-supply-empty"><AlertTriangle size={16} /> No active supply requests. New requests will show here until the office marks them received.</p>}
        </aside>
      </div>
    </section>
  )
}
