'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function AdminAnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [title, setTitle] = useState('')
  const [message, setMessage] = useState('')
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

    const { error } = await supabase.from('announcements').insert({
      title,
      message,
      is_active: true,
    })

    if (error) {
      setStatus(error.message)
      return
    }

    setTitle('')
    setMessage('')
    setStatus('Announcement posted!')
    loadAnnouncements()
  }

  async function deleteAnnouncement(id: string) {
    const ok = confirm('Delete this announcement?')
    if (!ok) return

    await supabase.from('announcements').delete().eq('id', id)
    loadAnnouncements()
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <h1>Announcements</h1>
          <p className="muted">Post campground updates for campers to see in their portal.</p>

          <input
            placeholder="Announcement Title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          />

          <textarea
            placeholder="Announcement Message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{ display: 'block', width: '100%', minHeight: '120px', marginBottom: '12px' }}
          />

          <button onClick={addAnnouncement}>Post Announcement</button>

          {status && <p>{status}</p>}
        </section>

        <section className="card">
          <h2>Current Announcements</h2>

          {announcements.length === 0 && <p className="muted">No announcements yet.</p>}

          {announcements.map((item) => (
            <div key={item.id} style={{ borderTop: '1px solid #e3ded2', padding: '15px 0' }}>
              <h3>{item.title}</h3>
              <p>{item.message}</p>
              <button onClick={() => deleteAnnouncement(item.id)}>Delete</button>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}