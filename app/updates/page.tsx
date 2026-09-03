'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Bell, Check, CheckCheck, Clock3, Inbox, Megaphone, MessageCircle, Send, ShieldCheck } from 'lucide-react'
import { isAnnouncementExpired } from '../../lib/announcement-expiration'
import { getCurrentCamper, supabase } from '../../lib/supabase'

function formatUpdateDate(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function CamperUpdatesPage() {
  const [camper, setCamper] = useState<any>(null)
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [readIds, setReadIds] = useState<string[]>([])
  const [messages, setMessages] = useState<any[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const messageRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    loadCenter()
  }, [])

  useEffect(() => {
    if (!messageRef.current) return
    messageRef.current.style.height = 'auto'
    messageRef.current.style.height = `${Math.max(180, messageRef.current.scrollHeight)}px`
  }, [draft])

  async function authHeaders(): Promise<Record<string, string>> {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }

  async function loadCenter() {
    const camperData = await getCurrentCamper()
    if (!camperData) {
      window.location.href = '/login'
      return
    }

    setCamper(camperData)
    const storageKey = `bur-oaks-read-updates-${camperData.id}`
    try {
      setReadIds(JSON.parse(window.localStorage.getItem(storageKey) || '[]') || [])
    } catch {
      setReadIds([])
    }

    const [announcementResult, messageResponse] = await Promise.all([
      supabase
        .from('announcements')
        .select('*')
        .eq('is_active', true)
        .order('is_urgent', { ascending: false })
        .order('created_at', { ascending: false }),
      fetch('/api/messages', { headers: await authHeaders() }),
    ])

    const messageResult = await messageResponse.json().catch(() => ({}))
    if (announcementResult.error) setNotice(announcementResult.error.message)
    else setAnnouncements((announcementResult.data || []).filter((item) => !isAnnouncementExpired(item)))
    if (messageResponse.ok) setMessages((messageResult.messages || []).slice(-3))
    setLoading(false)
  }

  function saveReadIds(nextIds: string[]) {
    if (!camper?.id) return
    const normalized = Array.from(new Set(nextIds)).slice(-500)
    window.localStorage.setItem(`bur-oaks-read-updates-${camper.id}`, JSON.stringify(normalized))
    setReadIds(normalized)
  }

  function markRead(id: string) {
    saveReadIds([...readIds, String(id)])
  }

  function markAllRead() {
    saveReadIds([...readIds, ...announcements.map((item) => String(item.id))])
  }

  async function sendMessage() {
    const text = draft.trim()
    if (!text) return
    setSending(true)
    setNotice('')

    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: JSON.stringify({ message: text }),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) setNotice(result.error || 'Unable to send your message.')
    else {
      setDraft('')
      setMessages((current) => [...current, result.message].slice(-3))
      setNotice('Your private message was sent to the office.')
    }
    setSending(false)
  }

  const unreadCount = useMemo(
    () => announcements.filter((item) => !readIds.includes(String(item.id))).length,
    [announcements, readIds]
  )

  return (
    <main className="updates-center-page">
      <section className="updates-center-hero">
        <div className="updates-center-hero-icon"><Megaphone size={30} /></div>
        <div>
          <span>CAMPGROUND COMMUNICATION CENTER</span>
          <h1>Updates, details, and office messages in one place.</h1>
          <p>Texts give you the short version. The complete schedule, notice, or campground information stays here so it is easy to find later.</p>
        </div>
        <div className="updates-center-count">
          <Bell size={20} />
          <strong>{unreadCount}</strong>
          <small>unread update{unreadCount === 1 ? '' : 's'}</small>
        </div>
      </section>

      <section className="updates-center-layout">
        <section className="updates-board-card">
          <header>
            <div>
              <small>OFFICIAL BULLETIN BOARD</small>
              <h2>Campground updates</h2>
            </div>
            {unreadCount > 0 && <button type="button" onClick={markAllRead}><CheckCheck size={16} /> Mark all read</button>}
          </header>

          {loading ? (
            <p className="updates-empty">Opening the campground board…</p>
          ) : announcements.length === 0 ? (
            <div className="updates-empty"><Megaphone size={28} /><p>No active announcements right now.</p></div>
          ) : (
            <div className="updates-board-list">
              {announcements.map((item) => {
                const isRead = readIds.includes(String(item.id))
                return (
                  <article id={`announcement-${item.id}`} className={`${item.is_urgent ? 'urgent' : ''} ${isRead ? 'read' : 'unread'}`} key={item.id}>
                    <div className="updates-board-meta">
                      <span>{item.is_urgent ? <><AlertTriangle size={14} /> URGENT NOTICE</> : <><Megaphone size={14} /> CAMPGROUND UPDATE</>}</span>
                      {!isRead && <b>NEW</b>}
                      <time><Clock3 size={13} /> {formatUpdateDate(item.created_at)}</time>
                    </div>
                    <h3>{item.title}</h3>
                    <p>{item.message}</p>
                    {!isRead && <button type="button" onClick={() => markRead(String(item.id))}><Check size={15} /> Mark as read</button>}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <aside className="updates-office-card">
          <div className="updates-office-heading">
            <span><MessageCircle size={23} /></span>
            <div><small>PRIVATE TO YOUR SITE</small><h2>Contact the office</h2></div>
          </div>
          <p>Ask a question or follow up here. Your note goes into the Bur Oaks office inbox and is not shown on the public bulletin board.</p>
          <div className="updates-office-trust"><ShieldCheck size={16} /> Private camper-to-office message</div>

          {messages.length > 0 && (
            <div className="updates-recent-messages">
              <small>RECENT PRIVATE MESSAGES</small>
              {messages.map((message) => (
                <div className={message.sender_role === 'camper' ? 'mine' : ''} key={message.id}>
                  <strong>{message.sender_role === 'admin' ? 'Bur Oaks Office' : 'You'}</strong>
                  <span>{message.body}</span>
                </div>
              ))}
            </div>
          )}

          <textarea ref={messageRef} value={draft} onChange={(event) => setDraft(event.target.value)} rows={7} placeholder="Type a private message to the office…" />
          <button className="updates-send-button" type="button" onClick={sendMessage} disabled={sending || !draft.trim()}>
            <Send size={16} /> {sending ? 'Sending…' : 'Send to the office'}
          </button>
          <a className="updates-inbox-link" href="/messages"><Inbox size={15} /> Open your complete private inbox</a>
          {notice && <p className="updates-notice">{notice}</p>}
        </aside>
      </section>
    </main>
  )
}
