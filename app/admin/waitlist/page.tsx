'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function WaitlistPage() {
  const [people, setPeople] = useState<any[]>([])
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [desiredSite, setDesiredSite] = useState('')
  const [notes, setNotes] = useState('')
  const [status, setStatus] = useState('Waiting')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadWaitlist()
  }, [])

  async function loadWaitlist() {
    const { data } = await supabase
      .from('waitlist')
      .select('*')
      .order('created_at', { ascending: false })

    setPeople(data || [])
  }

  async function addPerson() {
    if (!firstName || !lastName) {
      setMessage('Please add a first and last name.')
      return
    }

    const { error } = await supabase.from('waitlist').insert({
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      desired_site: desiredSite,
      notes,
      status,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Added to waitlist!')
    setFirstName('')
    setLastName('')
    setPhone('')
    setEmail('')
    setDesiredSite('')
    setNotes('')
    setStatus('Waiting')
    loadWaitlist()
  }

  async function updateStatus(id: string, newStatus: string) {
    const { error } = await supabase
      .from('waitlist')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Status updated.')
    loadWaitlist()
  }

  async function deletePerson(id: string) {
    const ok = confirm('Delete this waitlist entry?')
    if (!ok) return

    const { error } = await supabase
      .from('waitlist')
      .delete()
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Waitlist entry deleted.')
    loadWaitlist()
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Waitlist Manager</h1>
          <p className="muted">Track people interested in seasonal sites.</p>

          <input placeholder="First Name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />
          <input placeholder="Last Name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />
          <input placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />
          <input placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />
          <input placeholder="Desired Site / Notes About Site" value={desiredSite} onChange={(e) => setDesiredSite(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />

          <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }}>
            <option>Waiting</option>
            <option>Contacted</option>
            <option>Accepted</option>
            <option>Declined</option>
          </select>

          <textarea
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ display: 'block', width: '100%', minHeight: '100px', marginBottom: '12px' }}
          />

          <button onClick={addPerson}>Add to Waitlist</button>

          {message && <p>{message}</p>}
        </section>

        <section className="card">
          <h2>Current Waitlist</h2>

          {people.length === 0 && <p className="muted">No waitlist entries yet.</p>}

          {people.map((person) => (
            <div key={person.id} style={{ borderTop: '1px solid #e3ded2', padding: '15px 0' }}>
              <h3>{person.first_name} {person.last_name}</h3>
              <p><strong>Status:</strong> {person.status}</p>
              <p><strong>Phone:</strong> {person.phone || 'Not Provided'}</p>
              <p><strong>Email:</strong> {person.email || 'Not Provided'}</p>
              <p><strong>Desired Site:</strong> {person.desired_site || 'Not Provided'}</p>
              <p><strong>Notes:</strong> {person.notes || 'None'}</p>

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={() => updateStatus(person.id, 'Waiting')}>Waiting</button>
                <button onClick={() => updateStatus(person.id, 'Contacted')}>Contacted</button>
                <button onClick={() => updateStatus(person.id, 'Accepted')}>Accepted</button>
                <button onClick={() => updateStatus(person.id, 'Declined')}>Declined</button>
                <button onClick={() => deletePerson(person.id)}>Delete</button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}