'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, LoaderCircle, MessageSquareText, Phone, Search, Send, UsersRound } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { isOperationalCamper } from '../../../lib/camper-records'
import { camperTextWithLink, portalPathForTextType } from '../../../lib/portal-sms-links'
import { maskSmsPhone } from '../../../lib/sms-broadcast'

type TargetMode = 'all_opted_in' | 'open_balance' | 'one'

function formatDateTime(value?: string) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function camperLabel(camper: any) {
  return `Lot ${camper.lot_number || '—'} - ${camper.first_name || ''} ${camper.last_name || ''}`.trim()
}

export default function AdminTextsPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [targetMode, setTargetMode] = useState<TargetMode>('all_opted_in')
  const [selectedCamper, setSelectedCamper] = useState('')
  const [reminderType, setReminderType] = useState('General Alert')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')
  const [searchText, setSearchText] = useState('')
  const [sending, setSending] = useState(false)
  const [twilioConfigured, setTwilioConfigured] = useState(false)
  const [sendResults, setSendResults] = useState<any[]>([])
  const sendingRef = useRef(false)
  const requestIdRef = useRef('')

  useEffect(() => {
    loadData()
  }, [])

  async function authToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }

  async function loadData() {
    const token = await authToken()

    const [camperResult, alertResult, configResponse] = await Promise.all([
      supabase.from('campers').select('*').eq('active', true).order('lot_number', { ascending: true }),
      supabase
        .from('text_reminders')
        .select('*, campers(first_name,last_name,lot_number)')
        .order('sent_at', { ascending: false })
        .limit(100),
      token
        ? fetch('/api/text-alerts', { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
        : Promise.resolve(null),
    ])

    setCampers((camperResult.data || []).filter(isOperationalCamper))
    setAlerts(alertResult.data || [])

    if (configResponse?.ok) {
      const config = await configResponse.json()
      setTwilioConfigured(Boolean(config.twilioConfigured))
    }
  }

  async function sendAlert() {
    if (sendingRef.current) return
    setStatus('')
    setSendResults([])

    if (!message.trim()) {
      setStatus('Please type a message first.')
      return
    }

    if (targetMode === 'one' && !selectedCamper) {
      setStatus('Choose a camper first.')
      return
    }

    const warning =
      targetMode === 'all_opted_in'
        ? 'Send this text to every valid phone number saved on each opted-in camper profile?'
        : targetMode === 'open_balance'
          ? 'Send this text to every saved phone number for opted-in campers who currently have an open balance?'
          : 'Send this text to every saved phone number on the selected camper profile?'

    if (!window.confirm(warning)) return

    const token = await authToken()
    if (!token) {
      window.location.href = '/login'
      return
    }

    sendingRef.current = true
    setSending(true)
    setStatus('Sending text alert…')
    requestIdRef.current ||= crypto.randomUUID()

    try {
      const response = await fetch('/api/text-alerts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetMode,
          camperId: selectedCamper,
          reminderType,
          message,
          requestId: requestIdRef.current,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setStatus(result.error || 'Unable to send text alert.')
        return
      }

      setSendResults(result.results || [])
      if (result.duplicateRequest) {
        setStatus('This campaign was already submitted, so no duplicate texts were sent.')
        return
      }
      setStatus(
        `Twilio accepted ${result.sentCount} unique phone${result.sentCount === 1 ? '' : 's'}. ${result.duplicateRecipientCount ? `${result.duplicateRecipientCount} duplicate profile entr${result.duplicateRecipientCount === 1 ? 'y was' : 'ies were'} skipped. ` : ''}${result.failedCount ? `${result.failedCount} failed.` : 'If a phone does not receive it, check Twilio message logs / carrier delivery.'}`
      )
      setMessage('')
      requestIdRef.current = ''
      await loadData()
    } catch (error: any) {
      setStatus(error.message || 'Unable to send text alert.')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const optedInCampers = campers.filter((camper) => camper.sms_opt_in && camper.phone)
  const filteredCampers = useMemo(() => {
    const term = searchText.trim().toLowerCase()
    if (!term) return campers

    return campers.filter((camper) =>
      [
        camper.first_name,
        camper.last_name,
        camper.lot_number,
        camper.phone,
        camper.email,
      ]
        .join(' ')
        .toLowerCase()
        .includes(term)
    )
  }, [campers, searchText])

  const selectedCamperRecord = campers.find((camper) => camper.id === selectedCamper)
  const textPreview = camperTextWithLink({
    message: message || 'Your message will appear here.',
    path: portalPathForTextType(reminderType),
    compact: true,
  })

  return (
    <main className="admin-texts-page">
      <section className="admin-texts-hero">
        <div>
          <span><MessageSquareText size={24} /></span>
          <div>
            <small>TEXT ALERT CENTER</small>
            <h1>Send camper SMS alerts</h1>
            <p>Send bill reminders, weather alerts, announcements, and event updates to campers who opted in.</p>
          </div>
        </div>
        <aside className={twilioConfigured ? 'ready' : 'action'}>
          {twilioConfigured ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          {twilioConfigured ? 'Twilio connected' : 'Twilio keys needed in Vercel'}
        </aside>
      </section>

      <section className="admin-texts-stats" aria-label="Text message readiness">
        <article>
          <span><UsersRound size={20} /></span>
          <div><small>Active campers</small><strong>{campers.length}</strong></div>
        </article>
        <article>
          <span><Phone size={20} /></span>
          <div><small>Opted in with phone</small><strong>{optedInCampers.length}</strong></div>
        </article>
        <article>
          <span><MessageSquareText size={20} /></span>
          <div><small>Recent text logs</small><strong>{alerts.length}</strong></div>
        </article>
      </section>

      <section className="admin-texts-grid">
        <article className="admin-texts-card">
          <div className="admin-texts-section-heading">
            <small>COMPOSE</small>
            <h2>New text alert</h2>
          </div>

          <label>
            <span>Who should receive it?</span>
          <select value={targetMode} onChange={(event) => { requestIdRef.current = ''; setTargetMode(event.target.value as TargetMode) }}>
              <option value="all_opted_in">All opted-in campers</option>
              <option value="open_balance">Only campers with open balances</option>
              <option value="one">One selected camper</option>
            </select>
          </label>

          {targetMode === 'one' && (
            <label>
              <span>Select camper</span>
              <select value={selectedCamper} onChange={(event) => { requestIdRef.current = ''; setSelectedCamper(event.target.value) }}>
                <option value="">Choose camper…</option>
                {campers.map((camper) => (
                  <option key={camper.id} value={camper.id}>
                    {camperLabel(camper)} {camper.sms_opt_in ? '' : '(not opted in)'}
                  </option>
                ))}
              </select>
            </label>
          )}

          {selectedCamperRecord && targetMode === 'one' && (
            <div className={`admin-texts-recipient ${selectedCamperRecord.sms_opt_in && selectedCamperRecord.phone ? 'ready' : 'blocked'}`}>
              <Phone size={16} />
              <span>
                {selectedCamperRecord.phone || 'No phone saved'} · {selectedCamperRecord.sms_opt_in ? 'Opted in' : 'Not opted in'}
              </span>
            </div>
          )}

          <label>
            <span>Type</span>
            <select value={reminderType} onChange={(event) => { requestIdRef.current = ''; setReminderType(event.target.value) }}>
              <option>General Alert</option>
              <option>Invoice Reminder</option>
              <option>Electric Reminder</option>
              <option>Event Reminder</option>
              <option>Emergency Alert</option>
              <option>Gate Alert</option>
              <option>Weather Alert</option>
            </select>
          </label>

          <label>
            <span>Message</span>
            <textarea
              placeholder="Example: Your electric bill is due Friday. Please log into your camper portal or contact the office with questions."
              value={message}
              maxLength={1200}
              onChange={(event) => { requestIdRef.current = ''; setMessage(event.target.value) }}
            />
          </label>

          <div className="admin-texts-preview">
            <small>TEXT PREVIEW</small>
            <p>{textPreview}</p>
            <em>The delivered text is limited to one standard SMS segment. Put full details in the portal.</em>
          </div>

          <button type="button" onClick={sendAlert} disabled={sending || !twilioConfigured}>
            {sending ? <LoaderCircle className="admin-spin" size={17} /> : <Send size={17} />}
            {sending ? 'Sending…' : 'Send Text Alert'}
          </button>

          {!twilioConfigured && (
            <p className="admin-texts-warning">Add the three Twilio environment variables in Vercel before texts can send.</p>
          )}
          {status && <p className="admin-texts-status">{status}</p>}
          {sendResults.length > 0 && (
            <div className="admin-texts-send-results">
              {sendResults.map((result) => (
                <article key={`${result.camperId}-${result.phone || result.status}`}>
                  <strong>Lot {result.lotNumber || '—'} · {result.camperName}</strong>
                  <span className={result.status === 'sent' ? 'ready' : 'blocked'}>{result.status}</span>
                  <small>{result.phone || 'No phone used'}</small>
                  {result.providerMessageId && <em>Twilio ID: {result.providerMessageId}</em>}
                  {result.error && <p>{result.error}</p>}
                </article>
              ))}
            </div>
          )}
        </article>

        <article className="admin-texts-card">
          <div className="admin-texts-section-heading">
            <small>READINESS</small>
            <h2>Camper opt-ins</h2>
          </div>

          <label className="admin-texts-search">
            <Search size={16} />
            <input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="Search name, lot, phone…"
            />
          </label>

          <div className="admin-texts-camper-list">
            {filteredCampers.map((camper) => (
              <div key={camper.id}>
                <span>{camper.first_name?.[0] || '?'}{camper.last_name?.[0] || ''}</span>
                <p><strong>{camperLabel(camper)}</strong><small>{camper.phone || 'No phone on file'}</small></p>
                <em className={camper.sms_opt_in && camper.phone ? 'ready' : 'blocked'}>
                  {camper.sms_opt_in && camper.phone ? 'Ready' : 'Needs opt-in'}
                </em>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="admin-texts-card history">
        <div className="admin-texts-section-heading">
          <small>HISTORY</small>
          <h2>Recent text alerts</h2>
        </div>

        {alerts.length === 0 ? (
          <p className="admin-texts-empty">No text alerts have been sent yet.</p>
        ) : (
          <div className="admin-texts-history-list">
            {alerts.map((alert) => (
              <article key={alert.id}>
                <div>
                  <small>{formatDateTime(alert.sent_at)} · {alert.reminder_type}</small>
                  <h3>{alert.campers ? camperLabel(alert.campers) : 'Unknown camper'}</h3>
                  {alert.recipient_phone && <small>Delivered to {maskSmsPhone(alert.recipient_phone)}</small>}
                  <p>{alert.message}</p>
                </div>
                <span className={alert.status === 'sent' ? 'ready' : alert.status === 'failed' ? 'blocked' : ''}>
                  {alert.status}
                </span>
                {alert.error_message && <em>{alert.error_message}</em>}
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  )
}
