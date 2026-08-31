'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, CalendarDays, Camera, CheckCircle2, Download, Gauge, LoaderCircle, Mail, Printer, RefreshCw, RotateCcw, Trash2, Zap } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { campgroundAverageUsage, compareElectricUsage, groupedUsageHistory } from '../../../../lib/electric-reading-safeguards'
import { normalizeLotKey } from '../../../../lib/meter-reading'

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

function visibleLotFromOcr(submission: any) {
  try {
    const parsed = JSON.parse(String(submission?.ocr_text || ''))
    return String(parsed?.visible_lot_label || '').trim()
  } catch {
    return ''
  }
}

function lotLabelNeedsReview(submission: any) {
  const visible = visibleLotFromOcr(submission)
  return !visible || normalizeLotKey(visible) !== normalizeLotKey(submission?.lot_number)
}

export default function AdminMeterReadingReviewPage() {
  const [submissions, setSubmissions] = useState<any[]>([])
  const [readings, setReadings] = useState<any[]>([])
  const [reviewed, setReviewed] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [emailing, setEmailing] = useState(false)
  const [deletingId, setDeletingId] = useState('')
  const [readingId, setReadingId] = useState('')
  const [labelEmail, setLabelEmail] = useState('')
  const [singleLabelLot, setSingleLabelLot] = useState('FF17')
  const readingPhotoIds = useRef(new Set<string>())
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  async function load(silent = false) {
    if (!silent) setLoading(true)
    const auth = await token()
    const [response, readingResult] = await Promise.all([
      fetch('/api/meter-readings', { headers: { Authorization: `Bearer ${auth}` } }),
      supabase.from('electric_readings').select('*').order('reading_date', { ascending: false }),
    ])
    const result = await response.json().catch(() => ({}))
    setSubmissions(result.submissions || [])
    setReadings(readingResult.data || [])
    const initial: Record<string, string> = {}
    for (const item of result.submissions || []) {
      const value = [item.reviewed_reading, item.submitted_reading, item.detected_reading]
        .map(Number)
        .find((candidate) => Number.isFinite(candidate) && candidate > 0)
      initial[item.id] = value === undefined ? '' : String(value)
    }
    setReviewed(initial)
    if (!response.ok) setMessage(result.error || 'Unable to load meter readings.')
    setLoading(false)

    const unread = (result.submissions || []).find((item: any) =>
      !(Number(item.detected_reading) > 0) &&
      !(Number(item.submitted_reading) > 0) &&
      !readingPhotoIds.current.has(item.id)
    )
    if (unread) void readPhotoAutomatically(unread)
  }

  useEffect(() => {
    load()
    const refresh = window.setInterval(() => load(true), 7000)
    return () => window.clearInterval(refresh)
  }, [])

  const average = useMemo(() => campgroundAverageUsage(readings), [readings])

  async function readPhotoAutomatically(submission: any, continueToBilling = false) {
    readingPhotoIds.current.add(submission.id)
    setReadingId(submission.id)
    setMessage(`Reading the meter number from Lot ${submission.lot_number}…`)
    const auth = await token()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 30_000)
    let response: Response
    let result: any
    try {
      response = await fetch('/api/meter-readings', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: submission.id, reanalyze: true }),
        signal: controller.signal,
      })
      result = await response.json().catch(() => ({}))
    } catch (error) {
      setReadingId('')
      setMessage(error instanceof DOMException && error.name === 'AbortError'
        ? `Lot ${submission.lot_number}: photo reading took too long. Try Read Photo Now again.`
        : `Lot ${submission.lot_number}: the photo reader could not connect.`)
      return
    } finally {
      window.clearTimeout(timeout)
    }
    setReadingId('')
    if (!response.ok) {
      setMessage(`Lot ${submission.lot_number}: ${result.error || 'The photo could not be read.'}`)
      return
    }
    const detected = Number(result.submission?.detected_reading)
    setSubmissions((current) => current.map((item) => item.id === submission.id ? result.submission : item))
    setReviewed((current) => ({ ...current, [submission.id]: detected > 0 ? String(detected) : '' }))
    setMessage(`Lot ${submission.lot_number} was read as ${detected.toLocaleString()}. Verify the photo, then continue to billing.`)
    if (continueToBilling && detected > 0) {
      if (lotLabelNeedsReview(result.submission)) {
        const visible = visibleLotFromOcr(result.submission)
        const confirmed = window.confirm(visible
          ? `Safety check: the photo reader saw Lot ${visible}, but this reading is assigned to Lot ${submission.lot_number}. Verify the F/FF label in the photo before continuing.`
          : `Safety check: the photo reader could not verify the printed lot label. Confirm this photo belongs to Lot ${submission.lot_number} before continuing.`)
        if (!confirmed) return
      }
      const saved = await updateSubmission(submission.id, { reviewedReading: detected, status: 'ready' })
      if (saved) window.location.href = `/admin/electric?meterDraft=${encodeURIComponent(submission.id)}`
    }
  }

  async function updateSubmission(id: string, updates: any) {
    const auth = await token()
    const response = await fetch('/api/meter-readings', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, ...updates }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) {
      setMessage(result.error || 'Unable to update this reading.')
      return false
    }
    return true
  }

  async function openInBilling(submission: any) {
    const text = String(reviewed[submission.id] || '').trim()
    const value = Number(text)
    if (!text || !Number.isFinite(value) || value <= 0) {
      await readPhotoAutomatically(submission, true)
      return
    }
    if (lotLabelNeedsReview(submission)) {
      const visible = visibleLotFromOcr(submission)
      const confirmed = window.confirm(visible
        ? `Safety check: the photo reader saw Lot ${visible}, but this reading is assigned to Lot ${submission.lot_number}. Verify the F/FF label in the photo before continuing.`
        : `Safety check: the photo reader could not verify the printed lot label. Confirm this photo belongs to Lot ${submission.lot_number} before continuing.`)
      if (!confirmed) return
    }
    const saved = await updateSubmission(submission.id, { reviewedReading: value, status: 'ready' })
    if (saved) window.location.href = `/admin/electric?meterDraft=${encodeURIComponent(submission.id)}`
  }

  async function markRetake(submission: any) {
    const saved = await updateSubmission(submission.id, { status: 'retake' })
    if (saved) {
      setMessage(`Lot ${submission.lot_number} marked for a new photo.`)
      load()
    }
  }

  async function deletePhoto(submission: any) {
    const confirmed = window.confirm(`Permanently delete the meter photo and preview for Lot ${submission.lot_number}? This cannot be undone.`)
    if (!confirmed) return

    setDeletingId(submission.id)
    setMessage('Deleting the meter photo and preview…')
    const auth = await token()
    const response = await fetch('/api/meter-readings', {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: submission.id }),
    })
    const result = await response.json().catch(() => ({}))
    setDeletingId('')
    if (!response.ok) {
      setMessage(result.error || 'Unable to delete this meter photo.')
      return
    }
    setSubmissions((current) => current.filter((item) => item.id !== submission.id))
    setReviewed((current) => {
      const next = { ...current }
      delete next[submission.id]
      return next
    })
    setMessage(`Lot ${submission.lot_number} meter photo and preview were permanently deleted.`)
  }

  async function emailLabels() {
    setEmailing(true)
    setMessage('Creating and emailing the meter labels…')
    const auth = await token()
    const response = await fetch('/api/meter-labels', {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: labelEmail.trim() || undefined }),
    })
    const result = await response.json().catch(() => ({}))
    setEmailing(false)
    setMessage(response.ok
      ? `${result.count} cut-ready QR labels were emailed to ${result.recipient}.`
      : result.error || 'Unable to email the labels.')
  }

  async function downloadLabels() {
    setMessage('Creating the cut-ready meter label PDF…')
    const auth = await token()
    const response = await fetch('/api/meter-labels', { headers: { Authorization: `Bearer ${auth}` } })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      setMessage(result.error || 'Unable to download the labels.')
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'bur-oaks-meter-qr-labels.pdf'
    link.click()
    URL.revokeObjectURL(url)
    setMessage('Meter label PDF downloaded.')
  }

  async function downloadSingleLabel() {
    const lot = singleLabelLot.trim().toUpperCase().replace(/^LOT\s*/i, '')
    if (!lot) {
      setMessage('Enter the lot number for the QR label.')
      return
    }
    setMessage(`Creating the Lot ${lot} QR label…`)
    const auth = await token()
    const response = await fetch(`/api/meter-labels?lot=${encodeURIComponent(lot)}`, { headers: { Authorization: `Bearer ${auth}` } })
    if (!response.ok) {
      const result = await response.json().catch(() => ({}))
      setMessage(result.error || `Unable to create the Lot ${lot} label.`)
      return
    }
    const blob = await response.blob()
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `bur-oaks-meter-qr-${lot}.pdf`
    link.click()
    URL.revokeObjectURL(url)
    setMessage(`Lot ${lot} QR label downloaded.`)
  }

  return (
    <main className="admin-meter-page">
      <section className="admin-meter-hero">
        <div><span><Gauge size={16} /> ELECTRIC OPERATIONS</span><h1>Meter photo review</h1><p>Maintenance captures the photo. You confirm the number here, then finish the bill in the Electric area you already use.</p></div>
        <a href="/admin/electric"><Zap size={17} /> Electric Billing</a>
      </section>

      <section className="admin-meter-tools">
        <div><strong>Weatherproof meter labels</strong><p>Ten labels per page in two columns by five rows, with large lot numbers, meter references, QR codes, and cut lines.</p></div>
        <a className="admin-meter-capture-link" href="/admin/electric/capture"><Camera size={17} /> Take Meter Photo</a>
        <button type="button" className="secondary" onClick={downloadLabels}><Download size={17} /> Download PDF</button>
        <input type="email" aria-label="Meter label delivery email" placeholder="Email address (blank sends to me)" value={labelEmail} onChange={(event) => setLabelEmail(event.target.value)} />
        <button type="button" onClick={emailLabels} disabled={emailing}>{emailing ? <LoaderCircle className="meter-spin" size={17} /> : <Mail size={17} />} Email Labels</button>
      </section>

      <section className="admin-meter-single-label">
        <div><small>SINGLE REPLACEMENT LABEL</small><strong>Need one QR code that was missing from the last list?</strong><p>Enter the lot and download only its correctly targeted meter label.</p></div>
        <label><span>Lot number</span><input value={singleLabelLot} onChange={(event) => setSingleLabelLot(event.target.value)} placeholder="Example: FF17" /></label>
        <button type="button" onClick={downloadSingleLabel}><Download size={17} /> Download This Lot</button>
      </section>

      <section className="admin-meter-monthly-print">
        <span><CalendarDays size={22} /></span>
        <div><small>PAPER FILE COPY</small><strong>Print previous and current meter readings</strong><p>Choose any month. The report includes lot, camper, reading date, previous reading, current reading, and kWh used.</p></div>
        <label><small>REPORT MONTH</small><input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} /></label>
        <a href={`/admin/electric/monthly-report?month=${encodeURIComponent(reportMonth)}&print=1`} target="_blank" rel="noreferrer"><Printer size={17} /> Print Monthly Meter File</a>
      </section>

      {message && <p className="admin-meter-message" role="status">{message}</p>}

      <section className="admin-meter-heading">
        <div><small>WAITING FOR OFFICE REVIEW</small><h2>{submissions.length} meter reading{submissions.length === 1 ? '' : 's'}</h2></div>
        <button type="button" onClick={() => load()}><RefreshCw size={16} /> Refresh</button>
      </section>

      {loading ? (
        <div className="admin-meter-empty"><LoaderCircle className="meter-spin" size={34} /><p>Loading meter photos…</p></div>
      ) : submissions.length === 0 ? (
        <div className="admin-meter-empty"><CheckCircle2 size={42} /><h2>Nothing is waiting</h2><p>New maintenance meter photos will appear here automatically.</p></div>
      ) : (
        <div className="admin-meter-grid">
          {submissions.map((submission) => {
            const previous = readings.find((item) => item.camper_id === submission.camper_id)?.current_reading
            const currentText = String(reviewed[submission.id] || '').trim()
            const current = currentText ? Number(currentText) : null
            const usage = previous !== undefined && previous !== null && current !== null ? current - Number(previous) : null
            const comparison = usage !== null && usage > 0
              ? compareElectricUsage(usage, groupedUsageHistory(readings, submission.camper_id), average)
              : null
            const needsAttention = usage !== null && (usage <= 0 || comparison?.status !== 'normal')
            const visibleLot = visibleLotFromOcr(submission)
            const needsLotReview = lotLabelNeedsReview(submission)
            return (
              <article className={`admin-meter-card ${needsAttention ? 'attention' : ''}`} key={submission.id}>
                <div className="admin-meter-photo">
                  {submission.photo_url ? <a href={submission.photo_url} target="_blank" rel="noreferrer" title="Open the full-size meter photo"><img src={submission.photo_url} alt={`Meter photo for Lot ${submission.lot_number}`} /></a> : <span><Camera size={30} /> Photo unavailable</span>}
                  <b>LOT {submission.lot_number}</b>
                </div>
                <div className="admin-meter-review">
                  <header><div><small>{submission.meter_number ? `METER ${submission.meter_number}` : submission.meter_code}</small><h2>Lot {submission.lot_number}</h2></div><span className={submission.status}>{submission.status}</span></header>
                  <dl>
                    <div><dt>Previous</dt><dd>{previous ?? 'No history'}</dd></div>
                    <div><dt>Photo detected</dt><dd>{submission.detected_reading ?? 'Not clear'}</dd></div>
                    <div><dt>Field submission</dt><dd>{submission.submitted_reading ?? 'Photo only'}</dd></div>
                    <div><dt>Usage</dt><dd>{usage !== null ? `${usage.toLocaleString()} kWh` : 'Needs history'}</dd></div>
                  </dl>
                  {needsAttention && <p className="admin-meter-warning"><AlertTriangle size={16} /> {usage !== null && usage <= 0 ? 'Current number is not above the previous reading.' : `Usage appears unusually ${comparison?.status}. Compare the photo carefully.`}</p>}
                  {needsLotReview && <p className="admin-meter-warning"><AlertTriangle size={16} /> {visibleLot ? `F/FF safety check: reader saw Lot ${visibleLot}. Verify this is Lot ${submission.lot_number} before billing.` : `The printed lot label was not clear. Verify this is Lot ${submission.lot_number} before billing.`}</p>}
                  {comparison && comparison.recentAverage > 0 && <p className="admin-meter-comparison">Site average: {Math.round(comparison.recentAverage).toLocaleString()} kWh · {comparison.comparisonLabel}</p>}
                  <label><span>Office-confirmed meter number</span><input inputMode="numeric" value={reviewed[submission.id] || ''} onChange={(event) => setReviewed((currentValues) => ({ ...currentValues, [submission.id]: event.target.value.replace(/\D/g, '') }))} /></label>
                  <div className="admin-meter-actions">
                    <button type="button" className="danger" onClick={() => deletePhoto(submission)} disabled={deletingId === submission.id}>{deletingId === submission.id ? <LoaderCircle className="meter-spin" size={16} /> : <Trash2 size={16} />} Delete Photo</button>
                    <button type="button" className="secondary" onClick={() => markRetake(submission)}><RotateCcw size={16} /> Needs Retake</button>
                    <button type="button" className="secondary" onClick={() => readPhotoAutomatically(submission)} disabled={readingId === submission.id}>{readingId === submission.id ? <LoaderCircle className="meter-spin" size={16} /> : <Camera size={16} />} Read Photo Now</button>
                    <button type="button" onClick={() => openInBilling(submission)} disabled={readingId === submission.id || (usage !== null && usage <= 0)}>{readingId === submission.id ? <LoaderCircle className="meter-spin" size={16} /> : <Zap size={16} />} Continue in Electric Billing</button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </main>
  )
}
