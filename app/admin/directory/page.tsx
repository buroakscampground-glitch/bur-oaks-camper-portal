'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { AlertTriangle, Loader2 } from 'lucide-react'

export default function DirectoryPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    loadCampers()
  }, [])

  async function loadCampers() {
    setLoading(true)
    setLoadError('')
    const { data, error } = await supabase
      .from('campers')
      .select('*')

    if (error) setLoadError('The camper roster could not be loaded. No roster is being shown as empty.')
    else setCampers(data || [])
    setLoading(false)
  }

  const filteredCampers = campers.filter((camper) => {
    const text = `${camper.first_name} ${camper.last_name} ${camper.email} ${camper.phone} ${camper.lot_number}`.toLowerCase()
    return text.includes(search.toLowerCase())
  })

  if (loading) return <main className="portal-loading"><Loader2 className="spin" /><h1>Loading camper directory…</h1></main>
  if (loadError) return <main className="portal-loading" role="alert"><AlertTriangle aria-hidden="true" /><h1>Camper directory is temporarily unavailable</h1><p>{loadError}</p><button className="portal-loading-retry" type="button" onClick={loadCampers}>Try again</button></main>

  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Camper Directory</h1>
          <p className="muted">Search campers by name, lot, email, or phone.</p>

          <input
            placeholder="Search campers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ display: 'block', width: '100%', marginTop: '15px' }}
          />
        </section>

        <section className="card">
          <h2>Campers</h2>

          {filteredCampers.length === 0 && (
            <p className="muted">No campers found.</p>
          )}

          {filteredCampers.map((camper) => (
            <div
              key={camper.id}
              style={{
                borderTop: '1px solid #e3ded2',
                padding: '15px 0',
              }}
            >
              <h3>
                Lot {camper.lot_number || 'N/A'} — {camper.first_name} {camper.last_name}
              </h3>
              <p><strong>Email:</strong> {camper.email || 'Not Provided'}</p>
              <p><strong>Phone:</strong> {camper.phone || 'Not Provided'}</p>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
