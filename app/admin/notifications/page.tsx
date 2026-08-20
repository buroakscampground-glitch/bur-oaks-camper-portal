'use client'

import { useEffect, useState } from 'react'
import { BellRing, CheckCheck, CircleDollarSign, Droplets, MessageCircle, MessageSquareWarning, PartyPopper, Search, Soup, UsersRound, Wrench } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import AdminQuickText from '../../../components/AdminQuickText'

const typeLabels: Record<string, { label: string; icon: any; href: string }> = {
  maintenance_request: { label: 'Maintenance', icon: Wrench, href: '/admin/maintenance' },
  payment_received: { label: 'Payment', icon: CircleDollarSign, href: '/admin/invoices' },
  event_rsvp: { label: 'RSVP', icon: PartyPopper, href: '/admin/rsvps' },
  saturday_dinner: { label: 'Saturday Dinner', icon: Soup, href: '/admin/dinners' },
  sewer_pump_out: { label: 'Sewer Pump-Out', icon: Droplets, href: '/admin/pump-outs' },
  direct_message: { label: 'Camper Message', icon: MessageCircle, href: '/admin/messages' },
  website_waitlist: { label: 'Website Waitlist', icon: UsersRound, href: '/admin/waitlist' },
}

export default function AdminNotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [filter, setFilter] = useState('unread')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadNotifications()
  }, [])

  async function loadNotifications() {
    const { data, error } = await supabase
      .from('admin_notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200)

    if (error) setMessage(error.message)
    setNotifications(data || [])
  }

  async function markSeen(id?: string) {
    let query = supabase
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .is('read_at', null)

    if (id) query = query.eq('id', id)

    const { error } = await query
    setMessage(error ? error.message : id ? 'Notification marked handled.' : 'All notifications marked handled.')
    if (!error) loadNotifications()
  }

  const visible = notifications.filter((notification) => {
    const matchesFilter =
      filter === 'all' ||
      (filter === 'unread' ? !notification.read_at && notification.type !== 'event_rsvp' : notification.type === filter)
    const term = search.trim().toLowerCase()
    const matchesSearch =
      !term ||
      `${notification.title} ${notification.message} ${notification.lot_number || ''}`
        .toLowerCase()
        .includes(term)
    return matchesFilter && matchesSearch
  })

  const unreadCount = notifications.filter((notification) => !notification.read_at && notification.type !== 'event_rsvp').length

  return (
    <main className="admin-notifications-page">
      <section className="admin-notifications-hero">
        <div>
          <span><BellRing size={17} /> ADMIN NOTIFICATIONS</span>
          <h1>Everything that needs your attention.</h1>
          <p>Payments, maintenance requests, camper messages, and operational activity collected into one clean review queue.</p>
        </div>
        <button type="button" onClick={() => markSeen()} disabled={unreadCount === 0}>
          <CheckCheck size={17} /> Mark all handled
        </button>
      </section>

      <section className="admin-notification-stats">
        <article><small>Unread</small><strong>{unreadCount}</strong></article>
        <article><small>Maintenance</small><strong>{notifications.filter((item) => item.type === 'maintenance_request' && !item.read_at).length}</strong></article>
        <article><small>Payments</small><strong>{notifications.filter((item) => item.type === 'payment_received' && !item.read_at).length}</strong></article>
        <article><small>Camper messages</small><strong>{notifications.filter((item) => item.type === 'direct_message' && !item.read_at).length}</strong></article>
      </section>

      <AdminQuickText
        title="Campground-wide quick alert"
        description="Use this for fast storm updates, breakfast is ready, dinner time, gate notices, or urgent announcements."
        defaultTarget="all_opted_in"
        defaultType="Weather Alert"
        defaultMessage="Weather is moving into the area. Please secure awnings, outdoor items, and check your campsite."
      />

      <section className="admin-notification-toolbar">
        <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search title, lot, or message" /></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="unread">Unread</option>
          <option value="all">All</option>
          <option value="maintenance_request">Maintenance</option>
          <option value="payment_received">Payments</option>
          <option value="event_rsvp">RSVPs</option>
          <option value="saturday_dinner">Saturday Dinners</option>
          <option value="sewer_pump_out">Sewer Pump-Outs</option>
          <option value="direct_message">Camper Messages</option>
        </select>
      </section>

      <section className="admin-notification-list">
        {visible.map((notification) => {
          const config = typeLabels[notification.type] || {
            label: notification.type || 'Notice',
            icon: MessageSquareWarning,
            href: '/admin',
          }
          const Icon = config.icon

          return (
            <article className={notification.read_at ? 'read' : 'unread'} key={notification.id}>
              <span><Icon size={20} /></span>
              <div>
                <small>{config.label} · Lot {notification.lot_number || 'N/A'} · {new Date(notification.created_at).toLocaleString()}</small>
                <h2>{notification.title}</h2>
                <p>{notification.message}</p>
              </div>
              <div className="admin-notification-actions">
                <a href={config.href}>Open</a>
                {!notification.read_at && (
                  <button type="button" onClick={() => markSeen(notification.id)}>
                    {notification.type === 'sewer_pump_out' ? 'Clear alert' : 'Handled'}
                  </button>
                )}
              </div>
            </article>
          )
        })}

        {visible.length === 0 && (
          <div className="admin-notification-empty">
            <BellRing size={32} />
            <h2>No notifications found</h2>
            <p>{filter === 'unread' ? 'Nothing new is waiting right now.' : 'Try another filter or search.'}</p>
          </div>
        )}
      </section>

      {message && <p className="admin-notification-message">{message}</p>}
    </main>
  )
}
