"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from 'next/navigation'
import { ArrowRight, Download, Search, WalletCards } from 'lucide-react'
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
          camper: `${invoice.campers?.first_name || ""} ${invoice.campers?.last_name || ""}`.trim() || 'Unknown camper',
          lot: invoice.campers?.lot_number || "Unassigned",
          camperId,
          balance: 0,
          invoiceCount: 0,
          oldestDue: invoice.due_date,
          daysLate: 0,
          status: 'Current',
        }
      }

      grouped[camperId].balance += Number(invoice.total_due || 0)
      grouped[camperId].invoiceCount += 1

      if (invoice.due_date && (!grouped[camperId].oldestDue || invoice.due_date < grouped[camperId].oldestDue)) {
        grouped[camperId].oldestDue = invoice.due_date
      }
    })

    Object.values(grouped).forEach((row: any) => {
      if (row.oldestDue) {
        const dueDate = new Date(row.oldestDue)
        const today = new Date()
        row.daysLate = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
        row.status = row.daysLate > 10 ? "Late" : row.daysLate > 0 ? "Due" : "Current"
      }
    })

    const results = Object.values(grouped).sort((a: any, b: any) => b.balance - a.balance)
    setBalances(results)
    setTotalBalance(results.reduce((sum: number, row: any) => sum + row.balance, 0))
  }

  const filteredBalances = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return balances
    return balances.filter((row) =>
      `${row.camper} ${row.lot} ${row.status}`.toLowerCase().includes(term)
    )
  }, [balances, search])

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
    XLSX.utils.book_append_sheet(workbook, worksheet, "Open Balances")
    XLSX.writeFile(workbook, `Open-Balances-${new Date().toISOString().slice(0, 10)}.xlsx`)
  }

  return (
    <main className="admin-open-balance-page">
      <section className="admin-open-balance-hero">
        <button type="button" onClick={() => router.push('/admin')}>← Back to Dashboard</button>
        <div>
          <span><WalletCards size={18} /> Billing command center</span>
          <h1>Open Balances</h1>
          <p>See who owes, how long it has been open, and jump straight into the camper invoice record.</p>
        </div>
        <button type="button" className="admin-open-export" onClick={exportToExcel}>
          <Download size={17} /> Export
        </button>
      </section>

      <section className="admin-open-balance-stats">
        <article><small>Outstanding balance</small><strong>${totalBalance.toFixed(2)}</strong><em>Total unpaid</em></article>
        <article><small>Campers owing</small><strong>{balances.length}</strong><em>With open invoices</em></article>
        <article><small>Open invoices</small><strong>{balances.reduce((sum, row) => sum + row.invoiceCount, 0)}</strong><em>Awaiting payment</em></article>
        <article><small>Late accounts</small><strong>{balances.filter((row) => row.status === "Late").length}</strong><em>Over 10 days</em></article>
      </section>

      <section className="admin-open-balance-panel">
        <div className="admin-open-toolbar">
          <label>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search camper, lot, or status..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <span>{filteredBalances.length} account{filteredBalances.length === 1 ? '' : 's'} shown</span>
        </div>

        <div className="admin-open-balance-list">
          {filteredBalances.map((row) => (
            <article key={row.camperId} className={`admin-open-row ${String(row.status).toLowerCase()}`}>
              <div className="admin-open-camper">
                <span>Lot {row.lot}</span>
                <strong>{row.camper}</strong>
              </div>
              <div><small>Balance Due</small><strong>${row.balance.toFixed(2)}</strong></div>
              <div><small>Open Invoices</small><strong>{row.invoiceCount}</strong></div>
              <div><small>Oldest Due</small><strong>{row.oldestDue || '—'}</strong></div>
              <div><small>Days Late</small><strong>{row.daysLate}</strong></div>
              <span className={`admin-open-status ${String(row.status).toLowerCase()}`}>{row.status}</span>
              <button type="button" onClick={() => router.push(`/admin/open-balance/${row.camperId}`)}>
                View Invoices <ArrowRight size={15} />
              </button>
            </article>
          ))}

          {filteredBalances.length === 0 && (
            <div className="admin-open-empty">
              <WalletCards size={32} />
              <h2>No open balances found</h2>
              <p>Try another search or check back after new invoices are created.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
