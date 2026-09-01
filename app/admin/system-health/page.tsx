'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSearch,
  Gauge,
  Loader2,
  MailWarning,
  RefreshCw,
  Search,
  ShieldCheck,
  UsersRound,
  Zap,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

type View = 'health' | 'search' | 'delivery' | 'access' | 'activity'

function money(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function shortDate(value: unknown) {
  const date = new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function textMatch(query: string, ...values: unknown[]) {
  return values.some((value) => String(value || '').toLowerCase().includes(query))
}

export default function SystemHealthPage() {
  const [snapshot, setSnapshot] = useState<any>(null)
  const [view, setView] = useState<View>('health')
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  async function load() {
    setLoading(true)
    setMessage('')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      window.location.href = '/login'
      return
    }
    const response = await fetch('/api/admin-operations', { headers: { Authorization: `Bearer ${token}` } })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) setMessage(result.error || 'The operations snapshot could not be loaded.')
    else setSnapshot(result.snapshot)
    setLoading(false)
  }

  useEffect(() => {
    const initialQuery = new URLSearchParams(window.location.search).get('q') || ''
    if (initialQuery) {
      setQuery(initialQuery)
      setView('search')
    }
    load()
  }, [])

  async function downloadBackup() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return
    setMessage('Preparing the monthly operations backup…')
    const response = await fetch('/api/admin-operations?export=1', { headers: { Authorization: `Bearer ${token}` } })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      setMessage(result.error || 'The backup could not be prepared.')
      return
    }
    const blob = await response.blob()
    const disposition = response.headers.get('content-disposition') || ''
    const filename = disposition.match(/filename="([^"]+)"/)?.[1] || 'bur-oaks-operations-backup.json'
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Monthly operations backup downloaded.')
  }

  const normalizedQuery = query.trim().toLowerCase()
  const results = useMemo(() => {
    if (!snapshot || !normalizedQuery) return { campers: [], invoices: [], maintenance: [], documents: [] }
    return {
      campers: snapshot.campers.filter((item: any) => textMatch(normalizedQuery, item.first_name, item.last_name, item.second_profile_first_name, item.second_profile_last_name, item.lot_number, item.email, item.secondary_email, item.phone, item.alternate_phone, item.second_profile_phone)).slice(0, 30),
      invoices: snapshot.invoices.filter((item: any) => textMatch(normalizedQuery, item.invoice_number, item.invoice_type, item.campers?.first_name, item.campers?.last_name, item.campers?.lot_number)).slice(0, 30),
      maintenance: snapshot.maintenance.filter((item: any) => textMatch(normalizedQuery, item.title, item.status, item.priority, item.lot_number)).slice(0, 30),
      documents: snapshot.documents.filter((item: any) => textMatch(normalizedQuery, item.document_name, item.document_type, item.signature_status, item.campers?.first_name, item.campers?.last_name, item.campers?.lot_number)).slice(0, 30),
    }
  }, [snapshot, normalizedQuery])
  const resultCount = Object.values(results).reduce((sum, rows) => sum + rows.length, 0)

  if (loading) return <main className="operations-health-page"><div className="operations-health-loading"><Loader2 size={28} /><strong>Checking every portal system…</strong></div></main>

  return (
    <main className="operations-health-page">
      <section className="operations-health-hero">
        <div>
          <span><ShieldCheck size={16} /> OPERATIONS CONTROL</span>
          <h1>System health and oversight</h1>
          <p>One place to find problems, search every record, review access, confirm deliveries, and protect campground data.</p>
        </div>
        <div className="operations-health-actions">
          <button type="button" onClick={load}><RefreshCw size={16} /> Refresh</button>
          <button type="button" onClick={downloadBackup}><Download size={16} /> Download monthly backup</button>
        </div>
      </section>

      {message && <p className="operations-health-message">{message}</p>}

      <section className="operations-health-kpis">
        <article><span><Gauge size={20} /></span><small>Open balance</small><strong>{money(snapshot?.totals.openBalance)}</strong><em>{money(snapshot?.totals.pastDueBalance)} past due</em></article>
        <article><span><Zap size={20} /></span><small>Electric this month</small><strong>{money(snapshot?.totals.electricInvoiced)}</strong><em>{snapshot?.totals.electricSitesLeft} sites left</em></article>
        <article><span><MailWarning size={20} /></span><small>Delivery failures</small><strong>{snapshot?.totals.failedDeliveries}</strong><em>Last 30 days</em></article>
        <article><span><UsersRound size={20} /></span><small>Access relationships</small><strong>{snapshot?.access.length}</strong><em>{snapshot?.totals.optedOutCampers} not opted into texts</em></article>
      </section>

      <nav className="operations-health-tabs" aria-label="Operations health views">
        {([
          ['health', 'System health'],
          ['search', 'Search everything'],
          ['delivery', 'Delivery history'],
          ['access', 'Access & privacy'],
          ['activity', 'Recent activity'],
        ] as Array<[View, string]>).map(([key, label]) => <button type="button" className={view === key ? 'active' : ''} onClick={() => setView(key)} key={key}>{label}</button>)}
      </nav>

      {view === 'health' && (
        <section className="operations-health-panel">
          <header><div><span>LIVE CHECKS</span><h2>What needs attention</h2></div><small>Updated {shortDate(snapshot?.generatedAt)}</small></header>
          <div className="operations-health-checks">
            {snapshot?.health.map((item: any) => (
              <a className={item.tone} href={item.href} key={item.key}>
                <span>{item.count ? <AlertTriangle size={20} /> : <CheckCircle2 size={20} />}</span>
                <div><strong>{item.label}</strong><small>{item.count ? `${item.count} need attention` : 'All clear'}</small></div>
                <em>{item.count}</em><ArrowRight size={16} />
              </a>
            ))}
          </div>
          {snapshot?.errors.length > 0 && <div className="operations-health-errors"><strong>Data checks needing technical review</strong>{snapshot.errors.map((error: string) => <p key={error}>{error}</p>)}</div>}
        </section>
      )}

      {view === 'search' && (
        <section className="operations-health-panel">
          <header><div><span>GLOBAL LOOKUP</span><h2>Search every record</h2></div></header>
          <label className="operations-global-search"><Search size={20} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, lot, phone, email, invoice, document, or work order…" /></label>
          {!normalizedQuery ? <div className="operations-health-empty"><FileSearch size={30} /><strong>Type anything you know.</strong><p>The search checks campers, invoices, documents, and maintenance together.</p></div> : (
            <div className="operations-search-results">
              <p>{resultCount} result{resultCount === 1 ? '' : 's'} for “{query}”</p>
              {results.campers.map((item: any) => <a href={`/admin/campers/${item.id}`} key={`c-${item.id}`}><span>Camper · Lot {item.lot_number || '—'}</span><strong>{item.first_name} {item.last_name}</strong><small>{item.email || item.phone || 'Open camper record'}</small><ArrowRight size={16} /></a>)}
              {results.invoices.map((item: any) => <a href={`/admin/invoices/${item.id}`} key={`i-${item.id}`}><span>Invoice · Lot {item.campers?.lot_number || '—'}</span><strong>{item.invoice_number} · {money(item.total_due)}</strong><small>{item.invoice_type} · {item.status}</small><ArrowRight size={16} /></a>)}
              {results.maintenance.map((item: any) => <a href={`/admin/maintenance/${item.id}`} key={`m-${item.id}`}><span>Maintenance · Lot {item.lot_number || '—'}</span><strong>{item.title || 'Work order'}</strong><small>{item.status} · {item.priority || 'Normal'}</small><ArrowRight size={16} /></a>)}
              {results.documents.map((item: any) => <a href="/admin/documents" key={`d-${item.id}`}><span>Document · Lot {item.campers?.lot_number || '—'}</span><strong>{item.document_name}</strong><small>{item.signature_status || 'Pending'}</small><ArrowRight size={16} /></a>)}
              {!resultCount && <div className="operations-health-empty"><FileSearch size={30} /><strong>No records matched.</strong><p>Try a shorter name, lot number, or part of the email.</p></div>}
            </div>
          )}
        </section>
      )}

      {view === 'delivery' && (
        <section className="operations-health-panel" id="delivery">
          <header><div><span>COMMUNICATION & PRINTING</span><h2>Delivery history</h2></div><a href="/admin/texts">Open full text history <ArrowRight size={15} /></a></header>
          {snapshot?.failures.length > 0 && <div className="operations-delivery-warning"><AlertTriangle size={18} /><strong>{snapshot.failures.length} recent delivery failure{snapshot.failures.length === 1 ? '' : 's'} need review.</strong></div>}
          {snapshot?.deliveryHistory.length ? <div className="operations-delivery-list">{snapshot.deliveryHistory.map((item: any) => <article className={['failed', 'partial'].includes(String(item.status).toLowerCase()) ? 'failed' : 'success'} key={item.id}><span>{item.channel}</span><div><strong>{item.recipient || 'Scheduled system job'}{item.lot ? ` · Lot ${item.lot}` : ''}</strong><small>{item.detail}</small></div><em>{item.status}</em><time>{shortDate(item.date)}</time></article>)}</div> : <div className="operations-health-empty success"><CheckCircle2 size={30} /><strong>No recent delivery activity.</strong></div>}
        </section>
      )}

      {view === 'access' && (
        <section className="operations-health-panel">
          <header><div><span>ACCESS & PRIVACY</span><h2>Who can reach each account</h2></div><small>Household profiles and authorized bill payers</small></header>
          <div className="operations-access-list">{snapshot?.access.map((item: any, index: number) => <article key={`${item.kind}-${item.camperId}-${index}`}><span>{item.kind === 'billing-delegate' ? 'BILLING ONLY' : 'HOUSEHOLD'}</span><div><strong>Lot {item.lotNumber || '—'} · {item.camperName}</strong><small>{item.secondaryName || item.secondaryEmail || 'Additional household contact'}</small></div><div><small>{item.secondaryEmail}</small><em>{item.phones.length ? `${item.phones.length} saved phone${item.phones.length === 1 ? '' : 's'}` : 'No extra phones'}</em></div><a href={item.camperId ? `/admin/campers/${item.camperId}` : '/admin/campers'}>Review <ArrowRight size={14} /></a></article>)}</div>
          {!snapshot?.access.length && <div className="operations-health-empty success"><CheckCircle2 size={30} /><strong>No shared access relationships.</strong></div>}
        </section>
      )}

      {view === 'activity' && (
        <section className="operations-health-panel">
          <header><div><span>CAMPGROUND AUDIT TRAIL</span><h2>Recent activity</h2></div><small>Newest first</small></header>
          <div className="operations-activity-list">{snapshot?.recentActivity.map((item: any) => <a href={item.href} key={item.id}><span><Activity size={17} /></span><div><strong>{item.title}</strong><small>{item.lot ? `Lot ${item.lot} · ` : ''}{item.detail}</small></div><time>{shortDate(item.date)}</time><ArrowRight size={15} /></a>)}</div>
        </section>
      )}
    </main>
  )
}
