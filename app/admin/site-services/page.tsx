'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Search, Sparkles, SprayCan, Waves, XCircle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { defaultCampgroundBillingSettings, loadCampgroundBillingSettings } from '../../../lib/campground-settings'

const miscServiceOption = { type: 'misc_service', label: 'Misc custom charge', amount: 0 }

function camperName(camper: any) {
  return `${camper?.first_name || ''} ${camper?.last_name || ''}`.trim() || 'Camper'
}

export default function AdminSiteServicesPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [charges, setCharges] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [serviceType, setServiceType] = useState(defaultCampgroundBillingSettings.siteServices[0].type)
  const [customLabel, setCustomLabel] = useState('')
  const [customAmount, setCustomAmount] = useState('')
  const [performedAt, setPerformedAt] = useState('')
  const [notes, setNotes] = useState('')
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [savingId, setSavingId] = useState('')
  const [serviceOptions, setServiceOptions] = useState([...defaultCampgroundBillingSettings.siteServices, miscServiceOption])

  useEffect(() => {
    const today = new Date()
    const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60 * 1000)
    setPerformedAt(localToday.toISOString().slice(0, 10))
    loadCampers()
    loadCharges()
    loadSettings()
  }, [])

  async function loadSettings() {
    const settings = await loadCampgroundBillingSettings(supabase)
    setServiceOptions([...settings.siteServices, miscServiceOption])
  }

  async function loadCampers() {
    const { data, error } = await supabase
      .from('campers')
      .select('id,first_name,last_name,lot_number,email,active,role')
      .eq('active', true)
      .order('lot_number', { ascending: true })

    if (error) setMessage(error.message)
    setCampers((data || []).filter((camper) => !['admin', 'maintenance'].includes(String(camper.role || 'camper').toLowerCase())))
  }

  async function loadCharges() {
    const { data, error } = await supabase
      .from('site_service_charges')
      .select('*')
      .order('performed_at', { ascending: false })

    if (error) setMessage(error.message)
    setCharges(data || [])
  }

  async function addCharge() {
    setMessage('')
    const selectedCamper = campers.find((camper) => camper.id === camperId)
    const selectedService = serviceOptions.find((service) => service.type === serviceType)
    const isCustomService = serviceType === 'misc_service'
    const finalServiceLabel = isCustomService ? customLabel.trim() : selectedService?.label || ''
    const finalServiceAmount = isCustomService ? Number(customAmount) : Number(selectedService?.amount || 0)

    if (!selectedCamper || !selectedService || !performedAt) {
      setMessage('Choose a camper, service, and date first.')
      return
    }

    if (isCustomService && !finalServiceLabel) {
      setMessage('Add a description for the misc charge.')
      return
    }

    if (!Number.isFinite(finalServiceAmount) || finalServiceAmount <= 0) {
      setMessage('Enter a charge amount greater than $0.')
      return
    }

    setSaving(true)

    const {
      data: { user },
    } = await supabase.auth.getUser()

    const { error } = await supabase.from('site_service_charges').insert({
      camper_id: selectedCamper.id,
      lot_number: selectedCamper.lot_number || null,
      camper_name: camperName(selectedCamper),
      service_type: selectedService.type,
      service_label: finalServiceLabel,
      charge_amount: finalServiceAmount,
      notes: notes.trim() || null,
      performed_at: `${performedAt}T12:00:00`,
      created_by: user?.email || null,
    })

    setSaving(false)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage(`${finalServiceLabel} added for Lot ${selectedCamper.lot_number || '—'}. It will attach to the next electric bill.`)
    setCustomLabel('')
    setCustomAmount('')
    setNotes('')
    loadCharges()
  }

  async function cancelCharge(id: string) {
    setSavingId(id)
    const { error } = await supabase
      .from('site_service_charges')
      .update({ cancelled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)

    setSavingId('')
    setMessage(error ? error.message : 'Site service charge cancelled.')
    if (!error) loadCharges()
  }

  async function restoreCharge(id: string) {
    setSavingId(id)
    const { error } = await supabase
      .from('site_service_charges')
      .update({ cancelled_at: null, updated_at: new Date().toISOString() })
      .eq('id', id)

    setSavingId('')
    setMessage(error ? error.message : 'Site service charge restored.')
    if (!error) loadCharges()
  }

  const selectedService = serviceOptions.find((service) => service.type === serviceType) || serviceOptions[0]
  const isCustomService = selectedService.type === 'misc_service'
  const buttonLabel = isCustomService
    ? `Add misc charge${Number(customAmount) > 0 ? ` · $${Number(customAmount).toFixed(2)}` : ''}`
    : `Add ${selectedService.label} · $${selectedService.amount}`
  const activeCharges = charges.filter((charge) => !charge.billed_at && !charge.cancelled_at)
  const billedCharges = charges.filter((charge) => charge.billed_at)
  const pendingTotal = activeCharges.reduce((sum, charge) => sum + Number(charge.charge_amount || 0), 0)

  const visibleCharges = useMemo(() => {
    const term = search.trim().toLowerCase()
    return charges.filter((charge) => {
      const isActive = !charge.billed_at && !charge.cancelled_at
      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' ? isActive : filter === 'billed' ? Boolean(charge.billed_at) : Boolean(charge.cancelled_at))
      const matchesSearch =
        !term ||
        `${charge.lot_number || ''} ${charge.camper_name || ''} ${charge.service_label || ''} ${charge.notes || ''}`
          .toLowerCase()
          .includes(term)

      return matchesFilter && matchesSearch
    })
  }, [charges, filter, search])

  return (
    <main className="admin-site-services-page">
      <section className="admin-site-services-hero">
        <a href="/admin">← Back to dashboard</a>
        <span><Sparkles size={17} /> SITE SERVICE CHARGES</span>
        <h1>Add sporadic site work to the next electric bill.</h1>
        <p>Use this when Bur Oaks weed eats, sprays weeds, or pressure washes a camper site. Unbilled charges attach automatically when you create that camper’s next electric invoice.</p>
      </section>

      <section className="admin-site-service-stats">
        <article><small>Work completed</small><strong>{activeCharges.length}</strong></article>
        <article><small>Waiting to bill</small><strong>${pendingTotal.toFixed(2)}</strong></article>
        <article><small>Already billed</small><strong>{billedCharges.length}</strong></article>
      </section>

      <section className="admin-site-service-form">
        <div>
          <span><SprayCan size={16} /> Add service</span>
          <h2>What was done?</h2>
          <p>Pick the camper, choose the work performed, and it waits for the next electric bill.</p>
        </div>

        <label>
          <span>Camper / lot</span>
          <select value={camperId} onChange={(event) => setCamperId(event.target.value)}>
            <option value="">Select camper</option>
            {campers.map((camper) => (
              <option key={camper.id} value={camper.id}>
                Lot {camper.lot_number || '—'} · {camperName(camper)}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Service</span>
          <select value={serviceType} onChange={(event) => setServiceType(event.target.value)}>
            {serviceOptions.map((service) => (
              <option key={service.type} value={service.type}>
                {service.amount > 0 ? `${service.label} — $${service.amount}` : service.label}
              </option>
            ))}
          </select>
        </label>

        {isCustomService && (
          <>
            <label>
              <span>Misc description</span>
              <input value={customLabel} onChange={(event) => setCustomLabel(event.target.value)} placeholder="Example: Extra cleanup, gravel, special repair" />
            </label>

            <label>
              <span>Misc amount</span>
              <input
                min="0"
                step="0.01"
                type="number"
                value={customAmount}
                onChange={(event) => setCustomAmount(event.target.value)}
                placeholder="0.00"
              />
            </label>
          </>
        )}

        <label>
          <span>Date done</span>
          <input type="date" value={performedAt} onChange={(event) => setPerformedAt(event.target.value)} />
        </label>

        <label className="admin-site-service-notes">
          <span>Notes</span>
          <input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Optional note, area, or detail" />
        </label>

        <button type="button" onClick={addCharge} disabled={saving}>
          <CheckCircle2 size={16} /> {saving ? 'Adding…' : buttonLabel}
        </button>
      </section>

      <section className="admin-site-service-toolbar">
        <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lot, camper, service, or notes" /></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="active">Completed / waiting to bill</option>
          <option value="billed">Billed</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
      </section>

      <section className="admin-site-service-list">
        {visibleCharges.map((charge) => {
          const isBilled = Boolean(charge.billed_at)
          const isCancelled = Boolean(charge.cancelled_at)

          return (
            <article className={`${isBilled ? 'billed' : ''} ${isCancelled ? 'cancelled' : ''}`} key={charge.id}>
              <span>{isBilled ? 'Billed' : isCancelled ? 'Cancelled' : 'Done · Awaiting bill'}</span>
              <div>
                <small>Lot {charge.lot_number || 'N/A'} · {new Date(charge.performed_at).toLocaleDateString()}</small>
                <h2>{charge.service_label} · {charge.camper_name}</h2>
                <p>{charge.notes || 'No notes added.'}</p>
                <em>
                  ${Number(charge.charge_amount || 0).toFixed(2)}
                  {isBilled ? ` · billed on ${new Date(charge.billed_at).toLocaleDateString()}` : ' · work complete · waiting for next electric bill'}
                </em>
              </div>
              <div className="admin-site-service-actions">
                {!isBilled && !isCancelled && (
                  <button className="danger" type="button" onClick={() => cancelCharge(charge.id)} disabled={savingId === charge.id}>
                    <XCircle size={15} /> Cancel
                  </button>
                )}
                {!isBilled && isCancelled && (
                  <button type="button" onClick={() => restoreCharge(charge.id)} disabled={savingId === charge.id}>
                    Restore
                  </button>
                )}
              </div>
            </article>
          )
        })}

        {visibleCharges.length === 0 && (
          <div className="admin-site-service-empty">
            <Waves size={34} />
            <h2>No site service charges found</h2>
            <p>New weed eating, spraying, and pressure washing charges will appear here.</p>
          </div>
        )}
      </section>

      {message && <p className="admin-site-service-message">{message}</p>}
    </main>
  )
}
