"use client"

import { useEffect, useState } from "react"
import { useRouter } from 'next/navigation'
import * as XLSX from "xlsx"
import { supabase } from "../../../lib/supabase"

export default function OpenBalancePage() {
  const [balances, setBalances] = useState<any[]>([])
  const [totalBalance, setTotalBalance] = useState(0)
const [search, setSearch] = useState("")
const router = useRouter()
  useEffect(() => {
    loadBalances()
  }, [])

  async function loadBalances() {
    const { data: invoices, error } = await supabase
      .from("invoices")
      .select(`
        *,
        campers (
          first_name,
          last_name,
          lot_number
        )
      `)
      .neq("status", "paid")

    if (error) {
      console.error(error)
      
      return
    }

    const grouped: any = {}

    invoices?.forEach((invoice) => {
      const camperId = invoice.camper_id

      if (!grouped[camperId]) {
        grouped[camperId] = {
  camper: `${invoice.campers?.first_name || ""} ${invoice.campers?.last_name || ""}`,
  lot: invoice.campers?.lot_number || "",
  camperId,
  balance: 0,
  invoiceCount: 0,
  oldestDue: invoice.due_date,
  daysLate: 0,
}
      }

      grouped[camperId].balance += Number(invoice.total_due || 0)
      grouped[camperId].invoiceCount += 1

      if (
        invoice.due_date &&
        invoice.due_date < grouped[camperId].oldestDue
      ) {
        grouped[camperId].oldestDue = invoice.due_date
      }
    })
Object.values(grouped).forEach((row: any) => {
  if (row.oldestDue) {
    const dueDate = new Date(row.oldestDue)
    const today = new Date()

    row.daysLate = Math.max(
      0,
      Math.floor(
        (today.getTime() - dueDate.getTime()) /
          (1000 * 60 * 60 * 24)
      )
    )

    if (row.daysLate > 10) {
  row.status = "Late"
} else if (row.daysLate > 0) {
  row.status = "Due"
} else {
  row.status = "Current"
}
  }
})
    const results = Object.values(grouped).sort(
      (a: any, b: any) => b.balance - a.balance
    )

    setBalances(results)

    setTotalBalance(
      results.reduce(
        (sum: number, row: any) => sum + row.balance,
        0
      )
    )
  }
function exportToExcel() {
  const exportData = balances.map((row) => ({
    Lot: row.lot,
    Camper: row.camper,
    Balance: row.balance,
    OpenInvoices: row.invoiceCount,
    DaysLate: row.daysLate,
    Status: row.status,
  }))

  const worksheet = XLSX.utils.json_to_sheet(exportData)
  const workbook = XLSX.utils.book_new()

  XLSX.utils.book_append_sheet(
    workbook,
    worksheet,
    "Open Balances"
  )

  XLSX.writeFile(
    workbook,
    `Open-Balances-${new Date()
      .toISOString()
      .slice(0, 10)}.xlsx`
  )
}
  return (
    <main
      style={{
        padding: "40px",
        maxWidth: "1400px",
        margin: "0 auto",
      }}
    >
        <button
  onClick={() => router.push('/admin')}
  style={{
    marginBottom: '20px',
    background: '#6b7280',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
  }}
>
  ← Back to Dashboard
</button>
      <h1>💰 Open Balance Dashboard</h1>
      <button
  onClick={exportToExcel}
  style={{
    background: "#16a34a",
    color: "white",
    border: "none",
    padding: "10px 16px",
    borderRadius: "8px",
    cursor: "pointer",
    fontWeight: "bold",
    marginBottom: "20px",
  }}
>
  📊 Export to Excel
</button>

      <div
  style={{
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "20px",
    marginBottom: "25px",
  }}
>
  <div
    style={{
      background: "white",
      padding: "20px",
      borderRadius: "12px",
      boxShadow: "0 2px 10px rgba(0,0,0,.1)",
    }}
  >
    <div style={{ color: "#6b7280" }}>
      Outstanding Balance
    </div>
    <h1>${totalBalance.toFixed(2)}</h1>
  </div>

  <div
    style={{
      background: "white",
      padding: "20px",
      borderRadius: "12px",
      boxShadow: "0 2px 10px rgba(0,0,0,.1)",
    }}
  >
    <div style={{ color: "#6b7280" }}>
      Campers Owing
    </div>
    <h1>{balances.length}</h1>
  </div>

  <div
    style={{
      background: "white",
      padding: "20px",
      borderRadius: "12px",
      boxShadow: "0 2px 10px rgba(0,0,0,.1)",
    }}
  >
    <div style={{ color: "#6b7280" }}>
      Open Invoices
    </div>
    <h1>
      {balances.reduce(
        (sum, row) => sum + row.invoiceCount,
        0
      )}
    </h1>
  </div>

  <div
    style={{
      background: "white",
      padding: "20px",
      borderRadius: "12px",
      boxShadow: "0 2px 10px rgba(0,0,0,.1)",
    }}
  >
    <div style={{ color: "#6b7280" }}>
      Late Accounts
    </div>
    <h1>
      {
        balances.filter(
          (row) => row.status === "Late"
        ).length
      }
    </h1>
  </div>
</div>

<div style={{ marginBottom: "20px" }}>
  <input
    type="text"
    placeholder="Search camper name or lot number..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    style={{
      width: "100%",
      padding: "12px",
      border: "1px solid #d1d5db",
      borderRadius: "8px",
      fontSize: "16px",
    }}
  />
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
            <th style={{ padding: "12px", textAlign: "left" }}>
              Lot
            </th>

            <th style={{ padding: "12px", textAlign: "left" }}>
              Camper
            </th>

            <th style={{ padding: "12px", textAlign: "left" }}>
              Balance Due
            </th>

            <th style={{ padding: "12px", textAlign: "left" }}>
              Open Invoices
            </th>

            <th style={{ padding: "12px", textAlign: "left" }}>
              Oldest Due Date
            </th>
            <th style={{ padding: "12px", textAlign: "left" }}>
  Days Late
</th>

<th style={{ padding: "12px", textAlign: "left" }}>
  Status
</th>

<th style={{ padding: "12px", textAlign: "left" }}>
  Actions
</th>
          </tr>
        </thead>

        <tbody>
  {balances
    .filter((row) => {
      const term = search.toLowerCase()

      return (
        row.camper?.toLowerCase().includes(term) ||
        row.lot?.toString().toLowerCase().includes(term)
      )
    })
    .map((row, index) => (
            <tr
              key={index}
              style={{
                borderBottom: "1px solid #e5e7eb",
              }}
            >
              <td style={{ padding: "12px" }}>
                {row.lot}
              </td>

              <td style={{ padding: "12px" }}>
                {row.camper}
              </td>

              <td
                style={{
                  padding: "12px",
                  fontWeight: "bold",
                  color: "#dc2626",
                }}
              >
                ${row.balance.toFixed(2)}
              </td>

              <td style={{ padding: "12px" }}>
                {row.invoiceCount}
              </td>

              <td style={{ padding: "12px" }}>
                {row.oldestDue}
              </td>
              <td
  style={{
    padding: "12px",
    fontWeight: "bold",
    color: row.daysLate > 0 ? "#dc2626" : "#16a34a",
  }}
>
  {row.daysLate}
</td>

<td style={{ padding: "12px" }}>
  <span
    style={{
      background:
  row.status === "Late"
    ? "#fee2e2"
    : row.status === "Due"
    ? "#fef3c7"
    : "#dcfce7",

color:
  row.status === "Late"
    ? "#991b1b"
    : row.status === "Due"
    ? "#92400e"
    : "#166534",
      padding: "6px 12px",
      borderRadius: "999px",
      fontWeight: "bold",
      fontSize: "12px",
    }}
  >
    {row.status}
  </span>
</td>
              <td style={{ padding: "12px" }}>
  <button
    onClick={() =>
      window.location.href =
        `/admin/open-balance/${row.camperId}`
    }
    style={{
      background: "#2563eb",
      color: "white",
      border: "none",
      padding: "8px 12px",
      borderRadius: "6px",
      cursor: "pointer",
      fontWeight: "bold",
    }}
  >
    View Invoices
  </button>
</td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}