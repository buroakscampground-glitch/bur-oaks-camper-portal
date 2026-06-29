'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, BellRing, Megaphone, Send, Trash2, WandSparkles } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

const quickAnnouncements = [
  {
    label: 'Storm / urgent weather',
    title: 'Weather alert',
    message: 'Storms are expected near the campground. Please secure loose items at your site and watch the weather closely.',
    urgent: true,
  },
  {
    label: 'Breakfast ready',
    title: 'Breakfast is ready',
    message: 'Breakfast is ready at the clubhouse. Come on up when you are ready.',
    urgent: false,
  },
  {
    label: 'Dinner reminder',
    title: 'Saturday dinner reminder',
    message: 'Saturday dinner is at 6:00 PM. Please check the dinner page in your portal for the menu and what campers are bringing.',
    urgent: false,
  },
  {
    label: 'Gate update',
    title: 'Gate update',
    message: 'There is a campground gate update. Please check the portal or contact the office if you need help getting in.',
    urgent: true,
  },
]

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    loadAnnouncements()
  }, [])

  async function loadAnnouncements() {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })

    setAnnouncements(data || [])
  }

  async function addAnnouncement() {
    if (!title || !message) {
      setStatus('Please add a title and message.')
      return
    }

    const announcementRow = {
      title,
      message,
      is_active: true,
      is_urgent: isUrgent,
    }

    let { error } = await supabase.from('announcements').insert(announcementRow)

    if (error && /is_urgent/i.test(error.message)) {
      const retry = await supabase.from('announcements').insert({
        title,
        message,
        is_active: true,
      })
      error = retry.error
    }

    if (error) {
      setStatus(error.message)
      return
    }

    setTitle('')
    setMessage('')
    setIsUrgent(false)
    setStatus(isUrgent ? 'Urgent announcement posted!' : 'Announcement posted!')
    loadAnnouncements()
  }

  async function deleteAnnouncement(id: string) {
    const ok = confirm('Delete this announcement?')
    if (!ok) return

    await supabase.from('announcements').delete().eq('id', id)
    loadAnnouncements()
  }

  function useTemplate(template: any) {
    setTitle(template.title)
    setMessage(template.message)
    setIsUrgent(template.urgent)
    setStatus('')
  }

  return (
    <main className="admin-announcements-page">
      <section className="admin-announcements-hero">
        <span><Megaphone size={28} /></span>
        <div>
          <small>OFFICE ANNOUNCEMENTS</small>
          <h1>Post updates campers can’t miss.</h1>
          <p>Use regular announcements for everyday updates or mark something urgent when campers need to notice it quickly in the portal.</p>
        </div>
      </section>

      <section className="admin-announcements-grid">
        <article className="admin-announcement-card compose">
          <div className="admin-announcement-heading">
            <small>COMPOSE</small>
            <h2>New announcement</h2>
          </div>

          <div className="admin-announcement-templates">
            {quickAnnouncements.map((template) => (
              <button type="button" key={template.label} onClick={() => useTemplate(template)}>
                <WandSparkles size={14} /> {template.label}
              </button>
            ))}
          </div>

          <input
            placeholder="Announcement Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />

          <textarea
            placeholder="Announcement Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />

          <label className="admin-urgent-toggle">
            <input type="checkbox" checked={isUrgent} onChange={(event) => setIsUrgent(event.target.checked)} />
            <span>
              <strong>Mark as urgent</strong>
              <small>Shows with a red urgent badge at the top of the camper portal announcements.</small>
            </span>
          </label>

          <button onClick={addAnnouncement}><Send size={17} /> Post Announcement</button>

          {status && <p>{status}</p>}
        </article>

        <article className="admin-announcement-card guidance">
          <span><BellRing size={24} /></span>
          <h2>Need everyone quickly?</h2>
          <p>Urgent announcements show in the portal. For time-sensitive updates like storms, breakfast ready, gate issues, or water shutoffs, also send a text alert to opted-in campers.</p>
          <a href="/admin/texts">Open text alerts</a>
        </article>
      </section>

      <section className="admin-announcement-card list">
        <div className="admin-announcement-heading">
          <small>LIVE BOARD</small>
          <h2>Current announcements</h2>
        </div>

        {announcements.length === 0 && <p className="admin-announcement-empty">No announcements yet.</p>}

        <div className="admin-announcement-list">
          {announcements.map((item) => (
            <article className={item.is_urgent ? 'urgent' : ''} key={item.id}>
              <div>
                <small>{item.is_urgent ? <><AlertTriangle size={13} /> Urgent</> : 'Regular update'}</small>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
              </div>
              <button onClick={() => deleteAnnouncement(item.id)}><Trash2 size={16} /> Delete</button>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
