'use client'

import { CalendarDays, Sparkles } from 'lucide-react'
import { eventFlyers2026 } from '../lib/event-flyers'

type EventFlyerShowcaseProps = {
  context?: 'public' | 'portal'
  limit?: number
  showPast?: boolean
}

function startOfToday() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return today
}

function eventTime(value: string) {
  return new Date(`${value}T23:59:59`).getTime()
}

export default function EventFlyerShowcase({
  context = 'public',
  limit,
  showPast = false,
}: EventFlyerShowcaseProps) {
  const today = startOfToday().getTime()
  const upcoming = eventFlyers2026
    .filter((event) => eventTime(event.endDate || event.date) >= today)
    .sort((a, b) => eventTime(a.date) - eventTime(b.date))
  const past = eventFlyers2026
    .filter((event) => eventTime(event.endDate || event.date) < today)
    .sort((a, b) => eventTime(b.date) - eventTime(a.date))

  const visibleEvents = [
    ...upcoming,
    ...(showPast ? past : []),
  ].slice(0, limit || undefined)
  const nextEvent = upcoming[0]

  if (visibleEvents.length === 0) {
    return null
  }

  return (
    <section className={`event-flyer-showcase ${context}`}>
      <div className="event-flyer-heading">
        <div>
          <span><Sparkles size={15} /> 2026 event flyers</span>
          <h2>{nextEvent ? `Next up: ${nextEvent.title}` : 'Bur Oaks event season'}</h2>
          <p>
            Flyers are sorted by date automatically. Once an event is over, the next upcoming flyer moves to the front.
          </p>
        </div>
        {nextEvent && (
          <a href="/events">
            <CalendarDays size={16} /> {nextEvent.displayDate}
          </a>
        )}
      </div>

      <div className="event-flyer-grid">
        {visibleEvents.map((event, index) => (
          <a
            className="event-flyer-link"
            href={context === 'portal' ? `/portal/events/${event.slug}` : '/events'}
            key={event.slug}
          >
            <article className={index === 0 ? 'featured' : ''}>
              <img src={event.flyer} alt={`${event.title} flyer`} loading={index < 2 ? 'eager' : 'lazy'} />
              <div>
                <span>{index === 0 && nextEvent?.slug === event.slug ? 'NEXT EVENT' : event.displayDate}</span>
                <h3>{event.title}</h3>
                {event.time && <small>{event.time}</small>}
                <p>{event.description}</p>
              </div>
            </article>
          </a>
        ))}
      </div>
    </section>
  )
}
