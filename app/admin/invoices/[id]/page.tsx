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

      <div
  style={{
    background: '#fff',
    padding: '25px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,.08)',
    marginBottom: '25px',
  }}
>
  <h1 style={{ marginBottom: '10px' }}>
    {invoice.invoice_number}
  </h1>

  <h3 style={{ color: '#6b7280' }}>
    Lot {invoice.campers?.lot_number} •{' '}
    {invoice.campers?.first_name}{' '}
    {invoice.campers?.last_name}
  </h3>

  <span
    style={{
      display: 'inline-block',
      marginTop: '10px',
      padding: '8px 16px',
      borderRadius: '999px',
      fontWeight: 'bold',
      color: 'white',
      background:
        invoice.status === 'paid'
          ? '#16a34a'
          : '#dc2626',
    }}
  >
    {invoice.status === 'paid'
      ? 'PAID'
      : 'UNPAID'}
  </span>
</div>

<div
  style={{
    display: 'grid',
    gridTemplateColumns:
      'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
    marginBottom: '25px',
  }}
>
  <div
    style={{
      background: '#fff',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,.08)',
      borderLeft: '6px solid #2563eb',
    }}
  >
    <h4>Amount Due</h4>
    <h1>
      ${Number(invoice.total_due).toFixed(2)}
    </h1>
  </div>

  <div
    style={{
      background: '#fff',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,.08)',
      borderLeft: '6px solid #f59e0b',
    }}
  >
    <h4>Due Date</h4>
    <h1>{invoice.due_date}</h1>
  </div>

  <div
    style={{
      background: '#fff',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,.08)',
      borderLeft: '6px solid #16a34a',
    }}
  >
    <h4>Invoice Type</h4>
    <h1>{invoice.invoice_type}</h1>
  </div>
</div>

      <button onClick={markPaid}>
        Mark Paid
      </button>

      <button onClick={() => window.print()}>
        Print Invoice
      </button>
    </main>
  )
}