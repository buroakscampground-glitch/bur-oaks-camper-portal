'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function ProfilePage() {
  const [camper, setCamper] = useState<any>(null)
  const [invoices, setInvoices] = useState<any[]>([])
  const [documentCount, setDocumentCount] = useState(0)
  const [rsvpCount, setRsvpCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadProfile()
  }, [])

  async function loadProfile() {
    const { data: { user } } = await supabase.auth.getUser()

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

    const { data: invoiceData } = await supabase
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

    setInvoices(invoiceData || [])
    setDocumentCount(documents?.length || 0)
    setRsvpCount(rsvps?.length || 0)
    setLoading(false)
  }

  async function handleSignOut() {
    // client sign out
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('client signOut error', err)
    }

    // clear server cookies
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch (err) {
      console.error('server logout error', err)
    }

    window.location.href = '/login'
  }

  if (loading) {
    return <div style={{ padding: '40px' }}>Loading Profile...</div>
  }

  const openBalance = invoices
    .filter((invoice) => invoice.status !== 'paid')
    .reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)

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
            <h2>{invoices.length}</h2>
            <p className="muted">Invoices</p>
          </section>

          <section className="card">
            <h2>{rsvpCount}</h2>
            <p className="muted">RSVPs</p>
          </section>
        </div>

        <section className="card">
          <h2>Camper Information</h2>

          <p><strong>Name:</strong> {camper?.first_name} {camper?.last_name}</p>
          <p><strong>Email:</strong> {camper?.email}</p>
          <p><strong>Lot Number:</strong> {camper?.lot_number || 'Not Assigned'}</p>
          <p><strong>Phone:</strong> {camper?.phone || 'Not Provided'}</p>
          <p><strong>Documents Available:</strong> {documentCount}</p>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginTop: '25px' }}>
            <a href="/invoices"><button>View Invoices</button></a>
            <a href="/electric"><button>Electric History</button></a>
            <a href="/documents"><button>My Documents</button></a>
            <a href="/calendar"><button>Events</button></a>
            <button onClick={handleSignOut}>Sign Out</button>
          </div>
        </section>
      </div>
    </main>
  )
}