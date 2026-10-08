'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname } from 'next/navigation'
import { AlertTriangle, CalendarDays, CheckCircle2, CircleHelp, Loader2, Search, Soup, UsersRound, UtensilsCrossed, XCircle } from 'lucide-react'
import { saturdayDinnerEngagementStartDate, saturdayDinnerMetrics } from '../../../lib/saturday-dinner-metrics'
import { dinnerBringSuggestions, saturdayDinners2026 } from '../../../lib/saturday-dinners'
import { supabase } from '../../../lib/supabase'
import { thanksgivingDinnerDate } from '../../../lib/thanksgiving-dinner'

export default function AdminDinnersPage() {
  const pathname = usePathname()
  const [signups, setSignups] = useState<any[]>([])
  const [campers, setCampers] = useState<any[]>([])
  const [selectedDate, setSelectedDate] = useState('')
  const [search, setSearch] = useState('')
  const [participationSearch, setParticipationSearch] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    loadSignups()

    const refresh = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadSignups()
    }, 2 * 60_000)
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
    setLoadError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const response = await fetch('/api/community-dinners', { headers: { Authorization: `Bearer ${session?.access_token || ''}` } })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to load dinner responses.')
      setSignups(result.signups || [])
      setCampers(result.campers || [])
    } catch {
      setLoadError('Dinner responses and the camper roster could not be loaded. Headcounts are hidden until both are available.')
    } finally {
      setLoading(false)
    }
  }

  const nextDinner = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    return saturdayDinners2026.find((dinner) => dinner.date >= today && !dinner.closed) || saturdayDinners2026.find((dinner) => !dinner.closed)
  }, [])

  useEffect(() => {
    if (!selectedDate && nextDinner) setSelectedDate(nextDinner.date)
  }, [nextDinner, selectedDate])

  const selectedDinner = saturdayDinners2026.find((dinner) => dinner.date === selectedDate) || nextDinner
  const isSoupDay = selectedDinner?.date === '2026-09-26'
  const dinnerSignups = signups.filter((signup) => signup.dinner_date === selectedDinner?.date)
  const visibleSignups = dinnerSignups.filter((signup) =>
    `${signup.camper_name} ${signup.lot_number} ${signup.bringing || ''}`
      .toLowerCase()
      .includes(search.toLowerCase())
  )
  const metrics = saturdayDinnerMetrics(dinnerSignups)
  const activeSignups = dinnerSignups.filter((signup) => signup.attending_status !== 'Not Going')
  const suggestedBringItems = dinnerBringSuggestions(selectedDinner?.menu || '')
  const bringOptions = [
    ...suggestedBringItems.map((label) => ({ label, custom: false })),
    ...Array.from(new Set(activeSignups
      .map((signup) => String(signup.bringing || '').trim())
      .filter((item) => item && !suggestedBringItems.some((suggestion) => suggestion.toLowerCase() === item.toLowerCase()))))
      .map((label) => ({ label, custom: true })),
  ]
  const trackedDinnerDates = useMemo(() => {
    const throughDate = nextDinner?.date || selectedDinner?.date || ''
    return saturdayDinners2026
      .filter((dinner) => !dinner.closed && dinner.date >= saturdayDinnerEngagementStartDate && dinner.date <= throughDate)
      .map((dinner) => dinner.date)
  }, [nextDinner?.date, selectedDinner?.date])
  const allParticipationRows = useMemo(() => campers.map((camper) => {
    const camperSinceDate = String(camper.camper_since_date || '').slice(0, 10)
    const eligibleDates = trackedDinnerDates.filter((date) => !camperSinceDate || date >= camperSinceDate)
    const camperSignups = signups.filter((signup) => String(signup.camper_id || '') === String(camper.id || '') && eligibleDates.includes(String(signup.dinner_date || '')))
    const responseByDate = new Map(camperSignups.map((signup) => [String(signup.dinner_date || ''), signup]))
    const goingCount = camperSignups.filter((signup) => signup.attending_status === 'Going').length
    const maybeCount = camperSignups.filter((signup) => signup.attending_status === 'Maybe').length
    const notGoingCount = camperSignups.filter((signup) => signup.attending_status === 'Not Going').length
    const noResponseCount = eligibleDates.filter((date) => !responseByDate.has(date)).length
    const name = `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper'
    return {
      id: String(camper.id || ''),
      lotNumber: String(camper.lot_number || '—'),
      name,
      dinnersTracked: eligibleDates.length,
      responded: camperSignups.length,
      goingCount,
      maybeCount,
      notGoingCount,
      noResponseCount,
      responseRate: eligibleDates.length ? Math.round((camperSignups.length / eligibleDates.length) * 100) : 0,
    }
  }).sort((left, right) => right.noResponseCount - left.noResponseCount || left.responseRate - right.responseRate || left.lotNumber.localeCompare(right.lotNumber, undefined, { numeric: true })), [campers, signups, trackedDinnerDates])
  const participationRows = allParticipationRows.filter((row) =>
    `${row.name} ${row.lotNumber}`.toLowerCase().includes(participationSearch.toLowerCase())
  )
  const seasonResponseTotal = allParticipationRows.reduce((sum, row) => sum + row.responded, 0)
  const seasonNoResponseTotal = allParticipationRows.reduce((sum, row) => sum + row.noResponseCount, 0)
  const seasonOpportunityTotal = seasonResponseTotal + seasonNoResponseTotal
  const seasonResponseRate = seasonOpportunityTotal ? Math.round((seasonResponseTotal / seasonOpportunityTotal) * 100) : 0

  function selectDinner(dinnerDate: string) {
    if (dinnerDate === thanksgivingDinnerDate) {
      window.location.href = '/admin/thanksgiving'
      return
    }
    setSelectedDate(dinnerDate)
  }

  if (loading) return <main className="portal-loading"><Loader2 className="spin" /><h1>Loading dinner planner…</h1></main>
  if (loadError) return <main className="portal-loading" role="alert"><AlertTriangle aria-hidden="true" /><h1>Dinner planner is temporarily unavailable</h1><p>{loadError}</p><button className="portal-loading-retry" type="button" onClick={loadSignups}>Try again</button></main>

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

      <a className="admin-thanksgiving-launch" href="/admin/thanksgiving">
        <UtensilsCrossed size={22} />
        <span><small>SPECIAL DINNER PLANNER</small><strong>Open the Bur Oaks Thanksgiving board</strong><em>Track the 110–120 person headcount and every food category in one place.</em></span>
      </a>

      <section className="admin-dinner-controls">
        <label>
          <span>Dinner date</span>
          <select value={selectedDinner?.date || ''} onChange={(event) => selectDinner(event.target.value)}>
            {saturdayDinners2026.map((dinner) => (
              <option disabled={dinner.closed} value={dinner.date} key={dinner.id}>
                {dinner.month} {dinner.day} — {dinner.menu}{dinner.closed ? ' (Closed)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="admin-dinner-metric-grid" aria-label="Dinner response totals">
          <article><small>People attending</small><strong>{metrics.confirmedPeople}</strong><span>{metrics.goingCampsites} campsite{metrics.goingCampsites === 1 ? '' : 's'} going</span></article>
          <article><small>Maybe</small><strong>{metrics.maybeCampsites}</strong><span>{metrics.possiblePeople} possible people</span></article>
          <article><small>Not going</small><strong>{metrics.notGoingCampsites}</strong><span>campsite responses</span></article>
          <article><small>Total responses</small><strong>{metrics.responses}</strong><span>one per campsite</span></article>
          <article><small>Confirmed dishes</small><strong>{metrics.confirmedDishes}</strong><span>{metrics.possibleDishes} more from maybe</span></article>
          <article><small>Going, no dish</small><strong>{metrics.goingWithoutDish}</strong><span>follow-up list</span></article>
        </div>
      </section>

      <p className="admin-dinner-message" role="status">Live updates are on — camper responses refresh automatically.</p>

      {selectedDinner && (
        <section className="admin-dinner-feature">
          <CalendarDays size={24} />
          <div>
            <small>{selectedDinner.month} {selectedDinner.day} · 6:00 PM</small>
            <h2>{selectedDinner.menu}</h2>
            {selectedDinner.note && <p>{selectedDinner.note}</p>}
            {selectedDinner.theme && <p>{selectedDinner.theme}</p>}
          </div>
        </section>
      )}

      {selectedDinner && (
        <section className="saturday-dinner-bringing-board">
          <div>
            <small>{isSoupDay ? 'SOUP DAY CHOICES' : 'AVAILABLE CHOICES'}</small>
            <h3>{isSoupDay ? 'Soups, crackers, and cheese' : 'What campers can bring'}</h3>
            <p>{isSoupDay ? 'Rachel and the office can see each kind of soup, plus who is bringing crackers or shredded cheese.' : 'Rachel and the office can see every suggested choice, who selected it, and any custom item a camper added.'}</p>
          </div>
          <div className="saturday-dinner-bringing-list">
            {bringOptions.map((option) => {
              const selectedBy = activeSignups.filter((signup) => String(signup.bringing || '').trim().toLowerCase() === option.label.toLowerCase())
              return (
                <article key={`${option.custom ? 'custom' : 'suggested'}:${option.label}`}>
                  <span>{option.custom ? 'CAMPER ADDED' : selectedBy.length ? 'SELECTED' : 'AVAILABLE'}</span>
                  <strong>{option.label}</strong>
                  <p>{selectedBy.length
                    ? selectedBy.map((signup) => `${signup.camper_name} · Lot ${signup.lot_number || 'N/A'} (${signup.attending_status})`).join(', ')
                    : 'No one has selected this yet.'}</p>
                  {selectedBy.length > 0 && <em>{selectedBy.length} promised dish{selectedBy.length === 1 ? '' : 'es'}</em>}
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section className="admin-dinner-season-sides">
        <div className="admin-dinner-season-sides-heading">
          <div>
            <small>ALL MEALS</small>
            <h2>Side dishes by dinner</h2>
            <p>Open any meal to see every suggested side and the dishes campers have already chosen.</p>
          </div>
          <strong>{saturdayDinners2026.filter((dinner) => !dinner.closed).length} dinners</strong>
        </div>
        <div className="admin-dinner-season-sides-list">
          {saturdayDinners2026.filter((dinner) => !dinner.closed).map((dinner) => {
            const mealSignups = signups.filter((signup) => signup.dinner_date === dinner.date && signup.attending_status !== 'Not Going')
            const selectedSides = Array.from(new Set(mealSignups.map((signup) => String(signup.bringing || '').trim()).filter(Boolean)))
            const promisedDishes = mealSignups.filter((signup) => String(signup.bringing || '').trim()).length
            return (
              <details key={dinner.id}>
                <summary>
                  <span>{dinner.month} {dinner.day}</span>
                  <strong>{dinner.menu}</strong>
                  <em>{promisedDishes} promised dish{promisedDishes === 1 ? '' : 'es'}</em>
                </summary>
                <div>
                  <p><strong>{dinner.date === '2026-09-26' ? 'Soup Day extras:' : 'Suggested side dishes:'}</strong> {dinnerBringSuggestions(dinner.menu).join(', ')}</p>
                  <p><strong>Camper selections:</strong> {selectedSides.length ? selectedSides.join(', ') : 'Nothing selected yet.'}</p>
                </div>
              </details>
            )
          })}
        </div>
      </section>

      {pathname.startsWith('/admin') && (
        <section className="admin-dinner-participation">
          <header>
            <div>
              <small>2026 ENGAGEMENT TOTAL</small>
              <h2>Who answers—and who needs encouragement</h2>
              <p>This running yearly total begins with the October 10 portal signup and adds every dinner from there. Each camper’s start date is honored, so nobody is counted absent before joining Bur Oaks.</p>
            </div>
            <label><Search size={16} /><input value={participationSearch} onChange={(event) => setParticipationSearch(event.target.value)} placeholder="Search camper or lot" /></label>
          </header>
          <div className="admin-dinner-participation-summary">
            <article><small>Dinners tracked this year</small><strong>{trackedDinnerDates.length}</strong><span>Oct 10 through {nextDinner?.month} {nextDinner?.day}</span></article>
            <article><small>Campers tracked</small><strong>{allParticipationRows.length}</strong><span>active campsite accounts</span></article>
            <article><small>Responses received</small><strong>{seasonResponseTotal}</strong><span>all Going, Maybe, and Not going</span></article>
            <article><small>No responses</small><strong>{seasonNoResponseTotal}</strong><span>engagement opportunities</span></article>
            <article><small>Campground response rate</small><strong>{seasonResponseRate}%</strong><span>year to date</span></article>
          </div>
          <div className="admin-dinner-participation-key">
            <span><CheckCircle2 size={15} /> Going</span>
            <span><CircleHelp size={15} /> Maybe</span>
            <span><XCircle size={15} /> Not going</span>
            <strong>Running 2026 total · begins Oct 10</strong>
          </div>
          <div className="admin-dinner-participation-list">
            {participationRows.map((row) => (
              <article key={row.id} className={row.noResponseCount > 0 ? 'needs-response' : 'complete'}>
                <div><small>LOT {row.lotNumber}</small><strong>{row.name}</strong><span>2026: {row.responseRate}% · answered {row.responded} of {row.dinnersTracked}</span></div>
                <dl>
                  <div><dt>Going</dt><dd>{row.goingCount}</dd></div>
                  <div><dt>Maybe</dt><dd>{row.maybeCount}</dd></div>
                  <div><dt>Not going</dt><dd>{row.notGoingCount}</dd></div>
                  <div className={row.noResponseCount ? 'missed' : ''}><dt>No response</dt><dd>{row.noResponseCount}</dd></div>
                </dl>
              </article>
            ))}
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
