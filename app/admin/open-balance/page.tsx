"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from 'next/navigation'
import { AlertTriangle, ArrowRight, Download, Loader2, Search, WalletCards } from 'lucide-react'
import { supabase } from "../../../lib/supabase"
import { achExpectedLabel } from '../../../lib/ach-expected-date'
import { invoiceTimingBucket, isInvoiceDueThroughCurrentMonth, isInvoiceOutstanding, todayInCentral } from '../../../lib/invoice-balance'

export default function OpenBalancePage() {
  const [balances, setBalances] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [pastDueOnly, setPastDueOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const router = useRouter()

  useEffect(() => {
    setPastDueOnly(new URLSearchParams(window.location.search).get('filter') === 'past-due')
    loadBalances()
  }, [])

  async function loadBalances() {
    setLoading(true)
    setLoadError('')

    try {
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

      if (error) throw error

    const grouped: any = {}
    const dueInvoices = (invoices || []).filter((invoice) =>
      isInvoiceOutstanding(invoice) && isInvoiceDueThroughCurrentMonth(invoice)
    )
    const today = todayInCentral()

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
          processingBalance: 0,
          processingInvoiceCount: 0,
          achExpectedDates: [],
          oldestDue: invoice.due_date,
          oldestPastDue: null,
          daysLate: 0,
          status: 'Current',
        }
      }

      grouped[camperId].balance += Number(invoice.total_due || 0)
      grouped[camperId].invoiceCount += 1

      const timing = invoiceTimingBucket(invoice, today)
      if (timing === 'late') {
        grouped[camperId].pastDueBalance += Number(invoice.total_due || 0)
        grouped[camperId].pastDueInvoiceCount += 1
        if (!grouped[camperId].oldestPastDue || invoice.due_date < grouped[camperId].oldestPastDue) {
          grouped[camperId].oldestPastDue = invoice.due_date
        }
      }

      if (timing === 'processing') {
        grouped[camperId].processingBalance += Number(invoice.total_due || 0)
        grouped[camperId].processingInvoiceCount += 1
        if (invoice.ach_expected_date) grouped[camperId].achExpectedDates.push(invoice.ach_expected_date)
      }

      if (invoice.due_date && (!grouped[camperId].oldestDue || invoice.due_date < grouped[camperId].oldestDue)) {
        grouped[camperId].oldestDue = invoice.due_date
      }
    })

    Object.values(grouped).forEach((row: any) => {
      if (row.oldestPastDue) {
        const dueDate = new Date(`${row.oldestPastDue}T00:00:00Z`)
        const todayDate = new Date(`${today}T00:00:00Z`)
        row.daysLate = Math.max(0, Math.floor((todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)))
        row.status = "Late"
      } else if (row.processingInvoiceCount > 0) {
        row.status = "Processing"
      }
      row.achExpectedDate = [...row.achExpectedDates].sort()[0] || null
      row.achStatus = achExpectedLabel({
        status: 'processing',
        payment_method: 'Online ACH processing',
        ach_expected_date: row.achExpectedDate,
      })
    })

      const results = Object.values(grouped).sort((a: any, b: any) => b.balance - a.balance)
      setBalances(results)
    } catch (error) {
      console.error(error)
      setBalances([])
      setLoadError('Open balances could not be loaded. No totals on this screen should be treated as current.')
    } finally {
      setLoading(false)
    }
  }

  const scopedBalances = useMemo(
    () => pastDueOnly
      ? balances
          .filter((row) => row.pastDueInvoiceCount > 0)
          .map((row) => ({ ...row, balance: row.pastDueBalance, invoiceCount: row.pastDueInvoiceCount }))
      : balances,
    [balances, pastDueOnly]
  )

  const processingBalances = useMemo(
    () => pastDueOnly
      ? balances
          .filter((row) => row.pastDueInvoiceCount === 0 && row.processingInvoiceCount > 0)
          .map((row) => ({ ...row, balance: row.processingBalance, invoiceCount: row.processingInvoiceCount }))
      : [],
    [balances, pastDueOnly]
  )

  const filteredBalances = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return scopedBalances
    return scopedBalances.filter((row) =>
      `${row.camper} ${row.lot} ${row.status}`.toLowerCase().includes(term)
    )
  }, [scopedBalances, search])

  const filteredProcessingBalances = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return processingBalances
    return processingBalances.filter((row) =>
      `${row.camper} ${row.lot} ${row.status} ${row.achStatus}`.toLowerCase().includes(term)
    )
  }, [processingBalances, search])

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

  if (loading) {
    return <main className="portal-loading"><Loader2 className="portal-loading-spinner" aria-hidden="true" /><h1>Loading open balances…</h1><p>Checking the current billing records.</p></main>
  }

  if (loadError) {
    return <main className="portal-loading" role="alert"><AlertTriangle aria-hidden="true" /><h1>Open balances are temporarily unavailable</h1><p>{loadError}</p><button type="button" className="portal-loading-retry" onClick={loadBalances}>Try again</button></main>
  }

  return (
    <main className="admin-open-balance-page">
      <section className="admin-open-balance-hero">
        <button type="button" onClick={() => router.push('/admin')}>← Back to Dashboard</button>
        <div>
          <span><WalletCards size={18} /> Billing command center</span>
          <h1>{pastDueOnly ? 'Late Payments' : 'Amount Due This Month'}</h1>
          <p>{pastDueOnly
            ? 'Truly late invoices appear first. ACH payments already underway are shown separately and are never counted as late.'
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
        <article><small>ACH processing</small><strong>{balances.reduce((sum, row) => sum + row.processingInvoiceCount, 0)}</strong><em>Underway · not late</em></article>
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
          <span>{filteredBalances.length + filteredProcessingBalances.length} account{filteredBalances.length + filteredProcessingBalances.length === 1 ? '' : 's'} shown</span>
        </div>

        <div className="admin-open-balance-list">
          {filteredBalances.map((row) => (
            <article key={row.camperId} className={`admin-open-row ${String(row.status).toLowerCase()}`}>
              <div className="admin-open-camper">
                <span>Lot {row.lot}</span>
                <strong>{row.camper}</strong>
              </div>
              <div><small>{row.status === 'Processing' ? 'Payment Processing' : 'Balance Due'}</small><strong>${row.balance.toFixed(2)}</strong></div>
              <div><small>{row.status === 'Processing' ? 'Invoices' : 'Invoices Due'}</small><strong>{row.invoiceCount}</strong></div>
              <div><small>{row.status === 'Processing' ? 'Original Due Date' : 'Oldest Due'}</small><strong>{row.oldestPastDue || row.oldestDue || '—'}</strong></div>
              <div><small>{row.status === 'Processing' ? 'ACH Status' : 'Days Late'}</small><strong>{row.status === 'Processing' ? row.achStatus : row.daysLate}</strong></div>
              <span className={`admin-open-status ${String(row.status).toLowerCase()}`}>{row.status}</span>
              <button type="button" onClick={() => router.push(`/admin/open-balance/${row.camperId}`)}>
                View Invoices <ArrowRight size={15} />
              </button>
            </article>
          ))}

          {pastDueOnly && filteredProcessingBalances.length > 0 && (
            <div className="admin-processing-heading">
              <strong>ACH payments underway</strong>
              <span>These payments are already submitted and are not late.</span>
            </div>
          )}

          {filteredProcessingBalances.map((row) => (
            <article key={`processing-${row.camperId}`} className="admin-open-row processing">
              <div className="admin-open-camper">
                <span>Lot {row.lot}</span>
                <strong>{row.camper}</strong>
              </div>
              <div><small>Payment Processing</small><strong>${row.balance.toFixed(2)}</strong></div>
              <div><small>Invoices</small><strong>{row.invoiceCount}</strong></div>
              <div><small>Original Due Date</small><strong>{row.oldestDue || '—'}</strong></div>
              <div><small>ACH Status</small><strong>{row.achStatus}</strong></div>
              <span className="admin-open-status processing">Processing</span>
              <button type="button" onClick={() => router.push(`/admin/open-balance/${row.camperId}`)}>
                View Invoices <ArrowRight size={15} />
              </button>
            </article>
          ))}

          {filteredBalances.length === 0 && filteredProcessingBalances.length === 0 && (
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
