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
    ])

    const invoices = invoicesResult.data || []
    const maintenance = maintenanceResult.data || []

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
      openMaintenance: maintenance.filter((ticket) => ticket.status === 'Open').length,
      inProgressMaintenance: maintenance.filter(
        (ticket) => ticket.status === 'In Progress'
      ).length,
      emergencyMaintenance: maintenance.filter(
        (ticket) => ticket.priority === 'Emergency'
      ).length,
      completedMaintenance: maintenance.filter(
        (ticket) => ticket.status === 'Completed'
      ).length,
    })
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
      detail: `${stats.openMaintenance + stats.inProgressMaintenance} active`,
      icon: Wrench,
      tone: stats.emergencyMaintenance > 0 ? 'red' : 'orange',
    },
    {
      href: '/admin/lots',
      title: 'Lots & Sites',
      description: 'Manage lot assignments, meters, and rent rates.',
      detail: 'Site operations',
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
    { href: '/admin/rsvps', title: 'RSVPs', detail: `${stats.rsvps} responses`, icon: UsersRound },
    { href: '/admin/announcements', title: 'Announcements', detail: `${stats.announcements} active`, icon: Megaphone },
    { href: '/admin/texts', title: 'Text Alerts', detail: 'Camper notices', icon: BellRing },
    { href: '/admin/documents', title: 'Documents', detail: 'Files & forms', icon: FileText },
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

          <div className="admin-command-date">
            <CalendarDays size={19} />
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
            <span><small>Active maintenance</small><strong>{stats.openMaintenance + stats.inProgressMaintenance}</strong><em>{stats.emergencyMaintenance} emergency</em></span>
          </a>
        </section>

        <section className="admin-command-panel">
          <div className="admin-command-heading">
            <div><span>DAILY OPERATIONS</span><h2>Run the campground</h2></div>
            <p>The tools you use most, all in one place.</p>
          </div>

          <div className="admin-operation-grid">
            {dailyOperations.map((item) => {
              const Icon = item.icon
              return (
                <a href={item.href} className="admin-operation-card" key={item.href}>
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
              return (
                <a href={item.href} className="admin-community-card" key={item.href}>
                  <Icon size={21} />
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <ArrowRight size={17} />
                </a>
              )
            })}
          </div>
        </section>

        <footer className="admin-command-footer">
          <span>Bur Oaks Campground</span>
          <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Admin Operations Center</span>
        </footer>
      </div>
    </main>
  )
}
