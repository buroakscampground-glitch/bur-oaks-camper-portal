'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

export default function InvoiceDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [invoice, setInvoice] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadInvoice()
  }, [])

  async function loadInvoice() {
    const { data } = await supabase
      .from('invoices')
      .select(`
        *,
        campers (
          first_name,
          last_name,
          lot_number
        )
      `)
      .eq('id', params.id)
      .single()

    setInvoice(data)
    setLoading(false)
  }

  async function markPaid() {
  if (!confirm('Mark this invoice as paid?')) {
    return
  }

  const { error } = await supabase
    .from('invoices')
    .update({
      status: 'paid',
    })
    .eq('id', invoice.id)

  if (error) {
    alert(error.message)
    return
  }

  alert('Invoice marked paid')

  loadInvoice()
}
  if (loading) {
    return <div style={{ padding: '20px' }}>Loading...</div>
  }

  if (!invoice) {
    return <div style={{ padding: '20px' }}>Invoice not found</div>
  }

  return (
    <main style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
      <button
        onClick={() => router.push('/admin/invoices')}
      >
        ← Back to Invoices
      </button>

      <h1>{invoice.invoice_number}</h1>

      <p>
        <strong>Camper:</strong>{' '}
        {invoice.campers?.first_name} {invoice.campers?.last_name}
      </p>

      <p>
        <strong>Lot:</strong>{' '}
        {invoice.campers?.lot_number}
      </p>

      <p>
        <strong>Invoice Type:</strong>{' '}
        {invoice.invoice_type}
      </p>

      <p>
        <strong>Amount Due:</strong> $
        {Number(invoice.total_due).toFixed(2)}
      </p>

      <p>
        <strong>Due Date:</strong>{' '}
        {invoice.due_date}
      </p>

      <p>
        <strong>Status:</strong>{' '}
        {invoice.status}
      </p>

      <button onClick={markPaid}>
        Mark Paid
      </button>

      <button onClick={() => window.print()}>
        Print Invoice
      </button>
    </main>
  )
}