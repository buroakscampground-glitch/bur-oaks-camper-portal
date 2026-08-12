'use client'

import { useEffect, useMemo, useState } from 'react'
import { Map as MapIcon, Search, TentTree, UsersRound, Wrench } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { isSystemPortalAccount } from '../../../lib/camper-records'

const siteKey = (value: unknown) => String(value || '').trim().toLowerCase()

export default function AdminMapPage() {
  const [lots, setLots] = useState<any[]>([])
  const [campers, setCampers] = useState<any[]>([])
  const [maintenance, setMaintenance] = useState<any[]>([])
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadMap()
  }, [])

  async function loadMap() {
    const [lotResult, camperResult, maintenanceResult] = await Promise.all([
      supabase.from('lots').select('*').order('lot_number', { ascending: true }),
      supabase.from('campers').select('*').eq('active', true).order('lot_number', { ascending: true }),
      supabase.from('maintenance_tickets').select('*').neq('status', 'Completed'),
    ])

    setLots(lotResult.data || [])
    setCampers((camperResult.data || []).filter((camper) => !isSystemPortalAccount(camper)))
    setMaintenance(maintenanceResult.data || [])
  }

  const sites = useMemo(() => {
    const merged = new globalThis.Map<string, any>()
    for (const lot of lots) merged.set(siteKey(lot.lot_number), { ...lot, persisted: true })
    for (const camper of campers) {
      const key = siteKey(camper.lot_number)
      if (!key || key === 'staff') continue
      if (!merged.has(key)) merged.set(key, { id: `roster-${key}`, lot_number: camper.lot_number })
    }
    return [...merged.values()].sort((a, b) =>
      String(a.lot_number).localeCompare(String(b.lot_number), undefined, { numeric: true })
    )
  }, [lots, campers])

  const visibleSites = sites.filter((site) => {
    const occupants = campers.filter((camper) => siteKey(camper.lot_number) === siteKey(site.lot_number))
    const text = `${site.lot_number} ${occupants.map((camper) => `${camper.first_name} ${camper.last_name}`).join(' ')}`
    return text.toLowerCase().includes(search.toLowerCase())
  })

  const occupiedCount = sites.filter((site) =>
    campers.some((camper) => siteKey(camper.lot_number) === siteKey(site.lot_number))
  ).length
  const maintenanceLots = new Set(maintenance.map((ticket) => siteKey(ticket.lot_number)))

  return (
    <main className="admin-map-page">
      <section className="admin-map-hero">
        <div>
          <span><MapIcon size={17} /> CAMPGROUND MAP</span>
          <h1>See the campground at a glance.</h1>
          <p>Occupied lots, vacant sites, and maintenance activity in one visual board. True clickable GPS lot placement can come next when the final lot map is digitized.</p>
        </div>
        <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lot or camper" /></label>
      </section>

      <section className="admin-map-stats">
        <article><TentTree size={20} /><small>Total sites</small><strong>{sites.length}</strong></article>
        <article><UsersRound size={20} /><small>Occupied</small><strong>{occupiedCount}</strong></article>
        <article><TentTree size={20} /><small>Vacant</small><strong>{Math.max(sites.length - occupiedCount, 0)}</strong></article>
        <article><Wrench size={20} /><small>Maintenance lots</small><strong>{maintenanceLots.size}</strong></article>
      </section>

      <section className="admin-lot-map-board">
        {visibleSites.map((site, index) => {
          const occupants = campers.filter((camper) => siteKey(camper.lot_number) === siteKey(site.lot_number))
          const hasMaintenance = maintenanceLots.has(siteKey(site.lot_number))
          const tone = hasMaintenance ? 'maintenance' : occupants.length ? 'occupied' : 'vacant'

          return (
            <a
              className={`admin-lot-map-pin ${tone}`}
              href={occupants[0] ? `/admin/campers/${occupants[0].id}` : '/admin/lots'}
              key={site.id || site.lot_number}
              style={{ animationDelay: `${Math.min(index * 12, 360)}ms` }}
            >
              <small>Lot</small>
              <strong>{site.lot_number}</strong>
              <span>{hasMaintenance ? 'Maintenance' : occupants[0] ? `${occupants[0].first_name} ${occupants[0].last_name}` : 'Vacant'}</span>
            </a>
          )
        })}
      </section>
    </main>
  )
}
