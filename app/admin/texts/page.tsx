'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function AdminTextsPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [selectedCamper, setSelectedCamper] = useState('all')
  const [reminderType, setReminderType] = useState('General Alert')
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: camperData } = await supabase
      .from('campers')
      .select('*')
      .order('lot_number', { ascending: true })

    const { data: alertData } = await supabase
      .from('text_reminders')
      .select('*')
      .order('sent_at', { ascending: false })

    setCampers(camperData || [])
    setAlerts(alertData || [])
  }

  async function saveAlert() {
    if (!message) {
      setStatus('Please type a message.')
      return
    }

    const targetCampers =
      selectedCamper === 'all'
        ? campers
        : campers.filter((camper) => camper.id === selectedCamper)

    if (targetCampers.length === 0) {
      setStatus('No campers selected.')
      return
    }

    const rows = targetCampers.map((camper) => ({
      camper_id: camper.id,
      invoice_id: null,
      reminder_type: reminderType,
      message,
      sent_at: new Date().toISOString(),
      status: 'saved',
    }))

    const { error } = await supabase.from('text_reminders').insert(rows)

    if (error) {
      setStatus(error.message)
      return
    }

    setStatus(`Saved alert for ${targetCampers.length} camper(s).`)
    setMessage('')
    loadData()
  }

  function getCamperName(camperId: string) {
    const camper = campers.find((c) => c.id === camperId)
    if (!camper) return 'Unknown Camper'
    return `Lot ${camper.lot_number} - ${camper.first_name} ${camper.last_name}`
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Text Alert Center</h1>
          <p className="muted">
            Save campground text alerts and reminders. SMS sending can be connected later.
          </p>

          <select
            value={selectedCamper}
            onChange={(e) => setSelectedCamper(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          >
            <option value="all">All Campers</option>
            {campers.map((camper) => (
              <option key={camper.id} value={camper.id}>
                Lot {camper.lot_number} - {camper.first_name} {camper.last_name}
              </option>
            ))}
          </select>

          <select
            value={reminderType}
            onChange={(e) => setReminderType(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          >
            <option>General Alert</option>
            <option>Invoice Reminder</option>
            <option>Electric Reminder</option>
            <option>Event Reminder</option>
            <option>Emergency Alert</option>
            <option>Gate Alert</option>
          </select>

          <textarea
            placeholder="Type your message here..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              minHeight: '130px',
              marginBottom: '12px',
            }}
          />

          <button onClick={saveAlert}>Save Alert</button>

          {status && <p>{status}</p>}
        </section>

        <section className="card">
          <h2>Alert History</h2>

          {alerts.length === 0 && (
            <p className="muted">No text alerts saved yet.</p>
          )}

          {alerts.map((alert) => (
            <div
              key={alert.id}
              style={{
                borderTop: '1px solid #e3ded2',
                padding: '15px 0',
              }}
            >
              <p className="muted">{alert.sent_at}</p>
              <h3>{alert.reminder_type}</h3>
              <p>{alert.message}</p>
              <p className="muted">
                To: {getCamperName(alert.camper_id)} • Status: {alert.status}
              </p>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}