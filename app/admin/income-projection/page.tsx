'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
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
  const [lotRentTiming, setLotRentTiming] = useState<'spread' | 'history'>('spread')
  const [associationMonth, setAssociationMonth] = useState(2)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [message, setMessage] = useState('')

  const loadProjectionData = useCallback(async (initialLoad = false) => {
      if (initialLoad) setLoading(true)
      else setRefreshing(true)
      const [camperResult, lotResult, readingResult, invoiceResult] = await Promise.all([
        supabase.from('campers').select('id,lot_number,role,active').eq('active', true),
        supabase.from('lots').select('lot_number,lot_rent_amount'),
        supabase.from('electric_readings').select('camper_id,reading_date,amount_due'),
        supabase.from('invoices').select('camper_id,invoice_type,due_date,created_at,total_due,status'),
      ])

      const errors = [camperResult.error, lotResult.error, readingResult.error, invoiceResult.error].filter(Boolean)
      setMessage(errors.map((error) => error?.message).join(' '))

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
      setLastUpdated(new Date())
      setLoading(false)
      setRefreshing(false)
  }, [])

  useEffect(() => {
    loadProjectionData(true)
    const timer = window.setInterval(() => loadProjectionData(), 30_000)
    const refresh = () => loadProjectionData()
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [loadProjectionData])

  const projection = useMemo(() => buildIncomeProjection({
    sites,
    readings,
    invoices,
    associationFee: Math.max(0, Number(associationFee || 0)),
    lotRentTiming,
    fallbackAssociationMonth: associationMonth,
    projectionYear,
  }), [associationFee, associationMonth, invoices, lotRentTiming, projectionYear, readings, sites])

  const strongestMonth = projection.months.reduce((best, month) => month.total > best.total ? month : best, projection.months[0])
  const slimmestMonth = projection.months.reduce((best, month) => month.total < best.total ? month : best, projection.months[0])
  const maxMonthTotal = Math.max(...projection.months.flatMap((month) => [month.total, month.actualTotal]), 1)
  const categoryRows = [
    { key: 'lotRent', label: 'Lot rent', total: projection.annualLotRent, actual: projection.actualLotRent, color: categoryColors.lotRent },
    { key: 'association', label: 'Association fees', total: projection.annualAssociation, actual: projection.actualAssociation, color: categoryColors.association },
    { key: 'electric', label: 'Estimated electric', total: projection.annualElectric, actual: projection.actualElectric, color: categoryColors.electric },
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
      ['Month', 'Projected Lot Rent', 'Projected Association', 'Projected Electric', 'Projected Total', 'Actual Lot Rent', 'Actual Association', 'Actual Electric Entered', 'Actual Total', 'Variance'],
      ...projection.months.map((month) => [month.label, month.lotRent, month.association, month.electric, month.total, month.actualLotRent, month.actualAssociation, month.actualElectric, month.actualTotal, month.variance]),
      ['YEAR TOTAL', projection.annualLotRent, projection.annualAssociation, projection.annualElectric, projection.annualTotal, projection.actualLotRent, projection.actualAssociation, projection.actualElectric, projection.actualTotal, projection.actualTotal - projection.annualTotal],
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
            <p>Live forecast · refreshes every 30 seconds{lastUpdated ? ` · Updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}{refreshing ? ' · Refreshing…' : ''}</p>
          </div>
          <label><span>Projection year</span><input type="number" min="2026" max="2100" value={projectionYear} onChange={(event) => setProjectionYear(Number(event.target.value || new Date().getFullYear()))} /></label>
          <label><span>Association fee per site</span><div><i>$</i><input type="number" min="0" step="1" value={associationFee} onChange={(event) => setAssociationFee(Number(event.target.value || 0))} /></div></label>
          <label><span>Lot-rent projection</span><select value={lotRentTiming} onChange={(event) => setLotRentTiming(event.target.value as 'spread' | 'history')}><option value="spread">Spread evenly all year</option><option value="history">Use invoice timing</option></select></label>
          <label><span>Default association month</span><select value={associationMonth} onChange={(event) => setAssociationMonth(Number(event.target.value))}>{projectionMonths.map((month, index) => <option value={index} key={month}>{month}</option>)}</select></label>
        </section>

        <section className="income-projection-kpis">
          <article><span><CircleDollarSign size={21} /></span><div><small>{projectionYear} PROJECTED INCOME</small><strong>{formatMoney(projection.annualTotal)}</strong><em>Rent + association + estimated electric</em></div></article>
          <article><span><Gauge size={21} /></span><div><small>{projectionYear} ACTUAL ENTERED</small><strong>{formatMoney(projection.actualTotal)}</strong><em>Updates from invoices and electric readings</em></div></article>
          <article><span><TrendingUp size={21} /></span><div><small>STRONGEST MONTH</small><strong>{strongestMonth.label}</strong><em>{formatMoney(strongestMonth.total)} projected</em></div></article>
          <article><span><TrendingDown size={21} /></span><div><small>SLIMMEST MONTH</small><strong>{slimmestMonth.label}</strong><em>{formatMoney(slimmestMonth.total)} projected</em></div></article>
        </section>

        <section className="income-projection-main-grid">
          <article className="income-projection-panel income-projection-month-chart">
            <header><div><small>PROJECTED VS. ACTUAL</small><h2>Month-by-month income flow</h2></div><span>The white line is actual entered</span></header>
            <div className="income-projection-bars" aria-label={`${projectionYear} projected income by month`}>
              {projection.months.map((month) => (
                <div key={month.label}>
                  <span>{formatMoney(month.total, true)}</span>
                  <i>
                    <b className="electric" style={{ height: `${(month.electric / maxMonthTotal) * 100}%` }} />
                    <b className="association" style={{ height: `${(month.association / maxMonthTotal) * 100}%` }} />
                    <b className="rent" style={{ height: `${(month.lotRent / maxMonthTotal) * 100}%` }} />
                    {month.actualTotal > 0 && <em style={{ bottom: `${(month.actualTotal / maxMonthTotal) * 100}%` }} title={`Actual entered: ${formatMoney(month.actualTotal)}`} />}
                  </i>
                  <small>{month.label.slice(0, 3)}</small>
                </div>
              ))}
            </div>
            <footer>
              <span><i style={{ background: categoryColors.lotRent }} /> Lot rent</span>
              <span><i style={{ background: categoryColors.association }} /> Association</span>
              <span><i style={{ background: categoryColors.electric }} /> Estimated electric</span>
              <span><i className="actual-line" /> Actual entered</span>
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
                <p key={category.key}><i style={{ background: category.color }} /><span><strong>{category.label}</strong><small>{projection.annualTotal ? Math.round((category.total / projection.annualTotal) * 100) : 0}% · Actual entered {formatMoney(category.actual)}</small></span><b>{formatMoney(category.total)}</b></p>
              ))}
            </div>
          </article>
        </section>

        <section className="income-projection-panel income-projection-confidence">
          <header><div><small>FORECAST CONFIDENCE</small><h2>What the projection is based on</h2></div></header>
          <div>
            <article><Landmark size={20} /><span><strong>{projection.configuredRentSites} of {sites.length}</strong><small>{projection.savedRentSites} use saved annual rent; {projection.inferredRentSites} use the latest lot-rent invoice</small></span></article>
            <article><CalendarRange size={20} /><span><strong>{lotRentTiming === 'spread' ? 'Even monthly planning' : `${projection.rentHistoryMatches} timed sites`}</strong><small>{lotRentTiming === 'spread' ? `${projection.configuredRentSites} saved annual rent amounts are divided across all 12 months` : 'saved invoice history determines timing; unmatched rent is spread evenly'}</small></span></article>
            <article><Gauge size={20} /><span><strong>{electricCoverage}% exact seasonal coverage</strong><small>{projection.readingYears} year{projection.readingYears === 1 ? '' : 's'} of electric history found{projection.latestElectricYear ? `; ${projection.latestElectricYear} is weighted most heavily` : ''}; missing months use the campground seasonal average</small></span></article>
          </div>
          {projection.missingRentSites > 0 && <p><strong>{projection.missingRentSites} active campsite{projection.missingRentSites === 1 ? '' : 's'} need an annual lot-rent amount.</strong> Their rent is not guessed or included until it is entered in Camper Management or Lots.</p>}
        </section>

        <section className="income-projection-panel income-projection-table-card">
          <header><div><small>12-MONTH DETAIL</small><h2>{projectionYear} projection table</h2></div></header>
          <div className="income-projection-table-wrap">
            <table>
              <thead><tr><th>Month</th><th>Projected total</th><th>Actual rent</th><th>Actual association</th><th>Actual electric</th><th>Actual total</th><th>Difference</th></tr></thead>
              <tbody>
                {projection.months.map((month) => {
                  const strength = month.monthIndex === strongestMonth.monthIndex ? 'Strongest' : month.monthIndex === slimmestMonth.monthIndex ? 'Slimmest' : 'Typical'
                  return <tr key={`row-${month.label}`}><td><strong>{month.label}</strong><span className={strength.toLowerCase()}>{strength}</span></td><td>{formatMoney(month.total)}</td><td>{formatMoney(month.actualLotRent)}</td><td>{formatMoney(month.actualAssociation)}</td><td>{formatMoney(month.actualElectric)}</td><td><strong>{formatMoney(month.actualTotal)}</strong></td><td className={month.variance >= 0 ? 'positive' : 'negative'}>{month.actualTotal ? formatMoney(month.variance) : '—'}</td></tr>
                })}
              </tbody>
              <tfoot><tr><td>YEAR TOTAL</td><td>{formatMoney(projection.annualTotal)}</td><td>{formatMoney(projection.actualLotRent)}</td><td>{formatMoney(projection.actualAssociation)}</td><td>{formatMoney(projection.actualElectric)}</td><td>{formatMoney(projection.actualTotal)}</td><td>{formatMoney(projection.actualTotal - projection.annualTotal)}</td></tr></tfoot>
            </table>
          </div>
        </section>

        <p className="income-projection-note">Actual means charges entered into the portal—not necessarily cash collected. Electric updates from saved meter readings; lot rent and association update from invoices. The projection remains a planning estimate.</p>
      </div>
    </main>
  )
}
