'use client'

import { useState } from 'react'
import { LoaderCircle, MessageSquareText, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'

type TargetMode = 'all_opted_in' | 'open_balance' | 'one'

type Template = {
  label: string
  type: string
  message: string
}

const quickTemplates: Template[] = [
  {
    label: 'Storm alert',
    type: 'Weather Alert',
    message: 'Weather is moving into the area. Please secure awnings, outdoor items, and check your campsite.',
  },
  {
    label: 'Bill due',
    type: 'Invoice Reminder',
    message: 'You have a balance due on your Bur Oaks account. Please check your camper portal or contact the office with questions.',
  },
  {
    label: 'Dinner at 6',
    type: 'Event Reminder',
    message: 'Saturday dinner will be ready at 6:00 PM. See you at the clubhouse!',
  },
  {
    label: 'Breakfast ready',
    type: 'General Alert',
    message: 'Breakfast is ready at the clubhouse. Come grab a plate!',
  },
]

export default function AdminQuickText({
  title = 'Quick text alert',
  description = 'Send a fast SMS to opted-in campers.',
  defaultTarget = 'all_opted_in',
  camperId = '',
  defaultMessage = '',
  defaultType = 'General Alert',
  compact = false,
}: {
  title?: string
  description?: string
  defaultTarget?: TargetMode
  camperId?: string
  defaultMessage?: string
  defaultType?: string
  compact?: boolean
}) {
  const [targetMode, setTargetMode] = useState<TargetMode>(camperId ? 'one' : defaultTarget)
  const [reminderType, setReminderType] = useState(defaultType)
  const [message, setMessage] = useState(defaultMessage)
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }

  function useTemplate(template: Template) {
    setReminderType(template.type)
    setMessage(template.message)
  }

  async function sendText() {
    setStatus('')

    if (!message.trim()) {
      setStatus('Type a message first.')
      return
    }

    const finalTarget = camperId ? 'one' : targetMode
    const warning =
      finalTarget === 'open_balance'
        ? 'Send this text to all opted-in campers with open balances?'
        : finalTarget === 'all_opted_in'
          ? 'Send this text to all opted-in campers?'
          : 'Send this text to this camper?'

    if (!window.confirm(warning)) return

    const token = await getToken()
    if (!token) {
      window.location.href = '/login'
      return
    }

    setSending(true)
    setStatus('Sending text…')

    try {
      const response = await fetch('/api/text-alerts', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          targetMode: finalTarget,
          camperId,
          reminderType,
          message,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setStatus(result.error || 'Unable to send text.')
        return
      }

      setStatus(`Sent ${result.sentCount} text(s). ${result.failedCount ? `${result.failedCount} failed.` : ''}`)
    } catch (error: any) {
      setStatus(error.message || 'Unable to send text.')
    } finally {
      setSending(false)
    }
  }

  return (
    <section className={`admin-quick-text ${compact ? 'compact' : ''}`}>
      <div className="admin-quick-text-heading">
        <span><MessageSquareText size={18} /></span>
        <div>
          <small>FAST SMS</small>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>

      <div className="admin-quick-text-templates">
        {quickTemplates.map((template) => (
          <button type="button" key={template.label} onClick={() => useTemplate(template)}>
            {template.label}
          </button>
        ))}
      </div>

      {!camperId && (
        <label>
          <span>Send to</span>
          <select value={targetMode} onChange={(event) => setTargetMode(event.target.value as TargetMode)}>
            <option value="all_opted_in">All opted-in campers</option>
            <option value="open_balance">Campers with open balances</option>
          </select>
        </label>
      )}

      <label>
        <span>Text type</span>
        <select value={reminderType} onChange={(event) => setReminderType(event.target.value)}>
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
        <textarea value={message} onChange={(event) => setMessage(event.target.value)} maxLength={1200} />
      </label>

      <button type="button" onClick={sendText} disabled={sending}>
        {sending ? <LoaderCircle className="admin-spin" size={16} /> : <Send size={16} />}
        {sending ? 'Sending…' : 'Send text'}
      </button>

      {status && <p>{status}</p>}
    </section>
  )
}
