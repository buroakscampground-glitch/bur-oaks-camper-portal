'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Clock3, PackageCheck, Search, ShoppingBasket, Truck } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { markAdminAlertsSeen } from '../../../../lib/admin-alert-actions'

export default function AdminMaintenanceSuppliesPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [view, setView] = useState('Active')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadRequests()
  }, [])

  async function loadRequests() {
    const { data, error } = await supabase
      .from('maintenance_supply_requests')
      .select('*')
      .order('requested_at', { ascending: false })

    setMessage(error ? error.message : '')
    setRequests(data || [])
  }

  async function updateRequest(request: any, status: 'Requested' | 'Ordered' | 'Received' | 'Cancelled') {
    const now = new Date().toISOString()
    const updates = {
      status,
      ordered_at: status === 'Ordered' ? request.ordered_at || now : request.ordered_at,
      completed_at: status === 'Received' || status === 'Cancelled' ? now : null,
    }

    const { error } = await supabase
      .from('maintenance_supply_requests')
      .update(updates)
      .eq('id', request.id)

    setMessage(error ? error.message : status === 'Received' ? 'Supply request completed and moved to history.' : `Supply request marked ${status.toLowerCase()}.`)
    if (!error) {
      if (status !== 'Requested') await markAdminAlertsSeen(supabase, 'maintenance_request', request.id)
      loadRequests()
    }
  }

  const activeRequests = requests.filter((request) => request.status === 'Requested' || request.status === 'Ordered')
  const visibleRequests = requests.filter((request) => {
    const isActive = request.status === 'Requested' || request.status === 'Ordered'
    if (view === 'Active' && !isActive) return false
    if (view === 'History' && isActive) return false
    const term = search.trim().toLowerCase()
    return !term || `${request.item_name} ${request.requested_by} ${request.notes || ''}`.toLowerCase().includes(term)
  })

  return (
    <main className="admin-supplies-page">
      <style>{`
        .admin-supplies-page{display:grid;gap:18px;color:#273a2e}.admin-supplies-hero{padding:30px;border-radius:28px;background:radial-gradient(circle at 86% 12%,rgba(230,202,127,.22),transparent 30%),linear-gradient(135deg,#173722,#315f3d);color:#fff;box-shadow:0 22px 56px rgba(34,54,38,.16)}
        .admin-supplies-hero span,.admin-supplies-list-heading span{display:inline-flex;align-items:center;gap:8px;color:#e6ca7f;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.admin-supplies-list-heading span{color:#9a7834}.admin-supplies-hero h1{margin:10px 0 0;color:#fff;font:500 clamp(38px,5vw,60px)/1.02 Georgia,serif}.admin-supplies-hero p{max-width:760px;margin:13px 0 0;color:rgba(255,255,255,.84);line-height:1.55}
        .admin-supplies-stats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.admin-supplies-stats article{padding:18px;border:1px solid #dfddd3;border-radius:20px;background:#fff;box-shadow:0 12px 30px rgba(34,54,38,.07)}.admin-supplies-stats article.urgent{border-color:#e4b7aa;background:#fff3ef}.admin-supplies-stats small{color:#9a7834;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}.admin-supplies-stats strong{display:block;margin-top:5px;color:#263d2e;font:500 30px Georgia,serif}
        .admin-supplies-list{overflow:hidden;border:1px solid #dfddd3;border-radius:24px;background:#fff;box-shadow:0 14px 34px rgba(34,54,38,.07)}.admin-supplies-list-heading{display:flex;align-items:end;justify-content:space-between;gap:16px;padding:22px;border-bottom:1px solid #ebe7dd}.admin-supplies-list-heading h2{margin:5px 0 0;color:#263d2e;font:500 30px Georgia,serif}.admin-supplies-tools{display:flex;gap:9px}.admin-supplies-tools label{display:flex;align-items:center;gap:7px;padding:0 11px;border:1px solid #dce2da;border-radius:12px;background:#f8faf7}.admin-supplies-tools input{border:0!important;background:transparent!important;box-shadow:none!important}.admin-supplies-tools button{min-height:42px;background:#fff!important;color:#315f3d!important}.admin-supplies-tools button.selected{background:#315f3d!important;color:#fff!important}
        .admin-supply-request{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:16px;padding:20px 22px;border-bottom:1px solid #ebe7dd}.admin-supply-request:last-child{border-bottom:0}.admin-supply-request.urgent{background:linear-gradient(90deg,#fff2ed,#fff)}.admin-supply-request small{color:#9a7834;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.admin-supply-request h3{margin:5px 0 0;color:#263d2e;font-size:21px}.admin-supply-request p{margin:6px 0 0;color:#657168;font-size:13px;line-height:1.5}.admin-supply-request-actions{display:flex;align-items:center;flex-wrap:wrap;justify-content:flex-end;gap:8px}.admin-supply-request-actions button{display:inline-flex;align-items:center;gap:6px;min-height:39px}.admin-supply-request-actions .primary{background:#315f3d!important;color:#fff!important}.admin-supply-request-actions .complete{background:#e9f3e7!important;color:#315f3d!important}.admin-supply-status{display:inline-flex;padding:7px 10px;border-radius:999px;background:#f2eee4;color:#765d2b;font-size:10px;font-weight:900;text-transform:uppercase}.admin-supplies-message{margin:0;padding:12px 18px;border-radius:14px;background:#edf4ea;color:#315f3d;font-size:12px;font-weight:800}.admin-supplies-empty{padding:42px;color:#718078;text-align:center}
        @media(max-width:760px){.admin-supplies-stats{grid-template-columns:1fr}.admin-supplies-list-heading{align-items:stretch;flex-direction:column}.admin-supplies-tools{display:grid;grid-template-columns:1fr 1fr}.admin-supplies-tools label{grid-column:1/-1}.admin-supply-request{grid-template-columns:1fr}.admin-supply-request-actions{justify-content:flex-start}}
      `}</style>

      <section className="admin-supplies-hero">
        <span><ShoppingBasket size={18} /> MAINTENANCE SUPPLIES</span>
        <h1>One clean shopping list for the campground.</h1>
        <p>See exactly what the maintenance team needs, mark items ordered, and clear them when they arrive.</p>
      </section>

      <section className="admin-supplies-stats">
        <article><small>Waiting to order</small><strong>{requests.filter((request) => request.status === 'Requested').length}</strong></article>
        <article><small>Already ordered</small><strong>{requests.filter((request) => request.status === 'Ordered').length}</strong></article>
        <article className={activeRequests.some((request) => request.urgency === 'Urgent') ? 'urgent' : ''}><small>Urgent active</small><strong>{activeRequests.filter((request) => request.urgency === 'Urgent').length}</strong></article>
      </section>

      {message && <p className="admin-supplies-message">{message}</p>}

      <section className="admin-supplies-list">
        <div className="admin-supplies-list-heading">
          <div><span><PackageCheck size={17} /> REQUEST QUEUE</span><h2>{view === 'Active' ? 'Current shopping list' : 'Completed history'}</h2></div>
          <div className="admin-supplies-tools">
            <label><Search size={15} /><input placeholder="Search supplies…" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
            {['Active', 'History'].map((option) => <button type="button" className={view === option ? 'selected' : ''} onClick={() => setView(option)} key={option}>{option}</button>)}
          </div>
        </div>

        {visibleRequests.map((request) => (
          <article className={`admin-supply-request ${request.urgency === 'Urgent' && request.status !== 'Received' ? 'urgent' : ''}`} key={request.id}>
            <div>
              <small>{request.urgency} · Requested by {request.requested_by} · {new Date(request.requested_at).toLocaleString()}</small>
              <h3>{Number(request.quantity)} {request.unit} · {request.item_name}</h3>
              <p>{request.notes || 'No extra notes.'}</p>
            </div>
            <div className="admin-supply-request-actions">
              <span className="admin-supply-status">{request.status}</span>
              {request.status === 'Requested' && <button className="primary" type="button" onClick={() => updateRequest(request, 'Ordered')}><Truck size={15} /> Mark Ordered</button>}
              {request.status === 'Ordered' && <button type="button" onClick={() => updateRequest(request, 'Requested')}><Clock3 size={15} /> Back to List</button>}
              {(request.status === 'Requested' || request.status === 'Ordered') && <button className="complete" type="button" onClick={() => updateRequest(request, 'Received')}><CheckCircle2 size={15} /> Received / Done</button>}
              {(request.status === 'Requested' || request.status === 'Ordered') && <button type="button" onClick={() => updateRequest(request, 'Cancelled')}>Cancel</button>}
            </div>
          </article>
        ))}

        {visibleRequests.length === 0 && <div className="admin-supplies-empty"><CheckCircle2 size={34} /><h3>{view === 'Active' ? 'Shopping list is clear' : 'No completed requests yet'}</h3><p>{view === 'Active' ? 'New maintenance supply requests will appear here.' : 'Completed and cancelled items will be saved here.'}</p></div>}
      </section>
    </main>
  )
}
