'use client'

import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BarChart3, CalendarDays, Download, Droplets, FileSpreadsheet, Printer, ReceiptText, Search } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { getSewerPumpOutGallonsForCharge } from '../../../lib/sewer-pump-fees'

const categoryColors: Record<string, string> = {
  Electric: '#2f6fad',
  'Water/Trash': '#268b8f',
  'Sewer pump-outs': '#9f4f1f',
  'Site services': '#7b8f35',
  'Lot rent': '#315f3d',
  'Processing fees': '#8b6f2f',
  'Account credits applied': '#b54b42',
  'Other campground charges': '#6f7280',
}

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

function yearRange(monthValue: string) {
  const year = Number(monthValue.split('-')[0])
  return {
    year,
    start: new Date(year, 0, 1),
    end: new Date(year + 1, 0, 1),
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

function colorForCategory(label: string) {
  return categoryColors[label] || '#6f7280'
}

function donutSegmentPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarPoint(cx, cy, radius, endAngle)
  const end = polarPoint(cx, cy, radius, startAngle)
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1

  return [
    'M', start.x, start.y,
    'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y,
  ].join(' ')
}

function polarPoint(cx: number, cy: number, radius: number, angle: number) {
  const radians = (angle - 90) * Math.PI / 180
  return {
    x: cx + radius * Math.cos(radians),
    y: cy + radius * Math.sin(radians),
  }
}

function csvEscape(value: unknown) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export default function AdminMonthlyReportsPage() {
  const [month, setMonth] = useState(monthInputValue())
  const [invoices, setInvoices] = useState<any[]>([])
  const [yearInvoices, setYearInvoices] = useState<any[]>([])
  const [pumpOuts, setPumpOuts] = useState<any[]>([])
  const [yearPumpOuts, setYearPumpOuts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')

  const range = useMemo(() => monthRange(month), [month])
  const annualRange = useMemo(() => yearRange(month), [month])

  useEffect(() => {
    loadReport()
  }, [month])

  async function loadReport() {
    setLoading(true)
    setMessage('')

    const [invoiceResult, yearInvoiceResult, pumpOutResult, yearPumpOutResult] = await Promise.all([
      supabase
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
        .order('paid_at', { ascending: false }),
      supabase
        .from('invoices')
        .select('id,total_due,paid_at')
        .eq('status', 'paid')
        .gte('paid_at', annualRange.start.toISOString())
        .lt('paid_at', annualRange.end.toISOString()),
      supabase
        .from('sewer_pump_out_requests')
        .select('id,lot_number,camper_name,charge_amount,gallons_used,notes,completed_at,billed_at')
        .eq('status', 'completed')
        .gte('completed_at', range.start.toISOString())
        .lt('completed_at', range.end.toISOString())
        .order('completed_at', { ascending: false }),
      supabase
        .from('sewer_pump_out_requests')
        .select('id,charge_amount,gallons_used,completed_at')
        .eq('status', 'completed')
        .gte('completed_at', annualRange.start.toISOString())
        .lt('completed_at', annualRange.end.toISOString()),
    ])

    const errors = [invoiceResult.error, yearInvoiceResult.error, pumpOutResult.error, yearPumpOutResult.error].filter(Boolean)
    setMessage(errors.map((error) => error?.message).join(' '))
    setInvoices(invoiceResult.data || [])
    setYearInvoices(yearInvoiceResult.data || [])
    setPumpOuts(pumpOutResult.data || [])
    setYearPumpOuts(yearPumpOutResult.data || [])

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

  const positiveCategoryTotals = categoryTotals.filter((row) => row.total > 0)
  const categoryGrandTotal = positiveCategoryTotals.reduce((sum, row) => sum + row.total, 0)
  const topCategory = positiveCategoryTotals[0]
  let runningAngle = 0
  const donutSegments = positiveCategoryTotals.map((row) => {
    const percentage = categoryGrandTotal > 0 ? row.total / categoryGrandTotal : 0
    const startAngle = runningAngle
    const endAngle = runningAngle + percentage * 360
    runningAngle = endAngle

    return {
      ...row,
      percentage,
      path: donutSegmentPath(120, 120, 88, startAngle, endAngle),
      color: colorForCategory(row.label),
    }
  })

  const pumpOutGallons = (request: any) => Number(
    request.gallons_used || getSewerPumpOutGallonsForCharge(request.charge_amount)
  )
  const totalPumpOutGallons = pumpOuts.reduce((sum, request) => sum + pumpOutGallons(request), 0)
  const holdingTankPumpOuts = pumpOuts.filter((request) => pumpOutGallons(request) === 150).length
  const standardPumpOuts = pumpOuts.filter((request) => pumpOutGallons(request) === 30).length
  const annualMonths = useMemo(() => {
    return Array.from({ length: 12 }, (_, monthIndex) => {
      const revenue = yearInvoices
        .filter((invoice) => new Date(invoice.paid_at).getMonth() === monthIndex)
        .reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)
      const gallons = yearPumpOuts
        .filter((request) => new Date(request.completed_at).getMonth() === monthIndex)
        .reduce((sum, request) => sum + pumpOutGallons(request), 0)
      return {
        label: new Date(annualRange.year, monthIndex, 1).toLocaleDateString('en-US', { month: 'short' }),
        revenue,
        gallons,
      }
    })
  }, [annualRange.year, yearInvoices, yearPumpOuts])
  const annualMaxRevenue = Math.max(...annualMonths.map((entry) => entry.revenue), 1)
  const annualMaxGallons = Math.max(...annualMonths.map((entry) => entry.gallons), 1)

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

  function exportPumpOutCsv() {
    const rows = [
      ['Completed Date', 'Lot', 'Camper', 'Gallons Used', 'Charge', 'Billed Date', 'Notes'],
      ...pumpOuts.map((request) => [
        formatDateTime(request.completed_at),
        request.lot_number || '',
        request.camper_name || '',
        pumpOutGallons(request),
        Number(request.charge_amount || 0).toFixed(2),
        formatDateTime(request.billed_at),
        request.notes || '',
      ]),
    ]
    const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bur-oaks-pump-out-gallons-${month}.csv`
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
              Pick a month to see paid invoices, detailed line items, pump-out gallons,
              camper lots, and a full-year comparison.
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

          <div className="admin-report-money-map">
            <div className="admin-report-donut-card">
              <div className="admin-report-donut-wrap">
                <svg viewBox="0 0 240 240" className="admin-report-donut" aria-label="Revenue by charge type chart">
                  <circle cx="120" cy="120" r="88" className="admin-report-donut-bg" />
                  {donutSegments.map((segment) => (
                    <path
                      d={segment.path}
                      key={segment.label}
                      stroke={segment.color}
                      strokeWidth="34"
                      strokeLinecap="butt"
                      fill="none"
                    />
                  ))}
                  <circle cx="120" cy="120" r="58" className="admin-report-donut-hole" />
                </svg>
                <div className="admin-report-donut-center">
                  <small>Top bucket</small>
                  <strong>{topCategory?.label || 'No data'}</strong>
                  <span>{topCategory ? `${Math.round((topCategory.total / categoryGrandTotal) * 100)}%` : '—'}</span>
                </div>
              </div>
              <p>
                This shows the positive money buckets only. Credits are tracked separately so they do not muddy the revenue pie.
              </p>
            </div>

            <div className="admin-report-category-cards">
              {positiveCategoryTotals.length ? positiveCategoryTotals.map((row) => {
                const percentage = categoryGrandTotal > 0 ? row.total / categoryGrandTotal : 0
                return (
                  <article key={row.label}>
                    <span style={{ background: colorForCategory(row.label) }} />
                    <div>
                      <strong>{row.label}</strong>
                      <small>{row.count} line{row.count === 1 ? '' : 's'} · {Math.round(percentage * 100)}% of received categories</small>
                      <i><b style={{ width: `${Math.max(4, percentage * 100)}%`, background: colorForCategory(row.label) }} /></i>
                    </div>
                    <em>{formatMoney(row.total)}</em>
                  </article>
                )
              }) : (
                <p className="admin-report-empty">No revenue categories found for this month.</p>
              )}
            </div>
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
              <span><BarChart3 size={14} /> YEAR AT A GLANCE</span>
              <h2>Compare every month in {annualRange.year}</h2>
            </div>
          </div>

          <div className="admin-report-year-charts">
            <article>
              <div className="admin-report-chart-title">
                <div><small>PAID REVENUE</small><strong>{formatMoney(annualMonths.reduce((sum, entry) => sum + entry.revenue, 0))}</strong></div>
                <span>Year total</span>
              </div>
              <div className="admin-report-bars" aria-label={`${annualRange.year} paid revenue by month`}>
                {annualMonths.map((entry) => (
                  <div key={`revenue-${entry.label}`}>
                    <span>{entry.revenue ? formatMoney(entry.revenue) : '$0'}</span>
                    <i><b style={{ height: `${Math.max(entry.revenue ? 5 : 1, (entry.revenue / annualMaxRevenue) * 100)}%` }} /></i>
                    <small>{entry.label}</small>
                  </div>
                ))}
              </div>
            </article>

            <article>
              <div className="admin-report-chart-title">
                <div><small>PUMP-OUT USAGE</small><strong>{annualMonths.reduce((sum, entry) => sum + entry.gallons, 0).toLocaleString()} gal</strong></div>
                <span>Year total</span>
              </div>
              <div className="admin-report-bars gallons" aria-label={`${annualRange.year} pump-out gallons by month`}>
                {annualMonths.map((entry) => (
                  <div key={`gallons-${entry.label}`}>
                    <span>{entry.gallons.toLocaleString()}</span>
                    <i><b style={{ height: `${Math.max(entry.gallons ? 5 : 1, (entry.gallons / annualMaxGallons) * 100)}%` }} /></i>
                    <small>{entry.label}</small>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>

        <section className="admin-report-panel admin-report-pump-record">
          <div className="admin-report-heading">
            <div>
              <span><Droplets size={14} /> STATE PUMP-OUT RECORD</span>
              <h2>Gallons pumped in {range.label}</h2>
            </div>
            <button type="button" className="admin-report-export-secondary" onClick={exportPumpOutCsv} disabled={!pumpOuts.length}>
              <Download size={16} /> Export gallon log
            </button>
          </div>

          <div className="admin-report-pump-kpis">
            <article><small>Total gallons</small><strong>{totalPumpOutGallons.toLocaleString()}</strong><em>{pumpOuts.length} completed pump-out{pumpOuts.length === 1 ? '' : 's'}</em></article>
            <article><small>150-gallon visits</small><strong>{holdingTankPumpOuts}</strong><em>$15 holding-tank service</em></article>
            <article><small>30-gallon visits</small><strong>{standardPumpOuts}</strong><em>$10 standard service</em></article>
          </div>

          <div className="admin-report-table-wrap">
            <table className="admin-report-table admin-report-pump-table">
              <thead>
                <tr>
                  <th>Date pumped</th>
                  <th>Lot</th>
                  <th>Camper</th>
                  <th>Gallons</th>
                  <th>Charge</th>
                  <th>Billed</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {pumpOuts.length ? pumpOuts.map((request) => (
                  <tr key={request.id}>
                    <td>{formatDateTime(request.completed_at)}</td>
                    <td><strong>{request.lot_number || '—'}</strong></td>
                    <td>{request.camper_name || 'Camper'}</td>
                    <td><strong>{pumpOutGallons(request).toLocaleString()}</strong></td>
                    <td>{formatMoney(request.charge_amount)}</td>
                    <td>{request.billed_at ? formatDateTime(request.billed_at) : 'Not billed yet'}</td>
                    <td>{request.notes || '—'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan={7}>No completed pump-outs found for this month.</td></tr>
                )}
              </tbody>
            </table>
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
