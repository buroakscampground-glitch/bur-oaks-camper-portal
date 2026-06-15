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
const [search, setSearch] = useState('')
const [statusFilter, setStatusFilter] = useState('All')
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

async function moveToCamper(person: any) {
  const { error } = await supabase
    .from('campers')
    .insert({
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      phone: person.phone,
      role: 'camper',
      is_active: true,
    })

  if (error) {
    setMessage(error.message)
    return
  }

  await supabase
    .from('waitlist')
    .update({
      status: 'Converted',
    })
    .eq('id', person.id)

  setMessage('Camper created successfully.')
  loadWaitlist()
}
const waitingCount =
  people.filter((p) => p.status === 'Waiting').length

const contactedCount =
  people.filter((p) => p.status === 'Contacted').length

const acceptedCount =
  people.filter((p) => p.status === 'Accepted').length

const declinedCount =
  people.filter((p) => p.status === 'Declined').length
  return (
    <main className="page">
      <div className="container">
        <a
  href="/admin"
  style={{
    display: 'inline-block',
    marginBottom: '20px',
    textDecoration: 'none',
    fontWeight: 'bold',
  }}
>
  ← Back to Dashboard
</a>
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
            <option>Converted</option>
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
          <div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '15px',
    margin: '20px 0',
  }}
>
  <div className="card">
    <h3>Waiting</h3>
    <h1>{waitingCount}</h1>
  </div>

  <div className="card">
    <h3>Contacted</h3>
    <h1>{contactedCount}</h1>
  </div>

  <div className="card">
    <h3>Accepted</h3>
    <h1>{acceptedCount}</h1>
  </div>

  <div className="card">
    <h3>Declined</h3>
    <h1>{declinedCount}</h1>
  </div>
</div>
<div
  style={{
    display: 'flex',
    gap: '10px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  }}
>
  <input
    placeholder="Search name, phone, email..."
    value={search}
    onChange={(e) => setSearch(e.target.value)}
    style={{
      flex: 1,
    }}
  />

  <select
    value={statusFilter}
    onChange={(e) => setStatusFilter(e.target.value)}
  >
    <option>All</option>
    <option>Waiting</option>
    <option>Contacted</option>
    <option>Accepted</option>
    <option>Declined</option>
    <option>Converted</option>
  </select>
</div>
          {people.length === 0 && <p className="muted">No waitlist entries yet.</p>}

          {people
  .filter((person) => {
    const term = search.toLowerCase()

    const matchesSearch =
      person.first_name?.toLowerCase().includes(term) ||
      person.last_name?.toLowerCase().includes(term) ||
      person.phone?.toLowerCase().includes(term) ||
      person.email?.toLowerCase().includes(term)

    const matchesStatus =
      statusFilter === 'All' ||
      person.status === statusFilter

    return matchesSearch && matchesStatus
  })
  .map((person) => (
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
                {person.status === 'Accepted' && (
  <button onClick={() => moveToCamper(person)}>
    Move To Camper
  </button>
)}
                <button onClick={() => deletePerson(person.id)}>Delete</button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}