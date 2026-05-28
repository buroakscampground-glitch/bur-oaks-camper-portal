"use client"

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'

export default function AdminInvoicesPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [description, setDescription] = useState('Lot Rent')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function loadCampers() {
      const { data } = await supabase
        .from('campers')
        .select('*')
        .order('lot_number')

      setCampers(data || [])
    }

    loadCampers()
  }, [])

  async function createInvoice() {
    setMessage('Creating invoice...')

    const total = Number(amount)

    const { data: invoice, error: invoiceError } = await supabase
      .from('invoices')
      .insert({
        camper_id: camperId,
        invoice_number: invoiceNumber,
        invoice_type: description,
        subtotal: total,
        late_fee: 0,
        total_due: total,
        due_date: dueDate,
        status: 'sent',
      })
      .select()
      .single()

    if (invoiceError) {
      setMessage(invoiceError.message)
      return
    }

    const { error: itemError } = await supabase.from('invoice_items').insert({
      invoice_id: invoice.id,
      description,
      quantity: 1,
      unit_price: total,
      total,
    })

    if (itemError) {
      setMessage(itemError.message)
      return
    }

    setMessage('Invoice created successfully!')
    setInvoiceNumber('')
    setAmount('')
    setDueDate('')
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial', maxWidth: '700px' }}>
      <h1>Admin - Create Invoice</h1>

      <label>Camper</label>
      <select
        value={camperId}
        onChange={(e) => setCamperId(e.target.value)}
        style={{ display: 'block', padding: '10px', width: '100%', marginBottom: '15px' }}
      >
        <option value="">Select Camper</option>
        {campers.map((camper) => (
          <option key={camper.id} value={camper.id}>
            Lot {camper.lot_number} - {camper.first_name} {camper.last_name}
          </option>
        ))}
      </select>

      <label>Invoice Number</label>
      <input
        value={invoiceNumber}
        onChange={(e) => setInvoiceNumber(e.target.value)}
        placeholder="INV-1002"
        style={{ display: 'block', padding: '10px', width: '100%', marginBottom: '15px' }}
      />

      <label>Description</label>
      <input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        style={{ display: 'block', padding: '10px', width: '100%', marginBottom: '15px' }}
      />

      <label>Amount</label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="500"
        style={{ display: 'block', padding: '10px', width: '100%', marginBottom: '15px' }}
      />

      <label>Due Date</label>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        style={{ display: 'block', padding: '10px', width: '100%', marginBottom: '15px' }}
      />

      <button
        onClick={createInvoice}
        style={{
          padding: '12px 20px',
          background: 'black',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
        }}
      >
        Create Invoice
      </button>

      {message && <p style={{ marginTop: '20px' }}>{message}</p>}
    </main>
  )
}
