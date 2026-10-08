'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ChefHat, Loader2, RefreshCw, Search, UsersRound, UtensilsCrossed } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { thanksgivingDinnerDate, thanksgivingFoodOption, thanksgivingFoodOptions } from '../../../lib/thanksgiving-dinner'

type Signup = {
  id: string
  dinner_date: string
  camper_name?: string
  lot_number?: string
  attending_status?: string
  bringing?: string
  guest_count?: number
}

export default function ThanksgivingAdminPage() {
  const [signups, setSignups] = useState<Signup[]>([])
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('Loading the Thanksgiving planner…')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  async function loadSignups() {
    setLoading(true)
    setLoadError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/community-dinners', {
        headers: { Authorization: `Bearer ${session?.access_token || ''}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to load Thanksgiving responses.')
      setSignups((result.signups || []).filter((signup: Signup) => signup.dinner_date === thanksgivingDinnerDate))
      setMessage('Live planner refreshed.')
    } catch {
      setLoadError('Thanksgiving responses could not be loaded. Attendance and food totals are hidden until the live planner is available.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSignups()
    const refresh = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadSignups()
    }, 2 * 60_000)
    return () => window.clearInterval(refresh)
  }, [])

  const active = signups.filter((signup) => signup.attending_status !== 'Not Going')
  const going = signups.filter((signup) => signup.attending_status === 'Going')
  const maybe = signups.filter((signup) => signup.attending_status === 'Maybe')
  const notGoing = signups.filter((signup) => signup.attending_status === 'Not Going')
  const expectedPeople = going.reduce((sum, signup) => sum + Number(signup.guest_count || 1), 0)
  const possiblePeople = maybe.reduce((sum, signup) => sum + Number(signup.guest_count || 1), 0)
  const groupedOptions = Array.from(new Set(thanksgivingFoodOptions.map((option) => option.group)))
  const filtered = useMemo(() => signups.filter((signup) =>
    `${signup.camper_name || ''} ${signup.lot_number || ''} ${signup.bringing || ''}`.toLowerCase().includes(search.toLowerCase())
  ), [search, signups])

  function campersFor(label: string) {
    const optionId = thanksgivingFoodOption(label)?.id
    return active.filter((signup) => thanksgivingFoodOption(signup.bringing)?.id === optionId)
  }

  if (loading) return <main className="portal-loading"><Loader2 className="spin" /><h1>Loading Thanksgiving planner…</h1></main>
  if (loadError) return <main className="portal-loading" role="alert"><AlertTriangle aria-hidden="true" /><h1>Thanksgiving planner is temporarily unavailable</h1><p>{loadError}</p><button className="portal-loading-retry" type="button" onClick={loadSignups}>Try again</button></main>

  return (
    <main className="admin-thanksgiving-page">
      <section className="admin-thanksgiving-hero">
        <div>
          <span><UtensilsCrossed size={17} /> NOVEMBER 7 · 6:00 PM</span>
          <h1>Bur Oaks Thanksgiving planner</h1>
          <p>One live view of attendance and the food needed for 110–120 people. Anthony is providing all turkeys.</p>
        </div>
        <a href="/admin/dinners"><ArrowLeft size={16} /> All dinners</a>
      </section>

      <section className="admin-thanksgiving-stats">
        <article><small>Going</small><strong>{going.length}</strong><span>campsites</span></article>
        <article><small>Expected people</small><strong>{expectedPeople}</strong><span>confirmed</span></article>
        <article><small>Maybe</small><strong>{maybe.length}</strong><span>up to {possiblePeople} more</span></article>
        <article><small>Not going</small><strong>{notGoing.length}</strong><span>campsites</span></article>
      </section>

      <section className="admin-thanksgiving-note">
        <ChefHat size={27} />
        <div><strong>Turkey and supplies are excluded by design.</strong><p>Campers can only claim actual food. Each category closes automatically when its planned number of campsite dishes is reached.</p></div>
      </section>

      <section className="admin-thanksgiving-coverage">
        <header><div><small>FOOD COVERAGE</small><h2>What is covered and what is still needed</h2></div><button onClick={loadSignups} disabled={loading} type="button"><RefreshCw size={16} /> {loading ? 'Refreshing…' : 'Refresh'}</button></header>
        {groupedOptions.map((group) => (
          <div className="admin-thanksgiving-group" key={group}>
            <h3>{group}</h3>
            <div>
              {thanksgivingFoodOptions.filter((option) => option.group === group).map((option) => {
                const campers = campersFor(option.label)
                const remaining = Math.max(0, option.limit - campers.length)
                return (
                  <article className={remaining === 0 ? 'covered' : ''} key={option.id}>
                    <span>{remaining === 0 ? 'Covered' : `${remaining} still needed`}</span>
                    <strong>{option.label}</strong>
                    <small>{campers.length} of {option.limit} claimed · {option.servingGuide}</small>
                    <p>{campers.length ? campers.map((signup) => `${signup.camper_name || 'Camper'} · Lot ${signup.lot_number || '—'}`).join(', ') : 'No camper has claimed this yet.'}</p>
                  </article>
                )
              })}
            </div>
          </div>
        ))}
      </section>

      <section className="admin-thanksgiving-roster">
        <header>
          <div><small>RESPONSE LIST</small><h2>Every campsite response</h2></div>
          <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search camper, lot, or food" /></label>
        </header>
        <div>
          {filtered.map((signup) => (
            <article key={signup.id}>
              <span className={String(signup.attending_status || '').toLowerCase().replace(/\s+/g, '-')}>{signup.attending_status}</span>
              <div><small>Lot {signup.lot_number || '—'} · {signup.guest_count || 1} people</small><strong>{signup.camper_name || 'Camper'}</strong><p>{signup.bringing || 'No food item — not attending'}</p></div>
            </article>
          ))}
          {!filtered.length && <div className="admin-thanksgiving-empty"><UsersRound size={30} /><p>No matching Thanksgiving responses yet.</p></div>}
        </div>
        <p className="admin-thanksgiving-status" role="status">{message}</p>
      </section>
    </main>
  )
}
