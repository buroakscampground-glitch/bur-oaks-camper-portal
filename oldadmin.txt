'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../lib/supabase'

export default function AdminPage() {
  const router = useRouter()
  const [checkingAuth, setCheckingAuth] = useState(true)

  const [stats, setStats] = useState({
  campers: 0,
  archivedCampers: 0,
  balance: 0,
  events: 0,
  announcements: 0,
  rsvps: 0,
  electric: 0,
  maintenance: 0,
  waitlist: 0,
  unpaidInvoices: 0,

  openMaintenance: 0,
  inProgressMaintenance: 0,
  emergencyMaintenance: 0,
  completedMaintenance: 0,
})

  useEffect(() => {
    checkAdmin()
  }, [])

  async function checkAdmin() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    const { data: camper } = await supabase
      .from('campers')
      .select('role')
      .eq('email', user.email?.toLowerCase())
      .single()

    if (!camper || camper.role?.toLowerCase() !== 'admin') {
      window.location.href = '/portal'
      return
    }

    await loadStats()
    setCheckingAuth(false)
  }

  async function loadStats() {
    const { data: campers } = await supabase
      .from('campers')
      .select('id')
      .eq('active', true)

    const { data: archivedCampers } = await supabase
      .from('campers')
      .select('id')
      .eq('active', false)

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

    const { data: maintenance } = await supabase
  .from('maintenance_tickets')
  .select('*')

    const { data: waitlist } = await supabase
      .from('waitlist')
      .select('id')

    const openBalance =
      invoices
        ?.filter((i) => i.status !== 'paid')
        .reduce((sum, i) => sum + Number(i.total_due || 0), 0) || 0

    const unpaidInvoices =
      invoices?.filter((i) => i.status !== 'paid').length || 0
const openMaintenance =
  maintenance?.filter((t) => t.status === 'Open').length || 0

const inProgressMaintenance =
  maintenance?.filter((t) => t.status === 'In Progress').length || 0

const completedMaintenance =
  maintenance?.filter((t) => t.status === 'Completed').length || 0

const emergencyMaintenance =
  maintenance?.filter((t) => t.priority === 'Emergency').length || 0
    setStats({
      campers: campers?.length || 0,
      archivedCampers: archivedCampers?.length || 0,
      balance: openBalance,
      events: events?.length || 0,
      announcements: announcements?.length || 0,
      rsvps: rsvps?.length || 0,
      electric: electric?.length || 0,
      maintenance: maintenance?.length || 0,
      waitlist: waitlist?.length || 0,
      unpaidInvoices,
      openMaintenance,
inProgressMaintenance,
emergencyMaintenance,
completedMaintenance,
    })
  }

  if (checkingAuth) {
    return (
      <main className="page">
        <div className="container">
          <section className="card">
            <h2>Checking permissions...</h2>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <div className="container">
        <section className="card" style={{ marginBottom: '25px' }}>
          <p className="muted">BUR OAKS CAMPGROUND</p>
          <h1>Admin Command Center</h1>
          <p className="muted">
            Manage campground operations from one location.
          </p>
        </section>

        <button
          onClick={async () => {
            await supabase.auth.signOut()
            window.location.href = '/login'
          }}
        >
          Logout
        </button>

        <div className="grid grid-3" style={{ marginBottom: '25px' }}>
          <section
  className="card admin-link"
  onClick={() => router.push('/admin/campers')}
  style={{ cursor: 'pointer' }}
>
            <h2>👥 {stats.campers}</h2>
            <p className="muted">Active Campers</p>
          </section>

          <section
  className="card admin-link"
  onClick={() => router.push('/admin/archived-campers')}
  style={{ cursor: 'pointer' }}
>
            <h2>📦 {stats.archivedCampers}</h2>
            <p className="muted">Archived Campers</p>
          </section>

          <section
  className="card admin-link"
  onClick={() => router.push('/admin/open-balance')}
  style={{ cursor: 'pointer' }}
>
            <h2>💰 ${stats.balance.toFixed(2)}</h2>
            <p className="muted">Open Balance</p>
          </section>

          <section
  className="card admin-link"
  onClick={() => router.push('/admin/events')}
  style={{ cursor: 'pointer' }}
>
            <h2>📅 {stats.events}</h2>
            <p className="muted">Events</p>
          </section>

          <section
  className="card admin-link"
  onClick={() => router.push('/admin/rsvps')}
  style={{ cursor: 'pointer' }}
>
            <h2>📢 {stats.announcements}</h2>
            <p className="muted">Announcements</p>
          </section>

          <section
  className="card admin-link"
  onClick={() => router.push('/admin/rsvps')}
  style={{ cursor: 'pointer' }}
>
            <h2>🙋 {stats.rsvps}</h2>
            <p className="muted">RSVPs</p>
          </section>
<section
  className="card admin-link"
 onClick={() => router.push('/admin/electric')}
  style={{ cursor: 'pointer' }}
>
            <h2>⚡ {stats.electric}</h2>
            <p className="muted">Electric Readings</p>
          </section>

          <section
  className="card admin-link"
  onClick={() => router.push('/admin/maintenance')}
  style={{ cursor: 'pointer' }}
>
            <h2>🔧 {stats.openMaintenance}</h2>
            <div style={{ fontSize: '12px', lineHeight: '1.5' }}>
  <div>Open: {stats.openMaintenance}</div>
  <div>In Progress: {stats.inProgressMaintenance}</div>
  <div>Emergency: {stats.emergencyMaintenance}</div>
</div>
          </section>

          <section
  className="card admin-link"
  onClick={() => router.push('/admin/waitlist')}
  style={{ cursor: 'pointer' }}
>
            <h2>📝 {stats.waitlist}</h2>
            <p className="muted">Waitlist</p>
          </section>

         <section
  className="card admin-link"
 onClick={() => router.push('/admin/invoices?status=unpaid')}
  style={{ cursor: 'pointer' }}
>
            <h2>💵 {stats.unpaidInvoices}</h2>
            <p className="muted">Unpaid Invoices</p>
          </section>
        </div>

        <div className="grid grid-3">
          <a className="card admin-link" href="/admin/campers">
            <h2>Campers</h2>
            <p>Add, edit, and manage camper accounts.</p>
          </a>

          <a className="card admin-link" href="/admin/archived-campers">
            <h2>Archived Campers</h2>
            <p>View and restore archived camper records.</p>
          </a>

          <a className="card admin-link" href="/admin/invoices">
            <h2>Invoices</h2>
            <p>Create individual camper invoices.</p>
          </a>

          <a className="card admin-link" href="/admin/electric">
            <h2>Electric</h2>
            <p>Enter meter readings and create invoices.</p>
          </a>

          <a className="card admin-link" href="/admin/documents">
            <h2>Documents</h2>
            <p>Upload leases, rules, and camper files.</p>
          </a>

          <a className="card admin-link" href="/admin/events">
            <h2>Events</h2>
            <p>Create and manage campground events.</p>
          </a>

          <a className="card admin-link" href="/admin/rsvps">
            <h2>RSVPs</h2>
            <p>See who is attending each event.</p>
          </a>

          <a className="card admin-link" href="/admin/announcements">
            <h2>Announcements</h2>
            <p>Post updates and alerts to all campers.</p>
          </a>

          <a className="card admin-link" href="/admin/texts">
            <h2>Text Alerts</h2>
            <p>Save campground text alerts and reminders.</p>
          </a>

          <a className="card admin-link" href="/admin/gatecards">
            <h2>Gate Cards</h2>
            <p>Assign and manage camper gate access cards.</p>
          </a>

          <a className="card admin-link" href="/admin/waitlist">
            <h2>Waitlist</h2>
            <p>Track people waiting for seasonal sites.</p>
          </a>

          <a className="card admin-link" href="/admin/lots">
            <h2>Lots</h2>
            <p>Manage lot numbers, meters, rent amounts, and assigned campers.</p>
          </a>

          <a className="card admin-link" href="/admin/maintenance">
            <h2>Maintenance</h2>
            <p>Track repairs, campground issues, and work orders.</p>
          </a>
        </div>
      </div>
    </main>
  )
}