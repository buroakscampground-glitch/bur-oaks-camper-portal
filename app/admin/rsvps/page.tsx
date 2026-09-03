'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CheckCircle2, HelpCircle, UsersRound, XCircle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

type EventRecord = {
  id: string
  title: string
  event_date: string
  description?: string | null
}

type RsvpRecord = {
  id: string
  event_id: string
  camper_id: string
  response: 'Going' | 'Maybe' | 'Not Going'
}

type CamperRecord = {
  id: string
  lot_number?: string | null
  first_name?: string | null
  last_name?: string | null
}

function todayIso() {
  const now = new Date()
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

function eventDateLabel(value: string) {
  if (!value) return 'Date coming soon'
  return new Date(`${value}T12:00:00`).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })
}

export default function AdminRsvpsPage() {
  const [events, setEvents] = useState<EventRecord[]>([])
  const [rsvps, setRsvps] = useState<RsvpRecord[]>([])
  const [campers, setCampers] = useState<CamperRecord[]>([])
  const [view, setView] = useState<'upcoming' | 'all'>('upcoming')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => { loadData() }, [])

  async function loadData() {
    setLoading(true)
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/community-rsvps', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) setMessage(result.error || 'Unable to load event responses.')
    setEvents((result.events || []) as EventRecord[])
    setRsvps((result.rsvps || []) as RsvpRecord[])
    setCampers((result.campers || []) as CamperRecord[])
    setLoading(false)
  }

  function camperLabel(camperId: string) {
    const camper = campers.find((item) => item.id === camperId)
    if (!camper) return 'Unknown camper'
    const name = `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper'
    return `Lot ${camper.lot_number || '—'} · ${name}`
  }

  const visibleEvents = useMemo(() => {
    const today = todayIso()
    return events.filter((event) => view === 'all' || !event.event_date || event.event_date >= today)
  }, [events, view])

  const visibleEventIds = new Set(visibleEvents.map((event) => event.id))
  const visibleRsvps = rsvps.filter((rsvp) => visibleEventIds.has(rsvp.event_id))
  const goingTotal = visibleRsvps.filter((rsvp) => rsvp.response === 'Going').length
  const maybeTotal = visibleRsvps.filter((rsvp) => rsvp.response === 'Maybe').length
  const notGoingTotal = visibleRsvps.filter((rsvp) => rsvp.response === 'Not Going').length

  return (
    <main className="admin-rsvp-page">
      <style>{`
        .admin-rsvp-page{display:grid;gap:18px;color:#263b2e}.admin-rsvp-hero{display:flex;align-items:end;justify-content:space-between;gap:22px;padding:29px;border-radius:27px;background:radial-gradient(circle at 88% 12%,rgba(230,202,127,.25),transparent 30%),linear-gradient(135deg,#173722,#315f3d);color:#fff;box-shadow:0 22px 54px rgba(34,54,38,.16)}.admin-rsvp-hero span{display:inline-flex;align-items:center;gap:7px;color:#efd288;font-size:10px;font-weight:900;letter-spacing:.14em;text-transform:uppercase}.admin-rsvp-hero h1{margin:8px 0 0;color:#fff;font:500 clamp(36px,5vw,56px)/1.02 Georgia,serif}.admin-rsvp-hero p{max-width:740px;margin:11px 0 0;color:rgba(255,255,255,.82);line-height:1.55}.admin-rsvp-switch{display:flex;gap:7px;padding:5px;border:1px solid rgba(255,255,255,.2);border-radius:999px;background:rgba(255,255,255,.1)}.admin-rsvp-switch button{min-height:36px;padding:0 14px!important;border:0!important;border-radius:999px!important;background:transparent!important;color:#fff!important;box-shadow:none!important;font-size:11px;font-weight:900}.admin-rsvp-switch button.selected{background:#fff!important;color:#315f3d!important}.admin-rsvp-summary{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}.admin-rsvp-summary article{padding:17px;border:1px solid #dfded5;border-radius:18px;background:#fff;box-shadow:0 10px 25px rgba(34,54,38,.05)}.admin-rsvp-summary small{color:#8b7649;font-size:9px;font-weight:900;letter-spacing:.1em;text-transform:uppercase}.admin-rsvp-summary strong{display:block;margin-top:5px;color:#263b2e;font:500 31px Georgia,serif}.admin-rsvp-list{display:grid;gap:14px}.admin-rsvp-event{overflow:hidden;border:1px solid #deddd4;border-radius:23px;background:#fff;box-shadow:0 13px 32px rgba(34,54,38,.06)}.admin-rsvp-event-head{display:flex;align-items:center;justify-content:space-between;gap:15px;padding:19px 21px;border-bottom:1px solid #ebe8df;background:linear-gradient(135deg,#fbfaf5,#f2f6ef)}.admin-rsvp-event-head small{color:#9a7834;font-size:10px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}.admin-rsvp-event-head h2{margin:4px 0 0;color:#263b2e;font:500 27px Georgia,serif}.admin-rsvp-event-head>strong{display:grid;width:52px;height:52px;place-items:center;border-radius:16px;background:#315f3d;color:#fff;font:500 23px Georgia,serif}.admin-rsvp-columns{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0}.admin-rsvp-column{padding:19px}.admin-rsvp-column+.admin-rsvp-column{border-left:1px solid #ebe8df}.admin-rsvp-column h3{display:flex;align-items:center;gap:7px;margin:0 0 12px;font-size:13px}.admin-rsvp-column.going h3{color:#35663f}.admin-rsvp-column.maybe h3{color:#8b651f}.admin-rsvp-column.not-going h3{color:#7a5954}.admin-rsvp-column p{margin:0;padding:9px 0;border-top:1px solid #f0eee7;color:#405247;font-size:12px;font-weight:800}.admin-rsvp-column p:first-of-type{border-top:0}.admin-rsvp-empty{color:#849087!important;font-weight:600!important}.admin-rsvp-message,.admin-rsvp-none{padding:30px;border:1px dashed #d8ded4;border-radius:20px;background:#fbfcf8;color:#68746c;text-align:center}.admin-rsvp-message{border-style:solid;border-color:#ebc4bb;background:#fff5f1;color:#963f34}.admin-rsvp-none strong{display:block;margin-top:7px;color:#315f3d;font:500 23px Georgia,serif}@media(max-width:760px){.admin-rsvp-hero{align-items:stretch;flex-direction:column;padding:23px 19px}.admin-rsvp-switch{align-self:flex-start}.admin-rsvp-summary{grid-template-columns:repeat(2,1fr)}.admin-rsvp-columns{grid-template-columns:1fr}.admin-rsvp-column+.admin-rsvp-column{border-top:1px solid #ebe8df;border-left:0}.admin-rsvp-event-head{align-items:flex-start}.admin-rsvp-event-head h2{font-size:23px}}
      `}</style>

      <section className="admin-rsvp-hero">
        <div>
          <span><UsersRound size={17} /> EVENT RESPONSE ORGANIZER</span>
          <h1>See exactly who plans to attend.</h1>
          <p>RSVPs are informational, not warnings. Going, Maybe, and Not Going responses stay organized here for planning.</p>
        </div>
        <div className="admin-rsvp-switch" aria-label="Event view">
          <button type="button" className={view === 'upcoming' ? 'selected' : ''} onClick={() => setView('upcoming')}>Upcoming</button>
          <button type="button" className={view === 'all' ? 'selected' : ''} onClick={() => setView('all')}>All events</button>
        </div>
      </section>

      <section className="admin-rsvp-summary" aria-label="RSVP totals">
        <article><small>Events shown</small><strong>{visibleEvents.length}</strong></article>
        <article><small>Going</small><strong>{goingTotal}</strong></article>
        <article><small>Maybe</small><strong>{maybeTotal}</strong></article>
        <article><small>Not going</small><strong>{notGoingTotal}</strong></article>
      </section>

      {message && <p className="admin-rsvp-message">{message}</p>}

      <section className="admin-rsvp-list">
        {visibleEvents.map((event) => {
          const eventRsvps = rsvps.filter((rsvp) => rsvp.event_id === event.id)
          const groups = {
            going: eventRsvps.filter((rsvp) => rsvp.response === 'Going'),
            maybe: eventRsvps.filter((rsvp) => rsvp.response === 'Maybe'),
            notGoing: eventRsvps.filter((rsvp) => rsvp.response === 'Not Going'),
          }

          return (
            <article className="admin-rsvp-event" key={event.id}>
              <header className="admin-rsvp-event-head">
                <div><small>{eventDateLabel(event.event_date)}</small><h2>{event.title}</h2></div>
                <strong title={`${eventRsvps.length} total responses`}>{eventRsvps.length}</strong>
              </header>
              <div className="admin-rsvp-columns">
                <div className="admin-rsvp-column going">
                  <h3><CheckCircle2 size={17} /> Going · {groups.going.length}</h3>
                  {groups.going.map((rsvp) => <p key={rsvp.id}>{camperLabel(rsvp.camper_id)}</p>)}
                  {!groups.going.length && <p className="admin-rsvp-empty">No one yet.</p>}
                </div>
                <div className="admin-rsvp-column maybe">
                  <h3><HelpCircle size={17} /> Maybe · {groups.maybe.length}</h3>
                  {groups.maybe.map((rsvp) => <p key={rsvp.id}>{camperLabel(rsvp.camper_id)}</p>)}
                  {!groups.maybe.length && <p className="admin-rsvp-empty">No one yet.</p>}
                </div>
                <div className="admin-rsvp-column not-going">
                  <h3><XCircle size={17} /> Not Going · {groups.notGoing.length}</h3>
                  {groups.notGoing.map((rsvp) => <p key={rsvp.id}>{camperLabel(rsvp.camper_id)}</p>)}
                  {!groups.notGoing.length && <p className="admin-rsvp-empty">No one yet.</p>}
                </div>
              </div>
            </article>
          )
        })}

        {!loading && !visibleEvents.length && <div className="admin-rsvp-none"><CalendarDays size={30} /><strong>No events in this view.</strong><p>Choose All events to review earlier responses.</p></div>}
        {loading && <div className="admin-rsvp-none"><UsersRound size={30} /><strong>Loading event responses…</strong></div>}
      </section>
    </main>
  )
}
