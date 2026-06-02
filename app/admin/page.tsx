'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function AdminPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)

  const [stats, setStats] = useState({
    campers: 0,
    balance: 0,
    events: 0,
    announcements: 0,
    rsvps: 0,
    electric: 0,
  })

  useEffect(() => {
    initialize()
  }, [])

  async function initialize() {
    try {
      console.log('ADMIN PAGE START')

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      console.log('ADMIN USER:', user)
      console.log('ADMIN USER ERROR:', userError)

      if (userError || !user) {
        console.log('NO USER FOUND')
        router.replace('/login')
        return
      }

      const {
        data: camper,
        error: camperError,
      } = await supabase
        .from('campers')
        .select('*')
        .eq('email', user.email)
        .single()

      console.log('ADMIN CAMPER:', camper)
      console.log('ADMIN CAMPER ERROR:', camperError)

      if (camperError || !camper) {
        console.log('NO CAMPER RECORD')
        router.replace('/')
        return
      }

      if (
        !camper.role ||
        camper.role.toLowerCase() !== 'admin'
      ) {
        console.log('NOT ADMIN')
        router.replace('/')
        return
      }

      console.log('ADMIN VERIFIED')

      await loadStats()
    } catch (err) {
      console.error('ADMIN INIT ERROR:', err)
    } finally {
      setLoading(false)
    }
  }

  async function loadStats() {
    try {
      const { data: campers } = await supabase
        .from('campers')
        .select('id')

      const { data: invoices } = await supabase
        .from('invoices')
        .select('*')

      const { data: events } = await supabase
        .from('events')
        .select('id')

      const { data: announcements } = await supabase
        .from('announcements')
        .select('id')
        .eq('is_active', true)

      const { data: rsvps } = await supabase
        .from('event_rsvps')
        .select('id')

      const { data: electric } = await supabase
        .from('electric_readings')
        .select('id')

      const openBalance =
        invoices
          ?.filter((i) => i.status !== 'paid')
          .reduce(
            (sum, i) => sum + Number(i.total_due || 0),
            0
          ) || 0

      setStats({
        campers: campers?.length || 0,
        balance: openBalance,
        events: events?.length || 0,
        announcements: announcements?.length || 0,
        rsvps: rsvps?.length || 0,
        electric: electric?.length || 0,
      })
    } catch (err) {
      console.error('LOAD STATS ERROR:', err)
    }
  }

  if (loading) {
    return (
      <div style={{ padding: '40px' }}>
        Loading Admin Dashboard...
      </div>
    )
  }

  return (
    <main className="page">
      <div className="container">
        <section
          className="card"
          style={{ marginBottom: '25px' }}
        >
          <p className="muted">
            BUR OAKS CAMPGROUND
          </p>

          <h1>Admin Command Center</h1>

          <p className="muted">
            Manage campground operations from one
            location.
          </p>
        </section>

        <div
          className="grid grid-3"
          style={{ marginBottom: '25px' }}
        >
          <section className="card">
            <h2>👥 {stats.campers}</h2>
            <p className="muted">Campers</p>
          </section>

          <section className="card">
            <h2>
              💰 ${stats.balance.toFixed(2)}
            </h2>
            <p className="muted">Open Balance</p>
          </section>

          <section className="card">
            <h2>📅 {stats.events}</h2>
            <p className="muted">Events</p>
          </section>

          <section className="card">
            <h2>📢 {stats.announcements}</h2>
            <p className="muted">Announcements</p>
          </section>

          <section className="card">
            <h2>🙋 {stats.rsvps}</h2>
            <p className="muted">RSVPs</p>
          </section>

          <section className="card">
            <h2>⚡ {stats.electric}</h2>
            <p className="muted">
              Electric Readings
            </p>
          </section>
        </div>

        <div className="grid grid-3">
          <a className="card admin-link" href="/admin/campers">Campers</a>
          <a className="card admin-link" href="/admin/invoices">Invoices</a>
          <a className="card admin-link" href="/admin/electric">Electric</a>
          <a className="card admin-link" href="/admin/documents">Documents</a>
          <a className="card admin-link" href="/admin/events">Events</a>
          <a className="card admin-link" href="/admin/rsvps">RSVPs</a>
          <a className="card admin-link" href="/admin/announcements">Announcements</a>
          <a className="card admin-link" href="/admin/texts">Text Alerts</a>
          <a className="card admin-link" href="/admin/gatecards">Gate Cards</a>
          <a className="card admin-link" href="/admin/waitlist">Waitlist</a>
          <a className="card admin-link" href="/admin/lots">Lots</a>
          <a className="card admin-link" href="/admin/maintenance">Maintenance</a>
        </div>
      </div>
    </main>
  )
}