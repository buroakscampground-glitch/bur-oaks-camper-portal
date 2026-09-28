'use client'

import { useEffect, useRef, useState } from 'react'
import { CheckCircle2, LoaderCircle, MessageSquareText, Send, ShieldCheck, UsersRound } from 'lucide-react'
import { camperTextWithLink, portalPathForTextAlert } from '../../../lib/portal-sms-links'
import { supabase } from '../../../lib/supabase'

const coordinatorTypes = [
  'Event Reminder',
  'Saturday Dinner Reminder',
  'Thanksgiving Signup',
  'Community Update',
]

const suggestedMessages: Record<string, string> = {
  'Event Reminder': 'A new Bur Oaks event is coming up. Open the calendar for details and RSVP.',
  'Saturday Dinner Reminder': 'Saturday dinner is coming up. Please RSVP and tell us what you are bringing.',
  'Thanksgiving Signup': 'Bur Oaks Thanksgiving is Nov 7 at 6 PM. Please RSVP and claim one food item.',
  'Community Update': 'There is a new Bur Oaks Community update. Tap below to read it.',
}

function formatDateTime(value?: string) {
  if (!value) return '—'
  return new Date(value).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

export default function CommunityTextsPage() {
  const [reminderType, setReminderType] = useState('Event Reminder')
  const [message, setMessage] = useState(suggestedMessages['Event Reminder'])
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)
  const [twilioConfigured, setTwilioConfigured] = useState(false)
  const [recentBroadcasts, setRecentBroadcasts] = useState<any[]>([])
  const requestIdRef = useRef('')
  const sendingRef = useRef(false)

  async function authToken(forceRefresh = false) {
    const { data } = forceRefresh
      ? await supabase.auth.refreshSession()
      : await supabase.auth.getSession()
    return data.session?.access_token || ''
  }

  async function textServiceFetch(init?: RequestInit) {
    let token = await authToken()
    if (!token) return null

    let response = await fetch('/api/text-alerts', {
      ...init,
      headers: { ...init?.headers, Authorization: `Bearer ${token}` },
    })

    if (response.status === 401) {
      token = await authToken(true)
      if (!token) return response
      response = await fetch('/api/text-alerts', {
        ...init,
        headers: { ...init?.headers, Authorization: `Bearer ${token}` },
      })
    }

    return response
  }

  async function loadData() {
    const response = await textServiceFetch()
    if (!response) {
      window.location.href = '/login'
      return
    }
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setStatus(result.error || 'Unable to load Event Texts.')
      return
    }
    setTwilioConfigured(Boolean(result.twilioConfigured))
    setRecentBroadcasts(result.recentBroadcasts || [])
  }

  useEffect(() => {
    loadData()
  }, [])

  function changeType(value: string) {
    setReminderType(value)
    setMessage(suggestedMessages[value] || '')
    setStatus('')
    requestIdRef.current = ''
  }

  async function sendText() {
    if (sendingRef.current || !message.trim()) return
    if (!window.confirm('Send this event text to every opted-in camper phone number?')) return

    sendingRef.current = true
    setSending(true)
    setStatus('Sending the event text…')
    requestIdRef.current ||= crypto.randomUUID()
    try {
      const response = await textServiceFetch({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetMode: 'all_opted_in',
          reminderType,
          message: message.trim(),
          requestId: requestIdRef.current,
        }),
      })
      if (!response) {
        window.location.href = '/login'
        return
      }
      const result = await response.json().catch(() => ({}))
      if (!response.ok) {
        setStatus(result.error || 'Unable to send this event text.')
        return
      }
      setStatus(result.duplicateRequest
        ? 'This exact campaign was already submitted, so no duplicate texts were sent.'
        : `Twilio accepted ${result.sentCount || 0} phone${Number(result.sentCount || 0) === 1 ? '' : 's'}${result.failedCount ? `; ${result.failedCount} failed.` : '.'}`)
      requestIdRef.current = ''
      await loadData()
    } catch (error: any) {
      setStatus(error?.message || 'Unable to send this event text.')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const preview = camperTextWithLink({
    message: message || 'Your event message will appear here.',
    path: portalPathForTextAlert(reminderType, message),
    compact: true,
  })

  return (
    <main className="admin-texts-page community-event-texts">
      <section className="admin-texts-hero">
        <div><span><MessageSquareText size={24} /></span><div><small>EVENT COORDINATOR</small><h1>Event Texts</h1><p>Send a short, useful reminder with a link that opens the exact camper area.</p></div></div>
        <aside className={twilioConfigured ? 'ready' : 'action'}>{twilioConfigured ? <CheckCircle2 size={18} /> : <MessageSquareText size={18} />}{twilioConfigured ? 'Text service ready' : 'Text service unavailable'}</aside>
      </section>

      <section className="community-access-note"><ShieldCheck size={22} /><div><strong>Community-only text access</strong><p>You can send event, Saturday dinner, Thanksgiving, and Campground Messenger updates. Billing, finance, maintenance, and emergency alerts remain with full admins.</p></div></section>

      <section className="admin-texts-grid">
        <article className="admin-texts-card">
          <div className="admin-texts-section-heading"><small>COMPOSE</small><h2>New camper reminder</h2></div>
          <div className="admin-texts-recipient ready"><UsersRound size={16} /><span>All campers who opted in to text alerts</span></div>
          <label><span>Type</span><select value={reminderType} onChange={(event) => changeType(event.target.value)}>{coordinatorTypes.map((type) => <option key={type}>{type}</option>)}</select></label>
          <label><span>Message</span><textarea value={message} maxLength={1200} onChange={(event) => { setMessage(event.target.value); requestIdRef.current = '' }} /></label>
          <div className="admin-texts-preview"><small>TEXT PREVIEW</small><p>{preview}</p><em>The link shown here is the same link campers receive.</em></div>
          <button type="button" onClick={sendText} disabled={sending || !twilioConfigured || !message.trim()}>{sending ? <LoaderCircle className="admin-spin" size={17} /> : <Send size={17} />}{sending ? 'Sending…' : 'Send Event Text'}</button>
          {status && <p className="admin-texts-status" role="status">{status}</p>}
        </article>

        <article className="admin-texts-card">
          <div className="admin-texts-section-heading"><small>RECENT COMMUNITY CAMPAIGNS</small><h2>What was sent</h2></div>
          <div className="admin-texts-send-results">
            {recentBroadcasts.map((broadcast) => (
              <article key={broadcast.id}><strong>{broadcast.reminder_type}</strong><span className={broadcast.failed_count ? 'blocked' : 'ready'}>{broadcast.sent_count || 0} accepted</span><small>{formatDateTime(broadcast.created_at)}</small><p>{broadcast.message}</p></article>
            ))}
            {!recentBroadcasts.length && <p>No Event Coordinator texts have been sent yet.</p>}
          </div>
        </article>
      </section>
    </main>
  )
}
