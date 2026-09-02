'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, Landmark, Printer, RefreshCw, TriangleAlert } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

function money(cents: number) {
  return (Number(cents || 0) / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function date(value: string) {
  return new Date(value).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' })
}

async function api(path: string, init?: RequestInit) {
  const { data } = await supabase.auth.getSession()
  const response = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token || ''}`, ...(init?.headers || {}) } })
  const result = await response.json()
  if (!response.ok) throw new Error(result.error || 'Unable to load Stripe deposits.')
  return result
}

export default function StripeDepositsPage() {
  const [payouts, setPayouts] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState('')
  const [message, setMessage] = useState('')

  async function loadPayouts() {
    setLoading(true)
    setMessage('')
    try {
      const result = await api('/api/admin-stripe-payouts')
      setPayouts(result.payouts || [])
      if (!selected && result.payouts?.[0]) await openPayout(result.payouts[0].id)
    } catch (error: any) {
      setMessage(error.message)
    } finally {
      setLoading(false)
    }
  }

  async function openPayout(id: string) {
    setWorking(id)
    setMessage('')
    try {
      const result = await api(`/api/admin-stripe-payouts?id=${encodeURIComponent(id)}`)
      setSelected({ ...result.detail, printRecord: result.printRecord })
    } catch (error: any) {
      setMessage(error.message)
    } finally {
      setWorking('')
    }
  }

  async function printPayout() {
    if (!selected) return
    if (!window.confirm(`Print the exact ${money(selected.amountCents)} Stripe deposit breakdown on both office printers?`)) return
    setWorking('print')
    setMessage('')
    try {
      await api('/api/admin-stripe-payouts', { method: 'POST', body: JSON.stringify({ action: 'print', payoutId: selected.id }) })
      setMessage('The detailed Stripe deposit report was sent to both office printers.')
      await loadPayouts()
      await openPayout(selected.id)
    } catch (error: any) {
      setMessage(error.message)
    } finally {
      setWorking('')
    }
  }

  useEffect(() => { loadPayouts() }, [])

  return (
    <main className="stripe-deposit-page">
      <div className="stripe-deposit-shell">
        <a className="stripe-deposit-back" href="/admin"><ArrowLeft size={18} /> Command Center</a>
        <header className="stripe-deposit-hero">
          <div><small>BANK DEPOSIT CONTROL</small><h1>Stripe deposits, explained.</h1><p>Every bank deposit is matched to camper invoices, Stripe fees, refunds, and adjustments—down to the penny.</p></div>
          <button type="button" onClick={loadPayouts} disabled={loading || !!working}><RefreshCw size={17} /> {loading ? 'Syncing…' : 'Sync Stripe'}</button>
        </header>
        {message && <div className={`stripe-deposit-message ${message.startsWith('The detailed') ? 'success' : ''}`}>{message}</div>}

        <section className="stripe-deposit-layout">
          <aside className="stripe-deposit-list">
            <h2>Bank deposits</h2>
            <p>Newest first. Tap any deposit to see exactly what made up the total.</p>
            {payouts.map((payout) => (
              <button className={selected?.id === payout.id ? 'active' : ''} type="button" key={payout.id} onClick={() => openPayout(payout.id)}>
                <span><strong>{money(payout.amountCents)}</strong><small>{date(payout.arrivalDate)} · {payout.status}</small></span>
                {payout.printRecord?.status === 'sent' ? <CheckCircle2 size={20} /> : <Landmark size={20} />}
              </button>
            ))}
            {!loading && payouts.length === 0 && <p>No Stripe bank deposits were found.</p>}
          </aside>

          <section className="stripe-deposit-detail">
            {!selected ? <div className="stripe-deposit-empty">{loading || working ? 'Matching Stripe deposits to invoices…' : 'Choose a bank deposit.'}</div> : <>
              <div className="stripe-deposit-title">
                <div><small>EXPECTED BANK DEPOSIT</small><h2>{money(selected.amountCents)}</h2><p>{date(selected.arrivalDate)} · {selected.status} · {selected.rows.length} Stripe item{selected.rows.length === 1 ? '' : 's'}</p></div>
                <button type="button" onClick={printPayout} disabled={working === 'print'}><Printer size={17} /> {working === 'print' ? 'Sending…' : selected.printRecord?.status === 'sent' ? 'Reprint details' : 'Print details'}</button>
              </div>

              <div className={`stripe-deposit-check ${selected.summary.differenceCents === 0 ? 'balanced' : 'warning'}`}>
                {selected.summary.differenceCents === 0 ? <CheckCircle2 size={24} /> : <TriangleAlert size={24} />}
                <span><strong>{selected.summary.differenceCents === 0 ? 'Reconciled to the penny' : 'Review required'}</strong><small>Difference: {money(selected.summary.differenceCents)}</small></span>
              </div>

              <div className="stripe-deposit-summary">
                <article><small>Camper payments</small><strong>{money(selected.summary.paymentGrossCents)}</strong></article>
                <article><small>Refunds / reversals</small><strong>{money(selected.summary.refundsCents)}</strong></article>
                <article><small>Stripe fees</small><strong>{money(selected.summary.stripeFeesCents)}</strong></article>
                <article><small>Net bank deposit</small><strong>{money(selected.summary.payoutCents)}</strong></article>
              </div>

              <div className="stripe-deposit-table-wrap">
                <table className="stripe-deposit-table">
                  <thead><tr><th>Date</th><th>Who / what</th><th>Invoice</th><th>Gross</th><th>Stripe fee</th><th>Net</th></tr></thead>
                  <tbody>{selected.rows.map((row: any) => <tr key={row.id}>
                    <td>{date(row.created)}</td>
                    <td>{row.invoices.length ? row.invoices.map((invoice: any) => <div key={invoice.id}><strong>Lot {invoice.lot} · {invoice.camper}</strong><small>{invoice.invoiceType}</small></div>) : <div><strong>{row.description}</strong><small>{row.type.replaceAll('_', ' ')}</small></div>}</td>
                    <td>{row.invoices.length ? <>{row.invoices.map((invoice: any) => <a href={`/admin/invoices/${invoice.id}`} key={invoice.id}>{invoice.invoiceNumber} · {money(invoice.amountCents)}</a>)}{row.camperCheckoutFeeCents > 0 && <small>Camper checkout fee · {money(row.camperCheckoutFeeCents)}</small>}</> : '—'}</td>
                    <td>{money(row.grossCents)}</td><td className={row.feeCents < 0 ? 'negative' : ''}>{money(row.feeCents)}</td><td><strong>{money(row.netCents)}</strong></td>
                  </tr>)}</tbody>
                  <tfoot><tr><td colSpan={3}>TOTAL BANK DEPOSIT</td><td>{money(selected.rows.reduce((sum: number, row: any) => sum + row.grossCents, 0))}</td><td>{money(selected.rows.reduce((sum: number, row: any) => sum + row.feeCents, 0))}</td><td>{money(selected.summary.calculatedNetCents)}</td></tr></tfoot>
                </table>
              </div>
              <p className="stripe-deposit-footnote">Stripe payout ID: {selected.id}. Automatic reports print when Stripe finishes assigning every transaction to the bank deposit. Use Reprint details anytime you need another paper copy.</p>
            </>}
          </section>
        </section>
      </div>
    </main>
  )
}
