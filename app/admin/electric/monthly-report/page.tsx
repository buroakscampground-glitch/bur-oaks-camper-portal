'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, CalendarDays, FileText, Printer } from 'lucide-react'
import { supabase } from '../../../../lib/supabase'
import { displayLotNumber } from '../../../../lib/meter-reading'

function validMonth(value: string) {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function currentMonth() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const next = new Date(year, monthNumber, 1)
  return {
    start: `${month}-01`,
    next: `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`,
  }
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return new Date(year, monthNumber - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function readingDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('en-US')
}

export default function MonthlyMeterReportPage() {
  const [month, setMonth] = useState(currentMonth())
  const [readings, setReadings] = useState<any[]>([])
  const [campers, setCampers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const autoPrinted = useRef(false)

  useEffect(() => {
    const selected = new URLSearchParams(window.location.search).get('month') || ''
    if (validMonth(selected)) setMonth(selected)
  }, [])

  useEffect(() => {
    async function loadReport() {
      setLoading(true)
      setMessage('')
      const bounds = monthBounds(month)
      const [readingResult, camperResult] = await Promise.all([
        supabase
          .from('electric_readings')
          .select('id,camper_id,reading_date,previous_reading,current_reading,kwh_used,rate_per_kwh,amount_due,invoice_id')
          .gte('reading_date', bounds.start)
          .lt('reading_date', bounds.next)
          .order('reading_date', { ascending: true }),
        supabase.from('campers').select('id,first_name,last_name,second_first_name,second_last_name,lot_number'),
      ])
      if (readingResult.error) setMessage(readingResult.error.message)
      setReadings(readingResult.data || [])
      setCampers(camperResult.data || [])
      setLoading(false)

      const shouldPrint = new URLSearchParams(window.location.search).get('print') === '1'
      if (shouldPrint && !autoPrinted.current) {
        autoPrinted.current = true
        window.setTimeout(() => window.print(), 500)
      }
    }
    loadReport()
  }, [month])

  useEffect(() => {
    document.body.dataset.printMeterReport = 'true'
    return () => { delete document.body.dataset.printMeterReport }
  }, [])

  const rows = useMemo(() => readings.map((reading) => {
    const camper = campers.find((item) => item.id === reading.camper_id)
    const primary = `${camper?.first_name || ''} ${camper?.last_name || ''}`.trim()
    const second = `${camper?.second_first_name || ''} ${camper?.second_last_name || ''}`.trim()
    return {
      ...reading,
      lot_number: camper?.lot_number || '—',
      camper_name: [primary, second].filter(Boolean).join(' & ') || 'Unknown camper',
    }
  }).sort((a, b) => {
    const lotCompare = String(a.lot_number).localeCompare(String(b.lot_number), undefined, { numeric: true })
    return lotCompare || String(a.reading_date).localeCompare(String(b.reading_date))
  }), [readings, campers])

  const totalUsage = rows.reduce((sum, row) => sum + Number(row.kwh_used || 0), 0)

  function changeMonth(value: string) {
    if (!validMonth(value)) return
    setMonth(value)
    window.history.replaceState({}, '', `/admin/electric/monthly-report?month=${encodeURIComponent(value)}`)
    autoPrinted.current = true
  }

  return (
    <main className="monthly-meter-report">
      <header className="monthly-meter-report-controls">
        <a href="/admin/electric/meter-readings"><ArrowLeft size={16} /> Back to Meter Review</a>
        <label><CalendarDays size={16} /><span>Report month</span><input type="month" value={month} onChange={(event) => changeMonth(event.target.value)} /></label>
        <button type="button" onClick={() => window.print()}><Printer size={17} /> Print This Month</button>
      </header>

      <section className="monthly-meter-paper">
        <header>
          <div><small>BUR OAKS CAMPGROUND</small><h1>Monthly Electric Meter Reading File</h1><p>{monthLabel(month)}</p></div>
          <span><FileText size={25} /><strong>{rows.length}</strong><small>readings</small></span>
        </header>

        <div className="monthly-meter-summary">
          <span><small>Report month</small><strong>{monthLabel(month)}</strong></span>
          <span><small>Total readings</small><strong>{rows.length}</strong></span>
          <span><small>Total usage</small><strong>{totalUsage.toLocaleString()} kWh</strong></span>
          <span><small>Printed</small><strong>{new Date().toLocaleDateString('en-US')}</strong></span>
        </div>

        {loading ? <p className="monthly-meter-empty">Loading readings…</p> : message ? <p className="monthly-meter-empty">{message}</p> : rows.length === 0 ? (
          <p className="monthly-meter-empty">No electric meter readings were recorded for {monthLabel(month)}.</p>
        ) : (
          <table>
            <thead><tr><th>Lot</th><th>Camper</th><th>Date</th><th>Previous</th><th>Current</th><th>Usage</th></tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.id}>
                <td><strong>{displayLotNumber(row.lot_number)}</strong></td>
                <td>{row.camper_name}</td>
                <td>{readingDate(row.reading_date)}</td>
                <td>{Number(row.previous_reading).toLocaleString()}</td>
                <td>{Number(row.current_reading).toLocaleString()}</td>
                <td><strong>{Number(row.kwh_used).toLocaleString()} kWh</strong></td>
              </tr>
            ))}</tbody>
          </table>
        )}

        <footer><span>Reviewed by: ______________________________</span><span>Date: __________________</span></footer>
      </section>
    </main>
  )
}
