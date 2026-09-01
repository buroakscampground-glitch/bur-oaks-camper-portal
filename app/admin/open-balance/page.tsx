"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from 'next/navigation'
import { ArrowRight, Download, Search, WalletCards } from 'lucide-react'
import { supabase } from "../../../lib/supabase"
import { isInvoiceDueThroughCurrentMonth } from '../../../lib/invoice-balance'

export default function OpenBalancePage() {
  const [balances, setBalances] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [pastDueOnly, setPastDueOnly] = useState(false)
  const router = useRouter()

  useEffect(() => {
    setPastDueOnly(new URLSearchParams(window.location.search).get('filter') === 'past-due')
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
    const dueInvoices = (invoices || []).filter((invoice) => isInvoiceDueThroughCurrentMonth(invoice))
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    dueInvoices.forEach((invoice) => {
      const camperId = invoice.camper_id

      if (!grouped[camperId]) {
        grouped[camperId] = {
          camper: `${invoice.campers?.first_name || ""} ${invoice.campers?.last_name || ""}`.trim() || 'Unknown camper',
          lot: invoice.campers?.lot_number || "Unassigned",
          camperId,
          balance: 0,
          invoiceCount: 0,
          pastDueBalance: 0,
          pastDueInvoiceCount: 0,
          oldestDue: invoice.due_date,
          daysLate: 0,
          status: 'Current',
        }
      }

      grouped[camperId].balance += Number(invoice.total_due || 0)
      grouped[camperId].invoiceCount += 1

      if (invoice.due_date) {
        const invoiceDueDate = new Date(`${invoice.due_date}T12:00:00`)
        if (!Number.isNaN(invoiceDueDate.getTime()) && invoiceDueDate < today) {
          grouped[camperId].pastDueBalance += Number(invoice.total_due || 0)
          grouped[camperId].pastDueInvoiceCount += 1
        }
      }

      if (invoice.due_date && (!grouped[camperId].oldestDue || invoice.due_date < grouped[camperId].oldestDue)) {
        grouped[camperId].oldestDue = invoice.due_date
      }
    })

    Object.values(grouped).forEach((row: any) => {
      if (row.oldestDue) {
        const dueDate = new Date(`${row.oldestDue}T00:00:00`)
        row.daysLate = Math.max(0, Math.floor((today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
        row.status = row.daysLate > 0 ? "Late" : "Current"
      }
    })

    const results = Object.values(grouped).sort((a: any, b: any) => b.balance - a.balance)
    setBalances(results)
  }

  const scopedBalances = useMemo(
    () => pastDueOnly
      ? balances
          .filter((row) => row.pastDueInvoiceCount > 0)
          .map((row) => ({ ...row, balance: row.pastDueBalance, invoiceCount: row.pastDueInvoiceCount }))
      : balances,
    [balances, pastDueOnly]
  )

  const filteredBalances = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return scopedBalances
    return scopedBalances.filter((row) =>
      `${row.camper} ${row.lot} ${row.status}`.toLowerCase().includes(term)
    )
  }, [scopedBalances, search])

  const scopedTotalBalance = scopedBalances.reduce((sum, row) => sum + row.balance, 0)

  function exportToSpreadsheet() {
    const quote = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const rows = [
      ['Lot', 'Camper', 'Balance', 'Open Invoices', 'Days Late', 'Status'],
      ...scopedBalances.map((row) => [row.lot, row.camper, row.balance.toFixed(2), row.invoiceCount, row.daysLate, row.status]),
    ]
    const csv = rows.map((row) => row.map(quote).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `${pastDueOnly ? 'Past-Due-Payments' : 'Open-Balances'}-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="admin-open-balance-page">
      <section className="admin-open-balance-hero">
        <button type="button" onClick={() => router.push('/admin')}>← Back to Dashboard</button>
        <div>
          <span><WalletCards size={18} /> Billing command center</span>
          <h1>{pastDueOnly ? 'Late Payments' : 'Amount Due This Month'}</h1>
          <p>{pastDueOnly
            ? 'Only campers with invoices past their due date are shown below. Open any camper to see every invoice involved.'
            : 'Current-month invoices plus every unpaid balance carried forward from earlier months. Later months stay out until their month begins.'}</p>
        </div>
        <button type="button" className="admin-open-export" onClick={exportToSpreadsheet}>
          <Download size={17} /> Export
        </button>
      </section>

      <section className="admin-open-balance-stats">
        <article><small>{pastDueOnly ? 'Late amount' : 'Amount due'}</small><strong>${scopedTotalBalance.toFixed(2)}</strong><em>{pastDueOnly ? 'Past the due date' : 'This month + carryover'}</em></article>
        <article><small>Campers owing</small><strong>{scopedBalances.length}</strong><em>{pastDueOnly ? 'With a late payment' : 'Through the current month'}</em></article>
        <article><small>Invoices included</small><strong>{scopedBalances.reduce((sum, row) => sum + row.invoiceCount, 0)}</strong><em>{pastDueOnly ? 'On these accounts' : 'Current and earlier months'}</em></article>
        <article><small>Late accounts</small><strong>{scopedBalances.filter((row) => row.daysLate > 0).length}</strong><em>Past the due date</em></article>
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
              <div><small>Invoices Due</small><strong>{row.invoiceCount}</strong></div>
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
              <h2>{pastDueOnly ? 'No late payments' : 'No payments are due this month'}</h2>
              <p>{pastDueOnly ? 'Every payment currently due is still on time.' : 'Later-month invoices will flow in automatically when their month begins.'}</p>
            </div>
          )}
        </div>
      </section>
    </main>
  )
}
