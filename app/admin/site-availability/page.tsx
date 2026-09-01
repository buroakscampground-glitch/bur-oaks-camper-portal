'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, CheckCircle2, Clock3, DoorOpen, LoaderCircle, RefreshCw, TentTree } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { buildSiteAvailability } from '../../../lib/site-availability'

function todayCentral() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

function dateLabel(value?: string | null) {
  if (!value) return 'Date not set'
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function SiteAvailabilityPage() {
  const [lots, setLots] = useState<any[]>([])
  const [campers, setCampers] = useState<any[]>([])
  const [renewals, setRenewals] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  async function loadAvailability() {
    setLoading(true)
    setError('')
    const [lotResult, camperResult, renewalResult] = await Promise.all([
      supabase.from('lots').select('id,lot_number').order('lot_number', { ascending: true }),
      supabase.from('campers').select('id,first_name,last_name,lot_number,role,active').eq('active', true).order('lot_number', { ascending: true }),
      supabase.from('season_renewals').select('camper_id,lot_number,contract_end_date,status').order('contract_end_date', { ascending: true }),
    ])

    const loadError = lotResult.error || camperResult.error || renewalResult.error
    if (loadError) {
      setError(loadError.message || 'Site availability could not be loaded.')
    } else {
      setLots(lotResult.data || [])
      setCampers(camperResult.data || [])
      setRenewals(renewalResult.data || [])
    }
    setLoading(false)
  }

  useEffect(() => { loadAvailability() }, [])

  const forecast = useMemo(() => buildSiteAvailability({ lots, campers, renewals, today: todayCentral() }), [lots, campers, renewals])

  if (loading) {
    return <main className="site-availability-page"><div className="site-availability-loading"><LoaderCircle className="admin-spin" /><strong>Checking every campsite…</strong></div></main>
  }

  return (
    <main className="site-availability-page">
      <style>{`
        .site-availability-page{display:grid;gap:17px;color:#263b2e}.site-availability-hero{display:flex;align-items:end;justify-content:space-between;gap:22px;padding:29px;border-radius:27px;background:radial-gradient(circle at 85% 10%,rgba(236,199,111,.28),transparent 28%),linear-gradient(135deg,#173722,#386747);color:#fff;box-shadow:0 22px 55px rgba(34,54,38,.16)}.site-availability-hero span{display:inline-flex;align-items:center;gap:7px;color:#efd288;font-size:10px;font-weight:950;letter-spacing:.13em}.site-availability-hero h1{margin:8px 0 0;color:#fff;font:500 clamp(36px,5vw,58px)/1.02 Georgia,serif}.site-availability-hero p{max-width:780px;margin:10px 0 0;color:rgba(255,255,255,.82);line-height:1.55}.site-availability-hero button{display:flex;align-items:center;gap:8px;min-height:43px;padding:0 14px;border:1px solid rgba(255,255,255,.25)!important;background:#fff!important;color:#315f3d!important;font-size:11px;font-weight:950;white-space:nowrap}.site-availability-error{padding:13px 15px;border-radius:13px;background:#fff0ed;color:#9b3932;font-weight:850}.site-availability-summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:11px}.site-availability-summary article{display:grid;grid-template-columns:auto 1fr;gap:11px;align-items:center;padding:17px;border:1px solid #dddfd8;border-radius:18px;background:#fff;box-shadow:0 10px 26px rgba(35,55,40,.06)}.site-availability-summary article>span{display:grid;width:43px;height:43px;place-items:center;border-radius:13px;background:#e5f1e3;color:#315f3d}.site-availability-summary article:nth-child(2)>span{background:#f8e6d7;color:#955c21}.site-availability-summary article:nth-child(3)>span{background:#e7eff2;color:#386778}.site-availability-summary small{display:block;color:#8a7652;font-size:9px;font-weight:950;letter-spacing:.09em}.site-availability-summary strong{display:block;margin-top:3px;font:600 28px Georgia,serif}.site-availability-panel{padding:20px;border:1px solid #dedfd8;border-radius:22px;background:#fff;box-shadow:0 12px 30px rgba(34,54,38,.06)}.site-availability-panel>header{display:flex;align-items:start;justify-content:space-between;gap:14px}.site-availability-panel h2{margin:5px 0 0;font:500 28px Georgia,serif}.site-availability-panel header p{margin:4px 0 0;color:#6d786f;font-size:11px}.site-availability-panel header a{color:#315f3d;font-size:10px;font-weight:950}.site-availability-pills{display:flex;flex-wrap:wrap;gap:8px;margin-top:15px}.site-availability-pills a,.site-availability-pills span{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 11px;border-radius:999px;background:#e9f3e6;color:#315f3d;font-size:11px;font-weight:950;text-decoration:none}.site-availability-pills.overdue a{background:#fff0df;color:#955c21}.site-availability-empty{margin:14px 0 0;padding:17px;border-radius:14px;background:#f5f7f3;color:#68756c;font-size:12px}.site-availability-months{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.site-availability-month{min-height:210px;padding:17px;border:1px solid #dddfd8;border-radius:19px;background:#fff;box-shadow:0 9px 24px rgba(34,54,38,.05)}.site-availability-month.has-opening{border-color:#bad4b7;background:linear-gradient(145deg,#f2f9ef,#fff)}.site-availability-month.has-possible:not(.has-opening){border-color:#e5d2a5;background:linear-gradient(145deg,#fff9ec,#fff)}.site-availability-month header{display:flex;align-items:center;justify-content:space-between;gap:8px;padding-bottom:11px;border-bottom:1px solid #e7e8e3}.site-availability-month h3{margin:0;font:600 20px Georgia,serif}.site-availability-month header span{padding:5px 7px;border-radius:999px;background:#edf1eb;color:#647168;font-size:8px;font-weight:950}.site-availability-month-list{display:grid;gap:8px;margin-top:11px}.site-availability-month-list a{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:center;padding:10px;border-radius:12px;background:#f0f6ed;color:#284c34;text-decoration:none}.site-availability-month-list a.possible{background:#fff5df;color:#79571e}.site-availability-month-list a>span{display:grid;width:31px;height:31px;place-items:center;border-radius:9px;background:#fff}.site-availability-month-list strong,.site-availability-month-list small{display:block}.site-availability-month-list strong{font-size:12px}.site-availability-month-list small{margin-top:2px;color:inherit;font-size:9px;opacity:.76}.site-availability-month>p{margin:20px 0 0;color:#7a847d;font-size:11px;text-align:center}.site-availability-key{display:flex;flex-wrap:wrap;gap:12px;color:#69766d;font-size:10px}.site-availability-key span{display:inline-flex;align-items:center;gap:6px}.site-availability-key i{width:10px;height:10px;border-radius:50%;background:#76a36f}.site-availability-key span:last-child i{background:#deb968}.site-availability-loading{display:grid;min-height:65vh;place-content:center;justify-items:center;gap:10px;color:#315f3d}
        @media(max-width:1000px){.site-availability-months{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:680px){.site-availability-hero{align-items:stretch;flex-direction:column;padding:23px 19px}.site-availability-hero button{width:100%;justify-content:center}.site-availability-summary{grid-template-columns:1fr}.site-availability-months{grid-template-columns:1fr}.site-availability-panel{padding:16px}.site-availability-month{min-height:0}}
      `}</style>

      <section className="site-availability-hero">
        <div><span><CalendarDays size={16} /> SITE AVAILABILITY</span><h1>Open sites, month by month.</h1><p>Vacant sites appear under Open Now. Confirmed move-outs appear in their opening month. Yellow sites are only possibilities until the camper answers.</p></div>
        <button type="button" onClick={loadAvailability}><RefreshCw size={16} /> Refresh availability</button>
      </section>

      {error && <p className="site-availability-error"><AlertTriangle size={16} /> {error}</p>}

      <section className="site-availability-summary">
        <article><span><DoorOpen size={21} /></span><div><small>OPEN NOW</small><strong>{forecast.availableNow.length}</strong></div></article>
        <article><span><CheckCircle2 size={21} /></span><div><small>CONFIRMED OPENINGS</small><strong>{forecast.confirmedCount}</strong></div></article>
        <article><span><Clock3 size={21} /></span><div><small>WAITING ON ANSWER</small><strong>{forecast.possibleCount}</strong></div></article>
      </section>

      <section className="site-availability-panel">
        <header><div><small>AVAILABLE TODAY</small><h2>Open now</h2><p>These sites have no active camper assigned in Camper Records.</p></div><a href="/admin/lots">Manage sites →</a></header>
        {forecast.availableNow.length ? <div className="site-availability-pills">{forecast.availableNow.map((site) => <a href="/admin/lots" key={site.lotNumber}><TentTree size={15} /> Site {site.lotNumber}</a>)}</div> : <p className="site-availability-empty">No campsite is currently recorded as vacant.</p>}
      </section>

      {forecast.overdueOpenings.length > 0 && (
        <section className="site-availability-panel">
          <header><div><small>VERIFY BEFORE OFFERING</small><h2>Move-out date has passed</h2><p>These are confirmed departures, but the camper is still active. Inspect and clear the site first.</p></div><a href="/admin/renewals">Open renewals →</a></header>
          <div className="site-availability-pills overdue">{forecast.overdueOpenings.map((site) => <a href={site.camperId ? `/admin/campers/${site.camperId}` : '/admin/renewals'} key={site.lotNumber}><AlertTriangle size={15} /> Site {site.lotNumber} · expected {dateLabel(site.openingDate)}</a>)}</div>
        </section>
      )}

      <div className="site-availability-key"><span><i /> Confirmed opening — safe to plan after the listed date</span><span><i /> Possible only — waiting for camper response</span></div>

      <section className="site-availability-months" aria-label="Twelve month campsite opening forecast">
        {forecast.months.map((month) => {
          const total = month.confirmed.length + month.possible.length
          return (
            <article className={`site-availability-month${month.confirmed.length ? ' has-opening' : ''}${month.possible.length ? ' has-possible' : ''}`} key={month.key}>
              <header><h3>{month.label}</h3><span>{total ? `${total} site${total === 1 ? '' : 's'}` : 'No changes'}</span></header>
              <div className="site-availability-month-list">
                {month.confirmed.map((site) => <a href={site.camperId ? `/admin/campers/${site.camperId}` : '/admin/renewals'} key={`confirmed-${site.lotNumber}`}><span><DoorOpen size={16} /></span><div><strong>Site {site.lotNumber} · Confirmed</strong><small>Opens {dateLabel(site.openingDate)} · {site.reason}</small></div></a>)}
                {month.possible.map((site) => <a className="possible" href={site.camperId ? `/admin/campers/${site.camperId}` : '/admin/renewals'} key={`possible-${site.lotNumber}`}><span><Clock3 size={16} /></span><div><strong>Site {site.lotNumber} · Possible</strong><small>{dateLabel(site.openingDate)} · Waiting for answer</small></div></a>)}
              </div>
              {!total && <p>No known site opening this month.</p>}
            </article>
          )
        })}
      </section>
    </main>
  )
}
