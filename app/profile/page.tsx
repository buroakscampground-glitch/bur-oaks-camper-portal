'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ProfilePage() {
  const [camper, setCamper] = useState<any>(null)
  const [invoiceCount, setInvoiceCount] = useState(0)
  const [documentCount, setDocumentCount] = useState(0)
  const [rsvpCount, setRsvpCount] = useState(0)
  const [openBalance, setOpenBalance] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    const { data: camperData } = await supabase
      .from('campers')
      .select('*')
      .eq('email', user.email)
      .single()

    if (!camperData) {
      setLoading(false)
      return
    }

    setCamper(camperData)

    const { data: invoices } = await supabase
      .from('invoices')
      .select('*')
      .eq('camper_id', camperData.id)

    const { data: documents } = await supabase
      .from('documents')
      .select('*')

    const { data: rsvps } = await supabase
      .from('event_rsvps')
      .select('*')
      .eq('camper_id', camperData.id)

    const balance =
      invoices
        ?.filter((i) => i.status !== 'paid')
        .reduce((sum, i) => sum + Number(i.total_due || 0), 0) || 0

    setInvoiceCount(invoices?.length || 0)
    setDocumentCount(documents?.length || 0)
    setRsvpCount(rsvps?.length || 0)
    setOpenBalance(balance)

    setLoading(false)
  }

  if (loading) {
    return <div style={{ padding: '40px' }}>Loading Profile...</div>
  }

  return (
    <main className="page">
      <div className="container">
        <section
          className="card"
          style={{
            marginBottom: '25px',
            background: 'linear-gradient(135deg, #ffffff 0%, #eef4ea 100%)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              position: 'absolute',
              right: 25,
              top: 20,
              fontSize: 90,
              opacity: 0.15,
            }}
          >
            🌳
          </div>

          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>My Profile</h1>
          <p className="muted">A Site to Remember</p>
        </section>

        <div className="grid grid-3" style={{ marginBottom: '25px' }}>
          <section className="card">
            <h2>${openBalance.toFixed(2)}</h2>
            <p className="muted">Open Balance</p>
          </section>

          <section className="card">
            <h2>{invoiceCount}</h2>
            <p className="muted">Invoices</p>
          </section>

          <section className="card">
            <h2>{rsvpCount}</h2>
            <p className="muted">RSVPs</p>
          </section>
        </div>

        <section className="card">
          <h2>Camper Information</h2>

          <p>
            <strong>Name:</strong>{' '}
            {camper?.first_name} {camper?.last_name}
          </p>

          <p>
            <strong>Email:</strong>{' '}
            {camper?.email}
          </p>

          <p>
            <strong>Lot Number:</strong>{' '}
            {camper?.lot_number || 'Not Assigned'}
          </p>

          <p>
            <strong>Phone:</strong>{' '}
            {camper?.phone || 'Not Provided'}
          </p>

          <p>
            <strong>Documents Available:</strong>{' '}
            {documentCount}
          </p>
        </section>
      </div>
    </main>
  )
}