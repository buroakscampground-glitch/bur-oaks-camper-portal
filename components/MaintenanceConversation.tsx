'use client'

import { useEffect, useState } from 'react'
import { MessageSquarePlus, Send } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function MaintenanceConversation({
  ticketId,
  camperId,
  authorName,
  authorRole,
}: {
  ticketId: string
  camperId?: string | null
  authorName: string
  authorRole: 'admin' | 'maintenance' | 'camper'
}) {
  const [comments, setComments] = useState<any[]>([])
  const [body, setBody] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadComments()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId])

  async function loadComments() {
    const { data, error } = await supabase
      .from('maintenance_ticket_comments')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })

    if (!error) setComments(data || [])
    setLoading(false)
  }

  async function addComment() {
    const cleanBody = body.trim()
    if (!cleanBody) {
      setMessage('Add a note before sending.')
      return
    }

    setMessage('Sending note…')
    const { error } = await supabase.from('maintenance_ticket_comments').insert({
      ticket_id: ticketId,
      camper_id: camperId || null,
      author_name: authorName || 'Bur Oaks',
      author_role: authorRole,
      body: cleanBody,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setBody('')
    setMessage('Note added.')
    loadComments()
  }

  return (
    <section className="maintenance-conversation">
      <div className="maintenance-conversation-heading">
        <span><MessageSquarePlus size={18} /></span>
        <div>
          <small>WORK ORDER THREAD</small>
          <h3>Updates and notes</h3>
        </div>
      </div>

      <div className="maintenance-comment-list">
        {loading && <p className="maintenance-comment-empty">Loading notes…</p>}
        {!loading && comments.length === 0 && (
          <p className="maintenance-comment-empty">No notes yet. Add the first update here.</p>
        )}
        {comments.map((comment) => (
          <article className={`maintenance-comment ${comment.author_role}`} key={comment.id}>
            <div>
              <strong>{comment.author_name}</strong>
              <small>{comment.author_role} · {new Date(comment.created_at).toLocaleString()}</small>
            </div>
            <p>{comment.body}</p>
          </article>
        ))}
      </div>

      <label className="maintenance-comment-form">
        <span>Add an update</span>
        <textarea
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder="Example: Waiting on parts, scheduled for Friday, camper called with update..."
        />
      </label>
      <button type="button" onClick={addComment}>
        <Send size={16} /> Send note
      </button>
      {message && <p className="maintenance-comment-message">{message}</p>}
    </section>
  )
}
