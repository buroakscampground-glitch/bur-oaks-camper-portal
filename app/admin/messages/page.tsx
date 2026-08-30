'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Bell, CheckCircle2, Clock3, Inbox, Mail, MessageCircle, RefreshCw, Search, Send, UserRound, UsersRound, X } from 'lucide-react'
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
  const [listMode, setListMode] = useState<'inbox' | 'all'>('inbox')
  const [mobileThreadOpen, setMobileThreadOpen] = useState(false)
  const [draft, setDraft] = useState('')
  const [selectedCamperIds, setSelectedCamperIds] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')
  const activeThreadRequest = useRef('')
  const messageListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadConversations()
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const camperId = params.get('camperId')
    if (camperId) {
      setSelectedCamperId(camperId)
      setMobileThreadOpen(true)
    }
  }, [])

  useEffect(() => {
    if (selectedCamperId) loadThread(selectedCamperId)
  }, [selectedCamperId])

  useEffect(() => {
    if (!messageListRef.current) return
    messageListRef.current.scrollTop = messageListRef.current.scrollHeight
  }, [messages, selectedCamperId])

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
      const firstMessageConversation = result.conversations?.find((conversation: any) => conversation.messageCount > 0)
      const requestedCamperId = new URLSearchParams(window.location.search).get('camperId')
      if (!selectedCamperId && !requestedCamperId && firstMessageConversation?.camper?.id) {
        setSelectedCamperId(firstMessageConversation.camper.id)
      }
    }

    setLoading(false)
  }

  async function loadThread(camperId: string) {
    activeThreadRequest.current = String(camperId)
    setMessages([])

    const response = await fetch(`/api/messages?camperId=${camperId}`, {
      headers: await authHeaders(),
    })
    const result = await response.json().catch(() => ({}))

    if (activeThreadRequest.current !== String(camperId)) return

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
    const bulkMode = selectedCamperIds.length > 0

    if (!text || (!selectedCamperId && !bulkMode)) return

    setSending(true)
    setNotice('')

    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaders()),
      },
      body: JSON.stringify(
        bulkMode
          ? { camperIds: selectedCamperIds, message: text }
          : { camperId: selectedCamperId, message: text }
      ),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setNotice(result.error || (bulkMode ? 'Unable to send mass message.' : 'Unable to send reply.'))
    } else {
      setDraft('')
      if (bulkMode) {
        setSelectedCamperIds([])
        setNotice(
          `Mass message sent to ${result.sentCount || selectedCamperIds.length} camper${Number(result.sentCount || selectedCamperIds.length) === 1 ? '' : 's'}. ` +
          `Email alerts: ${result.emailSentCount || 0} sent, ${result.emailSkippedCount || 0} skipped, ${result.emailFailedCount || 0} failed. ` +
          `Text alerts with the full message: ${result.smsSentCount || 0} sent, ${result.smsSkippedCount || 0} skipped, ${result.smsFailedCount || 0} failed.`
        )
      } else {
        setMessages((current) => [...current, result.message])
        setNotice(
          result.emailStatus === 'failed'
            ? `Reply saved, but camper email failed: ${result.emailMessage || 'unknown error'}`
            : result.emailStatus === 'skipped'
              ? `Reply saved. Camper email skipped: ${result.emailMessage || 'not configured'}`
              : 'Reply sent and camper email alert triggered.'
        )
      }
      loadConversations()
    }

    setSending(false)
  }

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLowerCase()
    return conversations.filter((conversation) => {
      const camper = conversation.camper
      const belongsInMode = listMode === 'all' || conversation.messageCount > 0
      return belongsInMode && (!term || `${camperName(camper)} ${camper.lot_number || ''} ${camper.email || ''}`.toLowerCase().includes(term))
    })
  }, [conversations, listMode, search])
  const selectedConversation = conversations.find((conversation) => String(conversation.camper.id) === String(selectedCamperId))

  useEffect(() => {
    const term = search.trim()
    if (!term || filteredConversations.length === 0 || mobileThreadOpen) return

    const selectedIsVisible = filteredConversations.some(
      (conversation) => String(conversation.camper.id) === String(selectedCamperId)
    )

    if (!selectedIsVisible) {
      setSelectedCamperId(String(filteredConversations[0].camper.id))
    }
  }, [filteredConversations, search, selectedCamperId, mobileThreadOpen])

  const unreadTotal = conversations.reduce((sum, conversation) => sum + Number(conversation.unreadCount || 0), 0)
  const selectedBulkCount = selectedCamperIds.length
  const selectedBulkCampers = conversations.filter((conversation) => selectedCamperIds.includes(String(conversation.camper.id)))
  const selectedBulkLabel = selectedBulkCount > 0
    ? `Mass message to ${selectedBulkCount} camper${selectedBulkCount === 1 ? '' : 's'}`
    : selectedConversation
      ? `Reply to ${camperName(selectedConversation.camper)}`
      : 'Choose a camper'

  function toggleCamperSelection(camperId: string) {
    setSelectedCamperIds((current) => (
      current.includes(camperId)
        ? current.filter((id) => id !== camperId)
        : [...current, camperId]
    ))
  }

  function selectAllVisible() {
    setSelectedCamperIds(Array.from(new Set(filteredConversations.map((conversation) => String(conversation.camper.id)))))
  }

  function openConversation(camperId: string) {
    setSelectedCamperIds([])
    setSelectedCamperId(camperId)
    setMobileThreadOpen(true)
  }

  function showInbox() {
    setMobileThreadOpen(false)
    setSelectedCamperIds([])
    setNotice('')
  }

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

      <section className={`office-inbox-shell admin ${mobileThreadOpen ? 'thread-open' : ''}`}>
        <aside className="office-conversation-list">
          <div className="office-list-heading">
            <div>
              <small>OFFICE MAILBOX</small>
              <h2>{listMode === 'inbox' ? 'Conversations' : 'Camper directory'}</h2>
            </div>
            <button type="button" onClick={loadConversations} disabled={loading} aria-label="Refresh inbox">
              <RefreshCw size={16} className={loading ? 'spinning' : ''} />
            </button>
          </div>

          <div className="office-inbox-tabs" role="tablist" aria-label="Message list">
            <button type="button" className={listMode === 'inbox' ? 'active' : ''} onClick={() => setListMode('inbox')}>
              <Inbox size={15} /> Inbox {unreadTotal > 0 && <strong>{unreadTotal}</strong>}
            </button>
            <button type="button" className={listMode === 'all' ? 'active' : ''} onClick={() => setListMode('all')}>
              <UsersRound size={15} /> All campers
            </button>
          </div>

          <label className="office-inbox-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={listMode === 'inbox' ? 'Search conversations' : 'Search camper, lot, or email'} />
          </label>

          {listMode === 'all' && <div className="office-bulk-toolbar">
            <button type="button" onClick={selectAllVisible} disabled={filteredConversations.length === 0}>
              <UsersRound size={15} /> Select all visible
            </button>
            {selectedBulkCount > 0 && (
              <>
                <button type="button" className="primary" onClick={() => setMobileThreadOpen(true)}>
                  <Send size={15} /> Message {selectedBulkCount}
                </button>
                <button type="button" onClick={() => setSelectedCamperIds([])}>
                  <X size={15} /> Clear
                </button>
              </>
            )}
          </div>}

          <div className="office-conversations">
            {loading ? (
              <p className="office-message-empty">Opening inbox…</p>
            ) : filteredConversations.length === 0 ? (
              <div className="office-message-empty mailbox-empty">
                <CheckCircle2 size={27} />
                <strong>{listMode === 'inbox' ? 'Your inbox is clear' : 'No campers found'}</strong>
                <span>{listMode === 'inbox' ? 'New camper messages will appear here.' : 'Try another name, lot, or email.'}</span>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const camper = conversation.camper
                const selected = String(camper.id) === String(selectedCamperId)
                const checked = selectedCamperIds.includes(String(camper.id))

                return (
                  <article
                    className={`office-conversation-row ${selected ? 'selected' : ''} ${checked ? 'checked' : ''}`}
                    key={camper.id}
                  >
                    {listMode === 'all' && <label className="office-conversation-check" aria-label={`Select ${camperName(camper)}`}>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleCamperSelection(String(camper.id))}
                      />
                    </label>}
                    <button type="button" className="office-conversation-open" onClick={() => openConversation(String(camper.id))}>
                      <span><UserRound size={17} /></span>
                      <div>
                        <strong>Lot {camper.lot_number || '—'} · {camperName(camper)}</strong>
                        <small>{conversation.lastMessage?.body || camper.email || 'No messages yet'}</small>
                        {conversation.lastMessage?.created_at && <time><Clock3 size={11} /> {formatMessageTime(conversation.lastMessage.created_at)}</time>}
                      </div>
                      {conversation.unreadCount > 0 && <em>{conversation.unreadCount}</em>}
                    </button>
                  </article>
                )
              })
            )}
          </div>
        </aside>

        <section className="office-inbox-thread">
          <div className="office-inbox-thread-header">
            <button type="button" className="office-mobile-inbox-back" onClick={showInbox}>
              <ArrowLeft size={17} /> Back to inbox
            </button>
            <div>
              <small>Lot {selectedConversation?.camper?.lot_number || '—'}</small>
              <h2>{selectedBulkLabel}</h2>
            </div>
            <span><Mail size={16} /> Email alert on send</span>
          </div>

          {selectedBulkCount > 0 && (
            <div className="office-bulk-summary">
              <CheckCircle2 size={17} />
              <span>
                Selected: {selectedBulkCampers.slice(0, 4).map((conversation) => `Lot ${conversation.camper.lot_number || '—'}`).join(', ')}
                {selectedBulkCount > 4 ? `, and ${selectedBulkCount - 4} more` : ''}
                <br />Campers with text alerts turned on will see this entire message in their text. The portal link is only needed if they want to reply.
              </span>
            </div>
          )}

          <div className="office-message-list" ref={messageListRef}>
            {selectedBulkCount > 0 ? (
              <p className="office-message-empty">You are sending one office message to all selected campers. Individual conversation history will stay in each camper thread.</p>
            ) : !selectedCamperId ? (
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
              placeholder={selectedBulkCount > 0 ? 'Type the message for the selected campers…' : selectedCamperId ? 'Type your reply to this camper…' : 'Choose a camper first…'}
              disabled={!selectedCamperId && selectedBulkCount === 0}
              maxLength={1200}
              rows={4}
            />
            <button type="button" onClick={sendMessage} disabled={sending || !draft.trim() || (!selectedCamperId && selectedBulkCount === 0)}>
              <Send size={16} /> {sending ? 'Sending…' : selectedBulkCount > 0 ? `Send to ${selectedBulkCount}` : 'Send reply'}
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
