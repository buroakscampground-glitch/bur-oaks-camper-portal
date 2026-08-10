'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  DoorOpen,
  Save,
  Search,
  Send,
  Sparkles,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

type Camper = {
  id: string
  first_name?: string | null
  last_name?: string | null
  lot_number?: string | null
  role?: string | null
}

type RenewalStatus = 'Not Started' | 'Awaiting Response' | 'Renewing' | 'Camper Leaving' | 'Campground Not Renewing'

type Renewal = {
  id: string
  camper_id: string
  lot_number?: string | null
  contract_start_date?: string | null
  contract_end_date?: string | null
  renewal_sent_at?: string | null
  status: RenewalStatus
  decision_recorded_at?: string | null
  automation_error?: string | null
  notes?: string | null
  updated_at?: string | null
}

type Draft = {
  contract_start_date: string
  contract_end_date: string
  renewal_sent_at: string
  status: RenewalStatus
  notes: string
}

type View = 'Action' | 'Openings' | 'All' | 'Setup'

const statuses: RenewalStatus[] = ['Not Started', 'Awaiting Response', 'Renewing', 'Camper Leaving', 'Campground Not Renewing']

function camperName(camper: Camper) {
  return `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper'
}

function todayISO() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

function shiftDate(value: string, months = 0, days = 0) {
  if (!value) return ''
  const [year, month, day] = value.split('-').map(Number)
  const target = new Date(year, month - 1 + months, 1, 12)
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate()
  target.setDate(Math.min(day, lastDay) + days)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
}

function formatDate(value?: string | null) {
  if (!value) return 'Not set'
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function monthLabel(value: string) {
  return new Date(`${value}-01T12:00:00`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function draftFrom(record?: Renewal): Draft {
  return {
    contract_start_date: record?.contract_start_date || '',
    contract_end_date: record?.contract_end_date || '',
    renewal_sent_at: record?.renewal_sent_at || '',
    status: record?.status || 'Not Started',
    notes: record?.notes || '',
  }
}

export default function AdminRenewalsPage() {
  const [campers, setCampers] = useState<Camper[]>([])
  const [renewals, setRenewals] = useState<Renewal[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [expanded, setExpanded] = useState('')
  const [view, setView] = useState<View>('Action')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => { loadPage() }, [])

  async function loadPage() {
    setLoading(true)
    const [camperResult, renewalResult] = await Promise.all([
      supabase.from('campers').select('id,first_name,last_name,lot_number,role').eq('active', true).order('lot_number', { ascending: true }),
      supabase.from('season_renewals').select('*').order('contract_end_date', { ascending: true, nullsFirst: false }),
    ])

    if (camperResult.error || renewalResult.error) {
      setFeedback(camperResult.error?.message || renewalResult.error?.message || 'Unable to load renewal records.')
      setLoading(false)
      return
    }

    const activeCampers = (camperResult.data || []).filter((camper) => !['admin', 'maintenance'].includes(String(camper.role || '').toLowerCase()))
    const records = (renewalResult.data || []) as Renewal[]
    setCampers(activeCampers)
    setRenewals(records)
    setDrafts(Object.fromEntries(activeCampers.map((camper) => [camper.id, draftFrom(records.find((record) => record.camper_id === camper.id))])))
    setLoading(false)
  }

  function updateDraft(camperId: string, field: keyof Draft, value: string) {
    setDrafts((current) => ({
      ...current,
      [camperId]: { ...(current[camperId] || draftFrom()), [field]: value },
    }))
  }

  async function saveRenewal(camper: Camper, markSent = false) {
    const existing = renewals.find((record) => record.camper_id === camper.id)
    const draft = drafts[camper.id] || draftFrom(existing)
    const sentDate = markSent ? todayISO() : draft.renewal_sent_at || null
    const nextStatus: RenewalStatus = markSent && draft.status === 'Not Started' ? 'Awaiting Response' : draft.status

    setSaving(camper.id)
    setFeedback('')
    const decisionChanged = ['Renewing', 'Camper Leaving', 'Campground Not Renewing'].includes(nextStatus) && existing?.status !== nextStatus
    const payload = {
      camper_id: camper.id,
      lot_number: camper.lot_number || null,
      contract_start_date: draft.contract_start_date || null,
      contract_end_date: draft.contract_end_date || null,
      renewal_sent_at: sentDate,
      status: nextStatus,
      decision_recorded_at: decisionChanged ? todayISO() : existing?.decision_recorded_at || null,
      notes: draft.notes.trim() || null,
    }

    const { data, error } = await supabase
      .from('season_renewals')
      .upsert(payload, { onConflict: 'camper_id' })
      .select()
      .single()

    if (error) {
      setFeedback(error.message)
    } else {
      const saved = data as Renewal
      setRenewals((current) => [...current.filter((record) => record.camper_id !== camper.id), saved])
      setDrafts((current) => ({ ...current, [camper.id]: draftFrom(saved) }))
      setFeedback(markSent ? `Renewal marked sent for Lot ${camper.lot_number || '—'}.` : `Renewal forecast saved for Lot ${camper.lot_number || '—'}.`)
      setExpanded('')
    }
    setSaving('')
  }

  const rows = useMemo(() => {
    const today = todayISO()
    return campers.map((camper) => {
      const renewal = renewals.find((record) => record.camper_id === camper.id)
      const contractEnd = renewal?.contract_end_date || ''
      const sendDue = shiftDate(contractEnd, -4)
      const responseDue = shiftDate(contractEnd, -3)
      const openingDate = shiftDate(contractEnd, 0, 1)
      const confirmedOpening = renewal?.status === 'Camper Leaving' || renewal?.status === 'Campground Not Renewing'
      const responseOverdue = renewal?.status === 'Awaiting Response' && !!responseDue && responseDue < today
      const sendOverdue = !renewal?.renewal_sent_at && !!sendDue && sendDue <= today
      const sendSoon = !renewal?.renewal_sent_at && !!sendDue && sendDue > today && sendDue <= shiftDate(today, 1)
      const needsSetup = !contractEnd
      const automationError = Boolean(renewal?.automation_error)
      const needsAction = needsSetup || sendOverdue || sendSoon || responseOverdue || automationError
      let priority = 6
      if (automationError) priority = 0
      else if (responseOverdue) priority = 0
      else if (sendOverdue) priority = 1
      else if (sendSoon) priority = 2
      else if (needsSetup) priority = 3
      else if (renewal?.status === 'Awaiting Response') priority = 4
      else if (confirmedOpening) priority = 5
      return { camper, renewal, contractEnd, sendDue, responseDue, openingDate, confirmedOpening, responseOverdue, sendOverdue, sendSoon, needsSetup, automationError, needsAction, priority }
    }).sort((a, b) => a.priority - b.priority || (a.contractEnd || '9999').localeCompare(b.contractEnd || '9999') || String(a.camper.lot_number || '').localeCompare(String(b.camper.lot_number || ''), undefined, { numeric: true }))
  }, [campers, renewals])

  const visibleRows = rows.filter((row) => {
    if (view === 'Action' && !row.needsAction && row.renewal?.status !== 'Awaiting Response') return false
    if (view === 'Openings' && !row.confirmedOpening && !row.responseOverdue) return false
    if (view === 'Setup' && !row.needsSetup) return false
    const needle = search.trim().toLowerCase()
    return !needle || `${camperName(row.camper)} ${row.camper.lot_number || ''} ${row.renewal?.status || ''}`.toLowerCase().includes(needle)
  })

  const confirmedOpenings = rows.filter((row) => row.confirmedOpening)
  const overdueResponses = rows.filter((row) => row.responseOverdue)
  const awaiting = rows.filter((row) => row.renewal?.status === 'Awaiting Response')
  const sendSoon = rows.filter((row) => row.sendOverdue || row.sendSoon)
  const needsSetup = rows.filter((row) => row.needsSetup)

  const timeline = useMemo(() => {
    const events: Record<string, { send: number; response: number; opening: number }> = {}
    const currentMonth = todayISO().slice(0, 7)
    rows.forEach((row) => {
      const add = (date: string, key: 'send' | 'response' | 'opening') => {
        if (!date) return
        const month = date.slice(0, 7)
        events[month] ||= { send: 0, response: 0, opening: 0 }
        events[month][key] += 1
      }
      if (!row.renewal?.renewal_sent_at) add(row.sendDue, 'send')
      if (row.renewal?.status === 'Awaiting Response') add(row.responseDue, 'response')
      if (row.confirmedOpening) add(row.openingDate, 'opening')
    })
    return Object.entries(events).filter(([month]) => month >= currentMonth).sort(([a], [b]) => a.localeCompare(b)).slice(0, 12)
  }, [rows])

  return (
    <main className="renewal-page">
      <style>{`
        .renewal-page{display:grid;gap:18px;color:#263b2e}.renewal-hero{display:grid;grid-template-columns:1fr auto;gap:24px;align-items:end;padding:30px;border-radius:28px;background:radial-gradient(circle at 85% 12%,rgba(236,199,111,.3),transparent 28%),linear-gradient(135deg,#173722,#386747);color:#fff;box-shadow:0 22px 56px rgba(34,54,38,.16)}.renewal-eyebrow{display:inline-flex;align-items:center;gap:7px;color:#efd288;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.renewal-hero h1{margin:9px 0 0;color:#fff;font:500 clamp(36px,5vw,58px)/1.02 Georgia,serif}.renewal-hero p{max-width:760px;margin:12px 0 0;color:rgba(255,255,255,.84);line-height:1.55}.renewal-hero a{display:inline-flex;align-items:center;gap:8px;padding:12px 15px;border-radius:999px;background:#fff;color:#285237;font-size:12px;font-weight:900;text-decoration:none}
        .renewal-feedback{margin:0;padding:12px 15px;border-radius:13px;background:#eef5eb;color:#315f3d;font-size:12px;font-weight:800}.renewal-summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.renewal-summary button{display:grid;gap:5px;padding:18px!important;border:1px solid #deddd4!important;border-radius:18px!important;background:#fff!important;color:#263b2e!important;text-align:left!important;box-shadow:0 10px 24px rgba(34,54,38,.05)}.renewal-summary button.selected{border-color:#315f3d!important;box-shadow:0 0 0 2px rgba(49,95,61,.12)}.renewal-summary span{color:#7b715c;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.renewal-summary strong{font:600 30px Georgia,serif}.renewal-summary small{color:#6d786f;font-size:11px}
        .renewal-forecast-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:18px}.renewal-panel{padding:21px;border:1px solid #deddd4;border-radius:22px;background:#fff;box-shadow:0 12px 30px rgba(34,54,38,.06)}.renewal-panel-head{display:flex;align-items:start;justify-content:space-between;gap:14px}.renewal-panel h2{margin:6px 0 4px;font:500 27px Georgia,serif}.renewal-panel-head p{margin:0;color:#6d786f;font-size:12px;line-height:1.45}.opening-list,.timeline-list{display:grid;gap:8px;margin-top:16px}.opening-row{display:grid;grid-template-columns:auto 1fr auto;gap:11px;align-items:center;padding:12px;border-radius:14px;background:#f6f8f4}.opening-row.possible{background:#fff6eb}.opening-row>span{display:grid;place-items:center;width:37px;height:37px;border-radius:12px;background:#dcebdd;color:#315f3d}.opening-row.possible>span{background:#f5dfba;color:#8a5d1e}.opening-row strong{display:block;font-size:13px}.opening-row small{display:block;margin-top:3px;color:#758078;font-size:10px}.opening-row em{color:#315f3d;font-size:10px;font-style:normal;font-weight:900;text-align:right}.renewal-empty{padding:22px;text-align:center;color:#718078}.renewal-empty strong{display:block;margin-top:7px;color:#315f3d}.timeline-row{display:grid;grid-template-columns:1fr repeat(3,auto);gap:9px;align-items:center;padding:10px 0;border-bottom:1px solid #ecebe5}.timeline-row:last-child{border:0}.timeline-row strong{font-size:12px}.timeline-row span{padding:5px 7px;border-radius:999px;background:#f2f5f0;color:#45634c;font-size:9px;font-weight:900}.timeline-key{display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;color:#758078;font-size:10px}
        .renewal-roster{padding:22px;border:1px solid #deddd4;border-radius:24px;background:#fff;box-shadow:0 12px 30px rgba(34,54,38,.06)}.renewal-roster-head{display:flex;align-items:end;justify-content:space-between;gap:15px}.renewal-roster h2{margin:6px 0 4px;font:500 30px Georgia,serif}.renewal-roster-head p{margin:0;color:#6d786f;font-size:12px}.renewal-tools{display:flex;gap:8px}.renewal-search{display:flex;align-items:center;gap:7px;padding:0 11px;border:1px solid #d8ddd5;border-radius:12px;background:#fafbf9}.renewal-search input{min-width:190px;border:0!important;background:transparent!important;box-shadow:none!important}.renewal-tools button{background:#315f3d!important;color:#fff!important}.renewal-list{display:grid;gap:9px;margin-top:17px}.renewal-row{border:1px solid #e2e2da;border-radius:17px;overflow:hidden;background:#fbfcfa}.renewal-row.attention{border-color:#e8c888;background:#fffaf1}.renewal-row.opening{border-color:#bad5b8;background:#f5faf3}.renewal-row-main{display:grid;grid-template-columns:minmax(180px,1.2fr) repeat(3,minmax(120px,.8fr)) auto;gap:12px;align-items:center;padding:15px}.renewal-person small,.renewal-deadline small{display:block;color:#8a7449;font-size:9px;font-weight:900;letter-spacing:.07em;text-transform:uppercase}.renewal-person strong,.renewal-deadline strong{display:block;margin-top:4px;font-size:13px}.renewal-status{justify-self:start;padding:7px 9px;border-radius:999px;background:#e9eee7;color:#46604b;font-size:9px;font-weight:900;text-transform:uppercase}.renewal-status.leaving{background:#f6dfc6;color:#875321}.renewal-row-main>button{display:inline-flex!important;align-items:center;gap:6px;background:transparent!important;color:#315f3d!important;box-shadow:none!important}.renewal-edit{display:grid;grid-template-columns:repeat(4,1fr);gap:11px;padding:16px;border-top:1px solid #e2e2da;background:#fff}.renewal-edit label{display:grid;gap:6px;color:#526158;font-size:9px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.renewal-edit input,.renewal-edit select,.renewal-edit textarea{width:100%;border:1px solid #d8ddd5!important;border-radius:11px!important;background:#fbfcfa!important;color:#263b2e!important;box-shadow:none!important}.renewal-edit .notes{grid-column:1/-1}.renewal-edit textarea{min-height:72px;resize:vertical}.renewal-edit-dates{grid-column:1/-1;display:flex;flex-wrap:wrap;gap:8px;padding:10px 12px;border-radius:12px;background:#f2f6ef;color:#58705e;font-size:10px}.renewal-edit-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:8px}.renewal-edit-actions button{display:inline-flex!important;align-items:center;gap:7px}.renewal-edit-actions .mark-sent{background:#fff!important;color:#315f3d!important}.renewal-edit-actions .save{background:#315f3d!important;color:#fff!important}.renewal-none{padding:36px;text-align:center;color:#718078}.renewal-none strong{display:block;margin-top:8px;color:#315f3d}
        @media(max-width:1050px){.renewal-summary{grid-template-columns:repeat(2,1fr)}.renewal-forecast-grid{grid-template-columns:1fr}.renewal-row-main{grid-template-columns:minmax(180px,1.2fr) repeat(2,minmax(120px,.8fr)) auto}.renewal-row-main .contract-col{display:none}.renewal-edit{grid-template-columns:repeat(2,1fr)}}@media(max-width:680px){.renewal-hero{grid-template-columns:1fr;padding:24px 20px}.renewal-hero a{justify-self:start}.renewal-summary{gap:8px}.renewal-summary button{padding:14px!important}.renewal-summary strong{font-size:25px}.renewal-panel,.renewal-roster{padding:17px}.renewal-roster-head{align-items:stretch;flex-direction:column}.renewal-tools{display:grid;grid-template-columns:1fr auto}.renewal-search input{min-width:0;width:100%}.renewal-row-main{grid-template-columns:1fr auto;gap:9px}.renewal-row-main .renewal-deadline,.renewal-row-main .renewal-status{grid-column:1}.renewal-row-main>button{grid-column:2;grid-row:1/4}.renewal-edit{grid-template-columns:1fr}.renewal-edit .notes{grid-column:auto}.renewal-edit-actions{align-items:stretch;flex-direction:column}.renewal-edit-actions button{justify-content:center}.opening-row{grid-template-columns:auto 1fr}.opening-row em{grid-column:2;text-align:left}.timeline-row{grid-template-columns:1fr;gap:5px}.timeline-row span{justify-self:start}}
      `}</style>

      <section className="renewal-hero">
        <div><span className="renewal-eyebrow"><CalendarClock size={17} /> SEASON PLANNING</span><h1>Know which sites may open next.</h1><p>Contract dates repeat yearly. The saved renewal form goes into the camper portal four months before the anniversary, and the camper’s answer is due one month later.</p></div>
        <a href="/admin/waitlist"><BookOpen size={16} /> Open waitlist <ArrowRight size={15} /></a>
      </section>

      {feedback && <p className="renewal-feedback">{feedback}</p>}

      <section className="renewal-summary" aria-label="Renewal overview">
        <button type="button" className={view === 'Setup' ? 'selected' : ''} onClick={() => setView('Setup')}><span>Needs contract dates</span><strong>{needsSetup.length}</strong><small>Enter these once to begin</small></button>
        <button type="button" className={view === 'Action' ? 'selected' : ''} onClick={() => setView('Action')}><span>Send now or soon</span><strong>{sendSoon.length}</strong><small>Based on the four-month rule</small></button>
        <button type="button" className={view === 'Action' ? 'selected' : ''} onClick={() => setView('Action')}><span>Awaiting answers</span><strong>{awaiting.length}</strong><small>{overdueResponses.length} past response deadline</small></button>
        <button type="button" className={view === 'Openings' ? 'selected' : ''} onClick={() => setView('Openings')}><span>Confirmed openings</span><strong>{confirmedOpenings.length}</strong><small>Safe to begin filling</small></button>
      </section>

      <div className="renewal-forecast-grid">
        <section className="renewal-panel">
          <div className="renewal-panel-head"><div><span className="renewal-eyebrow"><DoorOpen size={15} /> OPENING FORECAST</span><h2>Sites to plan for</h2><p>Confirmed openings are kept separate from overdue answers.</p></div></div>
          <div className="opening-list">
            {confirmedOpenings.slice(0, 6).map((row) => <div className="opening-row" key={row.camper.id}><span><DoorOpen size={18} /></span><div><strong>Lot {row.camper.lot_number || '—'} · {camperName(row.camper)}</strong><small>{row.renewal?.status}</small></div><em>Opens {formatDate(row.openingDate)}</em></div>)}
            {overdueResponses.slice(0, 4).map((row) => <div className="opening-row possible" key={row.camper.id}><span><AlertTriangle size={18} /></span><div><strong>Lot {row.camper.lot_number || '—'} · {camperName(row.camper)}</strong><small>Answer is overdue—not a confirmed opening</small></div><em>Due {formatDate(row.responseDue)}</em></div>)}
            {!confirmedOpenings.length && !overdueResponses.length && <div className="renewal-empty"><Sparkles size={28} /><strong>No projected openings yet.</strong><small>Decisions and overdue replies will appear here.</small></div>}
          </div>
        </section>

        <section className="renewal-panel">
          <div className="renewal-panel-head"><div><span className="renewal-eyebrow"><CalendarCheck size={15} /> 12-MONTH TIMELINE</span><h2>What is coming up</h2><p>Send dates, camper deadlines, and confirmed openings by month.</p></div></div>
          <div className="timeline-list">
            {timeline.map(([month, counts]) => <div className="timeline-row" key={month}><strong>{monthLabel(month)}</strong><span>{counts.send} to send</span><span>{counts.response} replies due</span><span>{counts.opening} opening</span></div>)}
            {!timeline.length && <div className="renewal-empty"><CalendarClock size={28} /><strong>Add contract dates to build the calendar.</strong></div>}
          </div>
          <div className="timeline-key"><span>Send = 4 months before end</span><span>Reply due = 3 months before end</span></div>
        </section>
      </div>

      <section className="renewal-roster">
        <div className="renewal-roster-head">
          <div><span className="renewal-eyebrow"><Clock3 size={15} /> RENEWAL ROSTER</span><h2>{view === 'Setup' ? 'Campers needing dates' : view === 'Openings' ? 'Opening forecast details' : view === 'All' ? 'All seasonal campers' : 'Decisions needing attention'}</h2><p>Automatic renewals are protected against duplicates. You can still update any decision manually.</p></div>
          <div className="renewal-tools"><label className="renewal-search"><Search size={15} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lot or camper" /></label><button type="button" onClick={() => setView(view === 'All' ? 'Action' : 'All')}>{view === 'All' ? 'Priority view' : 'View all'}</button></div>
        </div>

        <div className="renewal-list">
          {visibleRows.map((row) => {
            const draft = drafts[row.camper.id] || draftFrom(row.renewal)
            const isExpanded = expanded === row.camper.id
            const attention = row.responseOverdue || row.sendOverdue || row.sendSoon || row.needsSetup || row.automationError
            return <article className={`renewal-row${attention ? ' attention' : ''}${row.confirmedOpening ? ' opening' : ''}`} key={row.camper.id}>
              <div className="renewal-row-main">
                <div className="renewal-person"><small>LOT {row.camper.lot_number || '—'}</small><strong>{camperName(row.camper)}</strong></div>
                <div className="renewal-deadline contract-col"><small>Contract ends</small><strong>{formatDate(row.contractEnd)}</strong></div>
                <div className="renewal-deadline"><small>{row.renewal?.renewal_sent_at ? 'Camper answer due' : 'Renewal should be sent'}</small><strong>{formatDate(row.renewal?.renewal_sent_at ? row.responseDue : row.sendDue)}</strong></div>
                <span className={`renewal-status${row.confirmedOpening ? ' leaving' : ''}`}>{row.automationError ? 'Send problem' : row.needsSetup ? 'Needs dates' : row.responseOverdue ? 'Reply overdue' : row.renewal?.status || 'Not Started'}</span>
                <button type="button" onClick={() => setExpanded(isExpanded ? '' : row.camper.id)}>{isExpanded ? 'Close' : 'Update'} <ChevronDown size={15} /></button>
              </div>
              {isExpanded && <div className="renewal-edit">
                <label>Contract starts<input type="date" value={draft.contract_start_date} onChange={(event) => updateDraft(row.camper.id, 'contract_start_date', event.target.value)} /></label>
                <label>Contract ends<input type="date" value={draft.contract_end_date} onChange={(event) => updateDraft(row.camper.id, 'contract_end_date', event.target.value)} /></label>
                <label>Renewal sent<input type="date" value={draft.renewal_sent_at} onChange={(event) => updateDraft(row.camper.id, 'renewal_sent_at', event.target.value)} /></label>
                <label>Decision<select value={draft.status} onChange={(event) => updateDraft(row.camper.id, 'status', event.target.value)}>{statuses.map((status) => <option key={status}>{status}</option>)}</select></label>
                {draft.contract_end_date && <div className="renewal-edit-dates"><span>Auto-send <strong>{formatDate(shiftDate(draft.contract_end_date, -4))}</strong></span><span>Camper reply due <strong>{formatDate(shiftDate(draft.contract_end_date, -3))}</strong></span><span>Possible opening <strong>{formatDate(shiftDate(draft.contract_end_date, 0, 1))}</strong></span>{row.renewal?.automation_error && <span><strong>Needs attention:</strong> {row.renewal.automation_error}</span>}</div>}
                <label className="notes">Private notes<textarea value={draft.notes} onChange={(event) => updateDraft(row.camper.id, 'notes', event.target.value)} placeholder="Calls, conversations, special circumstances…" /></label>
                <div className="renewal-edit-actions">{!draft.renewal_sent_at && <button className="mark-sent" type="button" disabled={saving === row.camper.id} onClick={() => saveRenewal(row.camper, true)}><Send size={15} /> Mark renewal sent today</button>}<button className="save" type="button" disabled={saving === row.camper.id} onClick={() => saveRenewal(row.camper)}>{saving === row.camper.id ? <Clock3 size={15} /> : <Save size={15} />} {saving === row.camper.id ? 'Saving…' : 'Save renewal record'}</button></div>
              </div>}
            </article>
          })}
          {!loading && !visibleRows.length && <div className="renewal-none"><CheckCircle2 size={31} /><strong>No campers match this view.</strong><small>Try View all or clear the search.</small></div>}
          {loading && <div className="renewal-none"><Clock3 size={31} /><strong>Loading renewal forecast…</strong></div>}
        </div>
      </section>
    </main>
  )
}
