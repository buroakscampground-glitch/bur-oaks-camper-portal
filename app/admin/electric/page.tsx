'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function AdminElectricPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [previousReading, setPreviousReading] = useState('')
  const [currentReading, setCurrentReading] = useState('')
  const [rate, setRate] = useState('0.23')
  const [readingDate, setReadingDate] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadCampers()
  }, [])

  async function loadCampers() {
    const { data } = await supabase.from('campers').select('*').order('lot_number')
    setCampers(data || [])
  }

  async function saveElectricAndCreateInvoice() {
    if (!camperId || !previousReading || !currentReading || !rate || !readingDate) {
      setMessage('Please fill out all fields.')
      return
    }

    const previous = Number(previousReading)
    const current = Number(currentReading)
    const rateNumber = Number(rate)
    const kwhUsed = current - previous
    const amountDue = Number((kwhUsed * rateNumber).toFixed(2))

    if (kwhUsed < 0) {
      setMessage('Current reading must be higher than previous reading.')
      return
    }

    const selectedCamper = campers.find((c) => c.id === camperId)
    const invoiceNumber = `ELECTRIC-${selectedCamper?.lot_number}-${Date.now()}`

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        camper_id: camperId,
        invoice_number: invoiceNumber,
        invoice_type: 'Electric',
        subtotal: amountDue,
        late_fee: 0,
        total_due: amountDue,
        due_date: readingDate,
        status: 'sent',
      })
      .select()
      .single()

    if (invoiceError) {
      setMessage(invoiceError.message)
      return
    }

    const { error: itemError } = await supabase.from('invoice_items').insert({
      invoice_id: invoice.id,
      description: `Electric Usage - ${kwhUsed} kWh`,
      quantity: kwhUsed,
      unit_price: rateNumber,
      total: amountDue,
    })

    if (itemError) {
      setMessage(itemError.message)
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
      setMessage(readingError.message)
      return
    }

    setMessage(`Electric invoice created: ${kwhUsed} kWh × $${rateNumber} = $${amountDue}`)
    setPreviousReading('')
    setCurrentReading('')
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card">
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Electric Billing</h1>
          <p className="muted">Enter meter readings and automatically create an electric invoice.</p>

          <select value={camperId} onChange={(e) => setCamperId(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }}>
            <option value="">Select Camper</option>
            {campers.map((camper) => (
              <option key={camper.id} value={camper.id}>
                Lot {camper.lot_number} - {camper.first_name} {camper.last_name}
              </option>
            ))}
          </select>

          <input type="date" value={readingDate} onChange={(e) => setReadingDate(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />

          <input placeholder="Previous Reading" value={previousReading} onChange={(e) => setPreviousReading(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />

          <input placeholder="Current Reading" value={currentReading} onChange={(e) => setCurrentReading(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />

          <input placeholder="Rate per kWh" value={rate} onChange={(e) => setRate(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '12px' }} />

          <button onClick={saveElectricAndCreateInvoice}>
            Save Reading + Create Invoice
          </button>

          {message && <p>{message}</p>}
        </section>
      </div>
    </main>
  )
}