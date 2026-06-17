'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '../../../../lib/supabase'

export default function CamperDetailPage() {
  const params = useParams()
  const router = useRouter()

  const [camper, setCamper] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [invoices, setInvoices] = useState<any[]>([])

  useEffect(() => {
    loadCamper()
  }, [])

  async function loadCamper() {
    const { data } = await supabase
      .from('campers')
      .select('*')
      .eq('id', params.id)
      .single()

    setCamper(data)
    const { data: invoiceData } = await supabase
  .from('invoices')
  .select('*')
  .eq('camper_id', params.id)

setInvoices(invoiceData || [])
    setLoading(false)
  }

  if (loading) {
    return <div style={{ padding: '40px' }}>Loading...</div>
  }

  if (!camper) {
    return <div style={{ padding: '40px' }}>Camper not found</div>
  }
const totalInvoices = invoices.length

const openInvoices = invoices.filter(
  (i) => i.status !== 'paid'
).length

const balanceDue = invoices
  .filter((i) => i.status !== 'paid')
  .reduce(
    (sum, i) => sum + Number(i.total_due || 0),
    0
  )
  return (
    <main style={{ padding: '40px', maxWidth: '900px', margin: '0 auto' }}>
      <button
        onClick={() => router.push('/admin/campers')}
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
        ← Back to Campers
      </button>

      <div
        style={{
          background: '#fff',
          padding: '25px',
          borderRadius: '12px',
          boxShadow: '0 2px 8px rgba(0,0,0,.08)',
        }}
      >
        <h1>
          Lot {camper.lot_number}
        </h1>

        <h2>
  {camper.first_name} {camper.last_name}
</h2>

<div
  style={{
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
    gap: '15px',
    marginTop: '20px',
    marginBottom: '20px',
  }}
>
  <div
    style={{
      background: '#f8fafc',
      padding: '15px',
      borderRadius: '10px',
    }}
  >
    <h3>{totalInvoices}</h3>
    <p>Total Invoices</p>
  </div>

  <div
    style={{
      background: '#fef2f2',
      padding: '15px',
      borderRadius: '10px',
    }}
  >
    <h3>{openInvoices}</h3>
    <p>Open Invoices</p>
  </div>

  <div
    style={{
      background: '#ecfdf5',
      padding: '15px',
      borderRadius: '10px',
    }}
  >
    <h3>${balanceDue.toFixed(2)}</h3>
    <p>Balance Due</p>
  </div>
</div>

<hr />

        <p><strong>Email:</strong> {camper.email || 'Not Provided'}</p>

        <p><strong>Phone:</strong> {camper.phone || 'Not Provided'}</p>

        <p>
          <strong>Emergency Contact:</strong>{' '}
          {camper.emergency_contact_name || 'Not Provided'}
        </p>

        <p>
          <strong>Emergency Phone:</strong>{' '}
          {camper.emergency_contact_phone || 'Not Provided'}
        </p>

        <hr />

        <p>
          <strong>Vehicle Make:</strong>{' '}
          {camper.vehicle_make || 'Not Provided'}
        </p>

        <p>
          <strong>Vehicle Model:</strong>{' '}
          {camper.vehicle_model || 'Not Provided'}
        </p>

        <p>
          <strong>License Plate:</strong>{' '}
          {camper.license_plate || 'Not Provided'}
        </p>

        <hr />

        <p>
          <strong>Golf Cart Make:</strong>{' '}
          {camper.golf_cart_make || 'Not Provided'}
        </p>

        <p>
          <strong>Golf Cart Color:</strong>{' '}
          {camper.golf_cart_color || 'Not Provided'}
        </p>
      </div>
    </main>
  )
}