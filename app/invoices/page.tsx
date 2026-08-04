'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  FileText,
  Hourglass,
  Leaf,
  LockKeyhole,
  MessageSquareText,
  ReceiptText,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react'
import { getCurrentCamper, supabase } from '../../lib/supabase'
import { checkoutItems } from '../../lib/stripe'
import { fallbackInvoiceLine, invoiceLineDetails } from '../../lib/invoice-display'
import { calculateCardProcessingFee, cardProcessingFeeSettings, loadPaymentFeeSettings } from '../../lib/payment-fees'
import {
  createAutoPayEnrollment,
  disableAutoPay,
  getAutoPayStatus,
  type AutoPayPaymentMethod,
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

function invoiceStatusBadge(invoice: any) {
  if (invoice.status === 'paid') {
    return { label: 'Paid', className: 'paid', detail: 'Thank you — this invoice is complete.' }
  }

  if (invoice.status === 'processing') {
    return { label: 'Payment processing', className: 'processing', detail: 'Your bank payment is underway. Please do not pay again.' }
  }

  if (!invoice.due_date) {
    return { label: 'Open', className: 'open', detail: 'Open invoice with no due date listed.' }
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDate = new Date(`${invoice.due_date}T12:00:00`)
  const daysUntilDue = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (daysUntilDue < 0) {
    const daysLate = Math.abs(daysUntilDue)
    return { label: `${daysLate} day${daysLate === 1 ? '' : 's'} late`, className: 'past-due', detail: 'Past due — please review when you can.' }
  }

  if (daysUntilDue <= 3) {
    return { label: daysUntilDue === 0 ? 'Due today' : `Due in ${daysUntilDue} day${daysUntilDue === 1 ? '' : 's'}`, className: 'due-soon', detail: 'Coming up soon.' }
  }

  return { label: `Due in ${daysUntilDue} days`, className: 'open', detail: 'Scheduled and ready to review.' }
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
  const [creditBalance, setCreditBalance] = useState(0)
  const [autoPayStatus, setAutoPayStatus] = useState<any>({ enabled: false })
  const [autoPayPreference, setAutoPayPreference] = useState<AutoPayPreference>('both')
  const [autoPayPaymentMethod, setAutoPayPaymentMethod] = useState<AutoPayPaymentMethod>('card')
  const [autoPayConsent, setAutoPayConsent] = useState(false)
  const [autoPayLoading, setAutoPayLoading] = useState(false)
  const [autoPayMessage, setAutoPayMessage] = useState('')
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [smsSaving, setSmsSaving] = useState(false)
  const [smsMessage, setSmsMessage] = useState('')
  const [feeSettings, setFeeSettings] = useState(cardProcessingFeeSettings())

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
      setSmsOptIn(Boolean(camperData.sms_opt_in))

      const [invoiceResult, creditResult, paymentFeeSettings] = await Promise.all([
        supabase
          .from('invoices')
          .select('*, invoice_items(*)')
          .eq('camper_id', camperData.id)
          .order('due_date', { ascending: false }),
        supabase
          .from('account_credits')
          .select('remaining_amount,status')
          .eq('camper_id', camperData.id)
          .eq('status', 'active')
          .gt('remaining_amount', 0),
        loadPaymentFeeSettings(supabase),
      ])

      setInvoices(invoiceResult.data || [])
      setFeeSettings(paymentFeeSettings)
      setCreditBalance(
        (creditResult.data || []).reduce((sum, credit) => sum + Number(credit.remaining_amount || 0), 0)
      )
      await refreshAutoPayStatus()

      if (new URLSearchParams(window.location.search).get('autopay') === 'success') {
        setAutoPayMessage('Your payment method was saved. AutoPay will be active shortly.')
        window.setTimeout(refreshAutoPayStatus, 1500)
      }

      setLoading(false)
    }

    loadAccount()
  }, [])

  useEffect(() => {
    if (!camper?.id) return

    async function refreshInvoiceStatuses() {
      const { data } = await supabase
        .from('invoices')
        .select('*, invoice_items(*)')
        .eq('camper_id', camper.id)
        .order('due_date', { ascending: false })

      if (data) setInvoices(data)
    }

    const timer = window.setInterval(refreshInvoiceStatuses, 30_000)
    window.addEventListener('focus', refreshInvoiceStatuses)
    window.addEventListener('pageshow', refreshInvoiceStatuses)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refreshInvoiceStatuses)
      window.removeEventListener('pageshow', refreshInvoiceStatuses)
    }
  }, [camper?.id])

  async function refreshAutoPayStatus() {
    try {
      const status = await getAutoPayStatus()
      setAutoPayStatus(status)
      if (status.preference) setAutoPayPreference(status.preference)
      if (status.paymentMethod === 'ach' || status.paymentMethod === 'card') {
        setAutoPayPaymentMethod(status.paymentMethod)
      }
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
      const result = await createAutoPayEnrollment(autoPayPreference, autoPayPaymentMethod)
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

  async function saveSmsPreference(nextValue = smsOptIn) {
    if (!camper?.id) return

    setSmsSaving(true)
    setSmsMessage('')

    const { data, error } = await supabase
      .from('campers')
      .update({
        sms_opt_in: Boolean(nextValue),
        sms_opt_in_at: nextValue ? camper.sms_opt_in_at || new Date().toISOString() : null,
      })
      .eq('id', camper.id)
      .select('*')
      .single()

    if (error) {
      setSmsMessage(error.message)
    } else {
      setCamper(data)
      setSmsOptIn(Boolean(data.sms_opt_in))
      setSmsMessage(data.sms_opt_in ? 'Text alerts are turned on.' : 'Text alerts are turned off.')
    }

    setSmsSaving(false)
  }

  const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid')
  const payableInvoices = invoices.filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'processing')
  const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid')
  const openTotal = openInvoices.reduce(
    (sum, invoice) => sum + Number(invoice.total_due || 0),
    0
  )
  const selectedTotal = payableInvoices
    .filter((invoice) => selectedInvoices.includes(invoice.id))
    .reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)
  const selectedProcessingFee = selectedInvoices.length ? calculateCardProcessingFee(selectedTotal, feeSettings) : 0
  const selectedChargeTotal = selectedTotal + selectedProcessingFee
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
    const invoicesToPay = payableInvoices.filter((invoice) =>
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
          <div><span className="account-summary-icon green"><WalletCards size={21} /></span><span><small>Account credit</small><strong>{formatMoney(creditBalance)}</strong></span></div>
          <div><span className="account-summary-icon green"><CheckCircle2 size={21} /></span><span><small>Paid invoices</small><strong>{paidInvoices.length}</strong></span></div>
          <div><span className="account-summary-icon blue"><FileText size={21} /></span><span><small>Total history</small><strong>{invoices.length}</strong></span></div>
          <div><span className="account-summary-icon plum"><CreditCard size={21} /></span><span><small>AutoPay</small><strong>{autoPayStatus.enabled ? 'Active' : 'Not enrolled'}</strong></span></div>
        </section>

        <section className="account-trust-strip" aria-label="Secure payment information">
          <div>
            <span><ShieldCheck size={18} /></span>
            <strong>Secure Stripe checkout</strong>
            <small>Card payments open in Stripe. Bur Oaks does not store your full card number.</small>
          </div>
          <div>
            <span><FileText size={18} /></span>
            <strong>Itemized invoices</strong>
            <small>Electric, water/trash, pump-outs, site services, and credits are shown line by line.</small>
          </div>
          <a href="/messages">Question about a bill? Message the office <ArrowRight size={15} /></a>
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

            {payableInvoices.length > 0 && (
              <div className="account-selection-bar">
                <div>
                  <strong>{selectedInvoices.length || 'No'} selected</strong>
                  <span>{formatMoney(selectedTotal)}</span>
                  {selectedInvoices.length > 0 && (
                    <small className="account-processing-fee-note">
                      Card checkout only: invoice balance {formatMoney(selectedTotal)} + card fee {formatMoney(selectedProcessingFee)} = card total {formatMoney(selectedChargeTotal)}
                    </small>
                  )}
                </div>
                <div>
                  <button type="button" className="account-text-button" onClick={() => setSelectedInvoices(payableInvoices.map((invoice) => invoice.id))}>Select all payable</button>
                  {selectedInvoices.length > 0 && <button type="button" className="account-text-button" onClick={() => setSelectedInvoices([])}>Clear</button>}
                  <button type="button" className="account-pay-button" onClick={handlePaySelected} disabled={selectedInvoices.length === 0 || checkoutLoading}>
                    <LockKeyhole size={15} /> {checkoutLoading ? 'Opening checkout…' : `Pay ${formatMoney(selectedChargeTotal)}`}
                  </button>
                </div>
              </div>
            )}

            {payableInvoices.length > 0 && (
              <div className="account-processing-fee-disclosure">
                <strong>{feeSettings.label}</strong>
                <span>
                  This fee is only added if you choose to pay online by card through Stripe.
                  Cash, check, and office-posted payments do not include this card checkout fee.
                  You will see the invoice balance, card fee, and total before checkout opens.
                </span>
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
                  const isProcessing = invoice.status === 'processing'
                  const isSelected = selectedInvoices.includes(invoice.id)
                  const statusBadge = invoiceStatusBadge(invoice)
                  const processingFee = calculateCardProcessingFee(Number(invoice.total_due || 0), feeSettings)
                  const payToday = Number(invoice.total_due || 0) + processingFee
                  const invoiceItems = Array.isArray(invoice.invoice_items)
                    ? invoice.invoice_items
                    : []
                  const visibleItemLines = invoiceItems.length
                    ? invoiceItems.map((item: any) => ({ key: item.id || `${invoice.id}-${item.description}`, ...invoiceLineDetails(item) }))
                    : [{ key: `${invoice.id}-fallback`, ...fallbackInvoiceLine(invoice) }]

                  return (
                    <article className={`account-invoice-row ${isSelected ? 'selected' : ''}`} key={invoice.id}>
                      <div className="account-invoice-check">
                        {isPaid ? (
                          <span><Check size={17} /></span>
                        ) : isProcessing ? (
                          <span className="processing"><Hourglass size={16} /></span>
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
                          <div className="account-invoice-items">
                            {visibleItemLines.map((line: any) => (
                              <p key={line.key}>
                                <span>
                                  <b>{line.title}</b>
                                  <em>{line.explanation}</em>
                                </span>
                                <strong>{formatMoney(line.amount)}</strong>
                              </p>
                            ))}
                          </div>
                        </div>
                        <div className="account-due-date"><CalendarDays size={15} /><span><small>Due date</small><strong>{formatDate(invoice.due_date)}</strong></span></div>
                        <div className={`account-invoice-timeline ${statusBadge.className}`}>
                          <span />
                          <div>
                            <strong>{statusBadge.label}</strong>
                            <small>{statusBadge.detail}</small>
                          </div>
                        </div>
                      </div>
                      <div className="account-invoice-total">
                        <strong>{formatMoney(invoice.total_due)}</strong>
                        <span className={isPaid ? 'paid' : isProcessing ? 'processing' : 'open'}>
                          {isPaid ? 'Paid' : isProcessing ? 'Bank payment processing' : 'Payment due'}
                        </span>
                        {!isPaid && !isProcessing && (
                          <small>
                            Card checkout: {formatMoney(invoice.total_due)} invoice + {formatMoney(processingFee)} card fee = {formatMoney(payToday)}
                          </small>
                        )}
                      </div>
                      <div className="account-invoice-action">
                        <a className="account-view-invoice" href={`/invoices/${invoice.id}`}>
                          View invoice
                        </a>
                        {isProcessing ? (
                          <span className="account-processing-mark"><Hourglass size={17} /> Do not pay again</span>
                        ) : !isPaid ? (
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
            <div className="autopay-heading account-sms-heading">
              <span><MessageSquareText size={20} /></span>
              <div><small>TEXT ALERTS</small><h2>Fast campground updates</h2></div>
            </div>

            <p className="autopay-intro">Get quick non-marketing texts for invoices, payment reminders, account notices, gate updates, utility notices, maintenance updates, sewer pump-outs, office notices, and safety or weather-related operational alerts.</p>

            <label className="autopay-consent account-sms-consent">
              <input
                type="checkbox"
                checked={smsOptIn}
                onChange={(event) => {
                  setSmsOptIn(event.target.checked)
                  saveSmsPreference(event.target.checked)
                }}
                disabled={smsSaving}
              />
              <span>
                <strong>I agree to receive Bur Oaks Campground text alerts</strong>
                <small>
                  By checking this box, I agree to receive recurring, non-marketing SMS messages from Bur Oaks Campground at the phone number saved in my profile about invoices, payment reminders, account notices, maintenance updates, sewer pump-out updates, gate notices, utility notices, office notices, safety notices, weather-related operational alerts, and other campground account or operations notices. Message frequency varies. Message and data rates may apply. Reply HELP for help or STOP to opt out. Consent is optional and is not a condition of campground service. <a href="/sms-terms">SMS Terms</a> · <a href="/privacy">Privacy Policy</a>
                </small>
              </span>
            </label>

            {smsMessage && <p className="autopay-message">{smsMessage}</p>}

            <div className="autopay-security account-sms-note"><LockKeyhole size={15} /><span>Your SMS opt-in, phone number, and text consent are not sold or shared with third parties or affiliates for marketing. <a href="/sms-terms">SMS Terms</a> · <a href="/privacy">Privacy Policy</a> · <a href="/sms-consent">SMS consent</a></span></div>
            <div className="account-sms-obligation-note">
              SMS consent is optional and is not required to stay at Bur Oaks or use the camper portal. Text alerts are courtesy reminders only. Turning texts off does not remove payment obligations, campground rules, lease notices, or other account responsibilities.
            </div>

            <div className="account-side-divider" />

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
              <p className="autopay-intro">Save a card or bank account securely with Stripe and eligible invoices can be paid automatically when issued.</p>
            )}

            {autoPayStatus.card && (
              <div className="autopay-card-preview">
                <CreditCard size={23} />
                <div><small>{String(autoPayStatus.card.brand).toUpperCase()}</small><strong>•••• {autoPayStatus.card.last4}</strong></div>
                <span>{autoPayStatus.card.expMonth}/{autoPayStatus.card.expYear}</span>
              </div>
            )}

            {autoPayStatus.bank && (
              <div className="autopay-card-preview">
                <WalletCards size={23} />
                <div><small>ACH BANK ACCOUNT</small><strong>{autoPayStatus.bank.bankName || 'Bank account'} •••• {autoPayStatus.bank.last4}</strong></div>
                <span>{autoPayStatus.bank.accountType || 'ACH'}</span>
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

            <label className="autopay-field">
              <span>Choose AutoPay method</span>
              <select value={autoPayPaymentMethod} onChange={(event) => { setAutoPayPaymentMethod(event.target.value as AutoPayPaymentMethod); setAutoPayConsent(false) }}>
                <option value="card">Credit / debit card</option>
                <option value="ach">Bank account / ACH</option>
              </select>
            </label>

            <label className="autopay-consent">
              <input type="checkbox" checked={autoPayConsent} onChange={(event) => setAutoPayConsent(event.target.checked)} />
              <span>
                <strong>Authorize future charges</strong>
                <small>
                  {autoPayPaymentMethod === 'ach'
                    ? 'I authorize Bur Oaks to debit my bank account for eligible invoices under the plan above. ACH payments can take several business days to confirm.'
                    : 'I authorize card charges for the plan above. Electric usage varies and lot rent uses my current rate.'}
                </small>
              </span>
            </label>

            <button type="button" className="autopay-primary" onClick={enrollInAutoPay} disabled={autoPayLoading}>
              <ShieldCheck size={17} /> {autoPayLoading ? 'Opening Stripe…' : autoPayStatus.enabled ? 'Update AutoPay' : 'Set up AutoPay'}
            </button>

            {autoPayStatus.enabled && <button type="button" className="autopay-disable" onClick={turnOffAutoPay} disabled={autoPayLoading}>Turn off AutoPay</button>}
            {autoPayMessage && <p className="autopay-message">{autoPayMessage}</p>}

            <div className="autopay-security"><LockKeyhole size={15} /><span>Payment details are handled securely by Stripe. Bank AutoPay may require bank verification and is marked paid after Stripe confirms it.</span></div>
          </aside>
        </div>

        <footer className="account-footer">
          <span>Bur Oaks Campground · Lot {camper?.lot_number || '—'}</span>
          <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span>
        </footer>
      </div>
    </main>
  )
}
