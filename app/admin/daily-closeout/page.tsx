'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, ClipboardCheck, Printer, RefreshCw, TriangleAlert } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

function campgroundToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function name(row: any) {
  return `${row.campers?.first_name || ''} ${row.campers?.last_name || ''}`.trim() || 'Camper'
}

function time(value?: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
}

async function loadCloseout(date: string) {
  const { data } = await supabase.auth.getSession()
  const response = await fetch(`/api/admin-daily-closeout?date=${encodeURIComponent(date)}`, {
    headers: { Authorization: `Bearer ${data.session?.access_token || ''}` }, cache: 'no-store',
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.error || 'The daily money closeout could not be loaded.')
  return result
}

export default function DailyCloseoutPage() {
  const [date, setDate] = useState(campgroundToday())
  const [closeout, setCloseout] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  async function refresh() {
    setLoading(true)
    setLoadError('')
    try {
      setCloseout(await loadCloseout(date))
    } catch (error: any) {
      setCloseout(null)
      setLoadError(error?.message || 'The daily money closeout could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [date])

  if (!loading && loadError) return (
    <main className="portal-loading" role="alert">
      <TriangleAlert aria-hidden="true" />
      <h1>Daily money closeout is temporarily unavailable</h1>
      <p>{loadError} No totals are shown until invoices, payments, credits, and bank deposits can all be verified.</p>
      <button className="portal-loading-retry" type="button" onClick={refresh}>Try again</button>
    </main>
  )

  const totals = closeout?.totals || {}
  const counts = closeout?.counts || {}
  return (
    <main className="daily-closeout-page" data-print-daily-closeout>
      <div className="daily-closeout-shell">
        <a className="daily-closeout-back" href="/admin"><ArrowLeft size={18} /> Command Center</a>
        <header className="daily-closeout-hero">
          <div><small>DAILY MONEY CONTROL</small><h1>Every dollar, closed out.</h1><p>Payments received, invoice allocations, saved credits, credit use, and bank deposits in one read-only check.</p></div>
          <div className="daily-closeout-controls">
            <label><span>Campground date</span><input type="date" value={date} max={campgroundToday()} onChange={(event) => setDate(event.target.value)} /></label>
            <button type="button" onClick={refresh} disabled={loading}><RefreshCw size={16} /> {loading ? 'Checking…' : 'Refresh'}</button>
            <button type="button" onClick={() => window.print()} disabled={!closeout}><Printer size={16} /> Print</button>
          </div>
        </header>

        {loading && <section className="daily-closeout-loading"><RefreshCw size={22} /> Verifying every money source…</section>}
        {closeout && <>
          <section className={`daily-closeout-balance ${closeout.balanced && !counts.payoutProblems ? 'balanced' : 'warning'}`}>
            {closeout.balanced && !counts.payoutProblems ? <CheckCircle2 size={27} /> : <TriangleAlert size={27} />}
            <div><small>PAYMENT ALLOCATION CHECK</small><h2>{closeout.balanced ? 'Every payment dollar is explained' : 'Review required before closing the day'}</h2><p>Received {money(totals.received)} = {money(totals.invoiceAllocations)} applied to invoices + {money(totals.savedCredit)} saved as credit. Difference: <strong>{money(totals.difference)}</strong>.{counts.unclassifiedInvoices ? ` ${counts.unclassifiedInvoices} paid invoice${counts.unclassifiedInvoices === 1 ? '' : 's'} has no matching online or office-payment ledger.` : ''}</p></div>
          </section>

          <section className="daily-closeout-kpis" aria-label="Daily closeout totals">
            <article><small>Total received</small><strong>{money(totals.received)}</strong><span>{counts.onlineInvoices} online invoice{counts.onlineInvoices === 1 ? '' : 's'} · {counts.manualPayments} office payment{counts.manualPayments === 1 ? '' : 's'}</span></article>
            <article><small>Applied to invoices</small><strong>{money(totals.invoiceAllocations)}</strong><span>From today’s online and office payments</span></article>
            <article><small>Saved as credit</small><strong>{money(totals.savedCredit)}</strong><span>{counts.creditsCreated} new payment remainder{counts.creditsCreated === 1 ? '' : 's'}</span></article>
            <article><small>Existing credit used</small><strong>{money(totals.creditsApplied)}</strong><span>{counts.creditsApplied} credit application{counts.creditsApplied === 1 ? '' : 's'}</span></article>
            <article><small>Arrived at bank</small><strong>{money(totals.bankDeposits)}</strong><span>{counts.bankDeposits} Stripe deposit{counts.bankDeposits === 1 ? '' : 's'}{counts.payoutProblems ? ` · ${counts.payoutProblems} needs review` : ''}</span></article>
          </section>

          <section className="daily-closeout-explainer">
            <ClipboardCheck size={21} /><p><strong>Receipts and bank deposits are intentionally separate.</strong> Card and ACH payments can take days to reach the bank. This page proves today’s payments were allocated correctly and separately reports deposits scheduled to arrive today.</p>
          </section>

          {closeout.unclassifiedInvoices.length > 0 && <section className="daily-closeout-unclassified" role="alert"><TriangleAlert size={20} /><div><strong>Paid invoices need ledger review</strong><p>These invoices were marked paid today but are not tied to an online payment, account-credit application, or current office-payment allocation.</p>{closeout.unclassifiedInvoices.map((invoice: any) => <a key={invoice.id} href={`/admin/invoices/${invoice.id}`}>Invoice #{invoice.invoice_number} · Lot {invoice.campers?.lot_number || '—'} · {money(invoice.total_due || invoice.subtotal)}</a>)}</div></section>}

          <div className="daily-closeout-grid">
            <section className="daily-closeout-card">
              <header><small>PAYMENTS RECEIVED</small><h2>Online invoice payments</h2><strong>{money(totals.onlineReceived)}</strong></header>
              <div>{closeout.onlineInvoices.map((invoice: any) => <a href={`/admin/invoices/${invoice.id}`} key={invoice.id}><span><strong>Lot {invoice.campers?.lot_number || '—'} · {name(invoice)}</strong><small>{time(invoice.paid_at)} · Invoice #{invoice.invoice_number} · {invoice.payment_method || 'Online payment'}</small></span><b>{money(invoice.total_due || invoice.subtotal)}</b></a>)}</div>
              {!closeout.onlineInvoices.length && !closeout.onlineExtraCredits.length && <p className="daily-closeout-empty">No online payments were recorded.</p>}
              {closeout.onlineExtraCredits.map((credit: any) => <article key={credit.id}><span><strong>Lot {credit.campers?.lot_number || '—'} · payment remainder saved</strong><small>{credit.applies_to === 'lot_rent' ? 'Future lot rent only' : 'Any future bill'} · {money(credit.remaining_amount)} remains</small></span><b>{money(credit.original_amount)}</b></article>)}
            </section>

            <section className="daily-closeout-card">
              <header><small>OFFICE PAYMENTS</small><h2>Checks, cash, and manual entries</h2><strong>{money(totals.manualReceived)}</strong></header>
              <div>{closeout.manualPayments.map((payment: any) => <article key={payment.id}><span><strong>Lot {payment.campers?.lot_number || '—'} · {name(payment)}</strong><small>{time(payment.created_at)} · {payment.payment_method || 'Office payment'} · {money(payment.result?.appliedTotal)} allocated{Number(payment.result?.creditAmount || 0) ? ` · ${money(payment.result.creditAmount)} saved` : ''}</small></span><b>{money(payment.amount)}</b></article>)}</div>
              {!closeout.manualPayments.length && <p className="daily-closeout-empty">No office payments were recorded.</p>}
            </section>

            <section className="daily-closeout-card">
              <header><small>CREDITS USED</small><h2>Existing credit applied today</h2><strong>{money(totals.creditsApplied)}</strong></header>
              <div>{closeout.creditApplications.map((application: any) => <article key={application.id}><span><strong>Lot {application.campers?.lot_number || '—'} · {name(application)}</strong><small>{time(application.applied_at)} · Invoice #{application.invoices?.invoice_number || '—'} · {application.invoices?.invoice_type || 'Campground charge'}</small></span><b>{money(application.amount_applied)}</b></article>)}</div>
              {!closeout.creditApplications.length && <p className="daily-closeout-empty">No existing credits were applied.</p>}
            </section>

            <section className="daily-closeout-card">
              <header><small>BANK ARRIVALS</small><h2>Stripe deposits expected today</h2><strong>{money(totals.bankDeposits)}</strong></header>
              <div>{closeout.payouts.map((payout: any) => <a href="/admin/stripe-deposits" key={payout.id}><span><strong>{payout.status === 'paid' ? 'Arrived at bank' : payout.status === 'failed' ? 'Deposit failed — review now' : `Deposit ${payout.status}`}</strong><small>{payout.automatic ? 'Automatic Stripe deposit' : 'Manual Stripe deposit'} · open exact reconciliation</small></span><b>{money(Number(payout.amount || 0) / 100)}</b></a>)}</div>
              {!closeout.payouts.length && <p className="daily-closeout-empty">No Stripe deposits are scheduled to arrive on this date.</p>}
            </section>
          </div>
        </>}
      </div>
    </main>
  )
}
