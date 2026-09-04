"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, CheckCircle2, ClipboardCopy, Printer, ReceiptText, Trash2, WalletCards } from "lucide-react"
import { useParams } from "next/navigation"
import { supabase } from "../../../../lib/supabase"
import { deleteInvoiceWithCreditRestore } from "../../../../lib/account-credits"
import { calculateAchProcessingFee, calculateCardProcessingFee, cardProcessingFeeSettings, loadPaymentFeeSettings } from "../../../../lib/payment-fees"
import AdminQuickText from "../../../../components/AdminQuickText"
import { isInvoiceDueThroughCurrentMonth, totalInvoiceBalance } from '../../../../lib/invoice-balance'
import { printPageWithFlag } from '../../../../lib/print-page'
import { buildBillingReminderMessage } from '../../../../lib/billing-reminder-message'
import { buildPaymentAllocationPreview, submitManualPayment } from '../../../../lib/manual-payment'

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
  })
}

function formatDate(value?: string) {
  if (!value) return "—"
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

export default function CamperBalancePage() {
  const params = useParams()
  const [camper, setCamper] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [allOpenInvoices, setAllOpenInvoices] = useState<any[]>([])
  const [totalDue, setTotalDue] = useState(0)
  const [message, setMessage] = useState("")
  const [busyInvoiceId, setBusyInvoiceId] = useState("")
  const [feeSettings, setFeeSettings] = useState(cardProcessingFeeSettings())
  const [paymentInvoiceId, setPaymentInvoiceId] = useState("")
  const [paymentMethod, setPaymentMethod] = useState("Check")
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [paymentReference, setPaymentReference] = useState("")
  const [paymentAmount, setPaymentAmount] = useState("")

  useEffect(() => {
    loadData()
  }, [])

  useEffect(() => {
    const refreshStatuses = () => loadData()
    const timer = window.setInterval(refreshStatuses, 30_000)

    window.addEventListener("focus", refreshStatuses)
    window.addEventListener("pageshow", refreshStatuses)

    return () => {
      window.clearInterval(timer)
      window.removeEventListener("focus", refreshStatuses)
      window.removeEventListener("pageshow", refreshStatuses)
    }
  }, [])

  async function loadData() {
    const camperId = params.id

    const { data: camperData } = await supabase
      .from("campers")
      .select("*")
      .eq("id", camperId)
      .single()

    setCamper(camperData)

    const { data: invoiceData } = await supabase
      .from("invoices")
      .select("*")
      .eq("camper_id", camperId)
      .neq("status", "paid")
      .order("due_date")

    setAllOpenInvoices(invoiceData || [])
    const dueInvoices = (invoiceData || []).filter((invoice) => isInvoiceDueThroughCurrentMonth(invoice))
    setInvoices(dueInvoices)
    setTotalDue(totalInvoiceBalance(dueInvoices))
    setFeeSettings(await loadPaymentFeeSettings(supabase))
  }

  function openPaymentForm(invoiceId: string) {
    setPaymentInvoiceId(invoiceId)
    setPaymentMethod("Check")
    setPaymentDate(new Date().toISOString().slice(0, 10))
    setPaymentReference("")
    const invoice = allOpenInvoices.find((item) => item.id === invoiceId) || invoices.find((item) => item.id === invoiceId)
    setPaymentAmount(String(Number(invoice?.total_due || 0).toFixed(2)))
    setMessage("")
  }

  async function recordPayment(invoiceId: string) {
    const invoice = invoices.find((item) => item.id === invoiceId)
    if (invoice?.status === "processing") {
      setMessage("Wait for Stripe to finish this payment before changing its status.")
      return
    }

    if (!paymentDate) {
      setMessage("Choose the date this payment was received.")
      return
    }

    const amount = Number(paymentAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      setMessage("Enter a valid payment amount.")
      return
    }

    const confirmed = window.confirm(
      `Record ${formatMoney(amount)} by ${paymentMethod.toLowerCase()} and apply it to the listed bills?`
    )
    if (!confirmed) return

    setBusyInvoiceId(invoiceId)
    try {
      const result = await submitManualPayment({
        client: supabase,
        invoiceId,
        amount,
        method: paymentMethod,
        receivedOn: paymentDate,
        reference: paymentReference,
      })
      const creditNote = Number(result.creditAmount || 0) > 0
        ? ` ${formatMoney(result.creditAmount)} remains as account credit.`
        : ""
      setPaymentInvoiceId("")
      setMessage(`Payment recorded. ${formatMoney(result.appliedTotal)} applied to ${result.allocations?.length || 0} bill(s).${creditNote}`)
      await loadData()
    } catch (error: any) {
      setMessage(error.message || "The payment could not be recorded.")
    } finally {
      setBusyInvoiceId("")
    }
  }

  async function deleteInvoice(invoice: any) {
    if (invoice.status === "processing") {
      setMessage("This invoice has a payment processing and cannot be deleted.")
      return
    }

    const confirmed = window.confirm(
      `Delete invoice #${invoice.invoice_number} permanently?\n\nThis removes the invoice and its itemized charge lines.`
    )

    if (!confirmed) return

    setBusyInvoiceId(invoice.id)

    let restoredTotal = 0
    try {
      const restoreResult = await deleteInvoiceWithCreditRestore(supabase, invoice.id)
      restoredTotal = restoreResult.restoredTotal
    } catch (error: any) {
      setBusyInvoiceId("")
      setMessage(error.message || "Unable to restore account credit before deleting this invoice.")
      return
    }

    setBusyInvoiceId("")

    setMessage(
      restoredTotal > 0
        ? `Invoice deleted. ${formatMoney(restoredTotal)} account credit was returned.`
        : "Invoice deleted."
    )
    await loadData()
  }

  function sendReminder() {
    const text = `
Hello ${camper?.first_name || ""},

This is a reminder that your Bur Oaks Campground account currently has an outstanding balance of ${formatMoney(totalDue)}.

Please contact the office if you have any questions regarding your account.

Thank you,
Bur Oaks Campground
`

    navigator.clipboard.writeText(text.trim())
    setMessage("Reminder copied to clipboard.")
  }

  const camperName = `${camper?.first_name || ""} ${camper?.last_name || ""}`.trim() || "Camper"
  const oldestDue = invoices[0]?.due_date
  const lateInvoices = invoices.filter((invoice) => {
    if (!invoice.due_date) return false
    const due = new Date(`${invoice.due_date}T12:00:00`)
    return due < new Date()
  })
  const billingReminderMessage = buildBillingReminderMessage(invoices)

  return (
    <main className="admin-open-balance-page admin-open-detail-page">
      <section className="admin-open-detail-hero">
        <a href="/admin/open-balance"><ArrowLeft size={17} /> Back to Open Balances</a>
        <div>
          <span><WalletCards size={18} /> ACCOUNT STATEMENT</span>
          <h1>{camperName}</h1>
          <p>Lot {camper?.lot_number || "—"} · Review open invoices, print a statement, copy a reminder, mark paid, or delete incorrect invoices.</p>
        </div>
        <div className="admin-open-detail-actions">
          <button type="button" onClick={() => printPageWithFlag('data-print-open-balance')}><Printer size={16} /> Print Statement</button>
          <button type="button" onClick={sendReminder}><ClipboardCopy size={16} /> Copy reminder</button>
        </div>
      </section>

      <section className="admin-open-detail-stats">
        <article><small>Amount due</small><strong>{formatMoney(totalDue)}</strong><em>This month + carryover</em></article>
        <article><small>Invoices included</small><strong>{invoices.length}</strong><em>Current and earlier months</em></article>
        <article><small>Oldest due date</small><strong>{formatDate(oldestDue)}</strong><em>First unpaid due date</em></article>
        <article className={lateInvoices.length ? "attention" : ""}><small>Past due</small><strong>{lateInvoices.length}</strong><em>{lateInvoices.length ? "Needs attention" : "None past due"}</em></article>
      </section>

      {camper?.id && invoices.length > 0 && (
        <AdminQuickText
          camperId={camper.id}
          title="Text bill reminder"
          description={`Send a direct billing reminder for ${camperName}'s account at Lot ${camper?.lot_number || "—"}. Authorized billing contacts are included.`}
          defaultType="Invoice Reminder"
          defaultMessage={billingReminderMessage}
          billDueMessage={billingReminderMessage}
        />
      )}

      <section className="admin-open-statement-card">
        <div className="admin-open-statement-heading">
          <div>
            <span><ReceiptText size={16} /> BUR OAKS CAMPGROUND</span>
            <h2>Open invoice statement</h2>
            <p>{camperName} · Lot {camper?.lot_number || "—"}</p>
          </div>
          <strong>{formatMoney(totalDue)}</strong>
        </div>

        {invoices.length === 0 ? (
          <div className="admin-open-empty">
            <CheckCircle2 size={34} />
            <h2>No open invoices</h2>
            <p>This camper does not currently have an outstanding balance.</p>
          </div>
        ) : (
          <div className="admin-open-invoice-list">
            {invoices.map((invoice) => (
              <article key={invoice.id} className={paymentInvoiceId === invoice.id ? "recording-payment" : ""}>
                <div className="admin-open-invoice-main">
                  <small>Invoice #{invoice.invoice_number}</small>
                  <h3>{invoice.invoice_type || "Campground invoice"}</h3>
                  <p>Due {formatDate(invoice.due_date)} · Status: {invoice.status || "sent"}</p>
                </div>
                <div className="admin-open-invoice-amount">
                  <strong>{formatMoney(invoice.total_due)}</strong>
                  <span>{invoice.status || "sent"}</span>
                  <small>
                    Card pay total: {formatMoney(Number(invoice.total_due || 0) + calculateCardProcessingFee(Number(invoice.total_due || 0), feeSettings))}
                    <br />
                    Checking/ACH total: {formatMoney(Number(invoice.total_due || 0) + calculateAchProcessingFee(Number(invoice.total_due || 0)))}
                    <br />
                    Fees: {formatMoney(calculateCardProcessingFee(Number(invoice.total_due || 0), feeSettings))} card · {formatMoney(calculateAchProcessingFee(Number(invoice.total_due || 0)))} ACH
                  </small>
                </div>
                <div className="admin-open-invoice-actions">
                  {invoice.status === "processing" ? (
                    <span>Stripe payment processing — changes locked</span>
                  ) : (
                    <>
                      <button type="button" onClick={() => openPaymentForm(invoice.id)} disabled={busyInvoiceId === invoice.id}>
                        <CheckCircle2 size={15} /> Mark paid
                      </button>
                      <button className="danger" type="button" onClick={() => deleteInvoice(invoice)} disabled={busyInvoiceId === invoice.id}>
                        <Trash2 size={15} /> Delete
                      </button>
                    </>
                  )}
                </div>
                {paymentInvoiceId === invoice.id && (
                  <div className="admin-open-payment-form">
                    <div>
                      <strong>How was this invoice paid?</strong>
                      <small>Enter any amount. Extra automatically moves to later bills; true excess becomes account credit.</small>
                    </div>
                    <label>
                      <span>Amount received</span>
                      <input type="number" min="0.01" step="0.01" inputMode="decimal" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} />
                    </label>
                    <label>
                      <span>Payment method</span>
                      <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                        <option>Check</option>
                        <option>Cash</option>
                        <option>Credit/debit card</option>
                        <option>Other</option>
                      </select>
                    </label>
                    <label>
                      <span>Date received</span>
                      <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                    </label>
                    <label>
                      <span>Check/reference number <em>optional</em></span>
                      <input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Example: Check 1942" />
                    </label>
                    <div className="admin-payment-allocation-preview">
                      <strong>Automatic allocation</strong>
                      {buildPaymentAllocationPreview(allOpenInvoices, invoice.id, paymentAmount).allocations.map((allocation) => (
                        <span key={allocation.invoiceId}><em>#{allocation.invoiceNumber} · {allocation.invoiceType}</em><b>{formatMoney(allocation.amount)}</b></span>
                      ))}
                      {buildPaymentAllocationPreview(allOpenInvoices, invoice.id, paymentAmount).creditAmount > 0 && (
                        <span className="credit"><em>Remaining account credit</em><b>{formatMoney(buildPaymentAllocationPreview(allOpenInvoices, invoice.id, paymentAmount).creditAmount)}</b></span>
                      )}
                    </div>
                    <div className="admin-open-payment-form-actions">
                      <button type="button" onClick={() => setPaymentInvoiceId("")} disabled={busyInvoiceId === invoice.id}>Cancel</button>
                      <button type="button" onClick={() => recordPayment(invoice.id)} disabled={busyInvoiceId === invoice.id}>
                        <CheckCircle2 size={15} /> {busyInvoiceId === invoice.id ? "Recording…" : "Record payment"}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>

      {message && <p className="admin-open-detail-message">{message}</p>}
    </main>
  )
}
