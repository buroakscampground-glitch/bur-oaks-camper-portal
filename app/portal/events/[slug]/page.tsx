'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, CheckCircle2, Clock, Download, HelpCircle, MapPin, PartyPopper, UsersRound, XCircle } from 'lucide-react'
import { eventFlyers2026 } from '../../../../lib/event-flyers'
import { supabase } from '../../../../lib/supabase'

type RsvpStatus = {
  eventId?: string
  myResponse: string | null
  goingCampers?: Array<{
    name: string
    lotNumber: string | null
  }>
  counts: {
    going: number
    maybe: number
    notGoing: number
  }
}

const responseButtons = [
  { label: 'Going', icon: CheckCircle2, helper: 'Count us in' },
  { label: 'Maybe', icon: HelpCircle, helper: 'Interested' },
  { label: 'Not Going', icon: XCircle, helper: 'Can’t make it' },
]

function compactCalendarDate(value: string) {
  return value.replaceAll('-', '')
}

function googleCalendarUrl(event: NonNullable<(typeof eventFlyers2026)[number]>) {
  const start = compactCalendarDate(event.date)
  const endDate = new Date(`${event.endDate || event.date}T12:00:00`)
  endDate.setDate(endDate.getDate() + 1)

  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: event.title,
    dates: `${start}/${compactCalendarDate(endDate.toISOString().slice(0, 10))}`,
    details: event.description,
    location: 'Bur Oaks Campground',
  })

  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export default function PortalEventDetailPage() {
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const slug = params?.slug
  const event = useMemo(() => eventFlyers2026.find((item) => item.slug === slug), [slug])
  const [status, setStatus] = useState<RsvpStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadStatus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      window.location.href = '/login'
      return null
    }

    return token
  }

  async function loadStatus() {
    if (!slug) return

    const token = await getToken()
    if (!token) return

    setLoading(true)
    const response = await fetch(`/api/event-rsvp?slug=${encodeURIComponent(slug)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const data = await response.json().catch(() => null)

    if (response.ok && data) {
      setStatus({
        eventId: data.eventId,
        myResponse: data.myResponse,
        goingCampers: data.goingCampers || [],
        counts: data.counts || { going: 0, maybe: 0, notGoing: 0 },
      })
    } else {
      setMessage(data?.error || 'Unable to load your RSVP right now.')
    }

    setLoading(false)
  }

  async function saveResponse(responseLabel: string) {
    if (!slug) return

    const token = await getToken()
    if (!token) return

    setSaving(responseLabel)
    setMessage('')

    const response = await fetch('/api/event-rsvp', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slug,
        response: responseLabel,
      }),
    })
    const data = await response.json().catch(() => null)

    if (response.ok && data) {
      setStatus({
        eventId: data.eventId,
        myResponse: data.myResponse,
        goingCampers: data.goingCampers || [],
        counts: data.counts || { going: 0, maybe: 0, notGoing: 0 },
      })
      setMessage(`Saved — you are marked as ${responseLabel}.`)
    } else {
      setMessage(data?.error || 'Unable to save your response right now.')
    }

    setSaving('')
  }

  if (!event) {
    return (
      <main className="portal-event-detail-page">
        <section className="portal-event-detail-empty">
          <button type="button" onClick={() => router.push('/portal')}>← Back to Portal</button>
          <h1>Event not found</h1>
          <p>That flyer is no longer available.</p>
        </section>
      </main>
    )
  }

  return (
    <main className="portal-event-detail-page">
      <section className="portal-event-detail-hero">
        <button type="button" onClick={() => router.push('/portal')}>
          <ArrowLeft size={17} /> Back to Portal
        </button>

        <div className="portal-event-detail-grid">
          <div className="portal-event-detail-copy">
            <span><PartyPopper size={17} /> Bur Oaks event</span>
            <h1>{event.title}</h1>
            <p>{event.description}</p>

            <div className="portal-event-detail-meta">
              <article>
                <CalendarDays size={19} />
                <div>
                  <small>Date</small>
                  <strong>{event.displayDate}</strong>
                </div>
              </article>
              <article>
                <Clock size={19} />
                <div>
                  <small>Time</small>
                  <strong>{event.time || 'Details on flyer'}</strong>
                </div>
              </article>
              <article>
                <MapPin size={19} />
                <div>
                  <small>Location</small>
                  <strong>Bur Oaks Campground</strong>
                </div>
              </article>
            </div>

            <section className="portal-event-rsvp-panel">
              <div>
                <span>Let us know</span>
                <h2>Are you coming?</h2>
                <p>Your answer helps Bur Oaks plan food, setup, seating, and supplies.</p>
              </div>

              <div className="portal-event-rsvp-actions">
                {responseButtons.map(({ label, icon: Icon, helper }) => (
                  <button
                    className={status?.myResponse === label ? 'active' : ''}
                    disabled={saving !== ''}
                    key={label}
                    onClick={() => saveResponse(label)}
                    type="button"
                  >
                    <Icon size={18} />
                    <strong>{saving === label ? 'Saving...' : label}</strong>
                    <small>{helper}</small>
                  </button>
                ))}
              </div>

              {message && <p className="portal-event-message">{message}</p>}
              {loading && <p className="portal-event-message">Loading your current RSVP...</p>}

              <div className="portal-event-count-row">
                <span>{status?.counts.going || 0} going</span>
                <span>{status?.counts.maybe || 0} maybe</span>
                <span>{status?.counts.notGoing || 0} not going</span>
              </div>
            </section>

            <section className="portal-event-extras">
              <article>
                <Download size={21} />
                <div>
                  <small>Save the date</small>
                  <h2>Add it to your calendar</h2>
                  <p>Drop this event onto your phone calendar so the weekend does not sneak up on you.</p>
                  <a href={googleCalendarUrl(event)} rel="noreferrer" target="_blank">Add to Google Calendar</a>
                </div>
              </article>

              <article>
                <UsersRound size={21} />
                <div>
                  <small>Who's going</small>
                  <h2>Campers planning to attend</h2>
                  <p>Only campers who opted into the camper directory are shown here.</p>
                  <div className="portal-event-going-list">
                    {(status?.goingCampers || []).slice(0, 6).map((camper) => (
                      <span key={`${camper.lotNumber}-${camper.name}`}>
                        Lot {camper.lotNumber || '—'} · {camper.name}
                      </span>
                    ))}
                    {(!status?.goingCampers || status.goingCampers.length === 0) && (
                      <span>No opted-in campers shown yet.</span>
                    )}
                  </div>
                </div>
              </article>
            </section>
          </div>

          <aside className="portal-event-flyer-frame">
            <img src={event.flyer} alt={`${event.title} flyer`} />
          </aside>
        </div>
      </section>
    </main>
  )
}
