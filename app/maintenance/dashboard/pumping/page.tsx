'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Check, CheckCircle2, Droplets, LoaderCircle, Phone, RefreshCw, RotateCcw, X } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { movePumpOutStopToEnd, pumpOutWorkerProgress, type PumpOutWorkerStop } from '../../../../lib/pump-out-worker'
import './pumping.css'

const OFFICE_PHONE = '+16184887927'

type WorkerStop = PumpOutWorkerStop & {
  camper_id?: string | null
  charge_amount?: number | null
  gallons_used?: number | null
}

function requestedLabel(value?: string | null) {
  if (!value) return 'Pending pump-out'
  const requested = new Date(value)
  if (Number.isNaN(requested.getTime())) return 'Pending pump-out'
  const today = new Date()
  const day = new Date(requested.getFullYear(), requested.getMonth(), requested.getDate()).getTime()
  const todayDay = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const difference = Math.round((todayDay - day) / 86_400_000)
  if (difference === 0) return 'Requested today'
  if (difference === 1) return 'Requested yesterday'
  return `Requested ${requested.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
}

export default function PumpOutWorkerPage() {
  const [stops, setStops] = useState<WorkerStop[]>([])
  const [routeTotal, setRouteTotal] = useState(0)
  const [completed, setCompleted] = useState(0)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function authorizationHeader() {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ? { Authorization: `Bearer ${data.session.access_token}` } : null
  }

  async function loadStops(resetProgress = false) {
    setLoading(true)
    setError('')
    setNotice('')
    setConfirming(false)

    const auth = await authorizationHeader()
    if (!auth) {
      setError('Your session expired. Please return to maintenance and sign in again.')
      setLoading(false)
      return
    }

    try {
      const response = await fetch('/api/maintenance-pump-outs', { headers: auth, cache: 'no-store' })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Could not load the pump-out route.')
      const nextStops = (result.stops || []) as WorkerStop[]
      setStops(nextStops)
      if (resetProgress || routeTotal === 0) {
        setRouteTotal(nextStops.length)
        setCompleted(0)
      } else if (nextStops.length > routeTotal - completed) {
        setRouteTotal(completed + nextStops.length)
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the pump-out route.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStops(true)
    // Initial route load only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = stops[0]
  const progress = pumpOutWorkerProgress(routeTotal, completed, stops.length)

  function skipCurrent() {
    if (!current) return
    setConfirming(false)
    if (stops.length < 2) {
      setNotice('This is the only stop left. It will stay here for later.')
      return
    }
    setStops((queue) => movePumpOutStopToEnd(queue, current.id))
    setNotice(`Lot ${current.lot_number || 'not listed'} moved to the end of today’s route.`)
  }

  async function completeCurrent() {
    if (!current || saving) return
    setSaving(true)
    setError('')
    setNotice('')

    const auth = await authorizationHeader()
    if (!auth) {
      setError('Your session expired. Return to maintenance and sign in again.')
      setSaving(false)
      return
    }

    try {
      const response = await fetch('/api/maintenance-pump-outs', {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: current.id }),
      })
      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) throw new Error(result?.error || 'Could not mark this pump-out complete.')

      setStops((queue) => queue.filter((stop) => stop.id !== current.id))
      setCompleted((count) => Math.min(count + 1, routeTotal))
      setConfirming(false)
      setNotice(`Lot ${current.lot_number || ''} complete. ${stops.length > 1 ? 'Next stop is ready.' : 'Route complete.'}`)
    } catch (completeError) {
      setError(completeError instanceof Error ? completeError.message : 'Could not mark this pump-out complete.')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <main className="pump-worker-page pump-worker-state">
        <LoaderCircle className="pump-worker-spinner" size={72} />
        <h1>Loading pump-outs…</h1>
        <p>Please wait. Do not close this screen.</p>
      </main>
    )
  }

  if (error && !current) {
    return (
      <main className="pump-worker-page pump-worker-state error">
        <X size={78} />
        <h1>Could not load the route.</h1>
        <p>{error}</p>
        <button type="button" onClick={() => loadStops(true)}><RefreshCw size={30} /> TRY AGAIN</button>
        <a href={`tel:${OFFICE_PHONE}`}><Phone size={30} /> CALL OFFICE</a>
        <Link href="/maintenance/dashboard"><ArrowLeft size={24} /> Maintenance home</Link>
      </main>
    )
  }

  if (!current) {
    return (
      <main className="pump-worker-page pump-worker-state complete">
        <CheckCircle2 size={96} />
        <h1>{routeTotal > 0 ? 'Route complete!' : 'No pump-outs waiting.'}</h1>
        <p>{routeTotal > 0 ? `All ${completed} pump-outs are marked complete.` : 'There are no pending sewer pump-out requests right now.'}</p>
        <button type="button" onClick={() => loadStops(true)}><RefreshCw size={30} /> CHECK AGAIN</button>
        <Link className="pump-worker-home" href="/maintenance/dashboard"><ArrowLeft size={24} /> MAINTENANCE HOME</Link>
      </main>
    )
  }

  return (
    <main className="pump-worker-page">
      <header className="pump-worker-brand">
        <Link href="/maintenance/dashboard" aria-label="Back to maintenance"><ArrowLeft size={31} /></Link>
        <div><Droplets size={34} /><span><strong>BUR OAKS</strong><small>CAMPGROUND</small></span></div>
        <span>WORKER</span>
      </header>

      <section className="pump-worker-route">
        <span>SEWER SERVICE</span>
        <h1>Today’s Pump-Outs</h1>
        <strong>{progress.remaining} {progress.remaining === 1 ? 'stop' : 'stops'} remaining</strong>
        <div className="pump-worker-progress" aria-label={`Stop ${progress.current} of ${progress.total}`}>
          <i style={{ width: `${progress.total ? (progress.current / progress.total) * 100 : 0}%` }} />
        </div>
        <p>STOP {progress.current} OF {progress.total}</p>
      </section>

      <section className="pump-worker-content">
        {notice && <p className="pump-worker-notice" aria-live="polite"><Check size={25} /> {notice}</p>}
        {error && <p className="pump-worker-error" role="alert"><X size={25} /> {error}</p>}

        <article className="pump-worker-stop">
          <small>NEXT STOP</small>
          <div className="pump-worker-lot-label">LOT</div>
          <strong className="pump-worker-lot">{current.lot_number || '—'}</strong>
          <h2>{current.camper_name || 'Camper name unavailable'}</h2>
          <p>{requestedLabel(current.requested_at)}</p>
          {current.notes && <div className="pump-worker-note"><strong>NOTE</strong><span>{current.notes}</span></div>}
        </article>

        {confirming ? (
          <section className="pump-worker-confirm" role="alertdialog" aria-labelledby="complete-heading">
            <CheckCircle2 size={65} />
            <h2 id="complete-heading">Finished Lot {current.lot_number || ''}?</h2>
            <p>This records the pump-out as complete and moves to the next stop.</p>
            <button className="yes" type="button" disabled={saving} onClick={completeCurrent}>
              {saving ? <LoaderCircle className="pump-worker-spinner" size={34} /> : <Check size={38} />}
              {saving ? 'SAVING…' : 'YES, MARK COMPLETE'}
            </button>
            <button className="no" type="button" disabled={saving} onClick={() => setConfirming(false)}><X size={31} /> GO BACK</button>
          </section>
        ) : (
          <section className="pump-worker-actions">
            <button className="complete" type="button" onClick={() => setConfirming(true)}><Check size={48} /> MARK COMPLETE</button>
            <button className="skip" type="button" onClick={skipCurrent}><RotateCcw size={35} /> SKIP FOR NOW</button>
            <a className="call" href={`tel:${OFFICE_PHONE}`}><Phone size={35} /> CALL OFFICE</a>
          </section>
        )}
      </section>
    </main>
  )
}
