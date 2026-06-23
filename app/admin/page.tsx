'use client'

import { useEffect, useState } from 'react'
import {
  Archive,
  ArrowRight,
  BellRing,
  CalendarDays,
  CircleDollarSign,
  ClipboardList,
  FileText,
  Gauge,
  KeyRound,
  LogOut,
  Map,
  Megaphone,
  ReceiptText,
  ShieldCheck,
  TentTree,
  UserRoundSearch,
  Users,
  UsersRound,
  Wrench,
  Zap,
} from 'lucide-react'
import AdminWeather from '../../components/AdminWeather'
import { supabase } from '../../lib/supabase'

type AdminStats = {
  campers: number
  archivedCampers: number
  balance: number
  events: number
  announcements: number
  rsvps: number
  electric: number
  waitlist: number
  unpaidInvoices: number
  totalRevenue: number
  openMaintenance: number
  inProgressMaintenance: number
  emergencyMaintenance: number
  completedMaintenance: number
  pendingMaintenance: number
  maintenanceAlerts: number
  paymentAlerts: number
  rsvpAlerts: number
  documentActions: number
  insuranceMissing: number
  totalUnreadAlerts: number
}

const emptyStats: AdminStats = {
  campers: 0,
  archivedCampers: 0,
  balance: 0,
  events: 0,
  announcements: 0,
  rsvps: 0,
  electric: 0,
  waitlist: 0,
  unpaidInvoices: 0,
  totalRevenue: 0,
  openMaintenance: 0,
  inProgressMaintenance: 0,
  emergencyMaintenance: 0,
  completedMaintenance: 0,
  pendingMaintenance: 0,
  maintenanceAlerts: 0,
  paymentAlerts: 0,
  rsvpAlerts: 0,
  documentActions: 0,
  insuranceMissing: 0,
  totalUnreadAlerts: 0,
}

export default function AdminPage() {
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [stats, setStats] = useState<AdminStats>(emptyStats)

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
      .or(`email.ilike.${user.email?.trim().toLowerCase()},secondary_email.ilike.${user.email?.trim().toLowerCase()}`)
      .single()

    if (!camper || camper.role?.toLowerCase() !== 'admin') {
      window.location.href = '/portal'
      return
    }

    await loadStats()
    setCheckingAuth(false)
  }

  async function loadStats() {
    const [
      campersResult,
      archivedResult,
      invoicesResult,
      eventsResult,
      announcementsResult,
      rsvpsResult,
      electricResult,
      maintenanceResult,
      waitlistResult,
      notificationResult,
      documentResult,
    ] = await Promise.all([
      supabase.from('campers').select('id').eq('active', true),
      supabase.from('campers').select('id').eq('active', false),
      supabase.from('invoices').select('*'),
      supabase.from('events').select('id'),
      supabase.from('announcements').select('id').eq('is_active', true),
      supabase.from('event_rsvps').select('id'),
      supabase.from('electric_readings').select('id'),
      supabase.from('maintenance_tickets').select('*'),
      supabase.from('waitlist').select('id'),
      supabase.from('admin_notifications').select('id,type').is('read_at', null),
      supabase.from('documents').select('id,document_type,signature_status,camper_id'),
    ])

    const invoices = invoicesResult.data || []
    const maintenance = maintenanceResult.data || []
    const notifications = notificationResult.data || []
    const documents = documentResult.data || []
    const insuredCamperIds = new Set(
      documents
        .filter((document) => document.document_type === 'Golf Cart Insurance')
        .map((document) => String(document.camper_id))
    )

    setStats({
      campers: campersResult.data?.length || 0,
      archivedCampers: archivedResult.data?.length || 0,
      balance: invoices
        .filter((invoice) => invoice.status !== 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0),
      events: eventsResult.data?.length || 0,
      announcements: announcementsResult.data?.length || 0,
      rsvps: rsvpsResult.data?.length || 0,
      electric: electricResult.data?.length || 0,
      waitlist: waitlistResult.data?.length || 0,
      unpaidInvoices: invoices.filter((invoice) => invoice.status !== 'paid').length,
      totalRevenue: invoices
        .filter((invoice) => invoice.status === 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0),
      openMaintenance: maintenance.filter(
        (ticket) => ticket.status === 'Open' && ticket.admin_approved === true
      ).length,
      inProgressMaintenance: maintenance.filter(
        (ticket) => ticket.status === 'In Progress' && ticket.admin_approved === true
      ).length,
      emergencyMaintenance: maintenance.filter(
        (ticket) => ticket.priority === 'Emergency'
      ).length,
      completedMaintenance: maintenance.filter(
        (ticket) => ticket.status === 'Completed'
      ).length,
      pendingMaintenance: maintenance.filter((ticket) => ticket.admin_approved !== true).length,
      maintenanceAlerts: notifications.filter((notification) => notification.type === 'maintenance_request').length,
      paymentAlerts: notifications.filter((notification) => notification.type === 'payment_received').length,
      rsvpAlerts: notifications.filter((notification) => notification.type === 'event_rsvp').length,
      documentActions: documents.filter((document) => document.signature_status === 'pending').length,
      insuranceMissing: (campersResult.data || []).filter((camper) => !insuredCamperIds.has(String(camper.id))).length,
      totalUnreadAlerts: notifications.length,
    })
  }

  async function markAlertsSeen(type: string) {
    await supabase
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('type', type)
      .is('read_at', null)

    loadStats()
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (checkingAuth) {
    return (
      <main className="admin-command-page">
        <div className="admin-command-loading">
          <ShieldCheck size={36} />
          <p>Opening the command center…</p>
        </div>
      </main>
    )
  }

  const dailyOperations = [
    {
      href: '/admin/campers',
      title: 'Campers',
      description: 'Add, edit, archive, and manage camper accounts.',
      detail: `${stats.campers} active`,
      icon: Users,
      tone: 'green',
    },
    {
      href: '/admin/invoices',
      title: 'Invoices & Billing',
      description: 'Create invoices, review balances, and track payments.',
      detail: `${stats.unpaidInvoices} unpaid`,
      alertCount: stats.paymentAlerts,
      alertLabel: 'new payment alert',
      alertType: 'payment_received',
      icon: ReceiptText,
      tone: 'gold',
    },
    {
      href: '/admin/electric',
      title: 'Electric',
      description: 'Enter readings and create usage-based invoices.',
      detail: `${stats.electric} readings`,
      icon: Zap,
      tone: 'blue',
    },
    {
      href: '/admin/maintenance',
      title: 'Maintenance',
      description: 'Manage repairs, assignments, and work orders.',
      detail: `${stats.openMaintenance + stats.inProgressMaintenance} active · ${stats.pendingMaintenance} pending`,
      alertCount: stats.maintenanceAlerts,
      alertLabel: 'maintenance alert',
      alertType: 'maintenance_request',
      icon: Wrench,
      tone: stats.emergencyMaintenance > 0 ? 'red' : 'orange',
    },
    {
      href: '/admin/map',
      title: 'Lots & Sites',
      description: 'View occupied, vacant, and maintenance lots.',
      detail: 'Visual campground map',
      icon: Map,
      tone: 'plum',
    },
    {
      href: '/admin/waitlist',
      title: 'Waitlist',
      description: 'Track prospects and convert them into campers.',
      detail: `${stats.waitlist} waiting`,
      icon: ClipboardList,
      tone: 'slate',
    },
  ]

  const communityTools = [
    { href: '/admin/events', title: 'Events', detail: `${stats.events} events`, icon: CalendarDays },
    { href: '/admin/rsvps', title: 'RSVPs', detail: `${stats.rsvps} responses`, alertCount: stats.rsvpAlerts, alertLabel: 'new RSVP alert', alertType: 'event_rsvp', icon: UsersRound },
    { href: '/admin/announcements', title: 'Announcements', detail: `${stats.announcements} active`, icon: Megaphone },
    { href: '/admin/notifications', title: 'Notifications', detail: `${stats.totalUnreadAlerts} unread`, alertCount: stats.totalUnreadAlerts, alertLabel: 'new notification', icon: BellRing },
    { href: '/admin/texts', title: 'Text Alerts', detail: 'Camper notices', icon: BellRing },
    { href: '/admin/documents', title: 'Documents', detail: `${stats.documentActions} need signatures`, icon: FileText },
    { href: '/admin/gatecards', title: 'Gate Cards', detail: 'Access control', icon: KeyRound },
    { href: '/admin/directory', title: 'Directory', detail: 'Camper lookup', icon: UserRoundSearch },
    { href: '/admin/archived-campers', title: 'Archive', detail: `${stats.archivedCampers} records`, icon: Archive },
  ]

  return (
    <main className="admin-command-page">
      <div className="admin-command-shell">
        <section className="admin-command-hero">
          <nav className="admin-command-topbar">
            <a href="/admin" className="admin-command-brand">
              <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
              <span>
                <strong>Bur Oaks</strong>
                <small>Operations Center</small>
              </span>
            </a>

            <div className="admin-command-actions">
              <span className="admin-command-date">
                <CalendarDays size={16} />
                <span>
                  <small>Today</small>
                  <strong>
                    {new Date().toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </strong>
                </span>
              </span>
              <span className="admin-live-status">
                <i /> Systems online
              </span>
              <button type="button" onClick={handleLogout}>
                <LogOut size={17} /> Sign out
              </button>
            </div>
          </nav>

          <div className="admin-command-intro">
            <div className="admin-command-eyebrow">
              <TentTree size={16} /> Campground operations
            </div>
            <h1>Good work starts with a clear view.</h1>
            <p>
              Your command center for campers, billing, maintenance, and the
              day-to-day details that keep Bur Oaks running beautifully.
            </p>
          </div>
        </section>

        <section className="admin-kpi-grid" aria-label="Campground overview">
          <a href="/admin/invoices" className="admin-kpi-card">
            <span className="admin-kpi-icon green"><CircleDollarSign size={23} /></span>
            <span><small>Revenue collected</small><strong>${stats.totalRevenue.toFixed(2)}</strong><em>Paid invoices</em></span>
          </a>
          <a href="/admin/open-balance" className="admin-kpi-card">
            <span className="admin-kpi-icon gold"><ReceiptText size={23} /></span>
            <span><small>Open balance</small><strong>${stats.balance.toFixed(2)}</strong><em>{stats.unpaidInvoices} unpaid invoices</em></span>
          </a>
          <a href="/admin/campers" className="admin-kpi-card">
            <span className="admin-kpi-icon blue"><Users size={23} /></span>
            <span><small>Active campers</small><strong>{stats.campers}</strong><em>Current accounts</em></span>
          </a>
          <a href="/admin/maintenance" className="admin-kpi-card">
            <span className="admin-kpi-icon orange"><Wrench size={23} /></span>
            <span><small>Approved maintenance</small><strong>{stats.openMaintenance + stats.inProgressMaintenance}</strong><em>{stats.pendingMaintenance} awaiting approval</em></span>
          </a>
        </section>

        <AdminWeather />

        <section className="admin-command-panel admin-today-panel">
          <div className="admin-command-heading">
            <div><span>TODAY COMMAND CENTER</span><h2>What needs attention first</h2></div>
            <a href="/admin/notifications">Open notifications <ArrowRight size={16} /></a>
          </div>
          <div className="admin-today-grid">
            <article className={stats.totalUnreadAlerts ? 'attention' : ''}>
              <BellRing size={21} />
              <small>New alerts</small>
              <strong>{stats.totalUnreadAlerts || 'Clear'}</strong>
              <p>{stats.totalUnreadAlerts ? 'Review new campground activity.' : 'No unread alerts right now.'}</p>
            </article>
            <article className={stats.pendingMaintenance ? 'attention' : ''}>
              <Wrench size={21} />
              <small>Pending approvals</small>
              <strong>{stats.pendingMaintenance || 'None'}</strong>
              <p>{stats.pendingMaintenance ? 'Maintenance is waiting for admin approval.' : 'No work orders waiting.'}</p>
            </article>
            <article className={stats.documentActions ? 'attention' : ''}>
              <FileText size={21} />
              <small>Unsigned documents</small>
              <strong>{stats.documentActions || 'Clear'}</strong>
              <p>{stats.documentActions ? 'Leases or renewals still need signatures.' : 'No pending signatures found.'}</p>
            </article>
            <article className={stats.insuranceMissing ? 'attention' : ''}>
              <ShieldCheck size={21} />
              <small>Insurance missing</small>
              <strong>{stats.insuranceMissing || 'Clear'}</strong>
              <p>{stats.insuranceMissing ? 'Campers missing golf cart insurance on file.' : 'Insurance records look good.'}</p>
            </article>
          </div>
        </section>

        <section className="admin-command-panel">
          <div className="admin-command-heading">
            <div><span>DAILY OPERATIONS</span><h2>Run the campground</h2></div>
            <p>The tools you use most, all in one place.</p>
          </div>

          <div className="admin-operation-grid">
            {dailyOperations.map((item) => {
              const Icon = item.icon
              const alertCount = item.alertCount || 0
              return (
                <a href={item.href} className="admin-operation-card" key={item.href}>
                  {alertCount > 0 && (
                    <span className="admin-attention-badge" aria-label={`${alertCount} ${item.alertLabel}${alertCount === 1 ? '' : 's'}`}>
                      {alertCount}
                    </span>
                  )}
                  <span className={`admin-operation-icon ${item.tone}`}><Icon size={24} /></span>
                  <span className="admin-operation-copy"><strong>{item.title}</strong><small>{item.description}</small><em>{item.detail}</em></span>
                  <ArrowRight size={19} />
                </a>
              )
            })}
          </div>
        </section>

        <section className="admin-command-panel admin-community-panel">
          <div className="admin-command-heading">
            <div><span>COMMUNITY & RECORDS</span><h2>Stay connected and organized</h2></div>
          </div>

          <div className="admin-community-grid">
            {communityTools.map((item) => {
              const Icon = item.icon
              const alertCount = item.alertCount || 0
              return (
                <a href={item.href} className="admin-community-card" key={item.href}>
                  {alertCount > 0 && (
                    <span className="admin-attention-badge small" aria-label={`${alertCount} ${item.alertLabel}${alertCount === 1 ? '' : 's'}`}>
                      {alertCount}
                    </span>
                  )}
                  <Icon size={21} />
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <ArrowRight size={17} />
                </a>
              )
            })}
          </div>
        </section>

        {(stats.maintenanceAlerts > 0 || stats.paymentAlerts > 0 || stats.rsvpAlerts > 0) && (
          <section className="admin-command-panel admin-alert-review-panel">
            <div className="admin-command-heading">
              <div><span>ATTENTION</span><h2>New activity waiting for review</h2></div>
              <p>Clear a dot after you have handled that group.</p>
            </div>
            <div className="admin-alert-review-grid">
              {stats.maintenanceAlerts > 0 && (
                <button type="button" onClick={() => markAlertsSeen('maintenance_request')}>
                  <Wrench size={18} /> Mark maintenance seen <strong>{stats.maintenanceAlerts}</strong>
                </button>
              )}
              {stats.paymentAlerts > 0 && (
                <button type="button" onClick={() => markAlertsSeen('payment_received')}>
                  <ReceiptText size={18} /> Mark payments seen <strong>{stats.paymentAlerts}</strong>
                </button>
              )}
              {stats.rsvpAlerts > 0 && (
                <button type="button" onClick={() => markAlertsSeen('event_rsvp')}>
                  <UsersRound size={18} /> Mark RSVPs seen <strong>{stats.rsvpAlerts}</strong>
                </button>
              )}
            </div>
          </section>
        )}

        <footer className="admin-command-footer">
          <span>Bur Oaks Campground</span>
          <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Admin Operations Center</span>
        </footer>
      </div>
    </main>
  )
}
