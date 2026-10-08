'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { AlertTriangle, Loader2 } from 'lucide-react'

export default function GateCardsPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [cards, setCards] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [status, setStatus] = useState('active')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    loadData()
  }, [])

  async function loadData() {
    setLoading(true)
    setLoadError('')
    const { data: camperData, error: camperError } = await supabase
      .from('campers')
      .select('*')
      .order('lot_number', { ascending: true })

    const { data: cardData, error: cardError } = await supabase
      .from('gate_cards')
      .select('*, campers(*)')
      .order('created_at', { ascending: false })

    if (camperError || cardError) {
      setLoadError('The camper roster or gate-card ledger could not be loaded. Card changes are blocked until both are available.')
    } else {
      setCampers(camperData || [])
      setCards(cardData || [])
    }
    setLoading(false)
  }

  async function addCard() {
    if (!camperId || !cardNumber) {
      setMessage('Please select a camper and enter a card number.')
      return
    }

    const { error } = await supabase.from('gate_cards').insert({
      camper_id: camperId,
      card_number: cardNumber,
      status,
      notes,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Gate card saved!')
    setCardNumber('')
    setNotes('')
    setStatus('active')
    loadData()
  }

  async function updateStatus(id: string, newStatus: string) {
    const { error } = await supabase
      .from('gate_cards')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Gate card updated.')
    loadData()
  }

  async function deleteCard(id: string) {
    const ok = confirm('Delete this gate card?')
    if (!ok) return

    const { error } = await supabase
      .from('gate_cards')
      .delete()
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Gate card deleted.')
    loadData()
  }

  if (loading) return <main className="portal-loading"><Loader2 className="spin" /><h1>Loading gate cards…</h1></main>
  if (loadError) return <main className="portal-loading" role="alert"><AlertTriangle aria-hidden="true" /><h1>Gate cards are temporarily unavailable</h1><p>{loadError}</p><button className="portal-loading-retry" type="button" onClick={loadData}>Try again</button></main>

  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Gate Card Management</h1>
          <p className="muted">
            Assign, track, and manage camper gate access cards.
          </p>

          <select
            value={camperId}
            onChange={(e) => setCamperId(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          >
            <option value="">Select Camper</option>

            {campers.map((camper) => (
              <option key={camper.id} value={camper.id}>
                Lot {camper.lot_number} - {camper.first_name} {camper.last_name}
              </option>
            ))}
          </select>

          <input
            placeholder="Gate Card Number"
            value={cardNumber}
            onChange={(e) => setCardNumber(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ display: 'block', width: '100%', marginBottom: '12px' }}
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="lost">Lost</option>
            <option value="replacement">Replacement</option>
          </select>

          <textarea
            placeholder="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{
              display: 'block',
              width: '100%',
              minHeight: '90px',
              marginBottom: '12px',
            }}
          />

          <button onClick={addCard}>Save Gate Card</button>

          {message && <p>{message}</p>}
        </section>

        <section className="card">
          <h2>Assigned Gate Cards</h2>

          {cards.length === 0 && (
            <p className="muted">No gate cards assigned yet.</p>
          )}

          {cards.map((card) => (
            <div
              key={card.id}
              style={{
                borderTop: '1px solid #e3ded2',
                padding: '15px 0',
              }}
            >
              <h3>
                Lot {card.campers?.lot_number} - {card.campers?.first_name}{' '}
                {card.campers?.last_name}
              </h3>

              <p>
                <strong>Card Number:</strong> {card.card_number}
              </p>

              <p>
                <strong>Status:</strong> {card.status}
              </p>

              <p>
                <strong>Issue Date:</strong> {card.issue_date}
              </p>

              {card.notes && (
                <p>
                  <strong>Notes:</strong> {card.notes}
                </p>
              )}

              <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                <button onClick={() => updateStatus(card.id, 'active')}>
                  Mark Active
                </button>

                <button onClick={() => updateStatus(card.id, 'inactive')}>
                  Mark Inactive
                </button>

                <button onClick={() => updateStatus(card.id, 'lost')}>
                  Mark Lost
                </button>

                <button onClick={() => deleteCard(card.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </section>
      </div>
    </main>
  )
}
