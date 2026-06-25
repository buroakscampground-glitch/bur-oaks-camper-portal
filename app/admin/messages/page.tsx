'use client'

import { useEffect, useMemo, useState } from 'react'
import { Bell, CheckCircle2, Mail, MessageCircle, Search, Send, UserRound } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

function formatMessageTime(value?: string) {
  if (!value) return ''
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function camperName(camper: any) {
  return `${camper?.first_name || ''} ${camper?.last_name || ''}`.trim() || 'Camper'
}

export default function AdminMessagesPage() {
  const [conversations, setConversations] = useState<any[]>([])
  const [selectedCamperId, setSelectedCamperId] = useState('')
  const [messages, setMessages] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const camperId = params.get('camperId')
    if (camperId) setSelectedCamperId(camperId)
  }, [])

  useEffect(() => {
    if (selectedCamperId) loadThread(selectedCamperId)
  }, [selectedCamperId])

  async function authHeaders(): Promise<Record<string, string>> {
    const {
      data: { session },
    } = await supabase.auth.getSession()

    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}
  }

  async function loadConversations() {
    setLoading(true)
    const response = await fetch('/api/messages?mode=conversations', {
      headers: await authHeaders(),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setNotice(result.error || 'Unable to open inbox.')
    } else {
      setConversations(result.conversations || [])
      if (!selectedCamperId && result.conversations?.[0]?.camper?.id) {
        setSelectedCamperId(result.conversations[0].camper.id)
      }
    }

    setLoading(false)
  }

  async function loadThread(camperId: string) {
    const response = await fetch(`/api/messages?camperId=${camperId}`, {
      headers: await authHeaders(),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setNotice(result.error || 'Unable to open this conversation.')
    } else {
      setMessages(result.messages || [])
      setConversations((current) => current.map((conversation) => (
        String(conversation.camper.id) === String(camperId)
          ? { ...conversation, unreadCount: 0 }
          : conversation
      )))
    }
  }

  async function sendMessage() {
    const text = draft.trim()
    if (!text || !selectedCamperId) return

    setSending(true)
    setNotice('')

    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaders()),
      },
      body: JSON.stringify({ camperId: selectedCamperId, message: text }),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setNotice(result.error || 'Unable to send reply.')
    } else {
      setDraft('')
      setMessages((current) => [...current, result.message])
      setNotice(
        result.emailStatus === 'failed'
          ? `Reply saved, but camper email failed: ${result.emailMessage || 'unknown error'}`
          : result.emailStatus === 'skipped'
            ? `Reply saved. Camper email skipped: ${result.emailMessage || 'not configured'}`
            : 'Reply sent and camper email alert triggered.'
      )
      loadConversations()
    }

    setSending(false)
  }

  const selectedConversation = conversations.find((conversation) => String(conversation.camper.id) === String(selectedCamperId))
  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase()
    return conversations.filter((conversation) => {
      const camper = conversation.camper
      return !term || `${camperName(camper)} ${camper.lot_number || ''} ${camper.email || ''}`.toLowerCase().includes(term)
    })
  }, [conversations, search])

  const unreadTotal = conversations.reduce((sum, conversation) => sum + Number(conversation.unreadCount || 0), 0)

  return (
    <main className="office-inbox-page admin">
      <section className="office-inbox-hero">
        <div>
          <span><MessageCircle size={16} /> CAMPER MESSAGE INBOX</span>
          <h1>Direct messages with campers.</h1>
          <p>Reply to campers from one clean inbox. Campers get an email alert when you send a reply.</p>
        </div>
        <div className="office-inbox-hero-stat">
          <small>Unread camper messages</small>
          <strong>{unreadTotal}</strong>
        </div>
      </section>

      <section className="office-inbox-shell admin">
        <aside className="office-conversation-list">
          <label className="office-inbox-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search camper, lot, or email" />
          </label>

          <div className="office-conversations">
            {loading ? (
              <p className="office-message-empty">Opening inbox…</p>
            ) : filteredConversations.length === 0 ? (
              <p className="office-message-empty">No campers found.</p>
            ) : (
              filteredConversations.map((conversation) => {
                const camper = conversation.camper
                const selected = String(camper.id) === String(selectedCamperId)

                return (
                  <button
                    type="button"
                    className={selected ? 'selected' : ''}
                    onClick={() => setSelectedCamperId(camper.id)}
                    key={camper.id}
                  >
                    <span><UserRound size={17} /></span>
                    <div>
                      <strong>Lot {camper.lot_number || '—'} · {camperName(camper)}</strong>
                      <small>{conversation.lastMessage?.body || camper.email || 'No messages yet'}</small>
                    </div>
                    {conversation.unreadCount > 0 && <em>{conversation.unreadCount}</em>}
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <section className="office-inbox-thread">
          <div className="office-inbox-thread-header">
            <div>
              <small>Lot {selectedConversation?.camper?.lot_number || '—'}</small>
              <h2>{selectedConversation ? camperName(selectedConversation.camper) : 'Choose a camper'}</h2>
            </div>
            <span><Mail size={16} /> Email alert on reply</span>
          </div>

          <div className="office-message-list">
            {!selectedCamperId ? (
              <p className="office-message-empty">Choose a camper conversation to begin.</p>
            ) : messages.length === 0 ? (
              <p className="office-message-empty">No messages with this camper yet. Send the first note.</p>
            ) : (
              messages.map((message) => (
                <article className={`office-message-bubble ${message.sender_role === 'admin' ? 'mine' : 'office'}`} key={message.id}>
                  <small>{message.sender_name || (message.sender_role === 'admin' ? 'Bur Oaks Office' : 'Camper')} · {formatMessageTime(message.created_at)}</small>
                  <p>{message.body}</p>
                </article>
              ))
            )}
          </div>

          <div className="office-message-compose">
            <textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder={selectedCamperId ? 'Type your reply to this camper…' : 'Choose a camper first…'}
              disabled={!selectedCamperId}
              rows={4}
            />
            <button type="button" onClick={sendMessage} disabled={sending || !draft.trim() || !selectedCamperId}>
              <Send size={16} /> {sending ? 'Sending…' : 'Send reply'}
            </button>
          </div>

          <div className="office-inbox-helper">
            <Bell size={16} />
            <span>Camper replies create an admin alert and email. Office replies email the camper.</span>
          </div>

          {notice && <p className="office-inbox-notice">{notice}</p>}
        </section>
      </section>
    </main>
  )
}
