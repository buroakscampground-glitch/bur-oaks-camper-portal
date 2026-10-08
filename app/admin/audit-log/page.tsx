'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowRight, FileClock, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

const labels: Record<string,string> = {
  manual_payment_recorded: 'Manual payment recorded', late_fee_waived: 'Late fee waived', invoice_deleted: 'Invoice deleted',
  account_credit_created: 'Account credit created', account_credit_voided: 'Account credit voided', camper_archived: 'Camper archived',
  camper_restored: 'Camper restored', camper_profile_updated: 'Camper profile updated', camper_rent_terms_updated: 'Rent terms updated',
  renewal_override: 'Renewal changed',
}
const moneyActions = new Set(['manual_payment_recorded','late_fee_waived','invoice_deleted','account_credit_created','account_credit_voided','camper_rent_terms_updated'])

function displayValue(value: unknown) {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export default function AdminAuditLogPage() {
  const [events,setEvents] = useState<any[]>([])
  const [summary,setSummary] = useState<any>({})
  const [loading,setLoading] = useState(true)
  const [error,setError] = useState('')
  const [search,setSearch] = useState('')
  const [filter,setFilter] = useState('all')

  async function load() {
    setLoading(true); setError('')
    try {
      const { data } = await supabase.auth.getSession()
      if (!data.session?.access_token) throw new Error('Your admin login expired. Please sign in again.')
      const response = await fetch('/api/admin-audit-events?limit=500', { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok) throw new Error(result?.error || 'The office audit trail could not be loaded.')
      setEvents(result.events || []); setSummary(result.summary || {})
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'The office audit trail could not be loaded.'); setEvents([]) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return events.filter((event) => {
      if (filter === 'money' && !moneyActions.has(event.action)) return false
      if (filter === 'renewal' && event.action !== 'renewal_override') return false
      if (filter === 'profile' && !['camper_profile_updated','camper_archived','camper_restored'].includes(event.action)) return false
      if (!needle) return true
      const camperName = `${event.camper?.first_name || ''} ${event.camper?.last_name || ''}`
      return `${event.action} ${event.reason} ${event.actor_email} ${event.lot_number || ''} ${camperName}`.toLowerCase().includes(needle)
    })
  },[events,filter,search])

  return <main className="audit-page">
    <header><div><span><ShieldCheck size={16}/> IMMUTABLE OFFICE HISTORY</span><h1>Audit Trail</h1><p>Who changed what, why they changed it, and the exact values before and after.</p></div><button onClick={() => void load()} disabled={loading}><RefreshCw size={16}/>{loading?'Checking…':'Refresh'}</button></header>
    <section className="audit-kpis"><article><small>Changes loaded</small><strong>{summary.totalLoaded || 0}</strong></article><article><small>Financial changes</small><strong>{summary.financial || 0}</strong></article><article><small>Campers affected</small><strong>{summary.campsites || 0}</strong></article><article><small>Office actors</small><strong>{summary.actors || 0}</strong></article></section>
    <section className="audit-tools"><label><Search size={16}/><input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Search lot, camper, reason, or administrator"/></label><div>{[['all','All'],['money','Money'],['renewal','Renewals'],['profile','Profiles']].map(([value,label])=><button key={value} className={filter===value?'active':''} onClick={()=>setFilter(value)}>{label}</button>)}</div></section>
    {error && <div className="audit-error"><strong>Audit history unavailable</strong><p>{error}</p><button onClick={()=>void load()}>Try again</button></div>}
    {!error && <section className="audit-list">
      {visible.map((event) => {
        const keys=[...new Set([...Object.keys(event.before_state || {}),...Object.keys(event.after_state || {})])]
        const name=`${event.camper?.first_name || ''} ${event.camper?.last_name || ''}`.trim()
        return <article key={event.id}><div className="audit-head"><span><FileClock size={17}/></span><div><small>{new Date(event.created_at).toLocaleString()} · {event.actor_email}</small><strong>{labels[event.action] || String(event.action).replaceAll('_',' ')}</strong><p>{event.reason}</p></div>{event.camper_id?<a href={`/admin/campers/${event.camper_id}`}>Lot {event.lot_number || event.camper?.lot_number || '—'}{name?` · ${name}`:''}<ArrowRight size={14}/></a>:<em>{event.entity_type}</em>}</div>
          {!!keys.length && <div className="audit-diff">{keys.map((key)=><div key={key}><b>{key.replace(/([A-Z])/g,' $1')}</b><span>{displayValue(event.before_state?.[key])}</span><ArrowRight size={13}/><span>{displayValue(event.after_state?.[key])}</span></div>)}</div>}
        </article>
      })}
      {!loading && !visible.length && <div className="audit-empty"><FileClock size={28}/><strong>No audit events match this view.</strong><p>Protected office changes will appear here automatically.</p></div>}
    </section>}
    <style jsx>{`
      .audit-page{max-width:1280px;margin:0 auto;padding:28px}.audit-page header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start}.audit-page header span{display:flex;gap:7px;align-items:center;color:#897035;font-weight:800;font-size:12px;letter-spacing:.12em}.audit-page h1{font:500 44px/1.05 Georgia,serif;margin:8px 0}.audit-page header p{color:#5e675f;margin:0}.audit-page button,.audit-page a{min-height:44px;border-radius:999px;border:1px solid #d9d5ca;background:#fff;color:#214b31;font-weight:800;display:inline-flex;gap:7px;align-items:center;justify-content:center;padding:0 16px;text-decoration:none;cursor:pointer}.audit-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:24px 0}.audit-kpis article{background:#fff;border:1px solid #e4e0d6;border-radius:18px;padding:18px}.audit-kpis small{display:block;color:#6d746d}.audit-kpis strong{display:block;font-size:28px;margin-top:6px}.audit-tools{display:flex;gap:14px;justify-content:space-between;margin-bottom:18px}.audit-tools label{flex:1;display:flex;align-items:center;gap:9px;background:#fff;border:1px solid #ddd8cc;border-radius:999px;padding:0 15px}.audit-tools input{width:100%;min-height:46px;border:0;outline:0;background:transparent}.audit-tools div{display:flex;gap:7px}.audit-tools button.active{background:#214b31;color:#fff}.audit-list{display:grid;gap:12px}.audit-list>article{background:#fff;border:1px solid #e4e0d6;border-radius:20px;padding:18px}.audit-head{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start}.audit-head>span{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:#eef4ef;color:#214b31}.audit-head small{color:#777}.audit-head strong{display:block;font-size:18px;margin:3px 0}.audit-head p{margin:0;color:#465149}.audit-head em{font-style:normal;color:#777}.audit-diff{margin:14px 0 0 50px;border-top:1px solid #eee9de;padding-top:10px}.audit-diff div{display:grid;grid-template-columns:minmax(130px,.7fr) 1fr auto 1fr;gap:10px;align-items:center;padding:7px 0;font-size:13px}.audit-diff b{text-transform:capitalize}.audit-diff span{background:#f7f5ef;border-radius:8px;padding:7px;overflow-wrap:anywhere}.audit-error,.audit-empty{padding:30px;text-align:center;background:#fff7ed;border:1px solid #ead5bd;border-radius:18px}.audit-empty{background:#fff;border-color:#e4e0d6}.audit-empty svg{color:#8d7846}.audit-empty strong{display:block;margin-top:8px}@media(max-width:760px){.audit-page{padding:18px 14px}.audit-page header{display:block}.audit-page header button{margin-top:15px}.audit-kpis{grid-template-columns:1fr 1fr}.audit-tools{display:block}.audit-tools div{margin-top:10px;overflow:auto}.audit-head{grid-template-columns:auto 1fr}.audit-head a,.audit-head em{grid-column:2}.audit-diff{margin-left:0}.audit-diff div{grid-template-columns:1fr}.audit-diff svg{transform:rotate(90deg)}}
    `}</style>
  </main>
}
