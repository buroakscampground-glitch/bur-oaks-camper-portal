'use client'

import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, Search, Soup, UsersRound } from 'lucide-react'
import { dinnerBringSuggestions, saturdayDinners2026 } from '../../../lib/saturday-dinners'
import { supabase } from '../../../lib/supabase'

export default function AdminDinnersPage() {
  const [signups, setSignups] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadSignups()

    const refresh = window.setInterval(loadSignups, 15_000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadSignups()
    }
    window.addEventListener('focus', loadSignups)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.clearInterval(refresh)
      window.removeEventListener('focus', loadSignups)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  async function loadSignups() {
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/community-dinners', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) setMessage(result.error || 'Unable to load dinner responses.')
    setSignups(result.signups || [])
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
  const activeSignups = dinnerSignups.filter((signup) => signup.attending_status !== 'Not Going')
  const suggestedBringItems = dinnerBringSuggestions(selectedDinner?.menu || '')
  const bringOptions = [
    ...suggestedBringItems.map((label) => ({ label, custom: false })),
    ...Array.from(new Set(activeSignups
      .map((signup) => String(signup.bringing || '').trim())
      .filter((item) => item && !suggestedBringItems.some((suggestion) => suggestion.toLowerCase() === item.toLowerCase()))))
      .map((label) => ({ label, custom: true })),
  ]

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

      <p className="admin-dinner-message" role="status">Live updates are on — camper responses refresh automatically.</p>

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

      {selectedDinner && (
        <section className="saturday-dinner-bringing-board">
          <div>
            <small>AVAILABLE CHOICES</small>
            <h3>What campers can bring</h3>
            <p>Rachel and the office can see every suggested choice, who selected it, and any custom item a camper added.</p>
          </div>
          <div className="saturday-dinner-bringing-list">
            {bringOptions.map((option) => {
              const selectedBy = activeSignups.filter((signup) => String(signup.bringing || '').trim().toLowerCase() === option.label.toLowerCase())
              return (
                <article key={`${option.custom ? 'custom' : 'suggested'}:${option.label}`}>
                  <span>{option.custom ? 'CAMPER ADDED' : selectedBy.length ? 'SELECTED' : 'AVAILABLE'}</span>
                  <strong>{option.label}</strong>
                  <p>{selectedBy.length
                    ? selectedBy.map((signup) => `${signup.camper_name} · Lot ${signup.lot_number || 'N/A'}`).join(', ')
                    : 'No one has selected this yet.'}</p>
                  {selectedBy.length > 0 && <em>{selectedBy.length} campsite{selectedBy.length === 1 ? '' : 's'}</em>}
                </article>
              )
            })}
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
