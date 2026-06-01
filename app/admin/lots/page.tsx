'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function LotsPage() {
  const [lots, setLots] = useState<any[]>([])
  const [campers, setCampers] = useState<any[]>([])
  const [lotNumber, setLotNumber] = useState('')
  const [meterNumber, setMeterNumber] = useState('')
  const [lotRentAmount, setLotRentAmount] = useState('')
  const [camperId, setCamperId] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    const { data: lotData } = await supabase
      .from('lots')
      .select('*, campers(*)')
      .order('lot_number', { ascending: true })

    const { data: camperData } = await supabase
      .from('campers')
      .select('*')

    setLots(lotData || [])
    setCampers(camperData || [])
  }

  async function addLot() {
    if (!lotNumber) {
      setMessage('Please enter a lot number.')
      return
    }

    const { error } = await supabase.from('lots').insert({
      lot_number: lotNumber,
      meter_number: meterNumber,
      lot_rent_amount: lotRentAmount ? Number(lotRentAmount) : null,
      camper_id: camperId || null,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Lot saved!')
    setLotNumber('')
    setMeterNumber('')
    setLotRentAmount('')
    setCamperId('')
    loadData()
  }

  async function assignCamper(lotId: string, newCamperId: string) {
    const { error } = await supabase
      .from('lots')
      .update({ camper_id: newCamperId || null })
      .eq('id', lotId)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Lot assignment updated.')
    loadData()
  }

  async function deleteLot(id: string) {
    const ok = confirm('Delete this lot?')
    if (!ok) return

    const { error } = await supabase
      .from('lots')
      .delete()
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Lot deleted.')
    loadData()
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Lot Management</h1>
          <p className="muted">
            Track lot numbers, meter numbers, rent amounts, and assigned campers.
          </p>

          <input
            placeholder="Lot Number"
            value={lotNumber}
            onChange={(e) => setLotNumber(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Meter Number"
            value={meterNumber}
            onChange={(e) => setMeterNumber(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          />

          <input
            placeholder="Lot Rent Amount"
            value={lotRentAmount}
            onChange={(e) => setLotRentAmount(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          />

          <select
            value={camperId}
            onChange={(e) => setCamperId(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          >
            <option value="">No Camper Assigned</option>
            {campers.map((camper) => (
              <option key={camper.id} value={camper.id}>
                Lot {camper.lot_number} - {camper.first_name} {camper.last_name}
              </option>
            ))}
          </select>

          <button onClick={addLot}>Save Lot</button>

          {message && <p>{message}</p>}
        </section>

        <section className="card">
          <h2>Current Lots</h2>

          {lots.length === 0 && (
            <p className="muted">No lots have been added yet.</p>
          )}

          {lots.map((lot) => (
            <div
              key={lot.id}
              style={{
                borderTop: '1px solid #e3ded2',
                padding: '15px 0',
              }}
            >
              <h3>Lot {lot.lot_number}</h3>

              <p>
                <strong>Meter Number:</strong>{' '}
                {lot.meter_number || 'Not Entered'}
              </p>

              <p>
                <strong>Lot Rent:</strong>{' '}
                {lot.lot_rent_amount
                  ? `$${Number(lot.lot_rent_amount).toFixed(2)}`
                  : 'Not Entered'}
              </p>

              <p>
                <strong>Assigned Camper:</strong>{' '}
                {lot.campers
                  ? `${lot.campers.first_name} ${lot.campers.last_name}`
                  : 'Vacant'}
              </p>

              <select
                value={lot.camper_id || ''}
                onChange={(e) => assignCamper(lot.id, e.target.value)}
                style={{ display: 'block', width: '100%', marginBottom: '12px' }}
              >
                <option value="">Vacant / No Camper</option>

                {campers.map((camper) => (
                  <option key={camper.id} value={camper.id}>
                    Lot {camper.lot_number} - {camper.first_name} {camper.last_name}
                  </option>
                ))}
              </select>

              <button onClick={() => deleteLot(lot.id)}>
                Delete Lot
              </button>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}