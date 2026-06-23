'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Search, Soup, UsersRound } from 'lucide-react'
import { saturdayDinners2026 } from '../../../lib/saturday-dinners'
import { supabase } from '../../../lib/supabase'

export default function AdminDinnersPage() {
  const [signups, setSignups] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadSignups()
  }, [])

  async function loadSignups() {
    const { data, error } = await supabase
      .from('saturday_dinner_signups')
      .select('*')
      .order('dinner_date', { ascending: true })
      .order('created_at', { ascending: false })

    if (error) setMessage(error.message)
    setSignups(data || [])
  }

  const nextDinner = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return saturdayDinners2026.find((dinner) => dinner.date >= today && !dinner.closed) || saturdayDinners2026.find((dinner) => !dinner.closed)
  }, [])

  useEffect(() => {
    if (!selectedDate && nextDinner) setSelectedDate(nextDinner.date)
  }, [nextDinner, selectedDate])

  const selectedDinner = saturdayDinners2026.find((dinner) => dinner.date === selectedDate) || nextDinner
  const dinnerSignups = signups.filter((signup) => signup.dinner_date === selectedDinner?.date)
  const visibleSignups = dinnerSignups.filter((signup) =>
    `${signup.camper_name} ${signup.lot_number} ${signup.bringing || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  const going = dinnerSignups.filter((signup) => signup.attending_status === 'Going')
  const maybe = dinnerSignups.filter((signup) => signup.attending_status === 'Maybe')
  const totalGuests = going.reduce((sum, signup) => sum + Number(signup.guest_count || 1), 0)

  return (
    <main className="admin-dinners-page">
      <section className="admin-dinners-hero">
        <div>
          <span><Soup size={17} /> SATURDAY NIGHT DINNERS</span>
          <h1>Plan Saturday dinner before the weekend starts.</h1>
          <p>See who is coming, what they are bringing, and the expected headcount for every Saturday at 6 PM.</p>
        </div>
        <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search camper, lot, or dish" /></label>
      </section>

      <section className="admin-dinner-controls">
        <label>
          <span>Dinner date</span>
          <select value={selectedDinner?.date || ''} onChange={(event) => setSelectedDate(event.target.value)}>
            {saturdayDinners2026.map((dinner) => (
              <option disabled={dinner.closed} value={dinner.date} key={dinner.id}>
                {dinner.month} {dinner.day} — {dinner.menu}{dinner.closed ? ' (Closed)' : ''}
              </option>
            ))}
          </select>
        </label>
        <article><small>Going</small><strong>{going.length}</strong></article>
        <article><small>Maybe</small><strong>{maybe.length}</strong></article>
        <article><small>Expected plates</small><strong>{totalGuests}</strong></article>
      </section>

      {selectedDinner && (
        <section className="admin-dinner-feature">
          <CalendarDays size={24} />
          <div>
            <small>{selectedDinner.month} {selectedDinner.day} · 6:00 PM</small>
            <h2>{selectedDinner.menu}</h2>
            {selectedDinner.theme && <p>{selectedDinner.theme}</p>}
          </div>
        </section>
      )}

      <section className="admin-dinner-signup-list">
        {visibleSignups.map((signup) => (
          <article key={signup.id}>
            <span className={signup.attending_status.toLowerCase().replace(/\s+/g, '-')}>{signup.attending_status}</span>
            <div>
              <small>Lot {signup.lot_number || 'N/A'} · {signup.guest_count || 1} plate{Number(signup.guest_count || 1) === 1 ? '' : 's'}</small>
              <h3>{signup.camper_name}</h3>
              <p>{signup.bringing ? `Bringing: ${signup.bringing}` : 'No item listed yet.'}</p>
            </div>
          </article>
        ))}

        {visibleSignups.length === 0 && (
          <div className="admin-dinner-empty">
            <UsersRound size={32} />
            <h2>No responses yet</h2>
            <p>Camper dinner responses will appear here as they submit them.</p>
          </div>
        )}
      </section>

      {message && <p className="admin-dinner-message">{message}</p>}
    </main>
  )
}
