'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Archive, BellRing, Megaphone, RotateCcw, Send, WandSparkles } from 'lucide-react'
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
  const [sendText, setSendText] = useState(false)
  const [posting, setPosting] = useState(false)
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

    if (sendText && !confirm('Post this update and text the short link to every opted-in camper?')) return

    setPosting(true)
    setStatus('Posting update…')
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/announcements', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token || ''}`,
      },
      body: JSON.stringify({ title, message, isUrgent, sendText }),
    })
    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      setStatus(result.error || 'Unable to post this announcement.')
      setPosting(false)
      return
    }

    setTitle('')
    setMessage('')
    setIsUrgent(false)
    setSendText(false)
    setStatus(sendText
      ? `Update posted. Short texts: ${result.smsSentCount || 0} sent, ${result.smsSkippedCount || 0} skipped, ${result.smsFailedCount || 0} failed.`
      : 'Update posted to the communication center without sending a text.')
    setPosting(false)
    loadAnnouncements()
  }

  async function archiveAnnouncement(id: string) {
    const ok = confirm('Move this announcement off the live camper board and into the archive?')
    if (!ok) return

    await supabase.from('announcements').update({ is_active: false }).eq('id', id)
    loadAnnouncements()
  }

  async function restoreAnnouncement(id: string) {
    await supabase.from('announcements').update({ is_active: true }).eq('id', id)
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

          <label className="admin-text-toggle">
            <input type="checkbox" checked={sendText} onChange={(event) => setSendText(event.target.checked)} />
            <span>
              <strong>Send a short text with the link</strong>
              <small>Texts only the title and a link to the complete update. It stays within one standard SMS segment and only goes to opted-in camper numbers.</small>
            </span>
          </label>

          <button onClick={addAnnouncement} disabled={posting}><Send size={17} /> {posting ? 'Posting…' : sendText ? 'Post & Send Short Text' : 'Post Update'}</button>

          {status && <p>{status}</p>}
        </article>

        <article className="admin-announcement-card guidance">
          <span><BellRing size={24} /></span>
          <h2>Write it once.</h2>
          <p>Put the full schedule or notice here. If you select the text option, campers receive only a short, clearly branded link to the Updates Center—not a long multi-part solicitation-style text.</p>
          <a href="/updates">Preview camper Updates Center</a>
        </article>
      </section>

      <section className="admin-announcement-card list">
        <div className="admin-announcement-heading">
          <small>LIVE BOARD</small>
          <h2>Current announcements</h2>
        </div>

        {announcements.filter((item) => item.is_active !== false).length === 0 && <p className="admin-announcement-empty">No live announcements yet.</p>}

        <div className="admin-announcement-list">
          {announcements.filter((item) => item.is_active !== false).map((item) => (
            <article className={item.is_urgent ? 'urgent' : ''} key={item.id}>
              <div>
                <small>{item.is_urgent ? <><AlertTriangle size={13} /> Urgent</> : 'Regular update'}</small>
                <h3>{item.title}</h3>
                <p>{item.message}</p>
              </div>
              <button onClick={() => archiveAnnouncement(item.id)}><Archive size={16} /> Archive</button>
            </article>
          ))}
        </div>
      </section>

      {announcements.some((item) => item.is_active === false) && (
        <section className="admin-announcement-card list archived">
          <div className="admin-announcement-heading">
            <small>ARCHIVE</small>
            <h2>Past announcements</h2>
          </div>
          <div className="admin-announcement-list">
            {announcements.filter((item) => item.is_active === false).map((item) => (
              <article key={item.id}>
                <div><small>Archived update</small><h3>{item.title}</h3><p>{item.message}</p></div>
                <button onClick={() => restoreAnnouncement(item.id)}><RotateCcw size={16} /> Restore</button>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  )
}
