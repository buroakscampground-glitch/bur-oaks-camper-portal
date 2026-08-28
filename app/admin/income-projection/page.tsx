'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BarChart3,
  CalendarRange,
  CircleDollarSign,
  Download,
  Gauge,
  Landmark,
  PieChart,
  Printer,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { isOperationalCamper } from '../../../lib/camper-records'
import { buildIncomeProjection, projectionMonths, type ProjectionSite } from '../../../lib/income-projection'

const categoryColors = {
  lotRent: '#315f3d',
  association: '#b8872e',
  electric: '#337ca0',
}

const lotKey = (value: unknown) => String(value || '').trim().toUpperCase()

function formatMoney(value: unknown, compact = false) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: compact ? 0 : 2,
  })
}

function csvCell(value: unknown) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`
}

export default function AdminIncomeProjectionPage() {
  const [sites, setSites] = useState<ProjectionSite[]>([])
  const [readings, setReadings] = useState<any[]>([])
  const [invoices, setInvoices] = useState<any[]>([])
  const [projectionYear, setProjectionYear] = useState(new Date().getFullYear())
  const [associationFee, setAssociationFee] = useState(250)
  const [lotRentMonth, setLotRentMonth] = useState(3)
  const [associationMonth, setAssociationMonth] = useState(2)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadProjectionData() {
      setLoading(true)
      const [camperResult, lotResult, readingResult, invoiceResult] = await Promise.all([
        supabase.from('campers').select('id,lot_number,role,active').eq('active', true),
        supabase.from('lots').select('lot_number,lot_rent_amount'),
        supabase.from('electric_readings').select('camper_id,reading_date,amount_due'),
        supabase.from('invoices').select('camper_id,invoice_type,due_date,created_at,total_due'),
      ])

      const errors = [camperResult.error, lotResult.error, readingResult.error, invoiceResult.error].filter(Boolean)
      if (errors.length) setMessage(errors.map((error) => error?.message).join(' '))

      const activeCampers = (camperResult.data || []).filter(isOperationalCamper)
      const rentByLot = new Map(
        (lotResult.data || []).map((lot) => [lotKey(lot.lot_number), Number(lot.lot_rent_amount || 0)]),
      )
      const siteMap = new Map<string, ProjectionSite>()
      for (const camper of activeCampers) {
        const key = lotKey(camper.lot_number)
        if (!key || key === 'STAFF') continue
        const current = siteMap.get(key) || {
          lotNumber: String(camper.lot_number || key),
          camperIds: [],
          annualLotRent: rentByLot.get(key) || 0,
        }
        current.camperIds.push(String(camper.id))
        siteMap.set(key, current)
      }

      setSites([...siteMap.values()])
      setReadings(readingResult.data || [])
      setInvoices(invoiceResult.data || [])
      setLoading(false)
    }

    loadProjectionData()
  }, [])

  const projection = useMemo(() => buildIncomeProjection({
    sites,
    readings,
    invoices,
    associationFee: Math.max(0, Number(associationFee || 0)),
    fallbackLotRentMonth: lotRentMonth,
    fallbackAssociationMonth: associationMonth,
  }), [associationFee, associationMonth, invoices, lotRentMonth, readings, sites])

  const strongestMonth = projection.months.reduce((best, month) => month.total > best.total ? month : best, projection.months[0])
  const slimmestMonth = projection.months.reduce((best, month) => month.total < best.total ? month : best, projection.months[0])
  const maxMonthTotal = Math.max(...projection.months.map((month) => month.total), 1)
  const categoryRows = [
    { key: 'lotRent', label: 'Lot rent', total: projection.annualLotRent, color: categoryColors.lotRent },
    { key: 'association', label: 'Association fees', total: projection.annualAssociation, color: categoryColors.association },
    { key: 'electric', label: 'Estimated electric', total: projection.annualElectric, color: categoryColors.electric },
  ]
  let pieOffset = 0
  const pieSegments = categoryRows.map((category) => {
    const share = projection.annualTotal ? category.total / projection.annualTotal : 0
    const result = { ...category, share, offset: pieOffset }
    pieOffset += share * 100
    return result
  })
  const electricCoverage = projection.totalElectricSiteMonths
    ? Math.round((projection.exactElectricSiteMonths / projection.totalElectricSiteMonths) * 100)
    : 0

  function exportProjection() {
    const rows = [
      ['Bur Oaks projected income', projectionYear],
      ['Month', 'Lot Rent', 'Association Fees', 'Estimated Electric', 'Projected Total'],
      ...projection.months.map((month) => [month.label, month.lotRent, month.association, month.electric, month.total]),
      ['YEAR TOTAL', projection.annualLotRent, projection.annualAssociation, projection.annualElectric, projection.annualTotal],
    ]
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\r\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = `Bur-Oaks-Income-Projection-${projectionYear}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <main className="income-projection-page"><div className="income-projection-loading"><BarChart3 size={34} /><p>Building the campground forecast…</p></div></main>
  }

  return (
    <main className="income-projection-page">
      <div className="income-projection-shell">
        <a className="income-projection-back" href="/admin"><ArrowLeft size={16} /> Back to admin</a>

        <header className="income-projection-hero">
          <div>
            <span><CalendarRange size={16} /> INCOME PLANNING</span>
            <h1>See the strong months—and the slim ones.</h1>
            <p>A month-by-month planning forecast built from active campsites, annual lot rent, association fees, and seasonal electric history.</p>
          </div>
          <div className="income-projection-actions">
            <button type="button" onClick={() => window.print()}><Printer size={16} /> Print</button>
            <button type="button" onClick={exportProjection}><Download size={16} /> Download</button>
          </div>
        </header>

        {message && <p className="income-projection-message">{message}</p>}

        <section className="income-projection-controls" aria-label="Projection assumptions">
          <div>
            <small>PLANNING ASSUMPTIONS</small>
            <h2>Adjust the forecast</h2>
            <p>Saved invoice history chooses each site’s usual billing month. These defaults are used only when a site has no matching history.</p>
          </div>
          <label><span>Projection year</span><input type="number" min="2026" max="2100" value={projectionYear} onChange={(event) => setProjectionYear(Number(event.target.value || new Date().getFullYear()))} /></label>
          <label><span>Association fee per site</span><div><i>$</i><input type="number" min="0" step="1" value={associationFee} onChange={(event) => setAssociationFee(Number(event.target.value || 0))} /></div></label>
          <label><span>Default lot-rent month</span><select value={lotRentMonth} onChange={(event) => setLotRentMonth(Number(event.target.value))}>{projectionMonths.map((month, index) => <option value={index} key={month}>{month}</option>)}</select></label>
          <label><span>Default association month</span><select value={associationMonth} onChange={(event) => setAssociationMonth(Number(event.target.value))}>{projectionMonths.map((month, index) => <option value={index} key={month}>{month}</option>)}</select></label>
        </section>

        <section className="income-projection-kpis">
          <article><span><CircleDollarSign size={21} /></span><div><small>{projectionYear} PROJECTED INCOME</small><strong>{formatMoney(projection.annualTotal)}</strong><em>Rent + association + estimated electric</em></div></article>
          <article><span><TrendingUp size={21} /></span><div><small>STRONGEST MONTH</small><strong>{strongestMonth.label}</strong><em>{formatMoney(strongestMonth.total)} projected</em></div></article>
          <article><span><TrendingDown size={21} /></span><div><small>SLIMMEST MONTH</small><strong>{slimmestMonth.label}</strong><em>{formatMoney(slimmestMonth.total)} projected</em></div></article>
          <article><span><Gauge size={21} /></span><div><small>ACTIVE CAMPSITES</small><strong>{sites.length}</strong><em>{projection.configuredRentSites} have projected annual rent</em></div></article>
        </section>

        <section className="income-projection-main-grid">
          <article className="income-projection-panel income-projection-month-chart">
            <header><div><small>MONTH-BY-MONTH</small><h2>Projected income flow</h2></div><span>Hover or tap a month for the total</span></header>
            <div className="income-projection-bars" aria-label={`${projectionYear} projected income by month`}>
              {projection.months.map((month) => (
                <div key={month.label}>
                  <span>{formatMoney(month.total, true)}</span>
                  <i>
                    <b className="electric" style={{ height: `${(month.electric / maxMonthTotal) * 100}%` }} />
                    <b className="association" style={{ height: `${(month.association / maxMonthTotal) * 100}%` }} />
                    <b className="rent" style={{ height: `${(month.lotRent / maxMonthTotal) * 100}%` }} />
                  </i>
                  <small>{month.label.slice(0, 3)}</small>
                </div>
              ))}
            </div>
            <footer>
              <span><i style={{ background: categoryColors.lotRent }} /> Lot rent</span>
              <span><i style={{ background: categoryColors.association }} /> Association</span>
              <span><i style={{ background: categoryColors.electric }} /> Estimated electric</span>
            </footer>
          </article>

          <article className="income-projection-panel income-projection-pie-card">
            <header><div><small>YEARLY MIX</small><h2>Where projected income comes from</h2></div><PieChart size={22} /></header>
            <div className="income-projection-donut-wrap">
              <svg viewBox="0 0 220 220" role="img" aria-label="Projected annual income pie chart">
                <circle cx="110" cy="110" r="78" fill="none" stroke="#ece8de" strokeWidth="38" />
                {pieSegments.map((segment) => (
                  <circle
                    key={segment.key}
                    cx="110"
                    cy="110"
                    r="78"
                    fill="none"
                    stroke={segment.color}
                    strokeWidth="38"
                    pathLength="100"
                    strokeDasharray={`${segment.share * 100} ${100 - segment.share * 100}`}
                    strokeDashoffset={-segment.offset}
                    transform="rotate(-90 110 110)"
                  />
                ))}
              </svg>
              <div><small>YEAR TOTAL</small><strong>{formatMoney(projection.annualTotal, true)}</strong></div>
            </div>
            <div className="income-projection-legend">
              {categoryRows.map((category) => (
                <p key={category.key}><i style={{ background: category.color }} /><span><strong>{category.label}</strong><small>{projection.annualTotal ? Math.round((category.total / projection.annualTotal) * 100) : 0}% of projection</small></span><b>{formatMoney(category.total)}</b></p>
              ))}
            </div>
          </article>
        </section>

        <section className="income-projection-panel income-projection-confidence">
          <header><div><small>FORECAST CONFIDENCE</small><h2>What the projection is based on</h2></div></header>
          <div>
            <article><Landmark size={20} /><span><strong>{projection.configuredRentSites} of {sites.length}</strong><small>{projection.savedRentSites} use saved annual rent; {projection.inferredRentSites} use the latest lot-rent invoice</small></span></article>
            <article><CalendarRange size={20} /><span><strong>{projection.rentHistoryMatches}</strong><small>sites use a historical lot-rent billing month; the rest use {projectionMonths[lotRentMonth]}</small></span></article>
            <article><Gauge size={20} /><span><strong>{electricCoverage}% exact seasonal coverage</strong><small>{projection.readingYears} year{projection.readingYears === 1 ? '' : 's'} of electric history found; missing months use the campground seasonal average</small></span></article>
          </div>
          {projection.missingRentSites > 0 && <p><strong>{projection.missingRentSites} active campsite{projection.missingRentSites === 1 ? '' : 's'} need an annual lot-rent amount.</strong> Their rent is not guessed or included until it is entered in Camper Management or Lots.</p>}
        </section>

        <section className="income-projection-panel income-projection-table-card">
          <header><div><small>12-MONTH DETAIL</small><h2>{projectionYear} projection table</h2></div></header>
          <div className="income-projection-table-wrap">
            <table>
              <thead><tr><th>Month</th><th>Lot rent</th><th>Association</th><th>Estimated electric</th><th>Projected total</th><th>Month strength</th></tr></thead>
              <tbody>
                {projection.months.map((month) => {
                  const strength = month.monthIndex === strongestMonth.monthIndex ? 'Strongest' : month.monthIndex === slimmestMonth.monthIndex ? 'Slimmest' : 'Typical'
                  return <tr key={`row-${month.label}`}><td><strong>{month.label}</strong></td><td>{formatMoney(month.lotRent)}</td><td>{formatMoney(month.association)}</td><td>{formatMoney(month.electric)}</td><td><strong>{formatMoney(month.total)}</strong></td><td><span className={strength.toLowerCase()}>{strength}</span></td></tr>
                })}
              </tbody>
              <tfoot><tr><td>YEAR TOTAL</td><td>{formatMoney(projection.annualLotRent)}</td><td>{formatMoney(projection.annualAssociation)}</td><td>{formatMoney(projection.annualElectric)}</td><td>{formatMoney(projection.annualTotal)}</td><td>Projection</td></tr></tfoot>
            </table>
          </div>
        </section>

        <p className="income-projection-note">Planning estimate only. Electric uses historical averages and actual income will change with occupancy, weather, meter usage, credits, late fees, and payment timing.</p>
      </div>
    </main>
  )
}
