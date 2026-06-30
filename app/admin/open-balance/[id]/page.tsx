"use client"

import { useEffect, useState } from "react"
import { ArrowLeft, CheckCircle2, ClipboardCopy, Printer, ReceiptText, Trash2, WalletCards } from "lucide-react"
import { useParams } from "next/navigation"
import { supabase } from "../../../../lib/supabase"
import { restoreCreditsForDeletedInvoice } from "../../../../lib/account-credits"
import AdminQuickText from "../../../../components/AdminQuickText"

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
  const [totalDue, setTotalDue] = useState(0)
  const [message, setMessage] = useState("")
  const [busyInvoiceId, setBusyInvoiceId] = useState("")

  useEffect(() => {
    loadData()
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

    const openInvoices = invoiceData || []
    setInvoices(openInvoices)
    setTotalDue(openInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0))
  }

  async function markPaid(invoiceId: string) {
    const confirmed = window.confirm("Mark this invoice as paid?")
    if (!confirmed) return

    setBusyInvoiceId(invoiceId)
    const { error } = await supabase
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_method: "Manual office payment",
        payment_reference: "Marked paid by admin",
      })
      .eq("id", invoiceId)

    setBusyInvoiceId("")

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage("Invoice marked paid.")
    await loadData()
  }

  async function deleteInvoice(invoice: any) {
    const confirmed = window.confirm(
      `Delete invoice #${invoice.invoice_number} permanently?\n\nThis removes the invoice and its itemized charge lines.`
    )

    if (!confirmed) return

    setBusyInvoiceId(invoice.id)

    let restoredTotal = 0
    try {
      const restoreResult = await restoreCreditsForDeletedInvoice(supabase, invoice.id)
      restoredTotal = restoreResult.restoredTotal
    } catch (error: any) {
      setBusyInvoiceId("")
      setMessage(error.message || "Unable to restore account credit before deleting this invoice.")
      return
    }

    const { error: reminderError } = await supabase
      .from("text_reminders")
      .delete()
      .eq("invoice_id", invoice.id)

    if (reminderError && !["42P01", "PGRST205"].includes(reminderError.code || "")) {
      setBusyInvoiceId("")
      setMessage(reminderError.message)
      return
    }

    const { error: itemError } = await supabase
      .from("invoice_items")
      .delete()
      .eq("invoice_id", invoice.id)

    if (itemError) {
      setBusyInvoiceId("")
      setMessage(itemError.message)
      return
    }

    const { error } = await supabase
      .from("invoices")
      .delete()
      .eq("id", invoice.id)

    setBusyInvoiceId("")

    if (error) {
      setMessage(error.message)
      return
    }

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
          <button type="button" onClick={() => window.print()}><Printer size={16} /> Print</button>
          <button type="button" onClick={sendReminder}><ClipboardCopy size={16} /> Copy reminder</button>
        </div>
      </section>

      <section className="admin-open-detail-stats">
        <article><small>Total outstanding</small><strong>{formatMoney(totalDue)}</strong><em>Open balance</em></article>
        <article><small>Open invoices</small><strong>{invoices.length}</strong><em>Awaiting payment</em></article>
        <article><small>Oldest due date</small><strong>{formatDate(oldestDue)}</strong><em>First unpaid due date</em></article>
        <article className={lateInvoices.length ? "attention" : ""}><small>Past due</small><strong>{lateInvoices.length}</strong><em>{lateInvoices.length ? "Needs attention" : "None past due"}</em></article>
      </section>

      {camper?.id && (
        <AdminQuickText
          camperId={camper.id}
          title="Text bill reminder"
          description={`Send a direct billing reminder to ${camperName} at Lot ${camper?.lot_number || "—"}.`}
          defaultType="Invoice Reminder"
          defaultMessage={`Your Bur Oaks account currently has an outstanding balance of ${formatMoney(totalDue)}. Please check your camper portal or contact the office with questions.`}
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
              <article key={invoice.id}>
                <div className="admin-open-invoice-main">
                  <small>Invoice #{invoice.invoice_number}</small>
                  <h3>{invoice.invoice_type || "Campground invoice"}</h3>
                  <p>Due {formatDate(invoice.due_date)} · Status: {invoice.status || "sent"}</p>
                </div>
                <div className="admin-open-invoice-amount">
                  <strong>{formatMoney(invoice.total_due)}</strong>
                  <span>{invoice.status || "sent"}</span>
                </div>
                <div className="admin-open-invoice-actions">
                  <button type="button" onClick={() => markPaid(invoice.id)} disabled={busyInvoiceId === invoice.id}>
                    <CheckCircle2 size={15} /> Mark paid
                  </button>
                  <button className="danger" type="button" onClick={() => deleteInvoice(invoice)} disabled={busyInvoiceId === invoice.id}>
                    <Trash2 size={15} /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {message && <p className="admin-open-detail-message">{message}</p>}
    </main>
  )
}
