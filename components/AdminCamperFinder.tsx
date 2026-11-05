'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowRight, CalendarClock, CheckCircle2, CircleDollarSign, FileText, Landmark, Loader2, MessageCircle, ReceiptText, Search, UserRound, WalletCards, Wrench, X, Zap } from 'lucide-react'
import { todayInCentral } from '../lib/invoice-balance'
import { buildPaymentAllocationPreview, submitManualPayment, type PaymentInvoice } from '../lib/manual-payment'
import { supabase } from '../lib/supabase'

type LookupAccount = {
  id: string
  active: boolean
  lotNumber?: string | null
  name: string
  secondName?: string | null
  email?: string | null
  phone?: string | null
  openBalance: number
  openInvoices: number
  invoiceOptions: PaymentInvoice[]
  nextDue?: string | null
  nextDueAmount: number
  nextDueFor?: string | null
  unusedCredit: number
  lastPayment?: { amount?: number; method?: string | null; reference?: string | null; date?: string | null } | null
  lookupTerms: string
}

type PaymentDraft = {
  camperId: string
  invoiceId: string
  amount: string
  method: string
  receivedOn: string
  reference: string
  reason: string
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })
}

function date(value?: string | null) {
  if (!value) return 'No date recorded'
  const parsed = new Date(value.length === 10 ? `${value}T12:00:00` : value)
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function accountScore(account: LookupAccount, query: string) {
  const lot = String(account.lotNumber || '').toLowerCase()
  const name = `${account.name} ${account.secondName || ''}`.toLowerCase()
  if (lot === query) return 0
  if (name.startsWith(query)) return 1
  if (name.includes(query)) return 2
  return 3
}

export default function AdminCamperFinder() {
  const [query, setQuery] = useState('')
  const [accounts, setAccounts] = useState<LookupAccount[]>([])
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')
  const [focused, setFocused] = useState(false)
  const [paymentDraft, setPaymentDraft] = useState<PaymentDraft | null>(null)
  const [paymentBusy, setPaymentBusy] = useState(false)
  const [paymentNotices, setPaymentNotices] = useState<Record<string, string>>({})
  const inputRef = useRef<HTMLInputElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)

  async function loadAccounts(force = false) {
    if ((!force && loaded) || loading) return
    setLoading(true)
    setError('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data.session?.access_token
      if (!token) throw new Error('Sign in again to use camper lookup.')
      const response = await fetch('/api/admin-camper-lookup', {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store',
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Camper lookup could not be loaded.')
      setAccounts(result.accounts || [])
      setLoaded(true)
    } catch (loadError: any) {
      setError(loadError.message || 'Camper lookup could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const isTyping = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (event.key === '/' && !isTyping) {
        event.preventDefault()
        setFocused(true)
        void loadAccounts()
        inputRef.current?.focus()
      }
      if (event.key === 'Escape' && shellRef.current?.contains(document.activeElement)) {
        setQuery('')
        setFocused(false)
        inputRef.current?.blur()
      }
    }
    const handleOutside = (event: PointerEvent) => {
      if (shellRef.current && !shellRef.current.contains(event.target as Node)) setFocused(false)
    }
    window.addEventListener('keydown', handleShortcut)
    document.addEventListener('pointerdown', handleOutside)
    return () => {
      window.removeEventListener('keydown', handleShortcut)
      document.removeEventListener('pointerdown', handleOutside)
    }
  }, [loaded, loading])

  const normalized = query.trim().toLowerCase()
  const compactQuery = normalized.replace(/[^a-z0-9]/g, '')
  const results = useMemo(() => {
    if (!normalized) return []
    return accounts
      .filter((account) => {
        const searchable = `${account.lookupTerms} ${account.name} ${account.secondName || ''} ${account.lotNumber || ''}`.toLowerCase()
        return searchable.includes(normalized) || (compactQuery.length >= 3 && searchable.replace(/[^a-z0-9]/g, '').includes(compactQuery))
      })
      .sort((left, right) => accountScore(left, normalized) - accountScore(right, normalized) || String(left.lotNumber || '').localeCompare(String(right.lotNumber || ''), undefined, { numeric: true }))
      .slice(0, 6)
  }, [accounts, compactQuery, normalized])

  const showPanel = focused && (loading || Boolean(error) || Boolean(normalized))

  function startPayment(account: LookupAccount) {
    const invoice = account.invoiceOptions?.[0]
    if (!invoice) return
    setPaymentDraft({
      camperId: account.id,
      invoiceId: invoice.id,
      amount: Number(invoice.total_due || 0).toFixed(2),
      method: 'Check',
      receivedOn: todayInCentral(),
      reference: '',
      reason: '',
    })
    setPaymentNotices((current) => ({ ...current, [account.id]: '' }))
  }

  function updatePaymentDraft(values: Partial<PaymentDraft>) {
    setPaymentDraft((current) => current ? { ...current, ...values } : current)
  }

  async function recordPayment(account: LookupAccount) {
    if (!paymentDraft || paymentDraft.camperId !== account.id) return
    const invoice = account.invoiceOptions.find((item) => item.id === paymentDraft.invoiceId)
    if (!invoice) {
      setPaymentNotices((current) => ({ ...current, [account.id]: 'Choose an open invoice before recording payment.' }))
      return
    }
    const amount = Number(paymentDraft.amount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setPaymentNotices((current) => ({ ...current, [account.id]: 'Enter a valid payment amount.' }))
      return
    }
    if (!paymentDraft.receivedOn) {
      setPaymentNotices((current) => ({ ...current, [account.id]: 'Choose the date this payment was received.' }))
      return
    }
    if (paymentDraft.reason.trim().length < 5) {
      setPaymentNotices((current) => ({ ...current, [account.id]: 'Enter a clear office note for this payment.' }))
      return
    }

    const preview = buildPaymentAllocationPreview(account.invoiceOptions, invoice.id, amount)
    const creditLine = preview.creditAmount > 0 ? ` ${money(preview.creditAmount)} will remain as account credit.` : ''
    if (!window.confirm(`Record ${money(amount)} by ${paymentDraft.method.toLowerCase()} for ${account.name}? It will apply to ${preview.allocations.length} invoice${preview.allocations.length === 1 ? '' : 's'}.${creditLine}`)) return

    setPaymentBusy(true)
    setPaymentNotices((current) => ({ ...current, [account.id]: 'Recording payment…' }))
    try {
      const result = await submitManualPayment({
        client: supabase,
        invoiceId: invoice.id,
        amount,
        method: paymentDraft.method,
        receivedOn: paymentDraft.receivedOn,
        reference: paymentDraft.reference,
        reason: paymentDraft.reason,
      })
      const applied = Number(result.appliedTotal || 0)
      const credit = Number(result.creditAmount || 0)
      setPaymentDraft(null)
      setPaymentNotices((current) => ({
        ...current,
        [account.id]: `Payment recorded. ${money(applied)} applied${credit > 0 ? ` and ${money(credit)} saved as account credit` : ''}.`,
      }))
      await loadAccounts(true)
    } catch (paymentError) {
      setPaymentNotices((current) => ({
        ...current,
        [account.id]: paymentError instanceof Error ? paymentError.message : 'The payment could not be recorded.',
      }))
    } finally {
      setPaymentBusy(false)
    }
  }

  return (
    <div className="admin-camper-finder" ref={shellRef}>
      <label>
        <Search size={17} />
        <input
          ref={inputRef}
          value={query}
          onFocus={() => { setFocused(true); void loadAccounts() }}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Find camper, lot, check, invoice…"
          aria-label="Quickly find any camper account"
          autoComplete="off"
        />
        {query ? <button type="button" aria-label="Clear camper search" onClick={() => setQuery('')}><X size={15} /></button> : <kbd>/</kbd>}
      </label>

      {showPanel && (
        <div className="admin-camper-finder-results" role="region" aria-label="Camper search results">
          {loading && <p className="loading"><Loader2 size={17} /> Loading camper accounts…</p>}
          {error && <p className="error">{error} <button type="button" onClick={() => void loadAccounts(true)}>Try again</button></p>}
          {!loading && !error && normalized && results.length === 0 && <p>No camper account matched “{query}”. Try a name, lot, phone, check number, or invoice number.</p>}
          {!loading && !error && results.map((account) => {
            const accountUrl = `/admin/campers/${account.id}`
            const lotSearch = encodeURIComponent(String(account.lotNumber || account.name))
            const isRecordingPayment = paymentDraft?.camperId === account.id
            const selectedInvoice = isRecordingPayment
              ? account.invoiceOptions.find((invoice) => invoice.id === paymentDraft.invoiceId)
              : null
            const paymentPreview = isRecordingPayment
              ? buildPaymentAllocationPreview(account.invoiceOptions, paymentDraft.invoiceId, paymentDraft.amount)
              : null
            return (
              <article key={account.id}>
                <header>
                  <div><span>LOT {account.lotNumber || '—'}{account.active ? '' : ' · ARCHIVED'}</span><strong>{account.name}{account.secondName ? ` & ${account.secondName}` : ''}</strong><small>{account.email || account.phone || 'Camper account'}</small></div>
                  <a href={accountUrl}>Full account <ArrowRight size={14} /></a>
                </header>
                <div className="admin-camper-finder-money">
                  <span><small>Open balance</small><strong>{money(account.openBalance)}</strong></span>
                  <span><small>Next due</small><strong>{account.nextDue ? `${money(account.nextDueAmount)} · ${date(account.nextDue)}` : 'Nothing due'}</strong>{account.nextDueFor && <em>{account.nextDueFor}</em>}</span>
                  <span><small>Last payment</small><strong>{account.lastPayment ? `${money(account.lastPayment.amount)} · ${date(account.lastPayment.date)}` : 'None recorded'}</strong>{account.lastPayment && <em>{account.lastPayment.method || 'Payment'}{account.lastPayment.reference ? ` #${account.lastPayment.reference}` : ''}</em>}</span>
                  <span><small>Unused credit</small><strong>{money(account.unusedCredit)}</strong></span>
                </div>
                <div className="admin-camper-finder-quick-payment">
                  <div><CircleDollarSign size={17} /><span><strong>Record a payment</strong><small>{account.invoiceOptions.length ? `${account.invoiceOptions.length} open invoice${account.invoiceOptions.length === 1 ? '' : 's'} available` : 'No recordable open invoice'}</small></span></div>
                  {account.invoiceOptions.length > 0 ? (
                    <button type="button" onClick={() => isRecordingPayment ? setPaymentDraft(null) : startPayment(account)} disabled={paymentBusy}>
                      {isRecordingPayment ? 'Close' : 'Enter payment'}
                    </button>
                  ) : <em>Nothing due</em>}
                </div>
                {isRecordingPayment && paymentDraft && selectedInvoice && (
                  <div className="admin-camper-finder-payment-form">
                    <label className="wide"><span>Invoice to pay</span><select value={paymentDraft.invoiceId} onChange={(event) => {
                      const invoice = account.invoiceOptions.find((item) => item.id === event.target.value)
                      updatePaymentDraft({ invoiceId: event.target.value, amount: Number(invoice?.total_due || 0).toFixed(2) })
                    }}>
                      {account.invoiceOptions.map((invoice) => <option key={invoice.id} value={invoice.id}>#{invoice.invoice_number || invoice.id} · {invoice.invoice_type || 'Campground invoice'} · {money(invoice.total_due)}</option>)}
                    </select></label>
                    <label><span>Amount received</span><input type="number" min="0.01" step="0.01" inputMode="decimal" value={paymentDraft.amount} onChange={(event) => updatePaymentDraft({ amount: event.target.value })} /></label>
                    <label><span>Payment method</span><select value={paymentDraft.method} onChange={(event) => updatePaymentDraft({ method: event.target.value })}><option>Check</option><option>Cash</option><option>Credit/debit card</option><option>Other</option></select></label>
                    <label><span>Date received</span><input type="date" value={paymentDraft.receivedOn} onChange={(event) => updatePaymentDraft({ receivedOn: event.target.value })} /></label>
                    <label><span>Check/reference <em>optional</em></span><input value={paymentDraft.reference} onChange={(event) => updatePaymentDraft({ reference: event.target.value })} placeholder="Example: Check 1942" /></label>
                    <label className="wide"><span>Reason / office note</span><input value={paymentDraft.reason} onChange={(event) => updatePaymentDraft({ reason: event.target.value })} maxLength={1000} placeholder="Example: Check received at office" /></label>
                    <div className="admin-camper-finder-allocation wide">
                      <strong>Where this payment will go</strong>
                      {paymentPreview?.allocations.map((allocation) => <span key={allocation.invoiceId}><em>#{allocation.invoiceNumber} · {allocation.invoiceType}</em><b>{money(allocation.amount)}</b></span>)}
                      {paymentPreview && paymentPreview.creditAmount > 0 && <span className="credit"><em>Remaining account credit</em><b>{money(paymentPreview.creditAmount)}</b></span>}
                    </div>
                    <div className="admin-camper-finder-payment-actions wide">
                      <button type="button" onClick={() => setPaymentDraft(null)} disabled={paymentBusy}>Cancel</button>
                      <button type="button" onClick={() => void recordPayment(account)} disabled={paymentBusy}><CheckCircle2 size={14} /> {paymentBusy ? 'Recording…' : `Record ${money(paymentDraft.amount)}`}</button>
                    </div>
                  </div>
                )}
                {paymentNotices[account.id] && <p className="admin-camper-finder-payment-notice" role="status">{paymentNotices[account.id]}</p>}
                <nav aria-label={`${account.name} account sections`}>
                  <a className="primary" href={`${accountUrl}?history=billing#camper-history`}><ReceiptText size={14} /> Payments</a>
                  <a href={`/admin/invoices?search=${lotSearch}`}><ReceiptText size={14} /> Invoices</a>
                  <a href={`${accountUrl}?history=credits#camper-history`}><WalletCards size={14} /> Credits</a>
                  <a href={`${accountUrl}?history=documents#camper-history`}><FileText size={14} /> Documents</a>
                  <a href={`/admin/messages?camperId=${encodeURIComponent(account.id)}`}><MessageCircle size={14} /> Messages</a>
                  <a href={`${accountUrl}?history=site#camper-history`}><Wrench size={14} /> Site</a>
                  <a href={`${accountUrl}?history=electric#camper-history`}><Zap size={14} /> Electric</a>
                  <a href={`/admin/association-fees?search=${lotSearch}`}><Landmark size={14} /> Association</a>
                  <a href={`/admin/renewals?camper=${encodeURIComponent(account.id)}`}><CalendarClock size={14} /> Renewal</a>
                  <a href={accountUrl}><UserRound size={14} /> Profile</a>
                </nav>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
