'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { getCurrentCamper, supabase } from '../../lib/supabase'

export default function ElectricPage() {
  const [readings, setReadings] = useState<any[]>([])
  const [meterPhotos, setMeterPhotos] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const router = useRouter()

  useEffect(() => {
    loadElectricHistory()
  }, [])

  async function loadElectricHistory() {
    setLoading(true)
    setLoadError('')

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser()

      if (authError) throw authError

      if (!user) {
        window.location.href = '/login'
        return
      }

      const { error: camperAvailabilityError } = await supabase.from('campers').select('id').limit(1)
      if (camperAvailabilityError) throw camperAvailabilityError

      const camper = await getCurrentCamper()
      if (!camper) throw new Error('Camper account was not available.')

      const { data, error: readingsError } = await supabase
        .from('electric_readings')
        .select('*')
        .eq('camper_id', camper.id)
        .order('reading_date', { ascending: false })

      if (readingsError) throw readingsError
      setReadings(data || [])

      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      if (sessionError) throw sessionError
      const token = sessionData.session?.access_token
      if (!token) throw new Error('Your secure session could not be confirmed.')

      const response = await fetch('/api/camper-meter-photos', {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!response.ok) throw new Error('Meter photos could not be loaded.')

      const result = await response.json()
      setMeterPhotos(Array.isArray(result.photos) ? result.photos : [])
    } catch (error: any) {
      setReadings([])
      setMeterPhotos([])
      setLoadError(error?.message || 'Electric history could not be loaded.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) return <div className="portal-loading" role="alert"><Loader2 className="portal-loading-spinner" aria-hidden="true" /><h1>Loading electric history…</h1><p>Your readings, charges, and meter photos are being checked.</p></div>

  if (loadError) return <div className="portal-loading portal-loading-error" role="alert"><AlertTriangle aria-hidden="true" /><h1>Electric history is temporarily unavailable</h1><p>Usage totals, charges, and meter photos are hidden until the complete history can be confirmed.</p><button className="portal-loading-retry" type="button" onClick={loadElectricHistory}>Try again</button></div>

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

        {meterPhotos.length > 0 && (
          <section className="card" style={{ marginBottom: '25px' }}>
            <h2 style={{ marginBottom: '6px' }}>Your Meter Photos</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Each billed meter reading includes the picture taken at your campsite.
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                gap: '16px',
              }}
            >
              {meterPhotos.map((photo) => (
                <article key={photo.id} style={{ border: '1px solid #dfe7dc', borderRadius: '12px', overflow: 'hidden' }}>
                  <a href={photo.photo_url} target="_blank" rel="noreferrer" title="Open the full-size meter photo">
                    <img
                      src={photo.photo_url}
                      alt={`Meter reading for Lot ${photo.lot_number}`}
                      style={{ display: 'block', width: '100%', height: '190px', objectFit: 'cover', background: '#eef4ea' }}
                    />
                  </a>
                  <div style={{ padding: '12px 14px' }}>
                    <strong>Lot {photo.lot_number}</strong>
                    <p className="muted" style={{ margin: '4px 0 0' }}>
                      {new Date(photo.captured_at).toLocaleDateString()}
                      {photo.reading !== null ? ` · Reading ${Number(photo.reading).toLocaleString()}` : ''}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

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
