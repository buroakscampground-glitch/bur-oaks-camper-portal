'use client'

import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarDays, Camera, CheckCircle2, Download, Gauge, LoaderCircle, Mail, Printer, RefreshCw, RotateCcw, Zap } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { campgroundAverageUsage, compareElectricUsage, groupedUsageHistory } from '../../../../lib/electric-reading-safeguards'

async function token() {
  const { data } = await supabase.auth.getSession()
  return data.session?.access_token || ''
}

export default function AdminMeterReadingReviewPage() {
  const [submissions, setSubmissions] = useState<any[]>([])
  const [readings, setReadings] = useState<any[]>([])
  const [reviewed, setReviewed] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [emailing, setEmailing] = useState(false)
  const [reportMonth, setReportMonth] = useState(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  })

  async function load() {
    setLoading(true)
    const auth = await token()
    const [response, readingResult] = await Promise.all([
      fetch('/api/meter-readings', { headers: { Authorization: `Bearer ${auth}` } }),
      supabase.from('electric_readings').select('*').order('reading_date', { ascending: false }),
    ])
    const result = await response.json().catch(() => ({}))
    setSubmissions(result.submissions || [])
    setReadings(readingResult.data || [])
    const initial: Record<string, string> = {}
    for (const item of result.submissions || []) initial[item.id] = String(item.reviewed_reading ?? item.submitted_reading ?? item.detected_reading ?? '')
    setReviewed(initial)
    if (!response.ok) setMessage(result.error || 'Unable to load meter readings.')
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const average = useMemo(() => campgroundAverageUsage(readings), [readings])

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
    const value = Number(reviewed[submission.id])
    if (!Number.isFinite(value) || value < 0) {
      setMessage('Enter the confirmed number before opening Electric Billing.')
      return
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

  async function emailLabels() {
    setEmailing(true)
    setMessage('Creating and emailing the meter labels…')
    const auth = await token()
    const response = await fetch('/api/meter-labels', {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
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

  return (
    <main className="admin-meter-page">
      <section className="admin-meter-hero">
        <div><span><Gauge size={16} /> ELECTRIC OPERATIONS</span><h1>Meter photo review</h1><p>Maintenance captures the photo and number. You verify it here, then finish the bill in the Electric area you already use.</p></div>
        <a href="/admin/electric"><Zap size={17} /> Electric Billing</a>
      </section>

      <section className="admin-meter-tools">
        <div><strong>Weatherproof meter labels</strong><p>Ten labels per page in two columns by five rows, with large lot numbers, meter references, QR codes, and cut lines.</p></div>
        <a className="admin-meter-capture-link" href="/admin/electric/capture"><Camera size={17} /> Take Meter Photo</a>
        <button type="button" className="secondary" onClick={downloadLabels}><Download size={17} /> Download PDF</button>
        <button type="button" onClick={emailLabels} disabled={emailing}>{emailing ? <LoaderCircle className="meter-spin" size={17} /> : <Mail size={17} />} Email Labels to Me</button>
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
        <button type="button" onClick={load}><RefreshCw size={16} /> Refresh</button>
      </section>

      {loading ? (
        <div className="admin-meter-empty"><LoaderCircle className="meter-spin" size={34} /><p>Loading meter photos…</p></div>
      ) : submissions.length === 0 ? (
        <div className="admin-meter-empty"><CheckCircle2 size={42} /><h2>Nothing is waiting</h2><p>New maintenance meter photos will appear here automatically.</p></div>
      ) : (
        <div className="admin-meter-grid">
          {submissions.map((submission) => {
            const previous = readings.find((item) => item.camper_id === submission.camper_id)?.current_reading
            const current = Number(reviewed[submission.id] || 0)
            const usage = previous !== undefined && previous !== null ? current - Number(previous) : null
            const comparison = usage !== null && usage > 0
              ? compareElectricUsage(usage, groupedUsageHistory(readings, submission.camper_id), average)
              : null
            const needsAttention = usage !== null && (usage <= 0 || comparison?.status !== 'normal')
            return (
              <article className={`admin-meter-card ${needsAttention ? 'attention' : ''}`} key={submission.id}>
                <div className="admin-meter-photo">
                  {submission.photo_url ? <img src={submission.photo_url} alt={`Meter photo for Lot ${submission.lot_number}`} /> : <span><Camera size={30} /> Photo unavailable</span>}
                  <b>LOT {submission.lot_number}</b>
                </div>
                <div className="admin-meter-review">
                  <header><div><small>{submission.meter_number ? `METER ${submission.meter_number}` : submission.meter_code}</small><h2>Lot {submission.lot_number}</h2></div><span className={submission.status}>{submission.status}</span></header>
                  <dl>
                    <div><dt>Previous</dt><dd>{previous ?? 'No history'}</dd></div>
                    <div><dt>Photo detected</dt><dd>{submission.detected_reading ?? 'Not clear'}</dd></div>
                    <div><dt>Maintenance confirmed</dt><dd>{submission.submitted_reading}</dd></div>
                    <div><dt>Usage</dt><dd>{usage !== null ? `${usage.toLocaleString()} kWh` : 'Needs history'}</dd></div>
                  </dl>
                  {needsAttention && <p className="admin-meter-warning"><AlertTriangle size={16} /> {usage !== null && usage <= 0 ? 'Current number is not above the previous reading.' : `Usage appears unusually ${comparison?.status}. Compare the photo carefully.`}</p>}
                  {comparison && comparison.recentAverage > 0 && <p className="admin-meter-comparison">Site average: {Math.round(comparison.recentAverage).toLocaleString()} kWh · {comparison.comparisonLabel}</p>}
                  <label><span>Office-confirmed meter number</span><input inputMode="numeric" value={reviewed[submission.id] || ''} onChange={(event) => setReviewed((currentValues) => ({ ...currentValues, [submission.id]: event.target.value.replace(/\D/g, '') }))} /></label>
                  <div className="admin-meter-actions">
                    <button type="button" className="secondary" onClick={() => markRetake(submission)}><RotateCcw size={16} /> Needs Retake</button>
                    <button type="button" onClick={() => openInBilling(submission)} disabled={usage !== null && usage <= 0}><Zap size={16} /> Continue in Electric Billing</button>
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
