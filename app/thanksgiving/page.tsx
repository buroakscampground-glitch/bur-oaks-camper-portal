'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, CalendarDays, CheckCircle2, ChefHat, Loader2, Minus, Plus, Send, UsersRound, UtensilsCrossed } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import {
  thanksgivingDinnerDate,
  thanksgivingFoodOption,
  thanksgivingFoodOptions,
  thanksgivingWriteInMaxLength,
} from '../../lib/thanksgiving-dinner'

type Signup = {
  id?: string
  camper_id?: string
  dinner_date: string
  camper_name?: string
  lot_number?: string
  attending_status?: string
  bringing?: string
  guest_count?: number
}

export default function ThanksgivingSignupPage() {
  const [mySignup, setMySignup] = useState<Signup | null>(null)
  const [publicSignups, setPublicSignups] = useState<Signup[]>([])
  const [status, setStatus] = useState('Going')
  const [guestCount, setGuestCount] = useState(1)
  const [bringing, setBringing] = useState('')
  const [usingWriteIn, setUsingWriteIn] = useState(false)
  const [writeInItem, setWriteInItem] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [loadError, setLoadError] = useState('')
  const savingRef = useRef(false)

  async function loadSignup() {
    setLoading(true)
    setLoadError('')
    try {
      const { data, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const token = data.session?.access_token
      if (!token) {
        window.location.href = '/login'
        return
      }

      const response = await fetch('/api/saturday-dinner', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to open the Thanksgiving signup.')

      const mine = (result.signups || []).find((signup: Signup) => signup.dinner_date === thanksgivingDinnerDate) || null
      setMySignup(mine)
      setPublicSignups((result.publicSignups || []).filter((signup: Signup) => signup.dinner_date === thanksgivingDinnerDate))
      if (mine) {
        setStatus(mine.attending_status || 'Going')
        setGuestCount(Number(mine.guest_count || 1))
        const savedOption = thanksgivingFoodOption(mine.bringing)
        setBringing(savedOption?.label || '')
        setUsingWriteIn(Boolean(mine.bringing && !savedOption))
        setWriteInItem(savedOption ? '' : String(mine.bringing || ''))
      }
    } catch (error: any) {
      setMySignup(null)
      setPublicSignups([])
      setLoadError(error?.message || 'The Thanksgiving signup could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadSignup()
  }, [])

  const claimCounts = useMemo(() => {
    const counts = new Map<string, number>()
    publicSignups.forEach((signup) => {
      if (signup.attending_status === 'Not Going') return
      const key = String(signup.bringing || '').trim().toLowerCase()
      if (key) counts.set(key, (counts.get(key) || 0) + 1)
    })
    return counts
  }, [publicSignups])

  const attendingSignups = publicSignups.filter((signup) => signup.attending_status === 'Going')
  const maybeSignups = publicSignups.filter((signup) => signup.attending_status === 'Maybe')
  const expectedPeople = attendingSignups.reduce((sum, signup) => sum + Number(signup.guest_count || 1), 0)
  const groupedOptions = Array.from(new Set(thanksgivingFoodOptions.map((option) => option.group)))
  const selectedFoodItem = usingWriteIn ? writeInItem.trim() : bringing

  function optionCount(label: string) {
    return claimCounts.get(label.toLowerCase()) || 0
  }

  function updateGuestCount(value: number) {
    setGuestCount(Math.max(1, Math.min(99, Math.round(value || 1))))
  }

  async function saveSignup() {
    if (savingRef.current) return
    if (status !== 'Not Going' && !selectedFoodItem) {
      setMessage(usingWriteIn ? 'Please type the food item you plan to bring.' : 'Please choose a food item or use the write-in box before saving.')
      return
    }

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      window.location.href = '/login'
      return
    }

    savingRef.current = true
    setSaving(true)
    setMessage('Saving your Thanksgiving response…')
    try {
      const response = await fetch('/api/saturday-dinner', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          dinnerDate: thanksgivingDinnerDate,
          status,
          guestCount,
          bringing: status === 'Not Going' ? '' : selectedFoodItem,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to save your Thanksgiving response.')

      setMessage(status === 'Not Going'
        ? 'Saved — the office knows your campsite will not be attending.'
        : `Saved — ${guestCount} ${guestCount === 1 ? 'person' : 'people'} attending and bringing ${selectedFoodItem}.`)
      await loadSignup()
    } catch {
      setMessage('The Thanksgiving response result could not be confirmed. Check your saved response before submitting again.')
    } finally {
      savingRef.current = false
      setSaving(false)
    }
  }

  if (loading) {
    return <main className="portal-loading" role="alert"><Loader2 className="portal-loading-spinner" aria-hidden="true" /><h1>Opening the Thanksgiving signup…</h1></main>
  }

  if (loadError) return <main className="portal-loading portal-loading-error" role="alert"><AlertTriangle aria-hidden="true" /><h1>Thanksgiving signup is temporarily unavailable</h1><p>Attendance totals, food claims, and response controls are hidden until the complete signup can be confirmed.</p><button className="portal-loading-retry" type="button" onClick={loadSignup}>Try again</button></main>

  return (
    <main className="thanksgiving-page">
      <a className="thanksgiving-back" href="/portal"><ArrowLeft size={17} /> Back to camper portal</a>

      <section className="thanksgiving-hero">
        <div className="thanksgiving-hero-copy">
          <span><UtensilsCrossed size={17} /> OUR LAST BIG MEAL OF THE SEASON</span>
          <h1>Bur Oaks Thanksgiving</h1>
          <p>Saturday, November 7 at 6:00 PM · Help us prepare a family Thanksgiving dinner for 110–120 people.</p>
        </div>
        <div className="thanksgiving-turkey-note">
          <ChefHat size={28} />
          <div><strong>Anthony has all the turkeys covered.</strong><span>Please claim one actual food item below. No plates, forks, napkins, or supplies are needed.</span></div>
        </div>
      </section>

      <section className="thanksgiving-overview" aria-label="Thanksgiving response summary">
        <article><small>Going</small><strong>{attendingSignups.length}</strong><span>campsites</span></article>
        <article><small>Expected</small><strong>{expectedPeople}</strong><span>people so far</span></article>
        <article><small>Maybe</small><strong>{maybeSignups.length}</strong><span>campsites</span></article>
      </section>

      <section className="thanksgiving-rsvp">
        <header>
          <span>STEP 1</span>
          <h2>Tell us who is coming</h2>
          <p>Submit one response for everyone staying at your campsite.</p>
        </header>
        <div className="thanksgiving-rsvp-fields">
          <label><span>Your response</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option>Going</option><option>Maybe</option><option>Not Going</option></select></label>
          <label>
            <span>Total people from your campsite</span>
            <div className="thanksgiving-count">
              <button type="button" onClick={() => updateGuestCount(guestCount - 1)} disabled={guestCount <= 1} aria-label="Remove one person"><Minus size={17} /></button>
              <input value={guestCount} type="number" min={1} max={99} inputMode="numeric" onChange={(event) => updateGuestCount(Number(event.target.value || 1))} />
              <button type="button" onClick={() => updateGuestCount(guestCount + 1)} aria-label="Add one person"><Plus size={17} /></button>
            </div>
          </label>
        </div>
      </section>

      <section className={`thanksgiving-food ${status === 'Not Going' ? 'disabled' : ''}`}>
        <header>
          <span>STEP 2</span>
          <h2>Claim one food item</h2>
          <p>More than one campsite can choose an item until that category has enough food for the whole group.</p>
        </header>
        {groupedOptions.map((group) => (
          <div className="thanksgiving-food-group" key={group}>
            <h3>{group}</h3>
            <div className="thanksgiving-food-grid">
              {thanksgivingFoodOptions.filter((option) => option.group === group).map((option) => {
                const claimed = optionCount(option.label)
                const selected = bringing === option.label
                const full = claimed >= option.limit && !selected
                return (
                  <button
                    className={`${selected ? 'selected' : ''} ${full ? 'full' : ''}`}
                    disabled={status === 'Not Going' || full}
                    key={option.id}
                    onClick={() => {
                      setBringing(option.label)
                      setUsingWriteIn(false)
                    }}
                    type="button"
                  >
                    <span>{selected ? <CheckCircle2 size={19} /> : <UtensilsCrossed size={18} />}{full ? 'Fully covered' : `${claimed} of ${option.limit} claimed`}</span>
                    <strong>{option.label}</strong>
                    <small>{option.servingGuide}</small>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        <div className="thanksgiving-write-in">
          <button
            aria-pressed={usingWriteIn}
            className={usingWriteIn ? 'selected' : ''}
            disabled={status === 'Not Going'}
            onClick={() => {
              setUsingWriteIn(true)
              setBringing('')
            }}
            type="button"
          >
            <span>{usingWriteIn ? <CheckCircle2 size={19} /> : <UtensilsCrossed size={18} />}WRITE IN A FOOD ITEM</span>
            <strong>Bringing something else?</strong>
            <small>Type the dish or dessert so everyone can see what you are bringing.</small>
          </button>
          {usingWriteIn && (
            <label>
              <span>Your food item</span>
              <input
                autoFocus
                disabled={status === 'Not Going'}
                maxLength={thanksgivingWriteInMaxLength}
                onChange={(event) => setWriteInItem(event.target.value)}
                placeholder="Example: Homemade apple crisp"
                value={writeInItem}
              />
              <small>{writeInItem.length} of {thanksgivingWriteInMaxLength} characters</small>
            </label>
          )}
        </div>
      </section>

      <section className="thanksgiving-save-panel">
        <div><UsersRound size={25} /><p><strong>{status === 'Not Going' ? 'We will save that you cannot attend.' : selectedFoodItem || 'Choose an item or write one in above.'}</strong><span>{status === 'Not Going' ? 'You can change your response later.' : `${guestCount} ${guestCount === 1 ? 'person' : 'people'} · ${status}`}</span></p></div>
        <button type="button" onClick={saveSignup} disabled={saving}><Send size={18} /> {saving ? 'Saving…' : mySignup ? 'Update my Thanksgiving response' : 'Save my Thanksgiving response'}</button>
        {message && <p className="thanksgiving-message" role="status">{message}</p>}
      </section>

      <section className="thanksgiving-covered">
        <header><CalendarDays size={23} /><div><small>WHAT IS ALREADY COVERED</small><h2>Campground food board</h2></div></header>
        <div>
          {publicSignups.filter((signup) => signup.attending_status !== 'Not Going' && signup.bringing).map((signup) => (
            <article key={signup.id}><span>Lot {signup.lot_number || '—'}</span><strong>{signup.bringing}</strong><small>{signup.camper_name || 'Camper'} · {signup.guest_count || 1} attending</small></article>
          ))}
          {!publicSignups.some((signup) => signup.attending_status !== 'Not Going' && signup.bringing) && <p>No food items have been claimed yet. Be the first!</p>}
        </div>
      </section>
    </main>
  )
}
