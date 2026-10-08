'use client'

import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Link2, LoaderCircle, MessageSquareText, Send, UsersRound } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { camperTextWithLink, portalPathForTextAlert } from '../lib/portal-sms-links'
import { reviewSmsLinks } from '../lib/sms-link-review'

type TargetMode = 'all_opted_in' | 'open_balance' | 'one'

type Template = {
  label: string
  type: string
  message: string
}

type RecipientPreview = {
  matchedCamperCount: number
  recipientCount: number
  duplicateRecipientCount: number
}

const quickTemplates: Template[] = [
  {
    label: 'Power outage',
    type: 'Emergency Alert',
    message: 'POWER OUTAGE: Bur Oaks is currently without power. We are monitoring the situation and will send another alert when service is restored.',
  },
  {
    label: 'Power restored',
    type: 'General Alert',
    message: 'POWER RESTORED: Electrical service has been restored at Bur Oaks. Please contact the office if your site is still without power.',
  },
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
  billDueMessage = '',
  defaultType = 'General Alert',
  compact = false,
}: {
  title?: string
  description?: string
  defaultTarget?: TargetMode
  camperId?: string
  defaultMessage?: string
  billDueMessage?: string
  defaultType?: string
  compact?: boolean
}) {
  const [targetMode, setTargetMode] = useState<TargetMode>(camperId ? 'one' : defaultTarget)
  const [reminderType, setReminderType] = useState(defaultType)
  const [message, setMessage] = useState(defaultMessage)
  const [status, setStatus] = useState('')
  const [sending, setSending] = useState(false)
  const [recipientPreview, setRecipientPreview] = useState<RecipientPreview | null>(null)
  const [previewLoading, setPreviewLoading] = useState(true)
  const [previewError, setPreviewError] = useState('')
  const sendingRef = useRef(false)
  const requestIdRef = useRef('')

  useEffect(() => {
    setMessage(defaultMessage)
    requestIdRef.current = ''
  }, [camperId, defaultMessage])

  useEffect(() => {
    setReminderType(defaultType)
    requestIdRef.current = ''
  }, [camperId, defaultType])

  useEffect(() => {
    let current = true
    const controller = new AbortController()

    async function loadRecipientPreview() {
      setPreviewLoading(true)
      setPreviewError('')
      setRecipientPreview(null)
      try {
        const { data } = await supabase.auth.getSession()
        const token = data.session?.access_token || ''
        if (!token) throw new Error('Sign in again to verify recipients.')

        const params = new URLSearchParams({
          preview: 'recipients',
          targetMode: camperId ? 'one' : targetMode,
          reminderType,
        })
        if (camperId) params.set('camperId', camperId)
        const response = await fetch(`/api/text-alerts?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
          signal: controller.signal,
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(result.error || 'Recipients could not be verified.')
        if (current) setRecipientPreview({
          matchedCamperCount: Number(result.matchedCamperCount || 0),
          recipientCount: Number(result.recipientCount || 0),
          duplicateRecipientCount: Number(result.duplicateRecipientCount || 0),
        })
      } catch (error: any) {
        if (current && error?.name !== 'AbortError') setPreviewError(error?.message || 'Recipients could not be verified.')
      } finally {
        if (current) setPreviewLoading(false)
      }
    }

    void loadRecipientPreview()
    return () => {
      current = false
      controller.abort()
    }
  }, [camperId, targetMode, reminderType])

  async function getToken() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token || ''
  }

  function useTemplate(template: Template) {
    requestIdRef.current = ''
    setReminderType(template.type)
    setMessage(template.label === 'Bill due' && billDueMessage.trim() ? billDueMessage : template.message)
  }

  async function sendText() {
    if (sendingRef.current) return
    setStatus('')

    if (!message.trim()) {
      setStatus('Type a message first.')
      return
    }

    const linkReview = reviewSmsLinks(message)
    if (linkReview.blockedLinks.length) {
      setStatus('Remove insecure, shortened, or credential-bearing links before sending.')
      return
    }

    if (!recipientPreview || previewLoading || previewError) {
      setStatus('Wait until the exact recipient list is verified before sending.')
      return
    }

    if (recipientPreview.recipientCount === 0) {
      setStatus('No opted-in phone numbers match this text.')
      return
    }

    const finalTarget = camperId ? 'one' : targetMode
    const warning = `Send this text to exactly ${recipientPreview.recipientCount} unique opted-in phone${recipientPreview.recipientCount === 1 ? '' : 's'}${linkReview.externalLinks.length ? `? It contains ${linkReview.externalLinks.length} external link${linkReview.externalLinks.length === 1 ? '' : 's'} that you should have opened and verified` : ''}?`

    if (!window.confirm(warning)) return

    const token = await getToken()
    if (!token) {
      window.location.href = '/login'
      return
    }

    sendingRef.current = true
    setSending(true)
    setStatus('Sending text…')
    requestIdRef.current ||= crypto.randomUUID()

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
          requestId: requestIdRef.current,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setStatus(result.error || 'Unable to send text.')
        return
      }

      if (result.duplicateRequest) {
        setStatus('This campaign was already submitted, so no duplicate texts were sent.')
        return
      }
      setStatus(`Sent ${result.sentCount} unique phone${result.sentCount === 1 ? '' : 's'}. ${result.duplicateRecipientCount ? `${result.duplicateRecipientCount} duplicate profile entr${result.duplicateRecipientCount === 1 ? 'y' : 'ies'} skipped. ` : ''}${result.failedCount ? `${result.failedCount} failed.` : ''}`)
      requestIdRef.current = ''
    } catch (error: any) {
      setStatus(error.message || 'Unable to send text.')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  const linkReview = reviewSmsLinks(message)
  const finalPreview = camperTextWithLink({
    message: message.trim() || 'Your message will appear here.',
    path: portalPathForTextAlert(reminderType, message),
    compact: true,
  })
  const sendBlocked = sending || previewLoading || Boolean(previewError) || !recipientPreview?.recipientCount || Boolean(linkReview.blockedLinks.length) || !message.trim()

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
          <select value={targetMode} onChange={(event) => { requestIdRef.current = ''; setTargetMode(event.target.value as TargetMode) }}>
            <option value="all_opted_in">All opted-in campers</option>
            <option value="open_balance">Campers with open balances</option>
          </select>
        </label>
      )}

      <label>
        <span>Text type</span>
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
        <textarea value={message} onChange={(event) => { requestIdRef.current = ''; setMessage(event.target.value) }} maxLength={1200} />
      </label>

      <div className={`admin-quick-text-review ${previewError || linkReview.blockedLinks.length ? 'blocked' : 'ready'}`} aria-live="polite">
        <div>
          {previewLoading ? <LoaderCircle className="admin-spin" size={18} /> : previewError || linkReview.blockedLinks.length ? <AlertTriangle size={18} /> : <UsersRound size={18} />}
          <span>
            <small>EXACT RECIPIENT PREVIEW</small>
            <strong>{previewLoading ? 'Verifying opted-in phones…' : previewError ? 'Recipient verification unavailable' : `${recipientPreview?.recipientCount || 0} unique phone${recipientPreview?.recipientCount === 1 ? '' : 's'}`}</strong>
            {!previewLoading && !previewError && recipientPreview && <em>{recipientPreview.matchedCamperCount} matching camper account{recipientPreview.matchedCamperCount === 1 ? '' : 's'}{recipientPreview.duplicateRecipientCount ? ` · ${recipientPreview.duplicateRecipientCount} duplicate phone entr${recipientPreview.duplicateRecipientCount === 1 ? 'y' : 'ies'} removed` : ''}</em>}
            {previewError && <em>{previewError} Sending is blocked.</em>}
          </span>
        </div>
        <div>
          <MessageSquareText size={18} />
          <span><small>FINAL PHONE PREVIEW</small><p>{finalPreview}</p></span>
        </div>
        <div>
          {linkReview.blockedLinks.length ? <AlertTriangle size={18} /> : linkReview.externalLinks.length ? <Link2 size={18} /> : <CheckCircle2 size={18} />}
          <span>
            <small>LINK CHECK</small>
            <strong>{linkReview.blockedLinks.length ? 'Unsafe link blocked' : linkReview.externalLinks.length ? `${linkReview.externalLinks.length} external HTTPS link${linkReview.externalLinks.length === 1 ? '' : 's'} — verify before sending` : linkReview.officialLinks.length ? 'Bur Oaks link verified' : 'Secure Bur Oaks portal link added automatically'}</strong>
            {linkReview.blockedLinks.length > 0 && <em>Remove HTTP, shortened, or credential-bearing links.</em>}
          </span>
        </div>
      </div>

      <button type="button" onClick={sendText} disabled={sendBlocked}>
        {sending ? <LoaderCircle className="admin-spin" size={16} /> : <Send size={16} />}
        {sending ? 'Sending…' : recipientPreview?.recipientCount ? `Review & send to ${recipientPreview.recipientCount}` : 'Send unavailable'}
      </button>

      {status && <p role="status">{status}</p>}
    </section>
  )
}
