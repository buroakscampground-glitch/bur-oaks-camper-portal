'use client'

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { ArrowLeft, Bell, CheckCircle2, MessageCircle, Send, ShieldCheck, Trash2 } from 'lucide-react'
import { getCurrentCamper, supabase } from '../../lib/supabase'

function formatMessageTime(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function CamperMessagesPage() {
  const [camper, setCamper] = useState<any>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const [loadError, setLoadError] = useState('')
  const sendingRef = useRef(false)

  useEffect(() => {
    loadMessages()
  }, [])

  async function authHeaders(): Promise<Record<string, string>> {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }

  async function loadMessages() {
    setLoading(true)
    setLoadError('')
    try {
      const camperData = await getCurrentCamper()

      if (!camperData) {
        window.location.href = '/login'
        return
      }

      setCamper(camperData)

      const response = await fetch('/api/messages', {
        headers: await authHeaders(),
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) throw new Error(result.error || 'Unable to open messages.')
      setMessages(result.messages || [])
      setNotice('')
    } catch (error) {
      console.error('Unable to open camper messages:', error)
      setLoadError('We could not open your conversation. No message was sent or changed.')
    } finally {
      setLoading(false)
    }
  }

  async function sendMessage(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault()
    if (sendingRef.current) return

    const text = draft.trim()
    if (!text) return

    sendingRef.current = true
    setSending(true)
    setNotice('')

    try {
      const response = await fetch('/api/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(await authHeaders()),
        },
        body: JSON.stringify({ message: text }),
      })
      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        setNotice(result.error || 'Unable to send message. Your draft is still here.')
      } else {
        setDraft('')
        setMessages((current) => [...current, result.message])
        if (result.emailStatus === 'failed') setNotice(`Message saved, but the office email alert failed: ${result.emailMessage || 'unknown error'}. The office can still see it in the portal.`)
        else if (result.emailStatus === 'skipped') setNotice(`Message saved in the portal. Office email alert skipped: ${result.emailMessage || 'not configured'}`)
        else setNotice('Message sent to the office.')
      }
    } catch {
      setNotice('We could not confirm whether the message was sent. Your draft is still here—check the conversation before trying again.')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  function submitWithKeyboard(event: KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.ctrlKey || event.metaKey) && (event.key === 'Enter' || event.key === 'NumpadEnter')) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }

  async function clearMessages(mode: 'read' | 'all') {
    const readMessageIds = messages
      .filter((message) => message.sender_role === 'camper' || message.read_by_camper_at)
      .map((message) => message.id)

    const idsToClear = mode === 'all' ? messages.map((message) => message.id) : readMessageIds

    if (idsToClear.length === 0) {
      setNotice('No read messages to clear yet.')
      return
    }

    const confirmed = window.confirm(
      mode === 'all'
        ? 'Clear this whole conversation from your portal view? The office will still keep its record.'
        : 'Clear read messages from your portal view? The office will still keep its record.'
    )

    if (!confirmed) return

    setNotice('')

    const response = await fetch('/api/messages', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaders()),
      },
      body: JSON.stringify(mode === 'all' ? { archiveAll: true } : { messageIds: idsToClear }),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setNotice(result.error || 'Unable to clear messages.')
      return
    }

    setMessages((current) =>
      mode === 'all'
        ? []
        : current.filter((message) => !idsToClear.includes(message.id))
    )
    setNotice(mode === 'all' ? 'Conversation cleared from your portal view.' : 'Read messages cleared from your portal view.')
  }

  return (
    <main className="office-inbox-page">
      <section className="office-inbox-hero camper">
        <a href="/portal"><ArrowLeft size={17} /> Back to portal</a>
        <div>
          <span><MessageCircle size={16} /> CHAT WITH THE OFFICE</span>
          <h1>Chat with the Bur Oaks office.</h1>
          <p>Ask a question, send a note, or follow up without hunting for a phone number. The office gets an email alert when you send a message.</p>
        </div>
      </section>

      <section className="office-inbox-shell">
        <aside className="office-inbox-side">
          <div className="office-inbox-card">
            <ShieldCheck size={22} />
            <h2>Private to your site</h2>
            <p>This conversation is only visible to your camper account and Bur Oaks admins.</p>
          </div>
          <div className="office-inbox-card soft">
            <Bell size={22} />
            <h2>Email alerts</h2>
            <p>When the office replies, you’ll get an email alert if an email is on file.</p>
          </div>
        </aside>

        <section className="office-inbox-thread">
          <div className="office-inbox-thread-header">
            <div>
              <small>Lot {camper?.lot_number || '—'}</small>
              <h2>{camper?.first_name || 'Camper'} {camper?.last_name || ''}</h2>
            </div>
            <div className="office-inbox-thread-actions">
              <span><CheckCircle2 size={16} /> Secure portal messages</span>
              <button type="button" onClick={() => clearMessages('read')} disabled={loading || messages.length === 0}>
                <Trash2 size={14} /> Clear read
              </button>
              <button type="button" onClick={() => clearMessages('all')} disabled={loading || messages.length === 0}>
                Clear all
              </button>
            </div>
          </div>

          <div className="office-message-list">
            {loading ? (
              <p className="office-message-empty">Opening messages…</p>
            ) : loadError ? (
              <div className="office-message-empty" role="alert">
                <p>{loadError}</p>
                <button className="portal-loading-retry" type="button" onClick={loadMessages}>Try again</button>
              </div>
            ) : messages.length === 0 ? (
              <p className="office-message-empty">No messages yet. Send the first note to the office.</p>
            ) : (
              messages.map((message) => (
                <article className={`office-message-bubble ${message.sender_role === 'camper' ? 'mine' : 'office'}`} key={message.id}>
                  <small>{message.sender_name || (message.sender_role === 'admin' ? 'Bur Oaks Office' : 'You')} · {formatMessageTime(message.created_at)}</small>
                  <p>{message.body}</p>
                </article>
              ))
            )}
          </div>

          <form className="office-message-compose" onSubmit={sendMessage} aria-label="Send a message to the Bur Oaks office">
            <textarea
              name="message"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={submitWithKeyboard}
              placeholder="Type your message to the office…"
              aria-label="Message to the office"
              aria-describedby="camper-message-help"
              maxLength={1200}
              rows={4}
              required
              disabled={Boolean(loadError)}
            />
            <button type="submit" disabled={sending || !draft.trim() || Boolean(loadError)}>
              <Send size={16} /> {sending ? 'Sending…' : 'Send message'}
            </button>
            <small className="office-message-compose-help" id="camper-message-help">
              {draft.length.toLocaleString()} / 1,200 characters · Press Ctrl+Enter or Command+Enter to send
            </small>
          </form>

          {notice && <p className="office-inbox-notice" role="status" aria-live="polite">{notice}</p>}
        </section>
      </section>
    </main>
  )
}
