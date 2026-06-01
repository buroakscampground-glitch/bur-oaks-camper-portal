'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function DirectoryPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadCampers()
  }, [])

  async function loadCampers() {
    const { data } = await supabase
      .from('campers')
      .select('*')

    setCampers(data || [])
  }

  const filteredCampers = campers.filter((camper) => {
    const text = `${camper.first_name} ${camper.last_name} ${camper.email} ${camper.phone} ${camper.lot_number}`.toLowerCase()
    return text.includes(search.toLowerCase())
  })

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