'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { attemptAutoPay } from '../../../lib/autopay'

export default function AdminElectricPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [readings, setReadings] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [previousReading, setPreviousReading] = useState('')
  const [currentReading, setCurrentReading] = useState('')
  const [rate, setRate] = useState('0.23')
  const [readingDate, setReadingDate] = useState('')
  const [includeWaterTrash, setIncludeWaterTrash] = useState(false)
  const [waterTrashFee, setWaterTrashFee] = useState('20')
  const [searchText, setSearchText] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const currentReadingRef = useRef<HTMLInputElement>(null)
  const router = useRouter()

  useEffect(() => {
    loadCampers()
    loadReadings()
  }, [])

  async function loadCampers() {
    const { data } = await supabase.from('campers').select('*').order('lot_number')
    setCampers(data || [])
  }

  async function loadReadings() {
    const { data } = await supabase
      .from('electric_readings')
      .select('*')
      .order('reading_date', { ascending: false })

    setReadings(data || [])
  }

  const filteredReadings = useMemo(() => {
    const search = searchText.trim().toLowerCase()
    if (!search) return readings

    return readings.filter((reading) => {
      const camper = campers.find((c) => c.id === reading.camper_id)
      const lot = camper?.lot_number?.toString() || ''
      const name = `${camper?.first_name || ''} ${camper?.last_name || ''}`.toLowerCase()
      const readingDateText = reading.reading_date?.toString().toLowerCase() || ''

      return (
        lot.includes(search) ||
        name.includes(search) ||
        readingDateText.includes(search)
      )
    })
  }, [campers, readings, searchText])

  const totalKwh = filteredReadings.reduce((sum, reading) => sum + Number(reading.kwh_used || 0), 0)
  const totalAmountDue = filteredReadings.reduce((sum, reading) => sum + Number(reading.amount_due || 0), 0)
const averageUsage =
  filteredReadings.length > 0
    ? Math.round(totalKwh / filteredReadings.length)
    : 0
    const liveUsage =
  Number(currentReading || 0) -
  Number(previousReading || 0)

const liveAmount =
  liveUsage > 0
    ? liveUsage * Number(rate || 0)
    : 0

const selectedWaterTrashFee = includeWaterTrash ? Number(waterTrashFee || 0) : 0
const liveInvoiceTotal = liveAmount + selectedWaterTrashFee

  async function saveElectricAndCreateInvoice() {
    setMessage('')
    setSaving(true)

    if (!camperId || !previousReading || !currentReading || !rate || !readingDate) {
      setMessage('Please fill out all fields.')
      setSaving(false)
      return
    }

    const previous = Number(previousReading)
    const current = Number(currentReading)
    const rateNumber = Number(rate)
    const waterTrashAmount = includeWaterTrash ? Number(waterTrashFee) : 0
    const kwhUsed = current - previous
    const amountDue = Number((kwhUsed * rateNumber).toFixed(2))
    const totalDue = Number((amountDue + waterTrashAmount).toFixed(2))

    if (!Number.isFinite(previous) || !Number.isFinite(current) || !Number.isFinite(rateNumber) || !Number.isFinite(waterTrashAmount)) {
      setMessage('Please enter valid numeric values for readings and rate.')
      setSaving(false)
      return
    }

    if (previous < 0 || current < 0 || rateNumber <= 0 || waterTrashAmount < 0) {
      setMessage('Readings and rate must be positive values.')
      setSaving(false)
      return
    }

    if (includeWaterTrash && ![20, 25].includes(waterTrashAmount)) {
      setMessage('Please choose a $20 or $25 water/trash fee.')
      setSaving(false)
      return
    }

    if (current <= previous) {
      setMessage('Current reading must be greater than previous reading.')
      setSaving(false)
      return
    }

    const parsedDate = new Date(readingDate)
    if (Number.isNaN(parsedDate.getTime())) {
      setMessage('Please provide a valid reading date.')
      setSaving(false)
      return
    }

    if (parsedDate > new Date()) {
      setMessage('Reading date cannot be in the future.')
      setSaving(false)
      return
    }

    const { data: existingReading, error: existingError } = await supabase
      .from('electric_readings')
      .select('id')
      .eq('camper_id', camperId)
      .eq('reading_date', readingDate)
      .maybeSingle()

    if (existingError) {
      setMessage(existingError.message)
      setSaving(false)
      return
    }

    if (existingReading) {
      setMessage('A reading already exists for this camper on the selected date.')
      setSaving(false)
      return
    }

    const selectedCamper = campers.find((c) => c.id === camperId)
    const invoiceNumber = `ELECTRIC-${selectedCamper?.lot_number || 'UNKNOWN'}-${Date.now()}`

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        camper_id: camperId,
        invoice_number: invoiceNumber,
        invoice_type: includeWaterTrash ? 'Electric + Water/Trash' : 'Electric',
        subtotal: totalDue,
        late_fee: 0,
        total_due: totalDue,
        due_date: readingDate,
        status: 'sent',
      })
      .select()
      .single()

    if (invoiceError || !invoice) {
      setMessage(invoiceError?.message || 'Failed to create electric invoice.')
      setSaving(false)
      return
    }

    const invoiceItems = [
      {
        invoice_id: invoice.id,
        description: `Electric Usage - ${kwhUsed} kWh`,
        quantity: kwhUsed,
        unit_price: rateNumber,
        total: amountDue,
      },
    ]

    if (includeWaterTrash) {
      invoiceItems.push({
        invoice_id: invoice.id,
        description: `Water/Trash Fee - $${waterTrashAmount}`,
        quantity: 1,
        unit_price: waterTrashAmount,
        total: waterTrashAmount,
      })
    }

    const { error: itemError } = await supabase.from('invoice_items').insert(invoiceItems)

    if (itemError) {
      await supabase.from('invoices').delete().eq('id', invoice.id)
      setMessage(itemError.message)
      setSaving(false)
      return
    }

    const { error: readingError } = await supabase.from('electric_readings').insert({
      camper_id: camperId,
      reading_date: readingDate,
      previous_reading: previous,
      current_reading: current,
      kwh_used: kwhUsed,
      rate_per_kwh: rateNumber,
      amount_due: amountDue,
      invoice_id: invoice.id,
    })

    if (readingError) {
      await supabase.from('invoice_items').delete().eq('invoice_id', invoice.id)
      await supabase.from('invoices').delete().eq('id', invoice.id)
      setMessage(readingError.message)
      setSaving(false)
      return
    }

    let resultMessage = `Electric invoice created: ${kwhUsed} kWh × $${rateNumber} = $${amountDue}`

    if (includeWaterTrash) {
      resultMessage += ` + $${waterTrashAmount} water/trash fee = $${totalDue}`
    }

    try {
      const autoPay = await attemptAutoPay(invoice.id)

      if (autoPay.charged) {
        resultMessage += ' — paid automatically.'
      }
    } catch (error: any) {
      resultMessage += ` — AutoPay was not completed: ${error.message}`
    }

    setMessage(resultMessage)
    setPreviousReading('')
    setCurrentReading('')
    setReadingDate('')
    setIncludeWaterTrash(false)
    setWaterTrashFee('20')
    setSearchText('')
    loadReadings()
    setSaving(false)
  }

  return (
    <main className="page">
      <a
  href="/admin"
  style={{
    display: 'inline-block',
    marginBottom: '20px',
    textDecoration: 'none',
    fontWeight: 'bold',
  }}
>
  ← Back to Dashboard
</a>
      <div className="container">
        <section className="card">
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <button
  onClick={() => router.push('/admin')}
  style={{
    marginBottom: '20px',
    background: '#6b7280',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
  }}
>
  ← Back to Dashboard
</button>
          <h1>Electric Billing</h1>
          <p className="muted">Enter meter readings and automatically create an electric invoice.</p>

          <select
  value={camperId}
  onChange={async (e) => {
    const selectedId = e.target.value
    setCamperId(selectedId)

    if (!selectedId) return

    const { data } = await supabase
      .from('electric_readings')
      .select('*')
      .eq('camper_id', selectedId)
      .order('reading_date', { ascending: false })
      .limit(1)
      .single()

    if (data) {
  setPreviousReading(
    String(data.current_reading)
  )

  const today = new Date()
  .toISOString()
  .split('T')[0]

setReadingDate(today)

setTimeout(() => {
  currentReadingRef.current?.focus()
}, 100)
}
  }} style={{ display: 'block', width: '100%', marginBottom: '12px' }}>
            <option value="">Select Camper</option>
            {campers.map((camper) => (
              <option key={camper.id} value={camper.id}>
                Lot {camper.lot_number} - {camper.first_name} {camper.last_name}
              </option>
            ))}
          </select>

          <input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />

          <input placeholder="Previous Reading" value={previousReading} onChange={(e) => setPreviousReading(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />

          <input
  ref={currentReadingRef}
  placeholder="Current Reading" value={currentReading} onChange={(e) => setCurrentReading(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />
{Number(currentReading) > Number(previousReading) && (
  <section
  className="card"
  style={{
    marginBottom: '12px',
    background: '#eef4ea',
    border: '2px solid #2f5d3a',
  }}
>
    <h2>{liveUsage} kWh</h2>
    <p className="muted">Estimated Usage</p>

    <h2>
      ${liveAmount.toFixed(2)}
    </h2>
    <p className="muted">Estimated Charge</p>

    {includeWaterTrash && (
      <>
        <h2>
          ${liveInvoiceTotal.toFixed(2)}
        </h2>
        <p className="muted">Estimated Total with Water/Trash</p>
      </>
    )}
  </section>
)}
          <input placeholder="Rate per kWh" value={rate} onChange={(e) => setRate(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />

          <section
            style={{
              marginBottom: '14px',
              padding: '16px',
              border: includeWaterTrash ? '2px solid #2f5d3a' : '1px solid #d8ded5',
              borderRadius: '14px',
              background: includeWaterTrash ? '#eef6eb' : '#f8faf7',
            }}
          >
            <label
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                cursor: 'pointer',
                fontWeight: 'bold',
              }}
            >
              <input
                checked={includeWaterTrash}
                onChange={(e) => setIncludeWaterTrash(e.target.checked)}
                style={{ marginTop: '3px' }}
                type="checkbox"
              />
              <span>
                Add water/trash fee to this electric bill
                <small
                  style={{
                    display: 'block',
                    marginTop: '4px',
                    color: '#6b7280',
                    fontWeight: 'normal',
                    lineHeight: 1.4,
                  }}
                >
                  Use this when electric and water/trash billing go out together.
                </small>
              </span>
            </label>

            {includeWaterTrash && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  gap: '10px',
                  marginTop: '14px',
                }}
              >
                {[20, 25].map((fee) => (
                  <label
                    key={fee}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      padding: '12px',
                      border: waterTrashFee === String(fee) ? '2px solid #2f5d3a' : '1px solid #d8ded5',
                      borderRadius: '12px',
                      background: waterTrashFee === String(fee) ? '#ffffff' : '#f3f5f1',
                      cursor: 'pointer',
                    }}
                  >
                    <input
                      checked={waterTrashFee === String(fee)}
                      onChange={() => setWaterTrashFee(String(fee))}
                      type="radio"
                    />
                    <strong>${fee} water/trash</strong>
                  </label>
                ))}
              </div>
            )}
          </section>

          <button onClick={saveElectricAndCreateInvoice} disabled={saving}>
            {saving ? 'Saving…' : includeWaterTrash ? 'Save Reading + Create Combined Invoice' : 'Save Reading + Create Invoice'}
          </button>

          {message && <p style={{ color: '#b02a37' }}>{message}</p>}
        </section>

        <section className="card" style={{ marginTop: '25px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <p className="muted" style={{ margin: 0 }}>Search readings</p>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Search by lot, camper name, or date"
                style={{ width: '100%', maxWidth: '320px' }}
              />
            </div>
            <div style={{ textAlign: 'right' }}>
              <p className="muted" style={{ margin: 0 }}>Filtered readings</p>
              <h2 style={{ margin: 0 }}>{filteredReadings.length}</h2>
            </div>
          </div>

          <div className="grid grid-3" style={{ marginTop: '20px', gap: '12px' }}>
            <section className="card">
  <h2>{filteredReadings.length}</h2>
  <p className="muted">Lifetime Readings</p>
</section>

<section className="card">
  <h2>{totalKwh.toLocaleString()} kWh</h2>
  <p className="muted">Lifetime Usage</p>
</section>

<section className="card">
  <h2>${totalAmountDue.toFixed(2)}</h2>
  <p className="muted">Lifetime Revenue</p>
</section>

<section className="card">
  <h2>{averageUsage.toLocaleString()} kWh</h2>
  <p className="muted">Average Usage</p>
</section>
          </div>

          {filteredReadings.length === 0 ? (
            <div style={{ marginTop: '20px' }}>
              <h2>No matching electric readings found.</h2>
              <p className="muted">Adjust your search or add a new reading above.</p>
            </div>
          ) : (
            <div style={{ marginTop: '20px', display: 'grid', gap: '16px' }}>
              {filteredReadings.map((reading) => {
                const camper = campers.find((c) => c.id === reading.camper_id)

                return (
                  <section className="card" key={`${reading.id}-${reading.reading_date}`}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '20px', alignItems: 'center' }}>
                      <div>
                        <p className="muted" style={{ margin: 0 }}>
                          Camper
                        </p>
                        <h2 style={{ margin: '8px 0' }}>
                          Lot {camper?.lot_number || '—'} • {camper?.first_name || 'Unknown'} {camper?.last_name || ''}
                        </h2>

                        <p style={{ margin: '4px 0' }}>
                          Reading Date: <strong>{reading.reading_date}</strong>
                        </p>
                        <p style={{ margin: '4px 0' }}>
                          Previous: <strong>{reading.previous_reading}</strong>
                        </p>
                        <p style={{ margin: '4px 0' }}>
                          Current: <strong>{reading.current_reading}</strong>
                        </p>
                        <p style={{ margin: '4px 0' }}>
                          Rate: <strong>${reading.rate_per_kwh}</strong> per kWh
                        </p>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <h2>{reading.kwh_used} kWh</h2>
                        <h2 style={{ color: '#2f5d3a' }}>${Number(reading.amount_due || 0).toFixed(2)}</h2>
                      </div>
                    </div>
                  </section>
                )
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  )
}
