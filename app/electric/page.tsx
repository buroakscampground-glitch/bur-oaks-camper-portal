'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ElectricPage() {
  const [readings, setReadings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadReadings() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: camper } = await supabase
        .from('campers')
        .select('*')
        .eq('email', user.email)
        .single()

      if (!camper) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('electric_readings')
        .select('*')
        .eq('camper_id', camper.id)
        .order('reading_date', { ascending: false })

      if (error) {
        console.error(error)
      } else {
        setReadings(data || [])
      }

      setLoading(false)
    }

    loadReadings()
  }, [])

  if (loading) {
    return <p style={{ padding: '40px' }}>Loading electric usage...</p>
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>My Electric Usage</h1>

      {readings.length === 0 && <p>No electric readings found yet.</p>}

      {readings.map((reading) => (
        <div
          key={reading.id}
          style={{
            border: '1px solid #ccc',
            padding: '20px',
            borderRadius: '10px',
            marginBottom: '20px',
            maxWidth: '650px',
          }}
        >
          <h2>Reading Date: {reading.reading_date}</h2>

          <p>
            <strong>Previous Reading:</strong> {reading.previous_reading}
          </p>

          <p>
            <strong>Current Reading:</strong> {reading.current_reading}
          </p>

          <p>
            <strong>kWh Used:</strong> {reading.kwh_used}
          </p>

          <p>
            <strong>Rate:</strong> ${reading.rate_per_kwh} per kWh
          </p>

          <h2>Total Electric Charge: ${reading.electric_total}</h2>
        </div>
      ))}
    </main>
  )
}