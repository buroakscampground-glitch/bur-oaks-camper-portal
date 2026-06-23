'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, CheckCircle2, Clock, Send, Soup, Sparkles, UsersRound } from 'lucide-react'
import { saturdayDinners2026 } from '../../lib/saturday-dinners'
import { supabase } from '../../lib/supabase'

const months = ['March', 'April', 'May', 'June', 'July', 'August', 'Sept', 'October']

export default function SaturdayDinnersPage() {
  const [signups, setSignups] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [status, setStatus] = useState('Going')
  const [bringing, setBringing] = useState('')
  const [guestCount, setGuestCount] = useState(1)
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const signupCardRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    loadSignups()
  }, [])

  async function loadSignups() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      window.location.href = '/login'
      return
    }

    const response = await fetch('/api/saturday-dinner', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json().catch(() => null)
    if (response.ok) setSignups(result?.signups || [])
  }

  const nextDinner = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return saturdayDinners2026.find((dinner) => dinner.date >= today && !dinner.closed) || saturdayDinners2026.find((dinner) => !dinner.closed)
  }, [])

  const selectedDinner = saturdayDinners2026.find((dinner) => dinner.date === selectedDate) || nextDinner
  const signupByDate = new Map(signups.map((signup) => [signup.dinner_date, signup]))
  const currentMonth = selectedDinner?.month || nextDinner?.month || 'June'
  const monthDinners = saturdayDinners2026.filter((dinner) => dinner.month === currentMonth)
  const openMonthDinners = monthDinners.filter((dinner) => !dinner.closed)
  const remainingMonthDinners = monthDinners.filter((dinner) => dinner.date >= new Date().toISOString().slice(0, 10) && !dinner.closed)

  useEffect(() => {
    if (!selectedDate && nextDinner) setSelectedDate(nextDinner.date)
  }, [nextDinner, selectedDate])

  useEffect(() => {
    const existing = selectedDate ? signupByDate.get(selectedDate) : null
    if (existing) {
      setStatus(existing.attending_status || 'Going')
      setBringing(existing.bringing || '')
      setGuestCount(existing.guest_count || 1)
    } else {
      setStatus('Going')
      setBringing('')
      setGuestCount(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, signups.length])

  async function saveDinnerSignup() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token || !selectedDinner) return

    setSaving(true)
    setMessage('Saving your dinner response…')
    const response = await fetch('/api/saturday-dinner', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        dinnerDate: selectedDinner.date,
        status,
        bringing,
        guestCount,
      }),
    })
    const result = await response.json().catch(() => null)

    if (!response.ok) {
      setMessage(result?.error || 'Unable to save your dinner response.')
      setSaving(false)
      return
    }

    let emailNote = ''
    if (result?.emailStatus === 'failed') emailNote = ` Admin email alert failed: ${result.emailMessage || 'unknown error'}.`
    if (result?.emailStatus === 'skipped') emailNote = ` Admin email alert skipped: ${result.emailMessage || 'not configured'}.`

    setMessage(`Saved — we have you marked ${status} for ${selectedDinner.month} ${selectedDinner.day}.${emailNote}`)
    setSaving(false)
    loadSignups()
  }

  function openDinner(dinnerDate: string) {
    setSelectedDate(dinnerDate)
    setMessage('')
    window.requestAnimationFrame(() => {
      signupCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  return (
    <main className="saturday-dinners-page">
      <section className="saturday-dinners-hero">
        <div>
          <span><Soup size={17} /> SATURDAY NIGHT DINNERS</span>
          <h1>Dinner is served Saturdays at 6 PM.</h1>
          <p>See the full season menu, tell us if you are coming, and let Bur Oaks know what you are bringing.</p>
        </div>
        {nextDinner && (
          <article>
            <small>NEXT DINNER</small>
            <strong>{nextDinner.month} {nextDinner.day}</strong>
            <span>{nextDinner.menu}</span>
            {nextDinner.theme && <em>{nextDinner.theme}</em>}
          </article>
        )}
      </section>

      <section className="saturday-month-snapshot">
        <div>
          <span><Sparkles size={15} /> {currentMonth.toUpperCase()} SNAPSHOT</span>
          <h2>{currentMonth} Saturday dinners at a glance</h2>
          <p>Tap any meal below and this page will open the signup card so you can mark Going, Maybe, or Not Going.</p>
        </div>
        <article>
          <small>Open meals</small>
          <strong>{openMonthDinners.length}</strong>
          <span>{remainingMonthDinners.length} still upcoming</span>
        </article>
        {remainingMonthDinners[0] && (
          <article>
            <small>Next in {currentMonth}</small>
            <strong>{remainingMonthDinners[0].day}</strong>
            <span>{remainingMonthDinners[0].menu}</span>
          </article>
        )}
        <article>
          <small>Your replies</small>
          <strong>{monthDinners.filter((dinner) => signupByDate.has(dinner.date)).length}</strong>
          <span>saved this month</span>
        </article>
      </section>

      <section className="saturday-dinner-signup" ref={signupCardRef}>
        <div>
          <small>YOUR RESPONSE</small>
          <h2>{selectedDinner?.month} {selectedDinner?.day} · {selectedDinner?.menu}</h2>
          <p><Clock size={15} /> Every Saturday dinner starts at 6:00 PM.</p>
          {selectedDinner?.theme && <p><Sparkles size={15} /> Theme: {selectedDinner.theme}</p>}
        </div>

        <div className="saturday-dinner-form">
          <label>
            <span>Dinner date</span>
            <select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>
              {saturdayDinners2026.map((dinner) => (
                <option disabled={dinner.closed} value={dinner.date} key={dinner.id}>
                  {dinner.month} {dinner.day} — {dinner.menu}{dinner.closed ? ' (Closed)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Are you coming?</span>
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option>Going</option>
              <option>Maybe</option>
              <option>Not Going</option>
            </select>
          </label>
          <label>
            <span>How many people?</span>
            <input type="number" min={1} max={20} value={guestCount} onChange={(event) => setGuestCount(Number(event.target.value || 1))} />
          </label>
          <label className="bring-field">
            <span>What are you bringing?</span>
            <input value={bringing} onChange={(event) => setBringing(event.target.value)} placeholder="Example: dessert, salad, chips, nothing this week" />
          </label>
          <button type="button" onClick={saveDinnerSignup} disabled={saving || selectedDinner?.closed}>
            <Send size={16} /> {saving ? 'Saving…' : 'Save dinner response'}
          </button>
        </div>
        {message && <p className="saturday-dinner-message">{message}</p>}
      </section>

      <section className="saturday-menu-board">
        {months.map((month) => (
          <article key={month}>
            <h2>{month}</h2>
            <div>
              {saturdayDinners2026.filter((dinner) => dinner.month === month).map((dinner) => {
                const mySignup = signupByDate.get(dinner.date)
                return (
                  <button
                    className={`${selectedDate === dinner.date ? 'selected' : ''} ${dinner.closed ? 'closed' : ''}`}
                    disabled={dinner.closed}
                    key={dinner.id}
                    onClick={() => openDinner(dinner.date)}
                    type="button"
                  >
                    <span><CalendarDays size={14} /> {dinner.day}</span>
                    <strong>{dinner.menu}</strong>
                    {dinner.theme && <em>{dinner.theme}</em>}
                    {mySignup && <small><CheckCircle2 size={13} /> {mySignup.attending_status}{mySignup.bringing ? ` · ${mySignup.bringing}` : ''}</small>}
                  </button>
                )
              })}
            </div>
          </article>
        ))}
      </section>

      <section className="saturday-dinner-note">
        <UsersRound size={20} />
        <div>
          <strong>Potluck planning made easy</strong>
          <p>Your response helps the office plan seating, sides, desserts, and setup before Saturday night.</p>
        </div>
      </section>
    </main>
  )
}
