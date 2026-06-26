"use client"

import { useEffect, useState } from "react"
import { supabase } from "../../../../lib/supabase"

import { useParams } from "next/navigation"

export default function CamperBalancePage() {
  const params = useParams()
  const [camper, setCamper] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [totalDue, setTotalDue] = useState(0)

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
    setInvoices(invoiceData || [])

    setTotalDue(
      (invoiceData || []).reduce(
        (sum, invoice) =>
          sum + Number(invoice.total_due || 0),
        0
      )
    )
  }
  async function markPaid(invoiceId: string) {
  const confirmed = window.confirm(
    "Mark this invoice as paid?"
  )

  if (!confirmed) return

  const { error } = await supabase
    .from("invoices")
    .update({
      status: "paid",
    })
    .eq("id", invoiceId)

  if (error) {
    alert(error.message)
    return
  }

  await loadData()

  alert("Invoice marked paid!")
}

async function deleteInvoice(invoice: any) {
  const confirmed = window.confirm(
    `Delete invoice #${invoice.invoice_number} permanently?\n\nThis removes the invoice and its itemized charge lines.`
  )

  if (!confirmed) return

  const { error: itemError } = await supabase
    .from("invoice_items")
    .delete()
    .eq("invoice_id", invoice.id)

  if (itemError) {
    alert(itemError.message)
    return
  }

  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", invoice.id)

  if (error) {
    alert(error.message)
    return
  }

  await loadData()
  alert("Invoice deleted.")
}

function sendReminder() {
  const message = `
Hello ${camper?.first_name || ""},

This is a reminder that your Bur Oaks Campground account currently has an outstanding balance of $${totalDue.toFixed(2)}.

Please contact the office if you have any questions regarding your account.

Thank you,
Bur Oaks Campground
`

  navigator.clipboard.writeText(message)

  alert("Reminder copied to clipboard!")
}
  return (
    <main
      style={{
        padding: "40px",
        maxWidth: "1200px",
        margin: "0 auto",
      }}
    >
      <button
  onClick={() =>
    (window.location.href = "/admin/open-balance")
  }
  style={{
    marginRight: "10px",
  }}
>
  ← Back to Open Balances
</button>

<button
  onClick={() => window.print()}
  style={{
    background: "#2563eb",
    color: "white",
    border: "none",
    padding: "10px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "bold",
  }}
>
  🖨 Print Statement
</button>
<button
  onClick={() => sendReminder()}
  style={{
    marginLeft: "10px",
    background: "#ea580c",
    color: "white",
    border: "none",
    padding: "10px 16px",
    borderRadius: "6px",
    cursor: "pointer",
    fontWeight: "bold",
  }}
>
  📧 Send Reminder
</button>
<div
  style={{
    textAlign: "center",
    marginBottom: "30px",
  }}
>
  <h1>Bur Oaks Campground</h1>
  <h2>Account Statement</h2>
</div>
      <h1>
        {camper?.first_name} {camper?.last_name}
      </h1>

      <h2>
        Lot {camper?.lot_number}
      </h2>

      <div
        style={{
          background: "white",
          padding: "20px",
          borderRadius: "12px",
          marginBottom: "20px",
          boxShadow: "0 2px 10px rgba(0,0,0,.1)",
        }}
      >
        <h2>Total Outstanding</h2>

        <h1
          style={{
            color: "#dc2626",
          }}
        >
          ${totalDue.toFixed(2)}
        </h1>
      </div>

      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          background: "white",
          boxShadow: "0 2px 10px rgba(0,0,0,.1)",
        }}
      >
        <thead>
          <tr
            style={{
              background: "#111827",
              color: "white",
            }}
          >
            <th style={{ padding: "12px" }}>
              Invoice #
            </th>

            <th style={{ padding: "12px" }}>
              Type
            </th>

            <th style={{ padding: "12px" }}>
              Amount
            </th>

            <th style={{ padding: "12px" }}>
              Due Date
            </th>

            <th style={{ padding: "12px" }}>
              Status
            </th>

            <th style={{ padding: "12px" }}>
              Actions
            </th>
          </tr>
        </thead>

        <tbody>
          {invoices.map((invoice) => (
            <tr key={invoice.id}>
              <td style={{ padding: "12px" }}>
                {invoice.invoice_number}
              </td>

              <td style={{ padding: "12px" }}>
                {invoice.invoice_type}
              </td>

              <td style={{ padding: "12px" }}>
                ${Number(invoice.total_due).toFixed(2)}
              </td>

              <td style={{ padding: "12px" }}>
                {invoice.due_date}
              </td>

              <td style={{ padding: "12px" }}>
  {invoice.status}

  <button
    onClick={() => markPaid(invoice.id)}
    style={{
      marginLeft: "10px",
      background: "#16a34a",
      color: "white",
      border: "none",
      padding: "6px 10px",
      borderRadius: "6px",
      cursor: "pointer",
    }}
  >
    Mark Paid
  </button>
</td>

              <td style={{ padding: "12px" }}>
                <button
                  onClick={() => deleteInvoice(invoice)}
                  style={{
                    background: "#dc2626",
                    color: "white",
                    border: "none",
                    padding: "6px 10px",
                    borderRadius: "6px",
                    cursor: "pointer",
                    fontWeight: "bold",
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}
