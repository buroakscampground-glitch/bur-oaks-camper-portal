'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  CircleDollarSign,
  Gauge,
  MapPin,
  Plus,
  Search,
  TentTree,
  Trash2,
  UserPlus,
  UsersRound,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'

const siteKey = (value: unknown) => String(value || '').trim().toLowerCase()

export default function LotsPage() {
  const [lots, setLots] = useState<any[]>([])
  const [campers, setCampers] = useState<any[]>([])
  const [lotNumber, setLotNumber] = useState('')
  const [meterNumber, setMeterNumber] = useState('')
  const [lotRentAmount, setLotRentAmount] = useState('')
  const [camperId, setCamperId] = useState('')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const [lotResult, camperResult] = await Promise.all([
      supabase.from('lots').select('*').order('lot_number', { ascending: true }),
      supabase.from('campers').select('*').eq('active', true).order('lot_number', { ascending: true }),
    ])

    setLots(lotResult.data || [])
    setCampers(camperResult.data || [])
  }

  const sites = useMemo(() => {
    const merged = new Map<string, any>()

    for (const lot of lots) {
      merged.set(siteKey(lot.lot_number), { ...lot, persisted: true })
    }

    for (const camper of campers) {
      const key = siteKey(camper.lot_number)
      if (!key || key === 'staff') continue
      if (!merged.has(key)) {
        merged.set(key, {
          id: `roster-${key}`,
          lot_number: camper.lot_number,
          meter_number: null,
          lot_rent_amount: null,
          camper_id: null,
          persisted: false,
        })
      }
    }

    return [...merged.values()].sort((a, b) =>
      String(a.lot_number).localeCompare(String(b.lot_number), undefined, { numeric: true })
    )
  }, [lots, campers])

  const occupiedSites = sites.filter((site) =>
    campers.some((camper) => siteKey(camper.lot_number) === siteKey(site.lot_number))
  )
  const vacantSites = sites.length - occupiedSites.length
  const assignedCampers = campers.filter((camper) => {
    const key = siteKey(camper.lot_number)
    return key && key !== 'staff'
  })

  const filteredSites = sites.filter((site) => {
    const occupants = campers.filter((camper) => siteKey(camper.lot_number) === siteKey(site.lot_number))
    const text = [
      site.lot_number,
      site.meter_number,
      ...occupants.flatMap((camper) => [camper.first_name, camper.last_name, camper.email]),
    ].join(' ').toLowerCase()
    return text.includes(search.toLowerCase())
  })

  async function addLot() {
    if (!lotNumber.trim()) {
      setMessage('Please enter a site number.')
      return
    }

    const selectedCamper = campers.find((camper) => camper.id === camperId)
    const { error } = await supabase.from('lots').insert({
      lot_number: lotNumber.trim(),
      meter_number: meterNumber.trim() || null,
      lot_rent_amount: lotRentAmount ? Number(lotRentAmount) : null,
      camper_id: camperId || null,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    if (selectedCamper) {
      await supabase.from('campers').update({ lot_number: lotNumber.trim() }).eq('id', selectedCamper.id)
    }

    setMessage(`Site ${lotNumber.trim()} added successfully.`)
    setLotNumber('')
    setMeterNumber('')
    setLotRentAmount('')
    setCamperId('')
    loadData()
  }

  async function addCamperToSite(site: any, newCamperId: string) {
    if (!newCamperId) return

    const camper = campers.find((item) => item.id === newCamperId)
    if (!camper) return

    const { error } = await supabase
      .from('campers')
      .update({ lot_number: String(site.lot_number) })
      .eq('id', newCamperId)

    if (error) {
      setMessage(error.message)
      return
    }

    if (site.persisted && !site.camper_id) {
      await supabase.from('lots').update({ camper_id: newCamperId }).eq('id', site.id)
    }

    setMessage(`${camper.first_name} ${camper.last_name} added to Site ${site.lot_number}.`)
    loadData()
  }

  async function removeCamperFromSite(camper: any) {
    if (!confirm(`Remove ${camper.first_name} ${camper.last_name} from this site?`)) return

    const { error } = await supabase.from('campers').update({ lot_number: null }).eq('id', camper.id)
    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`${camper.first_name} ${camper.last_name} is now unassigned.`)
    loadData()
  }

  async function syncRosterSites() {
    setSyncing(true)
    setMessage('Syncing camper site assignments…')

    const existing = new Set(lots.map((lot) => siteKey(lot.lot_number)))
    const missingSites = sites.filter((site) => !existing.has(siteKey(site.lot_number)))

    if (missingSites.length) {
      const rows = missingSites.map((site) => {
        const firstCamper = campers.find((camper) => siteKey(camper.lot_number) === siteKey(site.lot_number))
        return {
          lot_number: String(site.lot_number),
          camper_id: firstCamper?.id || null,
        }
      })

      const { error } = await supabase.from('lots').insert(rows)
      if (error) {
        setMessage(error.message)
        setSyncing(false)
        return
      }
    }

    setMessage(`${assignedCampers.length} campers are connected to ${occupiedSites.length} occupied sites.`)
    setSyncing(false)
    loadData()
  }

  async function deleteLot(site: any) {
    if (!site.persisted) return
    if (!confirm(`Delete Site ${site.lot_number}? Camper profile assignments will remain.`)) return

    const { error } = await supabase.from('lots').delete().eq('id', site.id)
    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`Site ${site.lot_number} record deleted.`)
    loadData()
  }

  return (
    <main className="admin-lot-center">
      <section className="admin-lot-hero">
        <div>
          <span><TentTree size={15} /> CAMPGROUND OPERATIONS</span>
          <h1>Lots & Sites</h1>
          <p>See every occupied site, its campers, meter information, and rent details in one place.</p>
        </div>
        <button type="button" onClick={syncRosterSites} disabled={syncing}>
          <UsersRound size={18} /> {syncing ? 'Syncing…' : 'Sync Camper Sites'}
        </button>
      </section>

      <section className="admin-lot-summary">
        <article><span className="green"><MapPin size={21} /></span><div><small>Total sites</small><strong>{sites.length}</strong></div></article>
        <article><span className="blue"><UsersRound size={21} /></span><div><small>Occupied</small><strong>{occupiedSites.length}</strong></div></article>
        <article><span className="gold"><TentTree size={21} /></span><div><small>Vacant</small><strong>{vacantSites}</strong></div></article>
        <article><span className="plum"><UserPlus size={21} /></span><div><small>Assigned campers</small><strong>{assignedCampers.length}</strong></div></article>
      </section>

      {message && <div className="admin-lot-message" role="status">{message}</div>}

      <div className="admin-lot-layout">
        <aside className="admin-lot-create">
          <div className="admin-lot-heading"><span><Plus size={20} /></span><div><small>NEW SITE</small><h2>Add a lot or site</h2></div></div>
          <label><span>Site number</span><input value={lotNumber} onChange={(event) => setLotNumber(event.target.value)} placeholder="Example: 101" /></label>
          <label><span>Meter number</span><input value={meterNumber} onChange={(event) => setMeterNumber(event.target.value)} placeholder="Optional" /></label>
          <label><span>Quarterly rent</span><div className="admin-lot-money"><i>$</i><input type="number" value={lotRentAmount} onChange={(event) => setLotRentAmount(event.target.value)} placeholder="0.00" /></div></label>
          <label><span>Initial camper</span><select value={camperId} onChange={(event) => setCamperId(event.target.value)}><option value="">Leave vacant</option>{campers.map((camper) => <option value={camper.id} key={camper.id}>{camper.first_name} {camper.last_name} · Current site {camper.lot_number || 'none'}</option>)}</select></label>
          <button type="button" onClick={addLot}><Plus size={17} /> Save Site</button>
        </aside>

        <section className="admin-lot-directory">
          <div className="admin-lot-directory-heading">
            <div><small>SITE DIRECTORY</small><h2>Campground assignments</h2></div>
            <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search sites or campers…" /></label>
          </div>

          <div className="admin-lot-grid">
            {filteredSites.map((site) => {
              const occupants = campers.filter((camper) => siteKey(camper.lot_number) === siteKey(site.lot_number))
              return (
                <article className="admin-lot-card" key={site.id}>
                  <header>
                    <div><small>{occupants.length ? 'OCCUPIED' : 'VACANT'}</small><h3>Site {site.lot_number}</h3></div>
                    <span className={occupants.length ? 'occupied' : 'vacant'}>{occupants.length ? `${occupants.length} camper${occupants.length === 1 ? '' : 's'}` : 'Available'}</span>
                  </header>
                  <div className="admin-lot-details">
                    <span><Gauge size={15} /><small>Meter</small><strong>{site.meter_number || 'Not entered'}</strong></span>
                    <span><CircleDollarSign size={15} /><small>Rent</small><strong>{site.lot_rent_amount ? `$${Number(site.lot_rent_amount).toFixed(2)}` : 'Not entered'}</strong></span>
                  </div>
                  <div className="admin-lot-occupants">
                    <small>CAMPERS ON THIS SITE</small>
                    {occupants.length === 0 ? <p>No campers assigned.</p> : occupants.map((camper) => (
                      <div key={camper.id}>
                        <a href={`/admin/campers/${camper.id}`}><span>{camper.first_name?.[0]}{camper.last_name?.[0]}</span><div><strong>{camper.first_name} {camper.last_name}</strong><small>{camper.email}</small></div></a>
                        <button type="button" onClick={() => removeCamperFromSite(camper)} aria-label={`Remove ${camper.first_name} from site`}><Trash2 size={14} /></button>
                      </div>
                    ))}
                  </div>
                  <div className="admin-lot-actions">
                    <select defaultValue="" onChange={(event) => { addCamperToSite(site, event.target.value); event.target.value = '' }}>
                      <option value="">+ Add camper to this site</option>
                      {campers.filter((camper) => siteKey(camper.lot_number) !== siteKey(site.lot_number)).map((camper) => <option value={camper.id} key={camper.id}>{camper.first_name} {camper.last_name} · {camper.lot_number || 'Unassigned'}</option>)}
                    </select>
                    {site.persisted && <button type="button" onClick={() => deleteLot(site)}><Trash2 size={15} /></button>}
                  </div>
                  {!site.persisted && <small className="admin-lot-roster-note">Roster site · Select “Sync Camper Sites” to create its permanent site record.</small>}
                </article>
              )
            })}
          </div>
        </section>
      </div>
    </main>
  )
}
