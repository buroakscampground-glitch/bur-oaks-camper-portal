'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  async function loadInvoices() {
    setLoading(true)
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    const { data: camper } = await supabase
      .from('campers')
      .select('*')
      .eq('email', user.email)
      .single()

    if (!camper) {
      console.log('No camper found')
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('camper_id', camper.id)
      .order('due_date', { ascending: false })

    if (error) {
      console.error(error)
    } else {
      setInvoices(data || [])
    }

    setLoading(false)
  }

  useEffect(() => {
    loadInvoices()
  }, [])

  if (loading) {
    return <p style={{ padding: '40px' }}>Loading invoices...</p>
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <h1>My Invoices</h1>
        <button onClick={loadInvoices} style={{ padding: '6px 10px' }}>
          Reload
        </button>
      </div>

      {invoices.length === 0 && <p>No invoices found yet.</p>}

      {invoices.map((invoice) => (
        <div
          key={invoice.id}
          style={{
            border: '1px solid #ccc',
            padding: '20px',
            borderRadius: '10px',
            marginBottom: '15px',
            maxWidth: '600px',
          }}
        >
          <h2>{invoice.invoice_number}</h2>

          <p>
            <strong>Type:</strong> {invoice.invoice_type}
          </p>

          <p>
            <strong>Total Due:</strong> ${invoice.total_due}
          </p>

          <p>
            <strong>Due Date:</strong> {invoice.due_date}
          </p>

          <p>
            <strong>Status:</strong> {invoice.status}
          </p>
        </div>
      ))}
    </main>
  )
}