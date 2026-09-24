'use client'

import { useEffect, useMemo, useState } from 'react'
import { BookOpen, CheckCheck, Search, UserX } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

function isWaitlistRemoval(notification: any) {
  return notification.type === 'waitlist_removal' || (
    notification.type === 'website_waitlist' &&
    String(notification.title || '').startsWith('Waitlist removal:')
  )
}

export default function WaitlistRemovalsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => { loadRemovals() }, [])

  async function loadRemovals() {
    const { data, error } = await supabase
      .from('admin_notifications')
      .select('*')
      .in('type', ['waitlist_removal', 'website_waitlist'])
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) setMessage(error.message)
    setNotifications((data || []).filter(isWaitlistRemoval))
  }

  async function markReviewed(id?: string) {
    const ids = notifications
      .filter((item) => !item.read_at && (!id || item.id === id))
      .map((item) => item.id)

    if (!ids.length) return
    const { error } = await supabase
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', ids)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(id ? 'Opt-out marked reviewed.' : 'All waitlist opt-outs marked reviewed.')
    window.dispatchEvent(new Event('admin-attention-changed'))
    loadRemovals()
  }

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return notifications.filter((item) => !term || `${item.title || ''} ${item.message || ''}`.toLowerCase().includes(term))
  }, [notifications, search])
  const unreadCount = notifications.filter((item) => !item.read_at).length

  return (
    <main className="admin-notifications-page waitlist-removals-page">
      <section className="admin-notifications-hero">
        <div>
          <span><UserX size={17} /> WAITLIST EMAIL RESPONSES</span>
          <h1>No longer interested.</h1>
          <p>This records only people who used the No Longer Interested option in a 30-day waitlist email.</p>
        </div>
        <button type="button" onClick={() => markReviewed()} disabled={unreadCount === 0}><CheckCheck size={17} /> Mark all reviewed</button>
      </section>

      <section className="admin-notification-stats">
        <article><small>Total opt-outs</small><strong>{notifications.length}</strong></article>
        <article><small>New to review</small><strong>{unreadCount}</strong></article>
        <article><small>Still interested</small><strong><a href="/admin/waitlist">Open waitlist</a></strong></article>
        <article><small>Reporting</small><strong>Automatic</strong></article>
      </section>

      <section className="admin-notification-toolbar">
        <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search name or email" /></label>
        <a href="/admin/waitlist"><BookOpen size={16} /> Open active waitlist</a>
      </section>

      <section className="admin-notification-list">
        {visible.map((notification) => (
          <article className={notification.read_at ? 'read' : 'unread'} key={notification.id}>
            <span><UserX size={20} /></span>
            <div>
              <small>EMAIL OPT-OUT · {new Date(notification.created_at).toLocaleString()}</small>
              <h2>{notification.title}</h2>
              <p>{notification.message}</p>
            </div>
            <div className="admin-notification-actions">
              {!notification.read_at && <button type="button" onClick={() => markReviewed(notification.id)}>Reviewed</button>}
            </div>
          </article>
        ))}

        {visible.length === 0 && (
          <div className="admin-notification-empty">
            <UserX size={32} />
            <h2>No one has opted out.</h2>
            <p>When someone clicks No Longer Interested in a monthly email, their name, email, and removal time will appear here automatically.</p>
          </div>
        )}
      </section>

      {message && <p className="admin-notification-message">{message}</p>}
    </main>
  )
}
