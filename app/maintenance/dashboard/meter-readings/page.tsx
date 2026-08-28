'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, Camera, CheckCircle2, ChevronRight, ClipboardCheck, Gauge, ListChecks, LoaderCircle, MapPin, RotateCcw, SkipForward, Trash2 } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { displayLotNumber, normalizeLotKey } from '../../../../lib/meter-reading'

type CapturedReading = {
  id: string
  status: string
  detected_reading: number | null
  submitted_reading: number | null
  reviewed_reading: number | null
  captured_at: string
}

type Site = {
  lot_number: string
  meter_number: string | null
  captured: CapturedReading | null
}

async function authToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

function monthKey() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function completedSite(site: Site) {
  return Boolean(site.captured && !['cancelled', 'retake'].includes(site.captured.status))
}

function capturedReading(site: Site) {
  if (!site.captured) return null
  const value = [site.captured.reviewed_reading, site.captured.submitted_reading, site.captured.detected_reading]
    .map(Number)
    .find((candidate) => Number.isFinite(candidate) && candidate > 0)
  return value ?? null
}

async function prepareMeterPhoto(file: File) {
  const sourceUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.src = sourceUrl
    await image.decode()
    const maxDimension = 1600
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', .82))
    return blob ? new File([blob], `meter-${Date.now()}.jpg`, { type: 'image/jpeg' }) : file
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

export function MeterReadingCapture({ adminMode = false }: { adminMode?: boolean }) {
  const routeMode = !adminMode
  const [sites, setSites] = useState<Site[]>([])
  const [lotNumber, setLotNumber] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [complete, setComplete] = useState(false)
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [skippedLots, setSkippedLots] = useState<string[]>([])

  const skippedKey = `bur-oaks-meter-route-skipped-${monthKey()}`

  useEffect(() => {
    try {
      setSkippedLots(JSON.parse(window.localStorage.getItem(skippedKey) || '[]'))
    } catch {
      setSkippedLots([])
    }

    async function loadSites() {
      const token = await authToken()
      const response = await fetch('/api/meter-readings?sites=1', { headers: { Authorization: `Bearer ${token}` } })
      const result = await response.json().catch(() => ({}))
      const loadedSites: Site[] = result.sites || []
      setSites(loadedSites)
      const scannedLot = new URLSearchParams(window.location.search).get('lot') || ''
      const storedSkipped: string[] = (() => {
        try { return JSON.parse(window.localStorage.getItem(skippedKey) || '[]') } catch { return [] }
      })()
      const firstOpen = loadedSites.find((site) => !completedSite(site) && !storedSkipped.includes(normalizeLotKey(site.lot_number)))
        || loadedSites.find((site) => !completedSite(site))
      setLotNumber(scannedLot || firstOpen?.lot_number || '')
      if (routeMode && loadedSites.length && !firstOpen && !scannedLot) setSummaryOpen(true)
      setLoading(false)
    }
    loadSites()
  }, [])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const selectedSite = useMemo(
    () => sites.find((site) => normalizeLotKey(site.lot_number) === normalizeLotKey(lotNumber)),
    [sites, lotNumber]
  )
  const completedCount = sites.filter(completedSite).length
  const attentionSites = sites.filter((site) => site.captured && (!capturedReading(site) || site.captured.status === 'retake'))
  const skippedSites = sites.filter((site) => skippedLots.includes(normalizeLotKey(site.lot_number)) && !completedSite(site))
  const missingSites = sites.filter((site) => !completedSite(site))
  const currentPosition = Math.max(0, sites.findIndex((site) => normalizeLotKey(site.lot_number) === normalizeLotKey(lotNumber))) + 1

  function storeSkipped(next: string[]) {
    setSkippedLots(next)
    window.localStorage.setItem(skippedKey, JSON.stringify(next))
  }

  function clearPhoto(messageText = '') {
    if (preview) URL.revokeObjectURL(preview)
    setPhoto(null)
    setPreview('')
    setAnalyzing(false)
    if (messageText) setMessage(messageText)
  }

  function advanceRoute(finishedLot: string, skipped = skippedLots, siteRows = sites) {
    const finishedKey = normalizeLotKey(finishedLot)
    const next = siteRows.find((site) => normalizeLotKey(site.lot_number) !== finishedKey && !completedSite(site) && !skipped.includes(normalizeLotKey(site.lot_number)))
    clearPhoto()
    if (next) {
      setLotNumber(next.lot_number)
      window.history.replaceState({}, '', `/maintenance/dashboard/meter-readings?lot=${encodeURIComponent(next.lot_number)}`)
    } else {
      setLotNumber('')
      setSummaryOpen(true)
      window.history.replaceState({}, '', '/maintenance/dashboard/meter-readings')
    }
  }

  async function submitReading(file: File, selectedLot: string) {
    setSaving(true)
    setMessage(`Reading and verifying Lot ${selectedLot}…`)
    const form = new FormData()
    form.append('lotNumber', selectedLot)
    form.append('photo', file)
    if (routeMode) form.append('routeMode', '1')
    const token = await authToken()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 30_000)
    let response: Response
    let result: any
    try {
      response = await fetch('/api/meter-readings', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: controller.signal,
      })
      result = await response.json().catch(() => ({}))
    } catch (error) {
      setSaving(false)
      setMessage(error instanceof DOMException && error.name === 'AbortError'
        ? 'The photo took too long. Nothing was saved—tap Retake and try once more.'
        : 'The photo could not connect to the office. Nothing was saved—tap Retake and try again.')
      return
    } finally {
      window.clearTimeout(timeout)
    }
    setSaving(false)

    if (!response.ok) {
      if (result.alreadyCaptured && routeMode) {
        setMessage(`Lot ${selectedLot} was already completed. Moving to the next meter.`)
        window.setTimeout(() => advanceRoute(selectedLot), 900)
        return
      }
      setMessage(result.error || 'Unable to submit this meter photo. Retake it and try again.')
      return
    }

    const submission = result.submission
    const updatedSites = sites.map((site) => normalizeLotKey(site.lot_number) === normalizeLotKey(selectedLot) ? { ...site, captured: submission } : site)
    setSites(updatedSites)

    if (!routeMode) {
      setComplete(true)
      setMessage(`Lot ${selectedLot} was sent to the office. Nothing has been billed.`)
      return
    }

    const readingValue = Number(submission?.detected_reading)
    setMessage(readingValue > 0
      ? `Lot ${selectedLot} verified and read as ${readingValue.toLocaleString()}. Moving to the next meter…`
      : `Lot ${selectedLot} verified. The office will review the number. Moving to the next meter…`)
    const nextSkipped = skippedLots.filter((key) => key !== normalizeLotKey(selectedLot))
    storeSkipped(nextSkipped)
    window.setTimeout(() => advanceRoute(selectedLot, nextSkipped, updatedSites), 1100)
  }

  async function choosePhoto(originalFile: File | null) {
    clearPhoto()
    setComplete(false)
    setMessage('')
    if (!originalFile || !lotNumber) return

    setAnalyzing(true)
    setMessage('Preparing the meter photo…')
    const file = await prepareMeterPhoto(originalFile)
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
    setAnalyzing(false)
    if (routeMode) await submitReading(file, lotNumber)
    else setMessage('Photo ready. Submit it to the office when you are ready.')
  }

  function skipCurrent() {
    if (!lotNumber) return
    const key = normalizeLotKey(lotNumber)
    const nextSkipped = skippedLots.includes(key) ? skippedLots : [...skippedLots, key]
    storeSkipped(nextSkipped)
    setMessage(`Lot ${lotNumber} skipped. It will remain on the route summary.`)
    advanceRoute(lotNumber, nextSkipped)
  }

  function continueRoute(includeSkipped = false) {
    const nextSkipped = includeSkipped ? [] : skippedLots
    if (includeSkipped) storeSkipped([])
    const next = sites.find((site) => !completedSite(site) && !nextSkipped.includes(normalizeLotKey(site.lot_number))) || sites.find((site) => !completedSite(site))
    setSummaryOpen(false)
    if (next) {
      setLotNumber(next.lot_number)
      window.history.replaceState({}, '', `/maintenance/dashboard/meter-readings?lot=${encodeURIComponent(next.lot_number)}`)
    }
  }

  function readAnother() {
    clearPhoto()
    setComplete(false)
    setMessage('')
    const firstOpen = sites.find((site) => !completedSite(site))
    setLotNumber(firstOpen?.lot_number || '')
    window.history.replaceState({}, '', adminMode ? '/admin/electric/capture' : '/maintenance/dashboard/meter-readings')
  }

  if (loading) {
    return <main className="meter-field-page"><div className="meter-route-loading"><LoaderCircle className="meter-spin" /><strong>Loading this month’s meter route…</strong></div></main>
  }

  if (routeMode && summaryOpen) {
    return (
      <main className="meter-field-page">
        <section className="meter-route-summary">
          <span><ClipboardCheck size={22} /> DONE FOR NOW — OFFICE SUMMARY</span>
          <h1>{completedCount} of {sites.length} meters captured</h1>
          <p>Every completed photo is already waiting in Electric Billing. This summary does not create or send an invoice.</p>
          <div className="meter-route-summary-counts">
            <article><CheckCircle2 /><small>Captured</small><strong>{completedCount}</strong></article>
            <article className={attentionSites.length ? 'attention' : ''}><AlertTriangle /><small>Office attention</small><strong>{attentionSites.length}</strong></article>
            <article><SkipForward /><small>Skipped</small><strong>{skippedSites.length}</strong></article>
            <article><ListChecks /><small>Still missing</small><strong>{missingSites.length}</strong></article>
          </div>
          {missingSites.length > 0 && <div className="meter-route-missing"><strong>Still needs a meter photo</strong><p>{missingSites.map((site) => `Lot ${displayLotNumber(site.lot_number)}`).join(' · ')}</p></div>}
          <div className="meter-route-summary-actions">
            {missingSites.length > 0 && <button type="button" onClick={() => continueRoute(skippedSites.length > 0)}><RotateCcw size={17} /> Continue Meter Route</button>}
            <Link href="/maintenance/dashboard"><CheckCircle2 size={17} /> Return to Maintenance Home</Link>
          </div>
        </section>
      </main>
    )
  }

  return (
    <main className="meter-field-page">
      <header className="meter-field-hero">
        <Link href={adminMode ? '/admin/electric/meter-readings' : '/maintenance/dashboard'}>← {adminMode ? 'Meter Reading Review' : 'Maintenance home'}</Link>
        <span><Gauge size={17} /> {adminMode ? 'ADMIN METER ENTRY' : 'MONTHLY METER ROUTE'}</span>
        <h1>{adminMode ? 'Take a meter photo.' : 'One photo. Then the next meter.'}</h1>
        <p>{adminMode ? 'Choose the lot, photograph the meter, and send it to the same office review queue.' : 'Keep both the meter digits and the Bur Oaks QR/lot label in the picture. The app verifies the lot, reads the number, saves it, and advances automatically.'}</p>
      </header>

      {routeMode && <section className="meter-route-progress"><div><small>THIS MONTH</small><strong>{completedCount} of {sites.length} captured</strong></div><span><i style={{ width: `${sites.length ? (completedCount / sites.length) * 100 : 0}%` }} /></span><button type="button" onClick={() => setSummaryOpen(true)}>Done for Now — Send to Office</button></section>}

      <section className="meter-field-card">
        {complete ? (
          <div className="meter-field-complete"><CheckCircle2 size={52} /><h2>Reading sent</h2><p>{message}</p><button type="button" onClick={readAnother}><RotateCcw size={17} /> Read another meter</button></div>
        ) : (
          <>
            {routeMode && lotNumber && <div className="meter-route-current"><span><small>NEXT METER</small><strong>Lot {displayLotNumber(lotNumber)}</strong><em>{currentPosition} of {sites.length}{selectedSite?.meter_number ? ` · Meter ${selectedSite.meter_number}` : ''}</em></span><ChevronRight size={27} /></div>}

            <label className="meter-field-label">
              <span><MapPin size={16} /> {routeMode ? 'Jump to a different lot' : 'Lot or campsite'}</span>
              <select value={lotNumber} disabled={saving} onChange={(event) => { clearPhoto(); setLotNumber(event.target.value); setMessage('') }}>
                <option value="">Choose a lot</option>
                {sites.map((site) => <option key={site.lot_number} value={site.lot_number}>{completedSite(site) ? '✓ ' : skippedLots.includes(normalizeLotKey(site.lot_number)) ? '↷ ' : ''}Lot {displayLotNumber(site.lot_number)}{capturedReading(site) ? ` · ${capturedReading(site)}` : site.meter_number ? ` · Meter ${site.meter_number}` : ''}</option>)}
              </select>
            </label>

            {lotNumber && !routeMode && <div className="meter-field-site"><Gauge size={23} /><span><small>METER SELECTED</small><strong>Lot {displayLotNumber(lotNumber)}</strong><em>{selectedSite?.meter_number ? `Meter ${selectedSite.meter_number}` : 'Verify the printed lot label'}</em></span></div>}

            <label className={`meter-photo-button ${!lotNumber ? 'disabled' : ''}`}>
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={!lotNumber || analyzing || saving} onChange={(event) => choosePhoto(event.target.files?.[0] || null)} />
              {saving ? <LoaderCircle className="meter-spin" size={27} /> : <Camera size={27} />}
              <span><strong>{saving ? 'Reading and sending…' : photo ? 'Retake meter photo' : 'Take Meter Photo'}</strong><small>{routeMode ? 'Include the meter digits and the QR/lot label in one picture.' : 'Hold the phone square, avoid glare, and fill the picture with the meter display.'}</small></span>
            </label>

            {preview && <div className="meter-photo-review photo-only"><img src={preview} alt={`Meter at Lot ${lotNumber}`} />{!saving && <button className="meter-photo-delete" type="button" onClick={() => clearPhoto('Photo removed. Take a new picture when ready.')}><Trash2 size={16} /> Delete this photo and retake</button>}</div>}
            {message && <p className="meter-field-message" role="status">{(analyzing || saving) && <LoaderCircle className="meter-spin" size={16} />} {message}</p>}

            {routeMode ? (
              <div className="meter-route-actions"><button type="button" className="skip" onClick={skipCurrent} disabled={!lotNumber || saving}><SkipForward size={17} /> Skip — Come Back Later</button><button type="button" onClick={() => setSummaryOpen(true)} disabled={saving}><ClipboardCheck size={17} /> Done for Now — Send to Office</button></div>
            ) : (
              <button className="meter-field-submit" type="button" onClick={() => photo && submitReading(photo, lotNumber)} disabled={!lotNumber || !photo || analyzing || saving}>{saving ? <LoaderCircle className="meter-spin" size={18} /> : <CheckCircle2 size={18} />}{saving ? 'Sending…' : 'Submit Reading to Office'}</button>
            )}
          </>
        )}
      </section>
    </main>
  )
}

export default function MaintenanceMeterReadingsPage() {
  return <MeterReadingCapture />
}
