'use client'

import { useEffect, useState } from 'react'
import { MapPin, Phone, Search, ShieldCheck, UsersRound } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function CamperDirectoryPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadDirectory()
  }, [])

  async function loadDirectory() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    const { data, error } = await supabase.rpc('get_camper_directory')

    if (error) {
      setMessage('The camper directory is being set up. Please check back soon.')
    } else {
      setCampers(data || [])
    }

    setLoading(false)
  }

  const filteredCampers = campers.filter((camper) => {
    const value = `${camper.first_name} ${camper.last_name} ${camper.lot_number}`.toLowerCase()
    return value.includes(search.trim().toLowerCase())
  })

  if (loading) {
    return <div className="directory-loading">Opening camper directory…</div>
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card directory-hero" style={{ marginBottom: '25px' }}>
          <div className="directory-hero-icon"><UsersRound size={29} /></div>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Camper Directory</h1>
          <p className="muted">
            Find neighbors who have chosen to be listed in the campground directory.
          </p>

          <div className="directory-privacy-note">
            <ShieldCheck size={17} /> Only campers who opt in appear here.
          </div>
        </section>

        <section className="card">
          <div className="directory-search">
            <Search size={19} />
            <input
              aria-label="Search camper directory"
              placeholder="Search by name or lot number…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {message && <p className="directory-message">{message}</p>}

          {!message && filteredCampers.length === 0 && (
            <div className="directory-empty">
              <UsersRound size={30} />
              <h3>No campers found</h3>
              <p>Try a different search or check back as more campers opt in.</p>
            </div>
          )}

          <div className="camper-directory-grid">
            {filteredCampers.map((camper) => (
              <article className="camper-directory-card" key={camper.id}>
                <div className="camper-directory-avatar">
                  {(camper.first_name?.[0] || '') + (camper.last_name?.[0] || '')}
                </div>
                <div className="camper-directory-copy">
                  <h3>{camper.first_name} {camper.last_name}</h3>
                  <span><MapPin size={15} /> Lot {camper.lot_number || '—'}</span>
                  {camper.phone && (
                    <a href={`tel:${camper.phone}`}><Phone size={15} /> {camper.phone}</a>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </main>
  )
}
