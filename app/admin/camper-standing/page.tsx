'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, CheckCircle2, ChevronRight, Clock3, History, Search, ShieldCheck, TrendingUp, Users } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import type { CamperStandingRow, CamperStanding } from '../../../lib/camper-standing'

type WindowChoice = '12' | '24' | 'lifetime'
type StandingFilter = 'all' | CamperStanding

const standingCopy: Record<CamperStanding, { label: string; detail: string }> = {
  clear: { label: 'Clear', detail: 'No recent pattern needing attention' },
  watch: { label: 'Watch', detail: 'A one-off or early pattern to be aware of' },
  'needs-review': { label: 'Needs review', detail: 'A current or repeated pattern worth reviewing' },
}

function money(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value || 0)
}

function lotOrder(value: string) {
  const number = Number.parseFloat(value)
  return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER
}

export default function CamperStandingPage() {
  const [rows, setRows] = useState<CamperStandingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<StandingFilter>('all')
  const [windowChoice, setWindowChoice] = useState<WindowChoice>('24')
  const router = useRouter()

  async function loadStanding() {
    setLoading(true)
    setError('')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      setError('Please sign in again to view camper standing.')
      setLoading(false)
      return
    }
    try {
      const response = await fetch('/api/admin-camper-standing', { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Camper standing could not be loaded.')
      setRows(result.rows || [])
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Camper standing could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadStanding() }, [])

  const counts = useMemo(() => ({
    all: rows.length,
    clear: rows.filter((row) => row.standing === 'clear').length,
    watch: rows.filter((row) => row.standing === 'watch').length,
    'needs-review': rows.filter((row) => row.standing === 'needs-review').length,
  }), [rows])

  const visibleRows = useMemo(() => {
    const query = search.trim().toLowerCase()
    const severity: Record<CamperStanding, number> = { 'needs-review': 0, watch: 1, clear: 2 }
    return rows
      .filter((row) => filter === 'all' || row.standing === filter)
      .filter((row) => !query || `${row.lotNumber} ${row.camperName} ${row.reasons.join(' ')}`.toLowerCase().includes(query))
      .sort((a, b) => severity[a.standing] - severity[b.standing] || lotOrder(a.lotNumber) - lotOrder(b.lotNumber) || a.lotNumber.localeCompare(b.lotNumber))
  }, [filter, rows, search])

  function lateCount(row: CamperStandingRow) {
    return windowChoice === '12' ? row.late12Months : windowChoice === '24' ? row.late24Months : row.lateLifetime
  }

  function careCount(row: CamperStandingRow) {
    return windowChoice === '12' ? row.siteCare12Months : windowChoice === '24' ? row.siteCare24Months : row.siteCareLifetime
  }

  return (
    <main className="camper-standing-page">
      <header className="camper-standing-hero">
        <div><span><ShieldCheck size={16} /> ADMIN ONLY · CAMPER RECORDS</span><h1>Camper Standing</h1><p>See patterns without letting one difficult month permanently define a camper. Every standing is backed by the actual payment and site-care history.</p></div>
        <button type="button" onClick={loadStanding} disabled={loading}><History size={16} /> {loading ? 'Refreshing…' : 'Refresh records'}</button>
      </header>

      <section className="camper-standing-rules" aria-label="How standing works">
        <TrendingUp size={22} />
        <div><strong>Built to recognize patterns, not punish one-offs.</strong><p>Payment history restarted September 16, 2026. A bill counts as late once it is five calendar days past its due date. Watch begins with an active issue or two incidents within 24 months. Needs Review is reserved for active important items, multiple bills beyond grace, a bill 14+ days beyond its due date, or repeated recent issues.</p></div>
      </section>

      <section className="camper-standing-summary" aria-label="Standing totals">
        {(['all', 'clear', 'watch', 'needs-review'] as StandingFilter[]).map((item) => {
          const label = item === 'all' ? 'All campers' : standingCopy[item].label
          return <button key={item} type="button" className={`${item} ${filter === item ? 'active' : ''}`} onClick={() => setFilter(item)}><small>{label}</small><strong>{counts[item]}</strong><span>{item === 'all' ? 'Active camper records' : standingCopy[item].detail}</span></button>
        })}
      </section>

      <section className="camper-standing-table-card">
        <div className="camper-standing-tools">
          <label><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lot, camper, or reason" /></label>
          <div><span>History shown</span><select value={windowChoice} onChange={(event) => setWindowChoice(event.target.value as WindowChoice)}><option value="12">Last 12 months</option><option value="24">Last 24 months</option><option value="lifetime">Lifetime</option></select></div>
        </div>

        {error && <div className="camper-standing-error" role="alert"><AlertTriangle size={18} /> {error}</div>}
        {loading && <div className="camper-standing-empty"><Clock3 size={28} /><strong>Reviewing camper records…</strong></div>}
        {!loading && !error && <div className="camper-standing-table-wrap"><table>
          <thead><tr><th>Lot & camper</th><th>Standing</th><th>Past due now</th><th>Times late</th><th>Site care</th><th>Active</th><th>Why</th><th><span className="sr-only">Open</span></th></tr></thead>
          <tbody>{visibleRows.map((row) => <tr key={row.camperId} onClick={() => router.push(`/admin/campers/${row.camperId}#camper-history`)}>
            <td><strong>Lot {row.lotNumber || '—'}</strong><span>{row.camperName}</span></td>
            <td><b className={`standing-badge ${row.standing}`}>{row.standing === 'clear' ? <CheckCircle2 size={13} /> : row.standing === 'watch' ? <Clock3 size={13} /> : <AlertTriangle size={13} />}{standingCopy[row.standing].label}</b>{row.pattern === 'one-off' && <em>Likely one-off</em>}{row.pattern === 'improving' && <em>Recent record is clear</em>}</td>
            <td><strong>{row.pastDueInvoices ? money(row.pastDueBalance) : 'Clear'}</strong>{row.oldestPastDueDays > 0 && <span>{row.oldestPastDueDays} days oldest</span>}</td>
            <td><strong>{lateCount(row)}</strong><span>{windowChoice === 'lifetime' ? 'lifetime' : `${windowChoice} months`}</span></td>
            <td><strong>{careCount(row)}</strong><span>{windowChoice === 'lifetime' ? 'lifetime' : `${windowChoice} months`}</span></td>
            <td><strong>{row.activeSiteCare}</strong><span>{row.activeImportantSiteCare ? `${row.activeImportantSiteCare} important` : 'site-care items'}</span></td>
            <td><p>{row.reasons.join(' · ')}</p>{row.unsignedDocuments > 0 && <span>{row.unsignedDocuments} unsigned document{row.unsignedDocuments === 1 ? '' : 's'}</span>}</td>
            <td><button type="button" aria-label={`Open ${row.camperName}'s complete history`}><ChevronRight size={18} /></button></td>
          </tr>)}</tbody>
        </table></div>}
        {!loading && !error && !visibleRows.length && <div className="camper-standing-empty"><Users size={28} /><strong>No campers match this view.</strong><span>Try another standing or clear the search.</span></div>}
      </section>

      <style jsx>{`
        .camper-standing-page{display:grid;gap:18px;color:#263b2e}.camper-standing-hero{display:flex;align-items:end;justify-content:space-between;gap:22px;padding:29px;border-radius:27px;background:radial-gradient(circle at 88% 12%,rgba(230,202,127,.25),transparent 30%),linear-gradient(135deg,#173722,#315f3d);color:#fff;box-shadow:0 22px 54px rgba(34,54,38,.16)}.camper-standing-hero span{display:inline-flex;align-items:center;gap:7px;color:#efd288;font-size:10px;font-weight:900;letter-spacing:.14em}.camper-standing-hero h1{margin:8px 0 0;color:#fff;font:500 clamp(36px,5vw,56px)/1.02 Georgia,serif}.camper-standing-hero p{max-width:760px;margin:11px 0 0;color:rgba(255,255,255,.82);line-height:1.55}.camper-standing-hero button{display:flex!important;align-items:center;gap:8px;min-height:43px!important;padding:0 14px!important;border:1px solid rgba(255,255,255,.25)!important;background:#fff!important;color:#315f3d!important;white-space:nowrap}.camper-standing-rules{display:flex;align-items:flex-start;gap:13px;padding:17px 19px;border:1px solid #d5dfd2;border-radius:18px;background:#f2f7ef;color:#315f3d}.camper-standing-rules svg{flex:0 0 auto;margin-top:2px}.camper-standing-rules strong{font-size:13px}.camper-standing-rules p{margin:4px 0 0;color:#617065;font-size:11px;line-height:1.55}.camper-standing-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.camper-standing-summary button{text-align:left!important;padding:17px!important;border:1px solid #dedfd8!important;border-radius:18px!important;background:#fff!important;color:#263b2e!important;box-shadow:0 9px 22px rgba(34,54,38,.05)!important}.camper-standing-summary button.active{border-color:#315f3d!important;box-shadow:0 0 0 2px rgba(49,95,61,.15)!important}.camper-standing-summary button.watch{background:#fffaf0!important}.camper-standing-summary button.needs-review{background:#fff3f0!important}.camper-standing-summary small{display:block;color:#7d6c47;font-size:9px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.camper-standing-summary strong{display:block;margin-top:5px;font:500 30px Georgia,serif}.camper-standing-summary span{display:block;margin-top:3px;color:#6e7a71;font-size:10px;line-height:1.35}.camper-standing-table-card{overflow:hidden;border:1px solid #dedfd8;border-radius:23px;background:#fff;box-shadow:0 13px 32px rgba(34,54,38,.06)}.camper-standing-tools{display:flex;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid #e9e9e2;background:#fafbf8}.camper-standing-tools label{display:flex;align-items:center;gap:8px;min-width:280px;padding:0 11px;border:1px solid #d8ddd5;border-radius:12px;background:#fff;color:#607066}.camper-standing-tools input{width:100%;border:0!important;background:transparent!important;box-shadow:none!important}.camper-standing-tools>div{display:flex;align-items:center;gap:8px;color:#6b766e;font-size:10px;font-weight:850}.camper-standing-tools select{min-height:39px;border:1px solid #d8ddd5!important;border-radius:11px!important;background:#fff!important}.camper-standing-table-wrap{overflow-x:auto}.camper-standing-table-card table{width:100%;border-collapse:collapse}.camper-standing-table-card th{padding:11px 13px;background:#f2f5f0;color:#69756c;font-size:9px;letter-spacing:.06em;text-align:left;text-transform:uppercase;white-space:nowrap}.camper-standing-table-card td{padding:13px;border-top:1px solid #ecece6;vertical-align:middle}.camper-standing-table-card tbody tr{cursor:pointer}.camper-standing-table-card tbody tr:hover{background:#fafbf8}.camper-standing-table-card td strong,.camper-standing-table-card td span{display:block}.camper-standing-table-card td>strong{font-size:12px}.camper-standing-table-card td>span{margin-top:3px;color:#7a847d;font-size:9px}.camper-standing-table-card td p{max-width:290px;margin:0;color:#58665d;font-size:10px;line-height:1.45}.camper-standing-table-card td em{display:block;margin-top:4px;color:#727e75;font-size:9px;font-style:normal}.standing-badge{display:inline-flex!important;align-items:center;gap:5px;padding:6px 8px;border-radius:999px;background:#eaf4e8;color:#315f3d;font-size:9px;white-space:nowrap}.standing-badge.watch{background:#fff0cb;color:#805a18}.standing-badge.needs-review{background:#fae1dc;color:#913e37}.camper-standing-table-card td:last-child button{display:grid!important;width:36px!important;height:36px!important;place-items:center!important;padding:0!important;border:1px solid #d8ded5!important;background:#fff!important;color:#315f3d!important;box-shadow:none!important}.camper-standing-error,.camper-standing-empty{display:flex;align-items:center;justify-content:center;gap:8px;padding:35px;color:#6e7b72;text-align:center}.camper-standing-error{color:#913e37}.camper-standing-empty strong,.camper-standing-empty span{display:block}.sr-only{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0}@media(max-width:900px){.camper-standing-summary{grid-template-columns:repeat(2,1fr)}.camper-standing-hero{align-items:flex-start;flex-direction:column}.camper-standing-table-card table{min-width:930px}}@media(max-width:620px){.camper-standing-page{gap:13px}.camper-standing-hero{padding:23px 19px}.camper-standing-hero button{width:100%;justify-content:center}.camper-standing-summary{gap:7px}.camper-standing-summary button{padding:14px!important}.camper-standing-tools{align-items:stretch;flex-direction:column}.camper-standing-tools label{min-width:0}.camper-standing-tools>div{justify-content:space-between}}
      `}</style>
    </main>
  )
}
