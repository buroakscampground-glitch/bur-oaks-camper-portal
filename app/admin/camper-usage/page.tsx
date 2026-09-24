'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Activity, AlertTriangle, BrainCircuit, CalendarRange, CheckCircle2, CircleHelp, Gauge, RefreshCw, Search, Zap } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { isOperationalCamper } from '../../../lib/camper-records'
import { buildCamperSeasonUsage, camperUsageRiskOrder, camperUsageSeasonWindow } from '../../../lib/camper-season-usage'

const usageBands = ['Not at all', 'A little', 'Sometimes', 'Often', 'A lot', 'No data'] as const

function formatKwh(value: number) {
  return `${Math.round(value).toLocaleString()} kWh`
}

function formatDate(value: string | null) {
  if (!value) return 'No reading'
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function siteKey(value: unknown) {
  return String(value || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function campersBySite(campers: any[]) {
  const sites = new Map<string, any>()
  for (const camper of campers.filter(isOperationalCamper)) {
    const key = siteKey(camper.lot_number)
    if (!key) continue
    const existing = sites.get(key)
    if (existing) {
      existing.camper_ids.push(String(camper.id))
      continue
    }
    sites.set(key, { ...camper, camper_ids: [String(camper.id)] })
  }
  return [...sites.values()]
}

export default function CamperUsagePage() {
  const [campers, setCampers] = useState<any[]>([])
  const [readings, setReadings] = useState<any[]>([])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('review')
  const [bandFilter, setBandFilter] = useState('All')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [message, setMessage] = useState('')

  const loadUsage = useCallback(async (initial = false) => {
    if (initial) setLoading(true)
    else setRefreshing(true)
    const [camperResult, readingResult] = await Promise.all([
      supabase.from('campers').select('id,first_name,last_name,lot_number,role,active').eq('active', true).order('lot_number'),
      supabase.from('electric_readings').select('camper_id,reading_date,kwh_used').order('reading_date', { ascending: true }),
    ])
    const errors = [camperResult.error, readingResult.error].filter(Boolean)
    setMessage(errors.map((error) => error?.message).join(' '))
    if (!errors.length) {
      setCampers(campersBySite(camperResult.data || []))
      setReadings(readingResult.data || [])
      setLastUpdated(new Date())
    }
    setLoading(false)
    setRefreshing(false)
  }, [])

  useEffect(() => {
    void loadUsage(true)
    let refreshDelay: number | undefined
    const refresh = () => void loadUsage()
    const refreshFromReading = () => {
      window.clearTimeout(refreshDelay)
      refreshDelay = window.setTimeout(refresh, 250)
    }
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh()
    }, 5 * 60_000)
    const liveReadings = supabase
      .channel('camper-season-usage-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'electric_readings' }, refreshFromReading)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'campers' }, refreshFromReading)
      .subscribe()
    window.addEventListener('focus', refresh)
    window.addEventListener('pageshow', refresh)
    return () => {
      window.clearInterval(timer)
      window.clearTimeout(refreshDelay)
      void supabase.removeChannel(liveReadings)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('pageshow', refresh)
    }
  }, [loadUsage])

  const availableYears = useMemo(() => {
    const years = new Set<number>([new Date().getFullYear()])
    for (const reading of readings) {
      const year = Number(String(reading.reading_date || '').slice(0, 4))
      if (Number.isFinite(year) && year > 2000) years.add(year)
    }
    return [...years].sort((a, b) => b - a)
  }, [readings])
  const rows = useMemo(() => buildCamperSeasonUsage(campers, readings, selectedYear), [campers, readings, selectedYear])
  const visibleRows = useMemo(() => {
    const term = search.trim().toLowerCase()
    return rows
      .filter((row) => !term || `${row.camperName} ${row.lotNumber}`.toLowerCase().includes(term))
      .filter((row) => filter === 'all' || (filter === 'review' ? row.signal !== 'regular' : row.signal === filter))
      .filter((row) => bandFilter === 'All' || row.usageBand === bandFilter)
      .sort((a, b) => camperUsageRiskOrder(a.signal) - camperUsageRiskOrder(b.signal) || a.totalKwh - b.totalKwh || a.lotNumber.localeCompare(b.lotNumber, undefined, { numeric: true }))
  }, [bandFilter, filter, rows, search])
  const seasonWindow = camperUsageSeasonWindow(selectedYear)
  const regularCount = rows.filter((row) => row.signal === 'regular').length
  const reviewCount = rows.filter((row) => row.signal === 'low' || row.signal === 'no_activity').length
  const noDataCount = rows.filter((row) => row.signal === 'no_data').length
  const bandCounts = useMemo(() => usageBands.map((band) => ({ band, count: rows.filter((row) => row.usageBand === band).length })), [rows])
  const largestBand = Math.max(1, ...bandCounts.map((item) => item.count))

  return (
    <main className="admin-camper-usage-page">
      <section className="admin-camper-usage-hero">
        <div><span><Activity size={17} /> LIVE SEASON ACTIVITY</span><h1>Camper Usage</h1><p>A running total from March 15 through November 15 shows who is actively using their campsite—not simply storing a camper.</p></div>
        <button type="button" onClick={() => loadUsage()} disabled={refreshing}><RefreshCw className={refreshing ? 'admin-spin' : ''} size={17} /> {refreshing ? 'Updating…' : 'Update now'}</button>
      </section>

      <section className="admin-camper-usage-stats">
        <article><span><Gauge size={18} /></span><div><small>ACTIVE SITES</small><strong>{rows.length}</strong><p>Current camper records</p></div></article>
        <article className="review"><span><AlertTriangle size={18} /></span><div><small>REVIEW SIGNAL</small><strong>{reviewCount}</strong><p>Low or no electric activity</p></div></article>
        <article><span><CheckCircle2 size={18} /></span><div><small>REGULAR ACTIVITY</small><strong>{regularCount}</strong><p>Usage pattern looks active</p></div></article>
        <article><span><CircleHelp size={18} /></span><div><small>NO DATA</small><strong>{noDataCount}</strong><p>No seasonal reading recorded</p></div></article>
      </section>

      <section className="admin-camper-usage-graph">
        <header><div><small>PLAIN-LANGUAGE USAGE PICTURE</small><h2>How much has each site been used this season?</h2><p>Tap a bar to see the campers in that group. Every meter reading is added to the site’s March–November running total, then compared with campground peers.</p></div><button className={bandFilter === 'All' ? 'active' : ''} type="button" onClick={() => setBandFilter('All')}>Show all sites</button></header>
        <div className="admin-camper-usage-bars">
          {bandCounts.map(({ band, count }) => (
            <button className={`${bandFilter === band ? 'active ' : ''}band-${band.toLowerCase().replaceAll(' ', '-')}`} type="button" onClick={() => { setBandFilter(bandFilter === band ? 'All' : band); setFilter('all') }} key={band}>
              <span><strong>{band}</strong><small>{count} site{count === 1 ? '' : 's'}</small></span>
              <i><b style={{ width: `${Math.max(count ? 7 : 0, (count / largestBand) * 100)}%` }} /></i>
            </button>
          ))}
        </div>
        <footer><span><b>Not at all</b> means the season’s running total is zero.</span><span><b>A little → A lot</b> compares season-to-date totals with campground peers.</span><span><b>Repeated low use</b> highlights consecutive seasons in the lowest-use group.</span><span><b>No data</b> means the office needs a reading before judging activity.</span></footer>
      </section>

      <section className="admin-camper-usage-learning">
        <BrainCircuit size={23} />
        <div><small>PATTERN LEARNING</small><h2>One season matters. A pattern matters more.</h2><p>The running total grows with every reading. It also checks earlier March–November seasons so repeated little or no use is clearly identified for an office conversation.</p></div>
        <div><CalendarRange size={16} /><span><strong>{seasonWindow.start}</strong> through <strong>{seasonWindow.end}</strong></span><small>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Loading current records'}</small></div>
      </section>

      <section className="admin-camper-usage-toolbar">
        <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search camper or site" /></label>
        <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} aria-label="Usage season year">{availableYears.map((year) => <option key={year} value={year}>{year} season</option>)}</select>
        <select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Usage signal filter"><option value="review">Needs review</option><option value="all">All sites</option><option value="regular">Regular activity</option><option value="low">Unusually low</option><option value="no_activity">No activity</option><option value="no_data">No data</option></select>
        {bandFilter !== 'All' && <button type="button" onClick={() => setBandFilter('All')}>Usage: {bandFilter} ×</button>}
      </section>

      {message && <p className="admin-camper-usage-message">{message}</p>}
      {loading ? <p className="admin-camper-usage-empty">Building the campground usage picture…</p> : (
        <section className="admin-camper-usage-list">
          <header><span>SITE & CAMPER</span><span>SEASON RUNNING TOTAL</span><span>LATEST PERIOD</span><span>SEASON HISTORY</span><span>ACTIVITY SIGNAL</span></header>
          {visibleRows.map((row) => (
            <a href={`/admin/campers/${row.camperId}`} className={`signal-${row.signal}`} key={row.camperId}>
              <div className="identity"><strong>Site {row.lotNumber}</strong><span>{row.camperName}</span></div>
              <div><strong>{formatKwh(row.totalKwh)}</strong><span><b className={`usage-band band-${row.usageBand.toLowerCase().replaceAll(' ', '-')}`}>{row.usageBand}</b> · {row.readingCount} reading{row.readingCount === 1 ? '' : 's'} added</span></div>
              <div><strong>{row.latestKwh === null ? 'No reading' : formatKwh(row.latestKwh)}</strong><span>{formatDate(row.latestDate)}</span></div>
              <div><strong>{row.consecutiveLowSeasonCount >= 2 ? `${row.consecutiveLowSeasonCount} low-use seasons in a row` : row.priorSeasonCount ? `${row.changeFromHistoryPercent === null ? '—' : `${Math.abs(row.changeFromHistoryPercent)}% ${row.changeFromHistoryPercent >= 0 ? 'above' : 'below'}`} prior seasons` : 'Building baseline'}</strong><span>{row.peerPercentile ? `${row.peerPercentile}th running-total percentile` : 'Peer rank pending'} · {row.confidence}</span></div>
              <div className="signal"><Zap size={16} /><span><strong>{row.signalLabel}</strong><small>{row.signalDetail}</small></span></div>
            </a>
          ))}
          {!visibleRows.length && <p className="admin-camper-usage-empty">No sites match this view.</p>}
        </section>
      )}

      <aside className="admin-camper-usage-caution"><AlertTriangle size={18} /><p><strong>Office decision support—not an automatic contract decision.</strong> A single quiet period can happen. Consecutive seasons of little or no activity are highlighted because Bur Oaks is an active campground community, not camper storage. Confirm circumstances before making a final decision.</p></aside>
    </main>
  )
}
