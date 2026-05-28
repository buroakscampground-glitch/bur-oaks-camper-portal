'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function AdminElectricPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [previousReading, setPreviousReading] = useState('')
  const [currentReading, setCurrentReading] = useState('')
  const [rate, setRate] = useState('0.23')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadCampers() {
      const { data } = await supabase.from('campers').select('*').order('lot_number')
      setCampers(data || [])
    }

    loadCampers()
  }, [])

  async function saveReading() {
    if (!camperId) {
      setMessage('Please select a camper.')
      return
    }

    const prev = Number(previousReading)
    const current = Number(currentReading)
    const rateNum = Number(rate)

    if (isNaN(prev) || isNaN(current) || isNaN(rateNum)) {
      setMessage('Please enter valid numeric values for readings and rate.')
      return
    }

    if (current <= prev) {
      setMessage('Current reading must be greater than previous reading.')
      return
    }

    const kwhUsed = current - prev
    const total = Number((kwhUsed * rateNum).toFixed(2))

    const { error } = await supabase.from('electric_readings').insert({
      camper_id: camperId,
      previous_reading: prev,
      current_reading: current,
      kwh_used: kwhUsed,
      rate_per_kwh: rateNum,
      electric_total: total,
      reading_date: new Date().toISOString().split('T')[0],
    })

    if (error) {
      setMessage(error.message)
    } else {
      setMessage(`Electric reading saved. Total electric charge: $${total}`)
      setPreviousReading('')
      setCurrentReading('')
    }
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial', maxWidth: '700px' }}>
      <h1>Admin - Electric Readings</h1>

      <label>Camper</label>
      <select value={camperId} onChange={(e) => setCamperId(e.target.value)} style={{ display: 'block', padding: '10px', width: '100%', marginBottom: '15px' }}>
        <option value="">Select Camper</option>
        {campers.map((camper) => (
          <option key={camper.id} value={camper.id}>
            Lot {camper.lot_number} - {camper.first_name} {camper.last_name}
          </option>
        ))}
      </select>

      <label>Previous Meter Reading</label>
      <input value={previousReading} onChange={(e) => setPreviousReading(e.target.value)} style={{ display: 'block', padding: '10px', width: '100%', marginBottom: '15px' }} />

      <label>Current Meter Reading</label>
      <input value={currentReading} onChange={(e) => setCurrentReading(e.target.value)} style={{ display: 'block', padding: '10px', width: '100%', marginBottom: '15px' }} />

      <label>Rate Per kWh</label>
      <input value={rate} onChange={(e) => setRate(e.target.value)} style={{ display: 'block', padding: '10px', width: '100%', marginBottom: '15px' }} />

      <button onClick={saveReading} style={{ padding: '12px 20px', background: 'black', color: 'white', border: 'none', borderRadius: '6px' }}>
        Save Electric Reading
      </button>

      {message && <p style={{ marginTop: '20px' }}>{message}</p>}
    </main>
  )
}
