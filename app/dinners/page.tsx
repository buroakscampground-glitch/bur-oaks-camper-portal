'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { CalendarDays, CheckCircle2, Clock, Send, Soup, Sparkles, UsersRound } from 'lucide-react'
import { dinnerBringSuggestions, saturdayDinners2026 } from '../../lib/saturday-dinners'
import { supabase } from '../../lib/supabase'

const months = ['March', 'April', 'May', 'June', 'July', 'August', 'Sept', 'October']

export default function SaturdayDinnersPage() {
  const searchParams = useSearchParams()
  const [signups, setSignups] = useState<any[]>([])
  const [publicSignups, setPublicSignups] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [status, setStatus] = useState('Going')
  const [bringChoice, setBringChoice] = useState('')
  const [customBringing, setCustomBringing] = useState('')
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
    if (response.ok) {
      setSignups(result?.signups || [])
      setPublicSignups(result?.publicSignups || [])
    }
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
  const selectedDinnerSignups = publicSignups.filter((signup) => signup.dinner_date === selectedDinner?.date)
  const visibleDinnerSignups = selectedDinnerSignups.filter((signup) => signup.attending_status !== 'Not Going')
  const selectedDinnerSuggestions = dinnerBringSuggestions(selectedDinner?.menu || '')
  const normalizedCurrentBringing = String(
    bringChoice === 'Other' ? customBringing : bringChoice
  ).trim().toLowerCase()
  const claimedBringItems = new Set(
    visibleDinnerSignups
      .map((signup) => String(signup.bringing || '').trim().toLowerCase())
      .filter(Boolean)
  )
  const availableBringSuggestions = selectedDinnerSuggestions.filter((item) => {
    const normalized = item.toLowerCase()
    return !claimedBringItems.has(normalized) || normalized === normalizedCurrentBringing
  })

  useEffect(() => {
    const requestedDate = searchParams.get('date')
    const requestedDinner = saturdayDinners2026.find((dinner) => dinner.date === requestedDate && !dinner.closed)

    if (!selectedDate && requestedDinner) {
      setSelectedDate(requestedDinner.date)
      window.requestAnimationFrame(() => {
        signupCardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
      return
    }

    if (!selectedDate && nextDinner) setSelectedDate(nextDinner.date)
  }, [nextDinner, searchParams, selectedDate])

  useEffect(() => {
    const existing = selectedDate ? signupByDate.get(selectedDate) : null
    const suggestions = dinnerBringSuggestions(selectedDinner?.menu || '')
    if (existing) {
      setStatus(existing.attending_status || 'Going')
      if (existing.bringing && suggestions.includes(existing.bringing)) {
        setBringChoice(existing.bringing)
        setCustomBringing('')
      } else if (existing.bringing) {
        setBringChoice('Other')
        setCustomBringing(existing.bringing)
      } else {
        setBringChoice('')
        setCustomBringing('')
      }
      setGuestCount(existing.guest_count || 1)
    } else {
      setStatus('Going')
      setBringChoice('')
      setCustomBringing('')
      setGuestCount(1)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDate, selectedDinner?.menu, signups.length])

  async function saveDinnerSignup() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token || !selectedDinner) return

    setSaving(true)
    setMessage('Saving your dinner response…')
    const bringing = bringChoice === 'Other' ? customBringing.trim() : bringChoice.trim()
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

  function updateGuestCount(value: number) {
    const safeCount = Math.max(1, Math.min(99, Math.round(value || 1)))
    setGuestCount(safeCount)
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
            <div className="saturday-dinner-count">
              <button type="button" onClick={() => updateGuestCount(guestCount - 1)} disabled={guestCount <= 1}>−</button>
              <input
                type="number"
                min={1}
                max={99}
                inputMode="numeric"
                value={guestCount}
                onChange={(event) => updateGuestCount(Number(event.target.value || 1))}
                aria-label="Number of people coming to dinner"
              />
              <button type="button" onClick={() => updateGuestCount(guestCount + 1)}>+</button>
            </div>
          </label>
          <label className="bring-field">
            <span>What are you bringing?</span>
            <select value={bringChoice} onChange={(event) => setBringChoice(event.target.value)}>
              <option value="">Nothing / not sure yet</option>
              {availableBringSuggestions.map((item) => (
                <option value={item} key={item}>{item}</option>
              ))}
              <option value="Other">Other — I will type it in</option>
            </select>
          </label>
          {bringChoice === 'Other' && (
            <label className="bring-field">
              <span>Other item</span>
              <input value={customBringing} onChange={(event) => setCustomBringing(event.target.value)} placeholder="Example: brownies, fruit salad, lemonade" />
            </label>
          )}
          <button type="button" onClick={saveDinnerSignup} disabled={saving || selectedDinner?.closed}>
            <Send size={16} /> {saving ? 'Saving…' : 'Save dinner response'}
          </button>
        </div>
        {message && <p className="saturday-dinner-message">{message}</p>}

        <div className="saturday-dinner-bringing-board">
          <div>
            <small>WHO IS BRINGING WHAT</small>
            <h3>{selectedDinner?.month} {selectedDinner?.day} potluck list</h3>
            <p>Claimed suggested items disappear from the dropdown so everyone can spread things out.</p>
          </div>
          {visibleDinnerSignups.length > 0 ? (
            <div className="saturday-dinner-bringing-list">
              {visibleDinnerSignups.map((signup) => (
                <article key={signup.id}>
                  <span>Lot {signup.lot_number || '—'}</span>
                  <strong>{signup.camper_name || 'Camper'}</strong>
                  <p>
                    {signup.attending_status}
                    {signup.guest_count ? ` · ${signup.guest_count} ${Number(signup.guest_count) === 1 ? 'person' : 'people'}` : ''}
                  </p>
                  <em>{signup.bringing || 'Nothing listed yet'}</em>
                </article>
              ))}
            </div>
          ) : (
            <p className="saturday-dinner-empty-small">No one has added what they are bringing yet.</p>
          )}
        </div>
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
                    {mySignup && (
                      <small>
                        <CheckCircle2 size={13} /> {mySignup.attending_status}
                        {mySignup.guest_count ? ` · ${mySignup.guest_count} people` : ''}
                        {mySignup.bringing ? ` · ${mySignup.bringing}` : ''}
                      </small>
                    )}
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
