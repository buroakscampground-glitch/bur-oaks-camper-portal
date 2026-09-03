'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, CakeSlice, CalendarDays, CheckCircle2, Clock3, Gift, Heart, PartyPopper, Send, Sparkles, Users } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

type Birthday = {
  camperId: string
  profile: 'primary' | 'secondary'
  name: string
  lotNumber: string | null
  birthdayDate: string
  eventYear: number
  offsetDays: number
  window: 'missed' | 'today' | 'upcoming'
  timingLabel: string
  boardOptIn: boolean
  greetingOptIn: boolean
  sentChannels: string[]
  failedChannels: string[]
  lastSentAt: string | null
  celebrated: boolean
  needsGreeting: boolean
  canSend: boolean
}

type BirthdayOffice = {
  today: string
  birthdays: Birthday[]
  counts: { missed: number; today: number; upcoming: number; needsGreeting: number }
}

const emptyOffice: BirthdayOffice = {
  today: '',
  birthdays: [],
  counts: { missed: 0, today: 0, upcoming: 0, needsGreeting: 0 },
}

function formatBirthday(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year, month - 1, day)))
}

function BirthdayCard({ birthday, sending, onSend }: { birthday: Birthday; sending: boolean; onSend: (birthday: Birthday) => void }) {
  const channelLabel = birthday.sentChannels.map((channel) => channel === 'sms' ? 'text' : channel).join(' + ')

  return (
    <article className={`admin-birthday-card ${birthday.window} ${birthday.needsGreeting ? 'needs-greeting' : ''}`}>
      <div className="admin-birthday-date">
        <small>{new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(new Date(`${birthday.birthdayDate}T12:00:00Z`))}</small>
        <strong>{birthday.birthdayDate.slice(-2).replace(/^0/, '')}</strong>
      </div>
      <div className="admin-birthday-person">
        <span>{birthday.timingLabel}</span>
        <h3>{birthday.name}</h3>
        <p>Lot {birthday.lotNumber || '—'} · {formatBirthday(birthday.birthdayDate)}</p>
        {birthday.celebrated ? (
          <em className="celebrated"><CheckCircle2 size={14} /> Office greeting sent by {channelLabel}</em>
        ) : birthday.failedChannels.length ? (
          <em className="failed"><Clock3 size={14} /> Delivery needs another try</em>
        ) : birthday.greetingOptIn ? (
          <em><Heart size={14} /> Private greetings allowed</em>
        ) : (
          <em className="in-person"><Users size={14} /> No digital greeting consent — celebrate in person</em>
        )}
      </div>
      <div className="admin-birthday-actions">
        <a href={`/admin/campers/${birthday.camperId}`}>Camper record <ArrowRight size={14} /></a>
        {birthday.celebrated ? (
          <span><CheckCircle2 size={16} /> Celebrated</span>
        ) : birthday.canSend ? (
          <button type="button" disabled={sending} onClick={() => onSend(birthday)}>
            <Send size={16} /> {sending ? 'Sending…' : birthday.failedChannels.length ? 'Retry greeting' : 'Send birthday greeting'}
          </button>
        ) : birthday.window === 'upcoming' && birthday.greetingOptIn ? (
          <span className="scheduled"><CalendarDays size={16} /> Scheduled for birthday</span>
        ) : (
          <span className="in-person"><PartyPopper size={16} /> Wish them well in person</span>
        )}
      </div>
    </article>
  )
}

export default function AdminBirthdaysPage() {
  const [office, setOffice] = useState<BirthdayOffice>(emptyOffice)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { loadBirthdays() }, [])

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token || ''}` }
  }

  async function loadBirthdays() {
    setLoading(true)
    const response = await fetch('/api/admin-birthdays', { headers: await authHeaders() })
    const result = await response.json().catch(() => ({}))
    if (response.ok) setOffice(result)
    else setMessage(result.error || 'Unable to load birthdays.')
    setLoading(false)
  }

  async function sendGreeting(birthday: Birthday) {
    if (!confirm(`Send the standard Bur Oaks birthday email/text to ${birthday.name}? The system will use only the channels they opted into and will not send the same greeting twice.`)) return
    const key = `${birthday.camperId}:${birthday.profile}`
    setSending(key)
    setMessage(`Sending birthday cheer to ${birthday.name}…`)
    const response = await fetch('/api/admin-birthdays', {
      method: 'POST',
      headers: { ...(await authHeaders()), 'Content-Type': 'application/json' },
      body: JSON.stringify({ camperId: birthday.camperId, profile: birthday.profile }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(result.error || 'Unable to send the birthday greeting.')
    } else {
      const delivery = result.delivery || {}
      const sent = [delivery.email === 'sent' ? 'email' : '', delivery.sms === 'sent' ? 'text' : ''].filter(Boolean)
      setMessage(sent.length
        ? `🎉 Birthday greeting sent to ${birthday.name} by ${sent.join(' and ')}.`
        : `${birthday.name} had already received the available greeting, or no deliverable opted-in channel is available.`)
      if (result.office) setOffice(result.office)
    }
    setSending('')
  }

  const groups = [
    { key: 'today', eyebrow: 'CELEBRATE TODAY', title: 'Today’s birthdays', note: 'These should feel special today.', icon: PartyPopper },
    { key: 'missed', eyebrow: 'CATCH UP', title: 'Recently missed', note: 'The last 30 days, so nobody quietly slips through.', icon: Clock3 },
    { key: 'upcoming', eyebrow: 'PLAN AHEAD', title: 'Coming up', note: 'The next 45 days—plenty of time for a card, post, or campground surprise.', icon: CalendarDays },
  ] as const

  return (
    <main className="admin-birthdays-page">
      <section className="admin-birthdays-hero">
        <div className="admin-birthday-confetti" aria-hidden="true"><i /><i /><i /><i /><i /><i /></div>
        <span className="admin-birthdays-hero-icon"><CakeSlice size={31} /></span>
        <div>
          <small>BUR OAKS BIRTHDAY OFFICE</small>
          <h1>Make a big deal about every birthday.</h1>
          <p>See who was recently missed, who is celebrating today, and who is coming up. Send the approved Bur Oaks greeting without accidentally sending it twice.</p>
        </div>
        <Gift size={42} />
      </section>

      <section className="admin-birthday-stats" aria-label="Birthday summary">
        <article className={office.counts.needsGreeting ? 'attention' : ''}><span><Heart size={20} /></span><div><small>NEED A GREETING</small><strong>{office.counts.needsGreeting}</strong></div></article>
        <article><span><PartyPopper size={20} /></span><div><small>TODAY</small><strong>{office.counts.today}</strong></div></article>
        <article><span><Clock3 size={20} /></span><div><small>RECENTLY MISSED</small><strong>{office.counts.missed}</strong></div></article>
        <article><span><CalendarDays size={20} /></span><div><small>COMING UP</small><strong>{office.counts.upcoming}</strong></div></article>
      </section>

      {message && <p className="admin-birthday-message" role="status">{message}</p>}

      {loading ? (
        <div className="admin-birthday-loading"><Sparkles size={25} /> Gathering the birthday calendar…</div>
      ) : (
        groups.map((group) => {
          const Icon = group.icon
          const birthdays = office.birthdays.filter((birthday) => birthday.window === group.key)
          return (
            <section className={`admin-birthday-section ${group.key}`} key={group.key}>
              <header>
                <span><Icon size={21} /></span>
                <div><small>{group.eyebrow}</small><h2>{group.title}</h2><p>{group.note}</p></div>
                <strong>{birthdays.length}</strong>
              </header>
              {birthdays.length ? (
                <div className="admin-birthday-list">
                  {birthdays.map((birthday) => (
                    <BirthdayCard
                      birthday={birthday}
                      sending={sending === `${birthday.camperId}:${birthday.profile}`}
                      onSend={sendGreeting}
                      key={`${birthday.camperId}:${birthday.profile}:${birthday.eventYear}`}
                    />
                  ))}
                </div>
              ) : (
                <div className="admin-birthday-empty"><CheckCircle2 size={22} /> No birthdays in this group.</div>
              )}
            </section>
          )
        })
      )}
    </main>
  )
}
