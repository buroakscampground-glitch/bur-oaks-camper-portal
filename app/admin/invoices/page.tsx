"use client"

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'
import { attemptAutoPay } from '../../../lib/autopay'

export default function AdminInvoicesPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [camperId, setCamperId] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [searchText, setSearchText] = useState('')
  const [description, setDescription] = useState('Lot Rent')
  const [amount, setAmount] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [message, setMessage] = useState('')
const [invoices, setInvoices] = useState<any[]>([])
const router = useRouter()

async function loadInvoices() {
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
    .order('created_at', { ascending: false })

  const sortedInvoices =
  (data || []).sort((a: any, b: any) => {
    if (a.status === 'paid' && b.status !== 'paid') return 1
    if (a.status !== 'paid' && b.status === 'paid') return -1

    return (
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
    )
  })

setInvoices(sortedInvoices)
}

useEffect(() => {
    async function loadCampers() {
      const { data: invoiceData } = await supabase
  .from('invoices')
  .select(`
    *,
    campers (
      first_name,
      last_name,
      lot_number
    )
  `)
  .order('created_at', { ascending: false })

const sortedInvoices =
  (invoiceData || []).sort((a: any, b: any) => {
    if (a.status === 'paid' && b.status !== 'paid') return 1
    if (a.status !== 'paid' && b.status === 'paid') return -1

    return (
      new Date(b.created_at).getTime() -
      new Date(a.created_at).getTime()
    )
  })

setInvoices(sortedInvoices)
      const { data } = await supabase
        .from('campers')
        .select('*')
        .order('lot_number')

      setCampers(data || [])
    }

    loadCampers()
  }, [])

  async function createInvoice() {
    if (!camperId) {
  setMessage('Please select a camper.')
  return
}

if (!invoiceNumber.trim()) {
  setMessage('Please enter an invoice number.')
  return
}

if (!amount || Number(amount) <= 0) {
  setMessage('Please enter a valid amount.')
  return
}

if (!dueDate) {
  setMessage('Please select a due date.')
  return
}
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

    let resultMessage = 'Invoice created successfully!'

    try {
      const autoPay = await attemptAutoPay(invoice.id)

      if (autoPay.charged) {
        resultMessage = 'Invoice created and paid automatically.'
      }
    } catch (error: any) {
      resultMessage = `Invoice created. AutoPay was not completed: ${error.message}`
    }

    setMessage(resultMessage)
setCamperId('')
setInvoiceNumber('')
setAmount('')
setDueDate('')

await loadInvoices()
  }
const filteredInvoices = invoices.filter((invoice) => {
  
  const search = searchText.toLowerCase()

  return (
    invoice.invoice_number?.toLowerCase().includes(search) ||
    invoice.campers?.first_name?.toLowerCase().includes(search) ||
    invoice.campers?.last_name?.toLowerCase().includes(search) ||
    invoice.campers?.lot_number?.toString().includes(search)
  )
})
const openInvoices = filteredInvoices.filter(
  (invoice) => invoice.status !== 'paid'
)

const paidInvoices = filteredInvoices.filter(
  (invoice) => invoice.status === 'paid'
)
  return (
   <main
  style={{
    padding: '40px',
    fontFamily: 'Arial',
    maxWidth: '1400px',
    margin: '0 auto',
    background: '#f5f7fa',
    minHeight: '100vh',
  }}
>
  <button
  onClick={() => router.push('/admin')}
  style={{
    marginBottom: '20px',
    background: '#6b7280',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
  }}
>
  ← Back to Dashboard
</button>
      <h1>Admin - Create Invoice</h1>
<h2 style={{ marginTop: '20px' }}>Invoice History</h2>
<input
  value={searchText}
  onChange={(e) => setSearchText(e.target.value)}
  placeholder="Search by lot, camper, or invoice number"
  style={{
    width: '100%',
    maxWidth: '400px',
    padding: '12px',
    marginTop: '15px',
    marginBottom: '20px',
    borderRadius: '8px',
    border: '1px solid #d1d5db',
  }}
/>
<p
  style={{
    marginTop: '-10px',
    marginBottom: '15px',
    color: '#6b7280',
  }}
>
  Showing {filteredInvoices.length} invoices
</p>
<div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
    gap: '20px',
    marginBottom: '30px',
  }}
>
  <div
  style={{
    background: '#fff',
    padding: '20px',
    borderRadius: '12px',
    boxShadow: '0 2px 8px rgba(0,0,0,.08)',
    borderLeft: '6px solid #16a34a',
  }}
>
  <h4>Collected Revenue</h4>
  <h1>
    $
    {invoices
      .filter(i => i.status === 'paid')
      .reduce((sum, i) => sum + Number(i.total_due || 0), 0)
      .toFixed(2)}
  </h1>
</div>
  <div
    style={{
      background: '#fff',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,.08)',
      borderLeft: '6px solid #dc2626',
    }}
  >
    <h4>Open Invoices</h4>
    <h1>
      {invoices.filter(i => i.status !== 'paid').length}
    </h1>
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
    <h4>Paid Invoices</h4>
    <h1>
      {invoices.filter(i => i.status === 'paid').length}
    </h1>
  </div>

  <div
    style={{
      background: '#fff',
      padding: '20px',
      borderRadius: '12px',
      boxShadow: '0 2px 8px rgba(0,0,0,.08)',
      borderLeft: '6px solid #2563eb',
    }}
  >
    <h4>Total Invoices</h4>
    <h1>{invoices.length}</h1>
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
    <h4>Open Balance</h4>
    <h1>
      $
      {invoices
        .filter(i => i.status !== 'paid')
        .reduce((sum, i) => sum + Number(i.total_due || 0), 0)
        .toFixed(2)}
    </h1>
  </div>
</div>
<h2
  style={{
    marginTop: '20px',
    marginBottom: '15px',
    color: '#dc2626',
  }}
>
  Open Invoices ({openInvoices.length})
</h2>
<table
  style={{
    width: '100%',
    borderCollapse: 'collapse',
    marginBottom: '30px',
  }}
>
  <thead>
    <tr>
      <th style={{ textAlign: 'left', padding: '8px' }}>Lot</th>
<th style={{ textAlign: 'left', padding: '8px' }}>Camper</th>
<th style={{ textAlign: 'left', padding: '8px' }}>Invoice #</th>
<th style={{ textAlign: 'left', padding: '8px' }}>Type</th>
<th style={{ textAlign: 'left', padding: '8px' }}>Amount</th>
<th style={{ textAlign: 'left', padding: '8px' }}>Due Date</th>
<th style={{ textAlign: 'left', padding: '8px' }}>Status</th>
    </tr>
  </thead>

  <tbody>
  {[...filteredInvoices]
    .sort((a, b) => {
      const aPaid = a.status === 'paid'
      const bPaid = b.status === 'paid'

      if (aPaid && !bPaid) return 1
      if (!aPaid && bPaid) return -1

      return 0
    })
    .map((invoice) => (
      <tr
        key={invoice.id}
        style={{
          background:
            invoice.status === 'paid'
              ? '#f0fdf4'
              : '#fef2f2',
          borderBottom: '1px solid #e5e7eb',
        }}
      >
        <td style={{ padding: '14px', fontWeight: 'bold' }}>
          {invoice.campers?.lot_number}
        </td>

        <td style={{ padding: '14px' }}>
          {invoice.campers?.first_name}{' '}
          {invoice.campers?.last_name}
        </td>

        

        <td
  style={{
    padding: '14px',
    fontWeight: 'bold',
    fontSize: '16px',
  }}
>
  <a
    href={`/admin/invoices/${invoice.id}`}
    style={{
      color: '#2563eb',
      textDecoration: 'none',
    }}
  >
    {invoice.invoice_number}
  </a>
</td>

        <td
          style={{
            padding: '14px',
            fontWeight: 'bold',
            fontSize: '18px',
          }}
        >
          ${Number(invoice.total_due).toFixed(2)}
        </td>

        <td style={{ padding: '14px' }}>
          {invoice.due_date}
        </td>

        <td style={{ padding: '14px' }}>
          <span
            style={{
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
        </td>
      </tr>
    ))}
</tbody>
</table>
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
