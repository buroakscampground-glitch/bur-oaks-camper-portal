'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Bell, CheckCircle2, MessageCircle, Send, ShieldCheck } from 'lucide-react'
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

    if (!response.ok) {
      setNotice(result.error || 'Unable to open messages.')
    } else {
      setMessages(result.messages || [])
    }

    setLoading(false)
  }

  async function sendMessage() {
    const text = draft.trim()
    if (!text) return

    setSending(true)
    setNotice('')

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
      setNotice(result.error || 'Unable to send message.')
    } else {
      setDraft('')
      setMessages((current) => [...current, result.message])
      if (result.emailStatus === 'failed') setNotice(`Message saved, but email alert failed: ${result.emailMessage || 'unknown error'}`)
      else if (result.emailStatus === 'skipped') setNotice(`Message saved. Email alert skipped: ${result.emailMessage || 'not configured'}`)
      else setNotice('Message sent to the office.')
    }

    setSending(false)
  }

  return (
    <main className="office-inbox-page">
      <section className="office-inbox-hero camper">
        <a href="/portal"><ArrowLeft size={17} /> Back to portal</a>
        <div>
          <span><MessageCircle size={16} /> OFFICE INBOX</span>
          <h1>Message the Bur Oaks office.</h1>
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
            <span><CheckCircle2 size={16} /> Secure portal messages</span>
          </div>

          <div className="office-message-list">
            {loading ? (
              <p className="office-message-empty">Opening messages…</p>
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

          <div className="office-message-compose">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Type your message to the office…"
              rows={4}
            />
            <button type="button" onClick={sendMessage} disabled={sending || !draft.trim()}>
              <Send size={16} /> {sending ? 'Sending…' : 'Send message'}
            </button>
          </div>

          {notice && <p className="office-inbox-notice">{notice}</p>}
        </section>
      </section>
    </main>
  )
}
