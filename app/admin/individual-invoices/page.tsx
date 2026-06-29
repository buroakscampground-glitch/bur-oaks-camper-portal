'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { attemptAutoPay } from '../../../lib/autopay'
import { applyAvailableCreditsToInvoice } from '../../../lib/account-credits'

export default function BulkInvoicesPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [invoiceType, setInvoiceType] = useState('Lot Rent')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    loadCampers()
  }, [])

  async function loadCampers() {
    const { data, error } = await supabase.from('campers').select('*')

    if (error) {
      setMessage(error.message)
    } else {
      setCampers(data || [])
    }
  }

  async function generateInvoices() {
    if (!amount || !dueDate || !invoiceType) {
      setMessage('Please fill out invoice type, amount, and due date.')
      return
    }

    setMessage('Generating invoices...')

    const total = Number(amount)
    let created = 0
    let autoPaid = 0
    let creditPaid = 0
    let creditApplied = 0
    const {
      data: { user },
    } = await supabase.auth.getUser()

    for (const camper of campers) {
      const invoiceNumber = `${invoiceType.replace(/\s+/g, '-').toUpperCase()}-${camper.lot_number}-${Date.now()}`

      const { data: invoice, error: invoiceError } = await supabase
        .from('invoices')
        .insert({
          camper_id: camper.id,
          invoice_number: invoiceNumber,
          invoice_type: invoiceType,
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
        description: invoiceType,
        quantity: 1,
        unit_price: total,
        total,
      })

      if (itemError) {
        setMessage(itemError.message)
        return
      }

      try {
        const creditResult = await applyAvailableCreditsToInvoice({
          client: supabase,
          camperId: camper.id,
          invoiceId: invoice.id,
          invoiceTotal: total,
          appliedBy: user?.email || null,
        })

        if (creditResult.appliedTotal > 0) creditApplied++
        if (creditResult.paidInFull) {
          creditPaid++
        } else {
          const autoPay = await attemptAutoPay(invoice.id)
          if (autoPay.charged) autoPaid++
        }
      } catch (error) {
        console.error('Credit or AutoPay attempt failed:', error)
      }

      created++
    }

    setMessage(
      `Created ${created} invoices successfully. ${creditApplied} used account credits, ${creditPaid} fully covered by credit, ${autoPaid} paid automatically.`
    )
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial', maxWidth: '750px' }}>
      <h1>Bulk Invoice Generator</h1>

      <p>This creates one invoice for every camper currently in the system.</p>

      <label>Invoice Type</label>
      <input
        value={invoiceType}
        onChange={(e) => setInvoiceType(e.target.value)}
        style={{ display: 'block', width: '100%', padding: '10px', marginBottom: '15px' }}
      />

      <label>Amount Per Camper</label>
      <input
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="500"
        style={{ display: 'block', width: '100%', padding: '10px', marginBottom: '15px' }}
      />

      <label>Due Date</label>
      <input
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        style={{ display: 'block', width: '100%', padding: '10px', marginBottom: '20px' }}
      />

      <button
        onClick={generateInvoices}
        style={{
          padding: '12px 20px',
          background: 'black',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
        }}
      >
        Generate Invoices for {campers.length} Campers
      </button>

      {message && <p style={{ marginTop: '20px' }}>{message}</p>}
    </main>
  )
}
