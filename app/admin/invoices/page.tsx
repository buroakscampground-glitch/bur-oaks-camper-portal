'use client'

import { useEffect, useState } from 'react'
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  FilePlus2,
  FileText,
  Loader2,
  MapPin,
  ReceiptText,
  Search,
  Sparkles,
  Trash2,
  UserRound,
  WalletCards,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { attemptAutoPay } from '../../../lib/autopay'
import { applyAvailableCreditsToInvoice, formatCreditMoney, restoreCreditsForDeletedInvoice } from '../../../lib/account-credits'
import { invoiceTextSummary, notifyInvoiceCreated } from '../../../lib/client-invoice-texts'
import { calculateCardProcessingFee, cardProcessingFeeSettings, loadPaymentFeeSettings } from '../../../lib/payment-fees'
import AdminQuickText from '../../../components/AdminQuickText'

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
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function AdminInvoicesPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [description, setDescription] = useState('Lot Rent')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [searchText, setSearchText] = useState('')
  const [filter, setFilter] = useState<InvoiceFilter>('all')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [deletingInvoiceId, setDeletingInvoiceId] = useState('')
  const [feeSettings, setFeeSettings] = useState(cardProcessingFeeSettings())

  async function loadInvoices() {
    const { data } = await supabase
      .from('invoices')
      .select(`
        *,
        campers (first_name, last_name, lot_number)
      `)
      .order('created_at', { ascending: false })

    setInvoices(
      (data || []).sort((a: any, b: any) => {
        if (a.status === 'paid' && b.status !== 'paid') return 1
        if (a.status !== 'paid' && b.status === 'paid') return -1
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
    )
  }

  useEffect(() => {
    async function loadWorkspace() {
      const [, camperResult, paymentFeeSettings] = await Promise.all([
        loadInvoices(),
        supabase.from('campers').select('*').eq('active', true).order('lot_number'),
        loadPaymentFeeSettings(supabase),
      ])

      setCampers(camperResult.data || [])
      setFeeSettings(paymentFeeSettings)
      setLoading(false)
    }

    loadWorkspace()
  }, [])

  async function createInvoice() {
    setMessage('')

    if (!camperId) return setMessage('Please select a camper.')
    if (!invoiceNumber.trim()) return setMessage('Please enter an invoice number.')
    if (!amount || Number(amount) <= 0) return setMessage('Please enter a valid amount.')
    if (!dueDate) return setMessage('Please select a due date.')

    setCreating(true)
    setMessage('Creating invoice…')
    const total = Number(amount)

    try {
      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          camper_id: camperId,
          invoice_number: invoiceNumber.trim(),
          invoice_type: description.trim() || 'Campground Charge',
          subtotal: total,
          late_fee: 0,
          total_due: total,
          due_date: dueDate,
          status: 'sent',
        })
        .select()
        .single()

      if (invoiceError) throw invoiceError

      const { error: itemError } = await supabase.from('invoice_items').insert({
        invoice_id: invoice.id,
        description: description.trim() || 'Campground Charge',
        quantity: 1,
        unit_price: total,
        total,
      })

      if (itemError) throw itemError

      const {
        data: { user },
      } = await supabase.auth.getUser()

      const creditResult = await applyAvailableCreditsToInvoice({
        client: supabase,
        camperId,
        invoiceId: invoice.id,
        invoiceTotal: total,
        appliedBy: user?.email || null,
      })

      let resultMessage = creditResult.appliedTotal > 0
        ? `Invoice created. Applied ${formatCreditMoney(creditResult.appliedTotal)} account credit.`
        : 'Invoice created successfully.'

      if (creditResult.paidInFull) {
        resultMessage += ' Credit covered the full invoice.'
      } else {
        try {
          const autoPay = await attemptAutoPay(invoice.id)
          if (autoPay.charged) resultMessage += ' Remaining balance paid automatically.'
        } catch (error: any) {
          resultMessage += ` AutoPay was not completed: ${error.message}`
        }
      }

      try {
        const textResult = await notifyInvoiceCreated(invoice.id)
        resultMessage += invoiceTextSummary(textResult)
      } catch (error: any) {
        resultMessage += ` Text alert failed: ${error.message || 'unknown error'}.`
      }

      setMessage(resultMessage)
      setCamperId('')
      setInvoiceNumber('')
      setAmount('')
      setDueDate('')
      await loadInvoices()
    } catch (error: any) {
      setMessage(error.message || 'Unable to create invoice.')
    } finally {
      setCreating(false)
    }
  }

  async function deleteInvoice(invoice: any) {
    const camperName = `${invoice.campers?.first_name || ''} ${invoice.campers?.last_name || ''}`.trim()
    const confirmed = confirm(
      `Delete invoice #${invoice.invoice_number} for ${camperName || `Lot ${invoice.campers?.lot_number || '—'}`}?\n\nThis permanently removes the invoice and its itemized charges.`
    )

    if (!confirmed) return

    setDeletingInvoiceId(invoice.id)
    setMessage('')

    try {
      const restoreResult = await restoreCreditsForDeletedInvoice(supabase, invoice.id)

      const { error: reminderError } = await supabase
        .from('text_reminders')
        .delete()
        .eq('invoice_id', invoice.id)

      if (reminderError && !['42P01', 'PGRST205'].includes(reminderError.code || '')) throw reminderError

      const { error: itemError } = await supabase
        .from('invoice_items')
        .delete()
        .eq('invoice_id', invoice.id)

      if (itemError) throw itemError

      const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoice.id)

      if (error) throw error

      setMessage(
        restoreResult.restoredTotal > 0
          ? `Invoice #${invoice.invoice_number} deleted. ${formatCreditMoney(restoreResult.restoredTotal)} account credit was returned.`
          : `Invoice #${invoice.invoice_number} deleted.`
      )
      await loadInvoices()
    } catch (error: any) {
      setMessage(error.message || 'Unable to delete invoice.')
    } finally {
      setDeletingInvoiceId('')
    }
  }

  const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid')
  const paidInvoices = invoices.filter((invoice) => invoice.status === 'paid')
  const openBalance = openInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)
  const collectedRevenue = paidInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)
  const previewInvoiceAmount = Number(amount || 0)
  const previewProcessingFee = calculateCardProcessingFee(previewInvoiceAmount, feeSettings)
  const previewCardTotal = previewInvoiceAmount + previewProcessingFee
  const normalizedSearch = searchText.trim().toLowerCase()
  const visibleInvoices = invoices.filter((invoice) => {
    const matchesStatus =
      filter === 'all' ||
      (filter === 'paid' && invoice.status === 'paid') ||
      (filter === 'open' && invoice.status !== 'paid')
    const matchesSearch =
      !normalizedSearch ||
      String(invoice.invoice_number || '').toLowerCase().includes(normalizedSearch) ||
      String(invoice.invoice_type || '').toLowerCase().includes(normalizedSearch) ||
      String(invoice.campers?.first_name || '').toLowerCase().includes(normalizedSearch) ||
      String(invoice.campers?.last_name || '').toLowerCase().includes(normalizedSearch) ||
      String(invoice.campers?.lot_number || '').toLowerCase().includes(normalizedSearch)

    return matchesStatus && matchesSearch
  })
  const selectedCamper = campers.find((camper) => camper.id === camperId)

  return (
    <main className="admin-billing-page">
      <section className="admin-billing-summary" aria-label="Billing summary">
        <article>
          <span className="green"><CircleDollarSign size={22} /></span>
          <div><small>Collected revenue</small><strong>{formatMoney(collectedRevenue)}</strong><em>{paidInvoices.length} paid invoices</em></div>
        </article>
        <article>
          <span className="gold"><WalletCards size={22} /></span>
          <div><small>Open balance</small><strong>{formatMoney(openBalance)}</strong><em>{openInvoices.length} awaiting payment</em></div>
        </article>
        <article>
          <span className="blue"><ReceiptText size={22} /></span>
          <div><small>Total invoices</small><strong>{invoices.length}</strong><em>Complete billing history</em></div>
        </article>
        <article>
          <span className="plum"><Sparkles size={22} /></span>
          <div><small>AutoPay ready</small><strong>Enabled</strong><em>Checked when invoices are issued</em></div>
        </article>
      </section>

      <div className="admin-billing-layout">
        <aside className="admin-invoice-create-panel">
          <div className="admin-billing-section-heading">
            <span className="admin-billing-heading-icon"><FilePlus2 size={22} /></span>
            <div><small>NEW CHARGE</small><h2>Create an invoice</h2><p>Issue a charge to one active camper account.</p></div>
          </div>

          <div className="admin-invoice-form">
            <label>
              <span>Camper account</span>
              <select value={camperId} onChange={(event) => setCamperId(event.target.value)}>
                <option value="">Select a camper</option>
                {campers.map((camper) => (
                  <option key={camper.id} value={camper.id}>
                    Lot {camper.lot_number} — {camper.first_name} {camper.last_name}
                  </option>
                ))}
              </select>
            </label>

            {selectedCamper && (
              <div className="admin-selected-camper">
                <span><UserRound size={18} /></span>
                <div><strong>{selectedCamper.first_name} {selectedCamper.last_name}</strong><small><MapPin size={12} /> Lot {selectedCamper.lot_number}</small></div>
              </div>
            )}

            <div className="admin-invoice-form-row">
              <label><span>Invoice number</span><input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} placeholder="INV-1002" /></label>
              <label><span>Due date</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
            </div>

            <label>
              <span>Description</span>
              <input list="invoice-types" value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Lot Rent" />
              <datalist id="invoice-types">
                <option value="Lot Rent" />
                <option value="Electric Bill" />
                <option value="Late Fee" />
                <option value="Gate Card" />
                <option value="Maintenance Charge" />
              </datalist>
            </label>

            <label><span>Amount</span><div className="admin-money-input"><i>$</i><input type="number" min="0.50" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></div></label>

            <div className="admin-invoice-preview">
              <span>Invoice total</span><strong>{formatMoney(amount)}</strong>
              {previewInvoiceAmount > 0 && (
                <small>
                  If paid by card: {formatMoney(previewInvoiceAmount)} invoice + {formatMoney(previewProcessingFee)} processing fee = {formatMoney(previewCardTotal)}
                </small>
              )}
            </div>

            <button className="admin-create-invoice-button" type="button" onClick={createInvoice} disabled={creating}>
              {creating ? <Loader2 className="admin-spin" size={17} /> : <FilePlus2 size={17} />}
              {creating ? 'Creating invoice…' : 'Create invoice'}
            </button>
            {message && <p className={`admin-invoice-message ${message.toLowerCase().includes('success') || message.toLowerCase().includes('paid automatically') ? 'success' : ''}`}>{message}</p>}
          </div>

          {selectedCamper && (
            <AdminQuickText
              compact
              camperId={selectedCamper.id}
              title="Text this camper"
              description={`Send a quick billing note to Lot ${selectedCamper.lot_number}.`}
              defaultType="Invoice Reminder"
              defaultMessage={`You have a balance due on your Bur Oaks account. Please check your camper portal or contact the office with questions.`}
            />
          )}
        </aside>

        <section className="admin-invoice-history-panel">
          <div className="admin-history-heading">
            <div><small>BILLING RECORDS</small><h2>Invoice history</h2><p>{visibleInvoices.length} of {invoices.length} invoices shown</p></div>
            <div className="admin-invoice-filters" role="group" aria-label="Filter invoices">
              {(['all', 'open', 'paid'] as InvoiceFilter[]).map((option) => (
                <button key={option} type="button" className={filter === option ? 'active' : ''} onClick={() => setFilter(option)}>
                  {option === 'all' ? 'All' : option === 'open' ? 'Open' : 'Paid'}
                </button>
              ))}
            </div>
          </div>

          <label className="admin-invoice-search">
            <Search size={18} />
            <input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search camper, lot, invoice, or type…" />
          </label>

          {loading ? (
            <div className="admin-invoice-empty"><Loader2 className="admin-spin" size={28} /><p>Loading billing records…</p></div>
          ) : visibleInvoices.length === 0 ? (
            <div className="admin-invoice-empty"><FileText size={32} /><h3>No invoices found</h3><p>Try another search or status filter.</p></div>
          ) : (
            <div className="admin-invoice-records">
              {visibleInvoices.map((invoice) => {
                const isPaid = invoice.status === 'paid'
                const processingFee = calculateCardProcessingFee(Number(invoice.total_due || 0), feeSettings)
                const cardTotal = Number(invoice.total_due || 0) + processingFee
                return (
                  <article className="admin-invoice-record" key={invoice.id}>
                    <span className={`admin-invoice-record-icon ${isPaid ? 'paid' : 'open'}`}>
                      {isPaid ? <CheckCircle2 size={20} /> : <ReceiptText size={20} />}
                    </span>
                    <span className="admin-invoice-record-camper">
                      <small>Lot {invoice.campers?.lot_number || '—'} · Invoice #{invoice.invoice_number}</small>
                      <strong>{invoice.campers?.first_name} {invoice.campers?.last_name}</strong>
                      <em>{invoice.invoice_type || 'Campground charge'}</em>
                    </span>
                    <span className="admin-invoice-record-date"><CalendarDays size={14} /><span><small>Due</small><strong>{formatDate(invoice.due_date)}</strong></span></span>
                    <span className="admin-invoice-record-total">
                      <strong>{formatMoney(invoice.total_due)}</strong>
                      <em className={isPaid ? 'paid' : 'open'}>{isPaid ? 'Paid' : 'Payment due'}</em>
                      {!isPaid && (
                        <small>
                          Card pay total: {formatMoney(cardTotal)}
                          <br />
                          Includes {formatMoney(processingFee)} processing fee
                        </small>
                      )}
                    </span>
                    <span className="admin-invoice-record-actions">
                      <a href={`/admin/invoices/${invoice.id}`}>View <ArrowRight size={14} /></a>
                      <button type="button" onClick={() => deleteInvoice(invoice)} disabled={deletingInvoiceId === invoice.id}>
                        <Trash2 size={14} /> {deletingInvoiceId === invoice.id ? 'Deleting…' : 'Delete'}
                      </button>
                    </span>
                  </article>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
