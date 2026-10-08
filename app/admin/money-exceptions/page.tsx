'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, CircleDollarSign, RefreshCw, TriangleAlert } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

function money(cents: unknown) {
  return Number(cents || 0) / 100
}

async function loadExceptions() {
  const { data } = await supabase.auth.getSession()
  const response = await fetch('/api/admin-money-exceptions', {
    headers: { Authorization: `Bearer ${data.session?.access_token || ''}` }, cache: 'no-store',
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || 'The money exception check could not be loaded.')
  return result
}

export default function MoneyExceptionsPage() {
  const [result, setResult] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function refresh() {
    setLoading(true)
    setError('')
    try { setResult(await loadExceptions()) }
    catch (loadError: any) { setResult(null); setError(loadError?.message || 'The money exception check could not be loaded.') }
    finally { setLoading(false) }
  }

  useEffect(() => { void refresh() }, [])

  if (!loading && error) return <main className="portal-loading" role="alert"><TriangleAlert /><h1>Money exceptions are temporarily unavailable</h1><p>{error} No “all clear” is shown until every source can be verified.</p><button className="portal-loading-retry" onClick={refresh}>Try again</button></main>

  return <main className="money-exception-page">
    <div className="money-exception-shell">
      <a className="money-exception-back" href="/admin"><ArrowLeft size={18} /> Command Center</a>
      <header className="money-exception-hero">
        <div><small>MONEY SAFETY NET</small><h1>Problems that need a human.</h1><p>One read-only queue for failed deposits, open disputes, stuck refunds, overdue ACH processing, and payment alerts.</p></div>
        <button type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} /> {loading ? 'Checking…' : 'Check again'}</button>
      </header>
      {loading && <section className="money-exception-loading"><RefreshCw size={22} /> Checking billing records and Stripe…</section>}
      {result && <>
        <section className={`money-exception-summary ${result.counts.total ? 'warning' : 'clear'}`}>
          {result.counts.total ? <TriangleAlert size={30} /> : <CheckCircle2 size={30} />}
          <div><small>CURRENT RESULT</small><h2>{result.counts.total ? `${result.counts.total} item${result.counts.total === 1 ? '' : 's'} to review` : 'No money exceptions found'}</h2><p>{result.counts.total ? `${result.counts.urgent} urgent · ${result.counts.watch} still processing` : 'Deposits, disputes, refunds, ACH processing, and payment alerts are clear.'}</p></div>
        </section>
        <section className="money-exception-list">
          {result.exceptions.map((item: any) => <a href={item.href} className={item.severity} key={item.id}>
            <span className="money-exception-icon"><CircleDollarSign size={22} /></span>
            <span><small>{item.kind.replaceAll('-', ' ')}{item.lotNumber ? ` · LOT ${item.lotNumber}` : ''}</small><strong>{item.title}</strong><p>{item.detail}</p>{item.occurredAt && <em>{new Date(item.occurredAt).toLocaleString()}</em>}</span>
            <b>{item.amountCents == null ? 'Open record →' : `${money(item.amountCents).toLocaleString('en-US', { style: 'currency', currency: 'USD' })} →`}</b>
          </a>)}
          {!result.exceptions.length && <div className="money-exception-empty"><CheckCircle2 size={34} /><h2>The queue is empty.</h2><p>That is the good kind of boring.</p></div>}
        </section>
      </>}
    </div>
  </main>
}
