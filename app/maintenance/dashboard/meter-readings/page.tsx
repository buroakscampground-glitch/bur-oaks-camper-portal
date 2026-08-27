'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { Camera, CheckCircle2, Gauge, Image as ImageIcon, LoaderCircle, MapPin, QrCode, RotateCcw } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { displayLotNumber } from '../../../../lib/meter-reading'

type Site = { lot_number: string; meter_number: string | null }

async function authToken() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
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
    return blob
      ? new File([blob], `meter-${Date.now()}.jpg`, { type: 'image/jpeg' })
      : file
  } catch {
    return file
  } finally {
    URL.revokeObjectURL(sourceUrl)
  }
}

export function MeterReadingCapture({ adminMode = false }: { adminMode?: boolean }) {
  const [sites, setSites] = useState<Site[]>([])
  const [lotNumber, setLotNumber] = useState('')
  const [photo, setPhoto] = useState<File | null>(null)
  const [preview, setPreview] = useState('')
  const [reading, setReading] = useState('')
  const [detectedReading, setDetectedReading] = useState('')
  const [ocrConfidence, setOcrConfidence] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [complete, setComplete] = useState(false)

  useEffect(() => {
    async function loadSites() {
      const token = await authToken()
      const response = await fetch('/api/meter-readings?sites=1', { headers: { Authorization: `Bearer ${token}` } })
      const result = await response.json().catch(() => ({}))
      setSites(result.sites || [])
      const scannedLot = new URLSearchParams(window.location.search).get('lot') || ''
      if (scannedLot) setLotNumber(scannedLot)
    }
    loadSites()
  }, [])

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const selectedSite = useMemo(
    () => sites.find((site) => String(site.lot_number).toLowerCase() === lotNumber.toLowerCase()),
    [sites, lotNumber]
  )

  async function choosePhoto(originalFile: File | null) {
    setPhoto(null)
    setReading('')
    setDetectedReading('')
    setOcrConfidence('')
    setComplete(false)
    setMessage('')
    if (preview) URL.revokeObjectURL(preview)
    setPreview('')
    if (!originalFile) return

    setAnalyzing(true)
    setMessage('Preparing and reading the meter photo…')
    const file = await prepareMeterPhoto(originalFile)
    setPhoto(file)
    setPreview(URL.createObjectURL(file))
    if (!adminMode) {
      setAnalyzing(false)
      setMessage('Photo ready. Submit it to the office—no number entry is required here.')
      return
    }
    const form = new FormData()
    form.append('photo', file)
    form.append('lotNumber', lotNumber)
    const token = await authToken()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 25_000)
    try {
      const response = await fetch('/api/meter-readings?analyze=1', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
        signal: controller.signal,
      })
      const result = await response.json().catch(() => ({}))
      if (response.ok && result.recognition?.reading !== null && result.recognition?.reading !== undefined) {
        setReading(String(result.recognition.reading))
        setDetectedReading(String(result.recognition.reading))
        setOcrConfidence(result.recognition.confidence === null ? '' : String(result.recognition.confidence))
        setMessage(result.recognition.confidence !== null && result.recognition.confidence < 65
          ? 'A possible number was found. Carefully compare every digit with the photo before submitting.'
          : 'Number detected. Compare it with the photo, correct it if needed, then submit.')
      } else {
        setMessage(result.error || 'Automatic reading was not clear. Enter the number shown in the photo below.')
      }
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === 'AbortError'
        ? 'Automatic reading took too long. Enter the number shown in the photo below—your picture is still ready to submit.'
        : 'Automatic reading was unavailable. Enter the number shown in the photo below.')
    } finally {
      window.clearTimeout(timeout)
      setAnalyzing(false)
    }
  }

  async function submitReading() {
    if (!lotNumber || !photo) {
      setMessage('Choose the site and take a meter photo first.')
      return
    }

    setSaving(true)
    setMessage(adminMode
      ? 'Sending this reading to the office…'
      : 'Sending the photo and reading the meter number…')
    const form = new FormData()
    form.append('lotNumber', lotNumber)
    if (reading) form.append('reading', reading)
    if (detectedReading) form.append('detectedReading', detectedReading)
    if (ocrConfidence) form.append('ocrConfidence', ocrConfidence)
    form.append('photo', photo)
    const token = await authToken()
    const response = await fetch('/api/meter-readings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    })
    const result = await response.json().catch(() => ({}))
    setSaving(false)
    if (!response.ok) {
      setMessage(result.error || 'Unable to submit this meter reading.')
      return
    }
    setComplete(true)
    const detectedValue = result?.submission?.detected_reading
    const detected = Number(detectedValue)
    setMessage(detectedValue !== null && detectedValue !== undefined && Number.isFinite(detected)
      ? `Lot ${lotNumber} was sent to the office. The photo reader found ${detected.toLocaleString()} for review. Nothing has been billed.`
      : `Lot ${lotNumber} was sent to the office for review. Nothing has been billed.`)
  }

  function readAnother() {
    setLotNumber('')
    setPhoto(null)
    setReading('')
    setDetectedReading('')
    setOcrConfidence('')
    if (preview) URL.revokeObjectURL(preview)
    setPreview('')
    setComplete(false)
    setMessage('')
    window.history.replaceState({}, '', adminMode ? '/admin/electric/capture' : '/maintenance/dashboard/meter-readings')
  }

  return (
    <main className="meter-field-page">
      <header className="meter-field-hero">
        <Link href={adminMode ? '/admin/electric/meter-readings' : '/maintenance/dashboard'}>← {adminMode ? 'Meter Reading Review' : 'Maintenance home'}</Link>
        <span><Gauge size={17} /> {adminMode ? 'ADMIN METER ENTRY' : 'ELECTRIC METERS'}</span>
        <h1>Read a meter in three easy steps.</h1>
        <p>Scan the meter label with the phone camera or choose the lot below. {adminMode ? 'Your photo will enter the same office review queue before billing.' : 'The office reviews every reading before billing.'}</p>
      </header>

      <section className="meter-field-steps" aria-label="Meter reading steps">
        <article className={lotNumber ? 'done' : 'active'}><strong>1</strong><span><QrCode size={20} /><b>Choose the meter</b><small>Scan its QR label or pick the lot.</small></span></article>
        <article className={photo ? 'done' : lotNumber ? 'active' : ''}><strong>2</strong><span><Camera size={20} /><b>Take one clear photo</b><small>Fill the frame with the meter display.</small></span></article>
        <article className={complete ? 'done' : photo ? 'active' : ''}><strong>3</strong><span><CheckCircle2 size={20} /><b>Confirm and submit</b><small>No billing access is given.</small></span></article>
      </section>

      <section className="meter-field-card">
        {complete ? (
          <div className="meter-field-complete">
            <CheckCircle2 size={52} />
            <h2>Reading sent</h2>
            <p>{message}</p>
            <button type="button" onClick={readAnother}><RotateCcw size={17} /> Read another meter</button>
          </div>
        ) : (
          <>
            <label className="meter-field-label">
              <span><MapPin size={16} /> Lot or campsite</span>
              <select value={lotNumber} onChange={(event) => { setLotNumber(event.target.value); setMessage('') }}>
                <option value="">Choose a lot</option>
                {sites.map((site) => <option key={site.lot_number} value={site.lot_number}>Lot {displayLotNumber(site.lot_number)}{site.meter_number ? ` · Meter ${site.meter_number}` : ''}</option>)}
              </select>
            </label>

            {lotNumber && (
              <div className="meter-field-site">
                <Gauge size={23} />
                <span><small>METER SELECTED</small><strong>Lot {displayLotNumber(lotNumber)}</strong><em>{selectedSite?.meter_number ? `Meter ${selectedSite.meter_number}` : 'Verify the printed lot label'}</em></span>
              </div>
            )}

            <label className={`meter-photo-button ${!lotNumber ? 'disabled' : ''}`}>
              <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" disabled={!lotNumber || analyzing || saving} onChange={(event) => choosePhoto(event.target.files?.[0] || null)} />
              <Camera size={25} />
              <span><strong>{photo ? 'Retake meter photo' : 'Take meter photo'}</strong><small>Hold the phone square, avoid glare, and fill the picture with the meter display.</small></span>
            </label>

            {preview && (
              <div className={`meter-photo-review ${adminMode ? '' : 'photo-only'}`}>
                <img src={preview} alt={`Meter at Lot ${lotNumber}`} />
                {adminMode ? (
                  <label>
                    <span><ImageIcon size={16} /> Confirm the number shown</span>
                    <input inputMode="numeric" pattern="[0-9]*" value={reading} onChange={(event) => setReading(event.target.value.replace(/\D/g, ''))} placeholder={analyzing ? 'Reading photo…' : 'Enter meter number'} />
                    <small>The system fills this automatically when it can. Always compare it with the photo.</small>
                  </label>
                ) : (
                  <div className="meter-photo-ready"><CheckCircle2 size={24} /><span><strong>Picture ready</strong><small>The office will confirm the meter number from this photo.</small></span></div>
                )}
              </div>
            )}

            {message && <p className="meter-field-message" role="status">{analyzing && <LoaderCircle className="meter-spin" size={16} />} {message}</p>}

            <button className="meter-field-submit" type="button" onClick={submitReading} disabled={!lotNumber || !photo || analyzing || saving}>
              {saving ? <LoaderCircle className="meter-spin" size={18} /> : <CheckCircle2 size={18} />}
              {saving ? 'Sending…' : adminMode ? 'Submit Reading to Office' : 'Submit Meter Photo to Office'}
            </button>
          </>
        )}
      </section>
    </main>
  )
}

export default function MaintenanceMeterReadingsPage() {
  return <MeterReadingCapture />
}
