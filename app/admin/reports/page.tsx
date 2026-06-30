'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, CalendarDays, Download, FileSpreadsheet, Printer, ReceiptText, Search } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

function monthInputValue(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function monthRange(monthValue: string) {
  const [year, month] = monthValue.split('-').map(Number)
  const start = new Date(year, month - 1, 1)
  const end = new Date(year, month, 1)

  return {
    start,
    end,
    label: start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
  }
}

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function formatDateTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatShortDate(value?: string) {
  if (!value) return '—'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function camperName(invoice: any) {
  return `${invoice.campers?.first_name || ''} ${invoice.campers?.last_name || ''}`.trim() || 'Camper'
}

function categoryForItem(item: any, invoice: any) {
  const text = `${item?.description || ''} ${invoice?.invoice_type || ''}`.toLowerCase()
  const amount = Number(item?.total || 0)

  if (amount < 0 || text.includes('credit')) return 'Account credits applied'
  if (text.includes('electric') || text.includes('kwh') || text.includes('meter')) return 'Electric'
  if (text.includes('water') || text.includes('trash')) return 'Water/Trash'
  if (text.includes('sewer') || text.includes('pump')) return 'Sewer pump-outs'
  if (text.includes('weed') || text.includes('spray') || text.includes('pressure') || text.includes('site service')) return 'Site services'
  if (text.includes('rent') || text.includes('lot')) return 'Lot rent'
  if (text.includes('processing') || text.includes('card fee')) return 'Processing fees'

  return invoice?.invoice_type || 'Other campground charges'
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export default function AdminMonthlyReportsPage() {
  const [month, setMonth] = useState(monthInputValue())
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')

  const range = useMemo(() => monthRange(month), [month])

  useEffect(() => {
    loadReport()
  }, [month])

  async function loadReport() {
    setLoading(true)
    setMessage('')

    const { data, error } = await supabase
      .from('invoices')
      .select(`
        *,
        campers (
          id,
          first_name,
          last_name,
          lot_number,
          email
        ),
        invoice_items (*)
      `)
      .eq('status', 'paid')
      .gte('paid_at', range.start.toISOString())
      .lt('paid_at', range.end.toISOString())
      .order('paid_at', { ascending: false })

    if (error) {
      setMessage(error.message)
      setInvoices([])
    } else {
      setInvoices(data || [])
    }

    setLoading(false)
  }

  const filteredInvoices = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return invoices

    return invoices.filter((invoice) => {
      const lot = String(invoice.campers?.lot_number || '')
      const name = camperName(invoice).toLowerCase()
      const invoiceNumber = String(invoice.invoice_number || '').toLowerCase()
      const invoiceType = String(invoice.invoice_type || '').toLowerCase()
      const method = String(invoice.payment_method || '').toLowerCase()
      const itemText = (invoice.invoice_items || [])
        .map((item: any) => item.description || '')
        .join(' ')
        .toLowerCase()

      return [lot, name, invoiceNumber, invoiceType, method, itemText].some((value) => value.includes(term))
    })
  }, [invoices, search])

  const lineItems = useMemo(() => {
    return filteredInvoices.flatMap((invoice) => {
      const items = Array.isArray(invoice.invoice_items) && invoice.invoice_items.length
        ? invoice.invoice_items
        : [
            {
              id: `${invoice.id}-fallback`,
              description: invoice.invoice_type || 'Invoice total',
              quantity: 1,
              unit_price: invoice.total_due,
              total: invoice.total_due,
            },
          ]

      return items.map((item: any) => ({
        invoice,
        item,
        category: categoryForItem(item, invoice),
      }))
    })
  }, [filteredInvoices])

  const totalCollected = filteredInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)
  const positiveLineTotal = lineItems
    .filter((entry) => Number(entry.item.total || 0) > 0)
    .reduce((sum, entry) => sum + Number(entry.item.total || 0), 0)
  const creditsApplied = Math.abs(
    lineItems
      .filter((entry) => Number(entry.item.total || 0) < 0)
      .reduce((sum, entry) => sum + Number(entry.item.total || 0), 0)
  )

  const paymentMethodTotals = useMemo(() => {
    const grouped = new Map<string, { label: string; count: number; total: number }>()
    for (const invoice of filteredInvoices) {
      const label = invoice.payment_method || 'Paid before detailed tracking'
      const current = grouped.get(label) || { label, count: 0, total: 0 }
      current.count += 1
      current.total += Number(invoice.total_due || 0)
      grouped.set(label, current)
    }
    return Array.from(grouped.values()).sort((a, b) => b.total - a.total)
  }, [filteredInvoices])

  const categoryTotals = useMemo(() => {
    const grouped = new Map<string, { label: string; count: number; total: number }>()
    for (const entry of lineItems) {
      const amount = Number(entry.item.total || 0)
      const current = grouped.get(entry.category) || { label: entry.category, count: 0, total: 0 }
      current.count += 1
      current.total += amount
      grouped.set(entry.category, current)
    }
    return Array.from(grouped.values()).sort((a, b) => Math.abs(b.total) - Math.abs(a.total))
  }, [lineItems])

  function exportCsv() {
    const rows = [
      [
        'Paid Date',
        'Lot',
        'Camper',
        'Email',
        'Invoice Number',
        'Invoice Type',
        'Due Date',
        'Payment Method',
        'Payment Reference',
        'Invoice Amount Received',
        'Line Category',
        'Line Description',
        'Quantity',
        'Unit Price',
        'Line Total',
      ],
      ...lineItems.map(({ invoice, item, category }) => [
        formatDateTime(invoice.paid_at),
        invoice.campers?.lot_number || '',
        camperName(invoice),
        invoice.campers?.email || '',
        invoice.invoice_number || '',
        invoice.invoice_type || '',
        formatShortDate(invoice.due_date),
        invoice.payment_method || '',
        invoice.payment_reference || '',
        Number(invoice.total_due || 0).toFixed(2),
        category,
        item.description || '',
        item.quantity ?? '',
        Number(item.unit_price || 0).toFixed(2),
        Number(item.total || 0).toFixed(2),
      ]),
    ]

    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bur-oaks-monthly-money-report-${month}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="admin-report-page">
      <div className="admin-report-shell">
        <a href="/admin" className="admin-report-back"><ArrowLeft size={17} /> Back to Dashboard</a>

        <section className="admin-report-hero">
          <div>
            <p className="admin-report-eyebrow"><FileSpreadsheet size={16} /> Monthly money report</p>
            <h1>What came in, when, and what it was for.</h1>
            <p>
              Pick a month to see paid invoices, detailed line items, payment methods,
              camper lots, and export-ready bookkeeping details.
            </p>
          </div>

          <div className="admin-report-controls">
            <label>
              <span>Report month</span>
              <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
            </label>
            <button type="button" onClick={exportCsv} disabled={!lineItems.length}>
              <Download size={16} /> Export CSV
            </button>
            <button type="button" onClick={() => window.print()}>
              <Printer size={16} /> Print
            </button>
          </div>
        </section>

        {message && <p className="admin-report-message">{message}</p>}

        <section className="admin-report-kpis">
          <article>
            <span><ReceiptText size={21} /></span>
            <small>Money received</small>
            <strong>{formatMoney(totalCollected)}</strong>
            <em>{range.label}</em>
          </article>
          <article>
            <span><CalendarDays size={21} /></span>
            <small>Paid invoices</small>
            <strong>{filteredInvoices.length}</strong>
            <em>{lineItems.length} itemized lines</em>
          </article>
          <article>
            <span><FileSpreadsheet size={21} /></span>
            <small>Charges before credits</small>
            <strong>{formatMoney(positiveLineTotal)}</strong>
            <em>Gross item lines</em>
          </article>
          <article>
            <span><ReceiptText size={21} /></span>
            <small>Credits applied</small>
            <strong>{formatMoney(creditsApplied)}</strong>
            <em>Reduces amount owed</em>
          </article>
        </section>

        <section className="admin-report-panel">
          <div className="admin-report-heading">
            <div>
              <span>BREAKDOWNS</span>
              <h2>Where the money came from</h2>
            </div>
            <label className="admin-report-search">
              <Search size={16} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search lot, camper, invoice, item, or method"
              />
            </label>
          </div>

          <div className="admin-report-breakdowns">
            <div>
              <h3>By payment method</h3>
              {paymentMethodTotals.length ? paymentMethodTotals.map((row) => (
                <p key={row.label}>
                  <span>{row.label}</span>
                  <strong>{formatMoney(row.total)}</strong>
                  <em>{row.count} invoice{row.count === 1 ? '' : 's'}</em>
                </p>
              )) : <p className="admin-report-empty">No paid invoices found for this month.</p>}
            </div>

            <div>
              <h3>By charge type</h3>
              {categoryTotals.length ? categoryTotals.map((row) => (
                <p key={row.label}>
                  <span>{row.label}</span>
                  <strong>{formatMoney(row.total)}</strong>
                  <em>{row.count} line{row.count === 1 ? '' : 's'}</em>
                </p>
              )) : <p className="admin-report-empty">No itemized charges found for this month.</p>}
            </div>
          </div>
        </section>

        <section className="admin-report-panel">
          <div className="admin-report-heading">
            <div>
              <span>PAID INVOICES</span>
              <h2>Every payment received in {range.label}</h2>
            </div>
          </div>

          {loading ? (
            <p className="admin-report-empty">Loading report…</p>
          ) : filteredInvoices.length ? (
            <div className="admin-report-invoice-list">
              {filteredInvoices.map((invoice) => (
                <article key={invoice.id}>
                  <div>
                    <small>Lot {invoice.campers?.lot_number || '—'} · {formatDateTime(invoice.paid_at)}</small>
                    <h3>{camperName(invoice)}</h3>
                    <p>{invoice.invoice_number} · {invoice.invoice_type || 'Invoice'} · Due {formatShortDate(invoice.due_date)}</p>
                    <p className="admin-report-items">
                      {(invoice.invoice_items || []).map((item: any) => item.description).filter(Boolean).join(' • ') || 'No line items listed'}
                    </p>
                  </div>
                  <div>
                    <strong>{formatMoney(invoice.total_due)}</strong>
                    <span>{invoice.payment_method || 'Paid'}</span>
                    <a href={`/admin/invoices/${invoice.id}`}>View invoice</a>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <p className="admin-report-empty">No paid invoices found for this month.</p>
          )}
        </section>

        <section className="admin-report-panel">
          <div className="admin-report-heading">
            <div>
              <span>LINE ITEM DETAIL</span>
              <h2>Exactly what each payment covered</h2>
            </div>
          </div>

          <div className="admin-report-table-wrap">
            <table className="admin-report-table">
              <thead>
                <tr>
                  <th>Paid</th>
                  <th>Lot</th>
                  <th>Camper</th>
                  <th>Invoice</th>
                  <th>What it was for</th>
                  <th>Qty</th>
                  <th>Unit</th>
                  <th>Total</th>
                  <th>Method</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.length ? lineItems.map(({ invoice, item, category }) => (
                  <tr key={`${invoice.id}-${item.id || item.description}`}>
                    <td>{formatDateTime(invoice.paid_at)}</td>
                    <td>{invoice.campers?.lot_number || '—'}</td>
                    <td>{camperName(invoice)}</td>
                    <td>{invoice.invoice_number}</td>
                    <td><strong>{category}</strong><span>{item.description}</span></td>
                    <td>{item.quantity ?? 1}</td>
                    <td>{formatMoney(item.unit_price)}</td>
                    <td className={Number(item.total || 0) < 0 ? 'credit' : ''}>{formatMoney(item.total)}</td>
                    <td>{invoice.payment_method || 'Paid'}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={9}>No line item detail found for this month.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  )
}
