'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { getCurrentCamper, supabase } from '../../lib/supabase'

export default function ElectricPage() {
  const [readings, setReadings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    async function loadElectricHistory() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/login'
        return
      }

      const camper = await getCurrentCamper()

      if (!camper) {
        setLoading(false)
        return
      }

      const { data } = await supabase
        .from('electric_readings')
        .select('*')
        .eq('camper_id', camper.id)
        .order('reading_date', { ascending: false })

      setReadings(data || [])
      setLoading(false)
    }

    loadElectricHistory()
  }, [])

  if (loading) return <p style={{ padding: '40px' }}>Loading electric history...</p>

  const latest = readings[0]
  const totalDue = readings.reduce(
  (sum, item) => sum + Number(item.amount_due || 0),
  0
)

const lifetimeUsage = readings.reduce(
  (sum, item) => sum + Number(item.kwh_used || 0),
  0
)

const currentYear = new Date().getFullYear()

const yearlyUsage = readings
  .filter(
    (item) =>
      new Date(item.reading_date).getFullYear() === currentYear
  )
  .reduce(
    (sum, item) => sum + Number(item.kwh_used || 0),
    0
  )

  return (
    <main className="page">
      <div className="container">
        <section
  className="card"
  style={{
    marginBottom: '25px',
    background: 'linear-gradient(135deg, #ffffff 0%, #eef4ea 100%)',
    position: 'relative',
    overflow: 'hidden',
  }}
>
  <div
    style={{
      position: 'absolute',
      right: 25,
      top: 20,
      fontSize: 80,
      opacity: 0.15,
    }}
  >
    🌳
  </div>

  <p className="muted">BUR OAKS CAMPGROUND</p>
<button
  onClick={() => router.push('/portal')}
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
  ← Back to Portal
</button>
  <h1>My Electric Usage</h1>

  <p className="muted">
    Review your meter readings, kWh usage, and electric charges.
  </p>
</section>
      <div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '15px',
    marginBottom: '25px',
  }}
>
  <section className="card">
    <h2>{latest ? latest.kwh_used : 0} kWh</h2>
    <p className="muted">Latest Usage</p>
  </section>

  <section className="card">
    <h2>
      ${latest ? Number(latest.amount_due || 0).toFixed(2) : '0.00'}
    </h2>
    <p className="muted">Latest Charge</p>
  </section>

  <section className="card">
  <h2>
    {latest
      ? latest.current_reading
      : 0}
  </h2>
  <p className="muted">Current Meter Reading</p>
</section>

  <section className="card">
  <h2>
    {latest
      ? latest.previous_reading
      : 0}
  </h2>
  <p className="muted">Previous Meter Reading</p>
</section>
  <section className="card">
  <h2>${totalDue.toFixed(2)}</h2>
  <p className="muted">Lifetime Electric Charges</p>
</section>
<section className="card">
  <h2>{yearlyUsage.toLocaleString()} kWh</h2>
  <p className="muted">Year Usage</p>
</section>

<section className="card">
  <h2>{lifetimeUsage.toLocaleString()} kWh</h2>
  <p className="muted">Lifetime Usage</p>
</section>
</div>

        {readings.length === 0 && (
          <section className="card">
            <h2>No electric readings yet</h2>
            <p className="muted">No electric usage has been posted to your account yet.</p>
          </section>
        )}

        <div className="grid">
          {readings.map((reading) => (
            <section className="card" key={reading.id}>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  gap: '20px',
                  alignItems: 'center',
                }}
              >
                <div>
                  <p className="muted" style={{ margin: 0 }}>
                    Reading Date
                  </p>
                  <h2>{reading.reading_date}</h2>

                  <p>
                    Previous: <strong>{reading.previous_reading}</strong>
                  </p>

                  <p>
                    Current: <strong>{reading.current_reading}</strong>
                  </p>

                  <p>
                    Rate: <strong>${reading.rate_per_kwh}</strong> per kWh
                  </p>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <h2>{reading.kwh_used} kWh</h2>
                  <h2 style={{ color: '#2f5d3a' }}>
                    ${Number(reading.amount_due || 0).toFixed(2)}
                  </h2>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </main>
  )
}
