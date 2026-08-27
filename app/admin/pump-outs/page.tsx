'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Droplets, Plus, Printer, Search, XCircle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { defaultCampgroundBillingSettings, loadCampgroundBillingSettings } from '../../../lib/campground-settings'
import { getSewerPumpOutFeeForLot, getSewerPumpOutGallonsForCharge } from '../../../lib/sewer-pump-fees'
import { isOperationalCamper, isSystemPortalAccount } from '../../../lib/camper-records'

const statusLabels: Record<string, string> = {
  requested: 'Needs Pumped',
  completed: 'Pumped',
  cancelled: 'Cancelled',
}

export default function AdminPumpOutsPage() {
  const [requests, setRequests] = useState<any[]>([])
  const [filter, setFilter] = useState('requested')
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')
  const [savingId, setSavingId] = useState('')
  const [sendingReport, setSendingReport] = useState(false)
  const [campers, setCampers] = useState<any[]>([])
  const [manualCamperId, setManualCamperId] = useState('')
  const [manualNotes, setManualNotes] = useState('')
  const [manualSaving, setManualSaving] = useState(false)
  const [defaultPumpOutFee, setDefaultPumpOutFee] = useState(defaultCampgroundBillingSettings.sewerPumpOutFee)

  useEffect(() => {
    loadRequests()
    loadManualEntryOptions()
  }, [])

  async function loadManualEntryOptions() {
    const [{ data, error }, settings] = await Promise.all([
      supabase
        .from('campers')
        .select('id,first_name,last_name,lot_number,role,active')
        .order('lot_number', { ascending: true }),
      loadCampgroundBillingSettings(supabase),
    ])

    if (error) setMessage(error.message)
    setCampers((data || []).filter(isOperationalCamper))
    setDefaultPumpOutFee(settings.sewerPumpOutFee)
  }

  async function loadRequests() {
    const { data, error } = await supabase
      .from('sewer_pump_out_requests')
      .select('*')
      .order('requested_at', { ascending: false })

    if (error) setMessage(error.message)
    // Keep portal test accounts out of the live pump-out queue and history.
    setRequests((data || []).filter((request) => !isSystemPortalAccount(request)))
  }

  async function updateStatus(id: string, status: 'completed' | 'cancelled' | 'requested') {
    setSavingId(id)
    const payload: any = {
      status,
      updated_at: new Date().toISOString(),
    }

    if (status === 'completed') payload.completed_at = new Date().toISOString()
    if (status === 'requested') payload.completed_at = null

    const { error } = await supabase
      .from('sewer_pump_out_requests')
      .update(payload)
      .eq('id', id)

    if (!error && ['completed', 'cancelled'].includes(status)) {
      await supabase
        .from('admin_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('type', 'sewer_pump_out')
        .eq('source_id', id)
        .is('read_at', null)
    }

    setSavingId('')
    setMessage(error ? error.message : status === 'completed'
      ? 'Marked pumped. The charge remains queued for the next electric bill.'
      : 'Pump-out request updated.')
    if (!error) loadRequests()
  }

  async function sendPumpOutReportNow() {
    if (!window.confirm('Send today\'s pump-out list to Gmail and the Epson printer now?')) return
    setSendingReport(true)
    setMessage('Creating the PDF and sending it to Gmail and the Epson printer…')

    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/pump-out-report', {
      method: 'POST',
      headers: { Authorization: `Bearer ${session?.access_token || ''}` },
    })
    const result = await response.json().catch(() => null)
    setMessage(result?.message || result?.error || 'Unable to send the pump-out list.')
    setSendingReport(false)
  }

  async function addManualPumpOut() {
    if (!manualCamperId) {
      setMessage('Choose a camper site first.')
      return
    }

    setManualSaving(true)
    setMessage('Adding the pump-out and pending charge…')
    const { data: { session } } = await supabase.auth.getSession()
    const response = await fetch('/api/admin-pump-out', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session?.access_token || ''}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ camperId: manualCamperId, notes: manualNotes }),
    })
    const result = await response.json().catch(() => null)

    setManualSaving(false)
    setMessage(result?.message || result?.error || 'Unable to add the pump-out request.')

    if (response.ok && !result?.duplicate) {
      setManualCamperId('')
      setManualNotes('')
      await loadRequests()
      setFilter('requested')
    }
  }

  const visibleRequests = useMemo(() => {
    const term = search.trim().toLowerCase()
    return requests.filter((request) => {
      const active = request.status !== 'cancelled' && !request.billed_at
      const matchesFilter =
        filter === 'all' ||
        (filter === 'active' ? active : request.status === filter)
      const matchesSearch =
        !term ||
        `${request.camper_name} ${request.lot_number} ${request.notes || ''}`
          .toLowerCase()
          .includes(term)

      return matchesFilter && matchesSearch
    })
  }, [filter, requests, search])

  const activeRequests = requests.filter((request) => request.status !== 'cancelled' && !request.billed_at)
  const needsPumping = requests.filter((request) => request.status === 'requested' && !request.billed_at)
  const completedUnbilled = requests.filter((request) => request.status === 'completed' && !request.billed_at)
  const pendingChargeTotal = activeRequests.reduce((sum, request) => sum + Number(request.charge_amount || 10), 0)
  const pendingGallons = activeRequests.reduce(
    (sum, request) => sum + Number(request.gallons_used || getSewerPumpOutGallonsForCharge(request.charge_amount)),
    0
  )
  const selectedManualCamper = campers.find((camper) => camper.id === manualCamperId)
  const selectedManualCharge = getSewerPumpOutFeeForLot(selectedManualCamper?.lot_number, defaultPumpOutFee)

  return (
    <main className="admin-pump-page">
      <section className="admin-pump-hero">
        <a href="/admin">← Back to dashboard</a>
        <span><Droplets size={17} /> SEWER PUMP-OUT QUEUE</span>
        <h1>See who needs pumped before electric bills go out.</h1>
        <p>Camper requests create the correct pending charge automatically. Holding-tank sites are $15; standard sites use the campground default. Electric billing automatically includes unbilled pump-outs and marks them billed.</p>
      </section>

      <section className="admin-pump-stats">
        <article><small>Needs pumped</small><strong>{needsPumping.length}</strong></article>
        <article><small>Pumped, not billed</small><strong>{completedUnbilled.length}</strong></article>
        <article><small>Pending charges</small><strong>${pendingChargeTotal.toFixed(2)}</strong></article>
        <article><small>Gallons on active list</small><strong>{pendingGallons.toLocaleString()}</strong></article>
      </section>

      <section className="admin-pump-manual">
        <div>
          <span><Plus size={16} /> OFFICE ENTRY</span>
          <h2>Add a pump-out manually</h2>
          <p>Use this when a camper calls or visits the office. It enters the normal pump queue and adds the charge to their next electric invoice.</p>
        </div>
        <div className="admin-pump-manual-fields">
          <label>
            <span>Camper site</span>
            <select value={manualCamperId} onChange={(event) => setManualCamperId(event.target.value)}>
              <option value="">Choose a lot…</option>
              {campers.map((camper) => (
                <option value={camper.id} key={camper.id}>
                  Lot {camper.lot_number || '—'} · {`${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper'}{camper.active === false ? ' · ARCHIVED – FINAL BILLING' : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Office note (optional)</span>
            <input value={manualNotes} onChange={(event) => setManualNotes(event.target.value)} maxLength={500} placeholder="Called the office, requested before Friday…" />
          </label>
          <button type="button" onClick={addManualPumpOut} disabled={manualSaving || !manualCamperId}>
            <Plus size={16} /> {manualSaving ? 'Adding…' : `Add Pump-Out · $${selectedManualCharge.toFixed(2)}`}
          </button>
        </div>
        <small>The system will not create a second charge if this site already has an open, unbilled pump-out.</small>
      </section>

      <section className="admin-pump-toolbar">
        <label><Search size={16} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search lot, camper, or note" /></label>
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="requested">Needs Pumped</option>
          <option value="completed">Pumped</option>
          <option value="active">All current / unbilled</option>
          <option value="cancelled">Cancelled</option>
          <option value="all">All</option>
        </select>
        <button type="button" onClick={sendPumpOutReportNow} disabled={sendingReport}>
          <Printer size={16} /> {sendingReport ? 'Sending…' : 'Send / Print List Now'}
        </button>
      </section>

      <section className="admin-pump-list">
        {visibleRequests.map((request) => {
          const isBilled = Boolean(request.billed_at)

          return (
            <article className={`${request.status} ${isBilled ? 'billed' : ''}`} key={request.id}>
              <span>{statusLabels[request.status] || request.status}</span>
              <div className="admin-pump-details">
                <small>Lot {request.lot_number || 'N/A'} · {new Date(request.requested_at).toLocaleString()}</small>
                <h2>{request.camper_name}</h2>
                <p>{request.notes || 'No notes. Camper requested sewer pump-out from the portal.'}</p>
                <em>
                  {Number(request.gallons_used || getSewerPumpOutGallonsForCharge(request.charge_amount)).toLocaleString()} gallons · ${Number(request.charge_amount || 10).toFixed(2)}
                  {isBilled ? ` · billed on ${new Date(request.billed_at).toLocaleDateString()}` : ' · pending next electric bill'}
                </em>
              </div>
              <div className="admin-pump-actions">
                {request.status !== 'completed' && request.status !== 'cancelled' && (
                  <button type="button" onClick={() => updateStatus(request.id, 'completed')} disabled={savingId === request.id}>
                    <CheckCircle2 size={15} /> Mark pumped
                  </button>
                )}
                {request.status === 'completed' && !isBilled && (
                  <button type="button" onClick={() => updateStatus(request.id, 'requested')} disabled={savingId === request.id}>
                    Reopen
                  </button>
                )}
                {request.status !== 'cancelled' && !isBilled && (
                  <button className="danger" type="button" onClick={() => updateStatus(request.id, 'cancelled')} disabled={savingId === request.id}>
                    <XCircle size={15} /> Cancel
                  </button>
                )}
              </div>
            </article>
          )
        })}

        {visibleRequests.length === 0 && (
          <div className="admin-pump-empty">
            <Droplets size={34} />
            <h2>No pump-outs found</h2>
            <p>New camper pump-out requests will appear here.</p>
          </div>
        )}
      </section>

      {message && <div className="admin-pump-message" role="status"><p>{message}</p><button type="button" onClick={() => setMessage('')} aria-label="Dismiss message"><XCircle size={18} /></button></div>}
    </main>
  )
}
