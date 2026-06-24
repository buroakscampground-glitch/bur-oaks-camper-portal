'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FileText,
  Leaf,
  LockKeyhole,
  ReceiptText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react'
import { getCurrentCamper, supabase } from '../../lib/supabase'
import { checkoutItems } from '../../lib/stripe'
import {
  createAutoPayEnrollment,
  disableAutoPay,
  getAutoPayStatus,
  type AutoPayPreference,
} from '../../lib/autopay'

type InvoiceFilter = 'all' | 'open' | 'paid'

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function formatDate(value?: string) {
  if (!value) return 'No due date'

  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function planLabel(preference?: AutoPayPreference | null) {
  if (preference === 'electric') return 'Electric bills'
  if (preference === 'rent') return 'Quarterly lot rent'
  return 'Electric and lot rent'
}

export default function InvoicesPage() {
  const [camper, setCamper] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [selectedInvoices, setSelectedInvoices] = useState<string[]>([])
  const [filter, setFilter] = useState<InvoiceFilter>('all')
  const [loading, setLoading] = useState(true)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [processingInvoiceId, setProcessingInvoiceId] = useState('')
  const [autoPayStatus, setAutoPayStatus] = useState<any>({ enabled: false })
  const [autoPayPreference, setAutoPayPreference] = useState<AutoPayPreference>('both')
  const [autoPayConsent, setAutoPayConsent] = useState(false)
  const [autoPayLoading, setAutoPayLoading] = useState(false)
  const [autoPayMessage, setAutoPayMessage] = useState('')

  useEffect(() => {
    async function loadAccount() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user?.email) {
        window.location.href = '/login'
        return
      }

      const camperData = await getCurrentCamper()

      if (!camperData) {
        setLoading(false)
        return
      }

      setCamper(camperData)

      const { data } = await supabase
        .from('invoices')
        .select('*')
        .eq('camper_id', camperData.id)
        .order('due_date', { ascending: false })

      setInvoices(data || [])
      await refreshAutoPayStatus()

      if (new URLSearchParams(window.location.search).get('autopay') === 'success') {
        setAutoPayMessage('Your card was saved. AutoPay will be active shortly.')
        window.setTimeout(refreshAutoPayStatus, 1500)
      }

      setLoading(false)
    }

    loadAccount()
  }, [])

  async function refreshAutoPayStatus() {
    try {
      const status = await getAutoPayStatus()
      setAutoPayStatus(status)
      if (status.preference) setAutoPayPreference(status.preference)
    } catch (error: any) {
      setAutoPayMessage(error.message)
    }
  }

  async function enrollInAutoPay() {
    if (!autoPayConsent) {
      setAutoPayMessage('Please authorize recurring charges before continuing.')
      return
    }

    setAutoPayLoading(true)
    setAutoPayMessage('')

    try {
      const result = await createAutoPayEnrollment(autoPayPreference)
      if (!result.url) throw new Error('Stripe enrollment link is unavailable.')
      window.location.href = result.url
    } catch (error: any) {
      setAutoPayMessage(error.message)
      setAutoPayLoading(false)
    }
  }

  async function turnOffAutoPay() {
    if (!window.confirm('Turn off AutoPay for future invoices?')) return

    setAutoPayLoading(true)

    try {
      await disableAutoPay()
      await refreshAutoPayStatus()
      setAutoPayMessage('AutoPay has been turned off.')
    } catch (error: any) {
      setAutoPayMessage(error.message)
    } finally {
      setAutoPayLoading(false)
    }
  }

  const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid')
  const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid')
  const openTotal = openInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_due || 0),
    0
  )
  const selectedTotal = openInvoices
    .filter((invoice) => selectedInvoices.includes(invoice.id))
    .reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)
  const visibleInvoices = invoices.filter((invoice) => {
    if (filter === 'open') return invoice.status !== 'paid'
    if (filter === 'paid') return invoice.status === 'paid'
    return true
  })

  function toggleInvoice(id: string) {
    setSelectedInvoices((current) =>
      current.includes(id)
        ? current.filter((invoiceId) => invoiceId !== id)
        : [...current, id]
    )
  }

  function buildCheckoutItems(invoiceList: any[]) {
    return invoiceList.map((invoice) => ({
      name: `Invoice ${invoice.invoice_number}`,
      amount: Math.round(Number(invoice.total_due || 0) * 100),
      currency: 'usd',
      quantity: 1,
    }))
  }

  async function handlePayment(invoicesToPay: any[]) {
    setCheckoutLoading(true)

    try {
      await checkoutItems(
        buildCheckoutItems(invoicesToPay),
        `${window.location.origin}/success`,
        `${window.location.origin}/invoices`,
        invoicesToPay.map((invoice) => invoice.id)
      )
    } catch (error: any) {
      window.alert(error.message || 'Unable to start Stripe checkout.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  async function handlePaySelected() {
    const invoicesToPay = openInvoices.filter((invoice) =>
      selectedInvoices.includes(invoice.id)
    )
    if (invoicesToPay.length > 0) await handlePayment(invoicesToPay)
  }

  async function handlePayInvoice(invoice: any) {
    setProcessingInvoiceId(invoice.id)
    try {
      await handlePayment([invoice])
    } finally {
      setProcessingInvoiceId('')
    }
  }

  if (loading) {
    return (
      <main className="camper-portal-page">
        <div className="portal-loading">
          <ReceiptText size={34} />
          <p>Opening your account…</p>
        </div>
      </main>
    )
  }

  return (
    <main className="camper-account-page">
      <div className="account-shell">
        <header className="account-header">
          <nav className="account-nav" aria-label="Billing navigation">
            <a className="account-brand" href="/portal">
              <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
              <span><strong>Bur Oaks</strong><small>Camper account</small></span>
            </a>
            <a className="account-back" href="/portal">
              <ArrowLeft size={17} /> Back to portal
            </a>
          </nav>

          <div className="account-welcome">
            <div>
              <span className="account-eyebrow"><Leaf size={15} /> Billing & payments</span>
              <h1>Your account, all in one place.</h1>
              <p>
                Review charges, make secure payments, and manage AutoPay for Lot{' '}
                {camper?.lot_number || '—'}.
              </p>
            </div>
            <div className="account-balance-card">
              <span>Current balance</span>
              <strong>{formatMoney(openTotal)}</strong>
              <small>
                {openInvoices.length === 0
                  ? 'You are all caught up'
                  : `${openInvoices.length} open invoice${openInvoices.length === 1 ? '' : 's'}`}
              </small>
            </div>
          </div>
        </header>

        <section className="account-summary" aria-label="Account summary">
          <div><span className="account-summary-icon gold"><CircleDollarSign size={21} /></span><span><small>Amount due</small><strong>{formatMoney(openTotal)}</strong></span></div>
          <div><span className="account-summary-icon green"><CheckCircle2 size={21} /></span><span><small>Paid invoices</small><strong>{paidInvoices.length}</strong></span></div>
          <div><span className="account-summary-icon blue"><FileText size={21} /></span><span><small>Total history</small><strong>{invoices.length}</strong></span></div>
          <div><span className="account-summary-icon plum"><CreditCard size={21} /></span><span><small>AutoPay</small><strong>{autoPayStatus.enabled ? 'Active' : 'Not enrolled'}</strong></span></div>
        </section>

        <div className="account-layout">
          <section className="account-panel account-ledger">
            <div className="account-panel-heading">
              <div><span>ACCOUNT HISTORY</span><h2>Invoices</h2></div>
              <div className="account-filter" role="group" aria-label="Filter invoices">
                {(['all', 'open', 'paid'] as InvoiceFilter[]).map((option) => (
                  <button
                    type="button"
                    className={filter === option ? 'active' : ''}
                    onClick={() => setFilter(option)}
                    key={option}
                  >
                    {option === 'all' ? 'All' : option === 'open' ? 'Open' : 'Paid'}
                  </button>
                ))}
              </div>
            </div>

            {openInvoices.length > 0 && (
              <div className="account-selection-bar">
                <div>
                  <strong>{selectedInvoices.length || 'No'} selected</strong>
                  <span>{formatMoney(selectedTotal)}</span>
                </div>
                <div>
                  <button type="button" className="account-text-button" onClick={() => setSelectedInvoices(openInvoices.map((invoice) => invoice.id))}>Select all open</button>
                  {selectedInvoices.length > 0 && <button type="button" className="account-text-button" onClick={() => setSelectedInvoices([])}>Clear</button>}
                  <button type="button" className="account-pay-button" onClick={handlePaySelected} disabled={selectedInvoices.length === 0 || checkoutLoading}>
                    <LockKeyhole size={15} /> {checkoutLoading ? 'Opening checkout…' : `Pay ${formatMoney(selectedTotal)}`}
                  </button>
                </div>
              </div>
            )}

            {visibleInvoices.length === 0 ? (
              <div className="account-empty">
                <CheckCircle2 size={34} />
                <h3>{invoices.length === 0 ? 'No invoices yet' : `No ${filter} invoices`}</h3>
                <p>{invoices.length === 0 ? 'New charges will appear here when they are issued.' : 'Try another account-history filter.'}</p>
              </div>
            ) : (
              <div className="account-invoice-list">
                {visibleInvoices.map((invoice) => {
                  const isPaid = invoice.status === 'paid'
                  const isSelected = selectedInvoices.includes(invoice.id)

                  return (
                    <article className={`account-invoice-row ${isSelected ? 'selected' : ''}`} key={invoice.id}>
                      <div className="account-invoice-check">
                        {isPaid ? (
                          <span><Check size={17} /></span>
                        ) : (
                          <label aria-label={`Select invoice ${invoice.invoice_number}`}>
                            <input type="checkbox" checked={isSelected} onChange={() => toggleInvoice(invoice.id)} />
                            <span><Check size={14} /></span>
                          </label>
                        )}
                      </div>
                      <div className="account-invoice-main">
                        <div>
                          <small>Invoice #{invoice.invoice_number}</small>
                          <h3>{invoice.invoice_type || 'Campground charge'}</h3>
                        </div>
                        <div className="account-due-date"><CalendarDays size={15} /><span><small>Due date</small><strong>{formatDate(invoice.due_date)}</strong></span></div>
                      </div>
                      <div className="account-invoice-total">
                        <strong>{formatMoney(invoice.total_due)}</strong>
                        <span className={isPaid ? 'paid' : 'open'}>{isPaid ? 'Paid' : 'Payment due'}</span>
                      </div>
                      <div className="account-invoice-action">
                        {!isPaid ? (
                          <button type="button" onClick={() => handlePayInvoice(invoice)} disabled={processingInvoiceId === invoice.id || checkoutLoading}>
                            {processingInvoiceId === invoice.id ? 'Opening…' : 'Pay now'} <ChevronRight size={16} />
                          </button>
                        ) : <span className="account-paid-mark"><CheckCircle2 size={21} /></span>}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          <aside className="account-panel account-autopay">
            <div className="autopay-heading">
              <span><Sparkles size={20} /></span>
              <div><small>AUTOPAY</small><h2>{autoPayStatus.enabled ? 'You’re enrolled' : 'Make payments effortless'}</h2></div>
            </div>

            {autoPayStatus.enabled ? (
              <div className="autopay-active-card">
                <span className="autopay-active-dot"><Check size={14} /></span>
                <div><strong>AutoPay is active</strong><small>{planLabel(autoPayStatus.preference)}</small></div>
              </div>
            ) : (
              <p className="autopay-intro">Save a card securely with Stripe and eligible invoices can be paid automatically when issued.</p>
            )}

            {autoPayStatus.card && (
              <div className="autopay-card-preview">
                <CreditCard size={23} />
                <div><small>{String(autoPayStatus.card.brand).toUpperCase()}</small><strong>•••• {autoPayStatus.card.last4}</strong></div>
                <span>{autoPayStatus.card.expMonth}/{autoPayStatus.card.expYear}</span>
              </div>
            )}

            <label className="autopay-field">
              <span>Choose what to pay automatically</span>
              <select value={autoPayPreference} onChange={(event) => { setAutoPayPreference(event.target.value as AutoPayPreference); setAutoPayConsent(false) }}>
                <option value="electric">Electric bills</option>
                <option value="rent">Quarterly lot rent</option>
                <option value="both">Electric bills and quarterly lot rent</option>
              </select>
            </label>

            <label className="autopay-consent">
              <input type="checkbox" checked={autoPayConsent} onChange={(event) => setAutoPayConsent(event.target.checked)} />
              <span><strong>Authorize future charges</strong><small>I authorize charges for the plan above. Electric usage varies and lot rent uses my current rate.</small></span>
            </label>

            <button type="button" className="autopay-primary" onClick={enrollInAutoPay} disabled={autoPayLoading}>
              <ShieldCheck size={17} /> {autoPayLoading ? 'Opening Stripe…' : autoPayStatus.enabled ? 'Update AutoPay' : 'Set up AutoPay'}
            </button>

            {autoPayStatus.enabled && <button type="button" className="autopay-disable" onClick={turnOffAutoPay} disabled={autoPayLoading}>Turn off AutoPay</button>}
            {autoPayMessage && <p className="autopay-message">{autoPayMessage}</p>}

            <div className="autopay-security"><LockKeyhole size={15} /><span>Payments and card details are handled securely by Stripe.</span></div>
          </aside>
        </div>

        <footer className="account-footer">
          <span>Bur Oaks Campground · Lot {camper?.lot_number || '—'}</span>
          <span><a href="/privacy" rel="noreferrer" target="_blank">Privacy</a> · <a href="/terms" rel="noreferrer" target="_blank">Terms</a></span>
        </footer>
      </div>
    </main>
  )
}
