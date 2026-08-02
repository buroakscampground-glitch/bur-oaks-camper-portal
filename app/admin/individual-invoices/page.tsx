'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { attemptAutoPay } from '../../../lib/autopay'
import { createInvoiceBundle } from '../../../lib/account-credits'
import { notifyInvoiceCreated } from '../../../lib/client-invoice-texts'

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
    const { data, error } = await supabase.from('campers').select('*').eq('active', true)

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
    let textSent = 0
    let textSkipped = 0
    let textFailed = 0
    const {
      data: { user },
    } = await supabase.auth.getUser()

    for (const camper of campers) {
      const operationKey = `bulk-invoice:${invoiceType.trim().toLowerCase()}:${dueDate}:${camper.id}`
      const invoiceNumber = `${invoiceType.replace(/\s+/g, '-').toUpperCase()}-${camper.lot_number}-${dueDate}`

      try {
        const bundle = await createInvoiceBundle({
          client: supabase,
          operationKey,
          invoice: {
          camper_id: camper.id,
          invoice_number: invoiceNumber,
          invoice_type: invoiceType,
          subtotal: total,
          late_fee: 0,
          total_due: total,
          due_date: dueDate,
          },
          items: [{ description: invoiceType, quantity: 1, unit_price: total, total }],
          appliedBy: user?.email || null,
        })
        const invoice = bundle.invoice
        const creditResult = bundle.credit

        if (bundle.duplicate) {
          continue
        }

        if (creditResult.appliedTotal > 0) creditApplied++
        if (creditResult.paidInFull) {
          creditPaid++
        } else {
          const autoPay = await attemptAutoPay(invoice.id)
          if (autoPay.charged) autoPaid++
        }
        const textResult = await notifyInvoiceCreated(invoice.id)
        if (textResult.status === 'sent') textSent++
        else if (textResult.status === 'failed') textFailed++
        else textSkipped++
        created++
      } catch (error: any) {
        console.error('Bulk invoice failed:', error)
        textFailed++
        setMessage(`Stopped after ${created} invoices: ${error.message || 'Unable to create the next invoice.'}`)
        return
      }
    }

    setMessage(
      `Created ${created} invoices successfully. ${creditApplied} used account credits, ${creditPaid} fully covered by credit, ${autoPaid} paid automatically. Text alerts: ${textSent} sent, ${textSkipped} skipped, ${textFailed} failed.`
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
