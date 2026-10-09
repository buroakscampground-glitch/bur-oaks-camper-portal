'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { attemptAutoPay } from '../../../lib/autopay'
import { createInvoiceBundle } from '../../../lib/account-credits'
import { notifyInvoiceCreated } from '../../../lib/client-invoice-texts'
import { isLotRentExemptCamper, isNoBillingLot } from '../../../lib/billing-exemptions'
import { isOperationalCamper } from '../../../lib/camper-records'
import type { AccountPolicy } from '../../../lib/account-policies'

export default function BulkInvoicesPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [invoiceType, setInvoiceType] = useState('Lot Rent')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [policies, setPolicies] = useState<AccountPolicy[]>([])

  useEffect(() => {
    loadCampers()
  }, [])

  async function loadCampers() {
    setLoading(true)
    setLoadError('')
    const [camperResult, policyResult] = await Promise.all([
      supabase.from('campers').select('*').eq('active', true),
      supabase.from('camper_account_policies').select('*').eq('active', true),
    ])

    if (camperResult.error || policyResult.error) {
      setCampers([])
      setPolicies([])
      setLoadError('The active camper list could not be loaded. Bulk invoice creation is blocked so nobody is accidentally skipped.')
    } else {
      setCampers((camperResult.data || []).filter(isOperationalCamper))
      setPolicies((policyResult.data || []) as AccountPolicy[])
    }
    setLoading(false)
  }

  async function generateInvoices() {
    if (loading || loadError) return
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
    let creditHeld = 0
    let textSent = 0
    let textSkipped = 0
    let textFailed = 0
    const {
      data: { user },
    } = await supabase.auth.getUser()

    for (const camper of campers) {
      if (isNoBillingLot(camper.lot_number, policies)) continue
      if (/rent/i.test(invoiceType) && !/association/i.test(invoiceType) && isLotRentExemptCamper(camper, policies)) continue
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
        } else if (creditResult.heldUntilDue) {
          creditHeld++
        } else {
          const autoPay = await attemptAutoPay(invoice.id)
          if (autoPay.charged) autoPaid++
        }
        if (creditResult.heldUntilDue) {
          textSkipped++
        } else {
          const textResult = await notifyInvoiceCreated(invoice.id)
          const invoiceTextResult = textResult?.text || textResult
          if (invoiceTextResult.status === 'sent') textSent++
          else if (invoiceTextResult.status === 'failed') textFailed++
          else textSkipped++
        }
        created++
      } catch (error: any) {
        console.error('Bulk invoice failed:', error)
        textFailed++
        setMessage(`Stopped after ${created} invoices: ${error.message || 'Unable to create the next invoice.'}`)
        return
      }
    }

    setMessage(
      `Created ${created} invoices successfully. ${creditHeld} account credit${creditHeld === 1 ? '' : 's'} held until the due date, ${creditApplied} used account credits, ${creditPaid} fully covered by credit, ${autoPaid} paid automatically. Text alerts: ${textSent} sent, ${textSkipped} skipped, ${textFailed} failed.`
    )
  }

  if (loading) {
    return <main className="portal-loading"><h1>Loading campers…</h1><p>Checking the complete billing roster.</p></main>
  }

  if (loadError) {
    return <main className="portal-loading" role="alert"><h1>Bulk invoicing is temporarily unavailable</h1><p>{loadError}</p><button type="button" className="portal-loading-retry" onClick={loadCampers}>Try again</button></main>
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
