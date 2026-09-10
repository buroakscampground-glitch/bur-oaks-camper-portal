'use client'

import {
  Archive,
  ArrowLeft,
  Bell,
  BookOpen,
  CakeSlice,
  CalendarDays,
  CalendarClock,
  CircleDollarSign,
  ChevronRight,
  ClipboardCheck,
  ClipboardList,
  DoorOpen,
  FileText,
  Hammer,
  Home,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Mail,
  Map,
  ScanLine,
  Menu,
  Megaphone,
  MessageCircle,
  ReceiptText,
  Rocket,
  Search,
  Send,
  Settings,
  ShieldCheck,
  ShoppingBasket,
  TentTree,
  Users,
  Utensils,
  WalletCards,
  Warehouse,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getSeasonalTheme } from '../lib/seasonal-theme'
import { syncHomeScreenBadge } from '../lib/home-screen-badge'
import { supabase } from '../lib/supabase'
import SeasonalThemeCard from './SeasonalThemeCard'
import CommunityUnreadBadge from './CommunityUnreadBadge'
import AppBadgePermission from './AppBadgePermission'

const pageNames: Record<string, string> = {
  campers: 'Camper Management',
  invoices: 'Invoices & Billing',
  'open-balance': 'Open Balances',
  electric: 'Electric Operations',
  maintenance: 'Maintenance Operations',
  lots: 'Lots & Sites',
  waitlist: 'Waitlist',
  events: 'Events',
  dinners: 'Saturday Dinners',
  rsvps: 'RSVP Tracking',
  announcements: 'Announcements',
  birthdays: 'Birthday Office',
  texts: 'Text Alerts',
  notifications: 'Notifications',
  messages: 'Camper Messages',
  documents: 'Documents',
  map: 'Campground Map',
  launch: 'Launch Checklist',
  'email-test': 'Email Alert Test',
  gatecards: 'Gate Cards',
  directory: 'Camper Directory',
  'archived-campers': 'Camper Archive',
  'individual-invoices': 'Individual Invoices',
  'site-services': 'Site Services',
  credits: 'Account Credits',
  reports: 'Reports & Taxes',
  'stripe-deposits': 'Stripe Deposits',
  settings: 'Campground Settings',
  'pump-outs': 'Pump-Out Requests',
  'site-care': 'Site Care Notices',
  renewals: 'Season Renewal Forecast',
  'site-availability': 'Site Availability',
  'system-health': 'System Health & Search',
  'community-feed': 'Community Feed',
}

const navGroups = [
  {
    label: 'Today',
    links: [
      { href: '/admin', label: 'Command Center', icon: LayoutDashboard },
      { href: '/admin/system-health', label: 'System Health & Search', icon: ShieldCheck },
      { href: '/admin/notifications', label: 'Needs Attention', icon: Bell },
      { href: '/admin/messages', label: 'Office Inbox', icon: MessageCircle },
      { href: '/admin/texts', label: 'Text Alerts', icon: Send },
    ],
  },
  {
    label: 'Money',
    links: [
      { href: '/admin/invoices', label: 'Invoices', icon: ReceiptText },
      { href: '/admin/open-balance', label: 'Open Balances', icon: CircleDollarSign },
      { href: '/admin/electric', label: 'Electric Billing', icon: Zap },
      { href: '/admin/electric/meter-readings', label: 'Meter Reading Review', icon: ScanLine },
      { href: '/admin/credits', label: 'Credits', icon: WalletCards },
      { href: '/admin/reports', label: 'Reports', icon: ClipboardList },
      { href: '/admin/stripe-deposits', label: 'Stripe Deposits', icon: Landmark },
    ],
  },
  {
    label: 'Campers',
    links: [
      { href: '/admin/campers', label: 'Camper Records', icon: Users },
      { href: '/admin/renewals', label: 'Renewal Forecast', icon: CalendarClock },
      { href: '/admin/site-availability', label: 'Site Availability', icon: DoorOpen },
      { href: '/admin/documents', label: 'Documents & Leases', icon: FileText },
      { href: '/admin/waitlist', label: 'Waitlist', icon: BookOpen },
      { href: '/admin/directory', label: 'Directory', icon: Mail },
    ],
  },
  {
    label: 'Operations',
    links: [
      { href: '/admin/site-care', label: 'Site Care', icon: ClipboardCheck },
      { href: '/admin/maintenance', label: 'Maintenance', icon: Wrench },
      { href: '/admin/maintenance/archive', label: 'Completed Tickets', icon: Archive },
      { href: '/admin/maintenance/inventory', label: 'Inventory', icon: Warehouse },
      { href: '/admin/maintenance/supplies', label: 'Supply Requests', icon: ShoppingBasket },
      { href: '/admin/pump-outs', label: 'Pump-Outs', icon: Hammer },
      { href: '/admin/site-services', label: 'Site Services', icon: KeyRound },
      { href: '/admin/lots', label: 'Lots & Sites', icon: TentTree },
      { href: '/admin/map', label: 'Campground Map', icon: Map },
    ],
  },
  {
    label: 'Community',
    links: [
      { href: '/admin/community-feed', label: 'Community Feed', icon: Users },
      { href: '/admin/dinners', label: 'Saturday Dinners', icon: Utensils },
      { href: '/admin/events', label: 'Events', icon: CalendarDays },
      { href: '/admin/birthdays', label: 'Birthday Office', icon: CakeSlice },
      { href: '/admin/announcements', label: 'Announcements', icon: Megaphone },
      { href: '/admin/rsvps', label: 'RSVPs', icon: ClipboardList },
    ],
  },
  {
    label: 'Setup',
    links: [
      { href: '/admin/settings', label: 'Settings', icon: Settings },
      { href: '/admin/gatecards', label: 'Gate Cards', icon: KeyRound },
      { href: '/admin/archived-campers', label: 'Archive', icon: Archive },
      { href: '/admin/launch', label: 'Launch Checklist', icon: Rocket },
    ],
  },
]

function isActiveLink(pathname: string, href: string) {
  if (href === '/admin') return pathname === '/admin'
  if (href === '/admin/electric') return pathname === href
  if (href === '/admin/maintenance') {
    return pathname === href || (
      pathname.startsWith(`${href}/`) &&
      !pathname.startsWith('/admin/maintenance/archive') &&
      !pathname.startsWith('/admin/maintenance/supplies') &&
      !pathname.startsWith('/admin/maintenance/inventory')
    )
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [mobileAlertsOpen, setMobileAlertsOpen] = useState(false)
  const [attentionCounts, setAttentionCounts] = useState<Record<string, number>>({})
  const [homeBadgeCount, setHomeBadgeCount] = useState(0)
  const [standaloneNotificationCount, setStandaloneNotificationCount] = useState(0)
  const [birthdayTodayCount, setBirthdayTodayCount] = useState(0)
  const [birthdayPreview, setBirthdayPreview] = useState('')
  const theme = getSeasonalTheme()

  useEffect(() => {
    let active = true
    async function loadAttentionCounts() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const headers = { Authorization: `Bearer ${session.access_token}` }
      const [sidebarResponse, birthdayResponse, communityResponse] = await Promise.all([
        fetch('/api/admin-sidebar-attention', { headers }),
        fetch('/api/admin-birthdays', { headers }),
        fetch('/api/community-feed?mode=summary', { headers }),
      ])
      const sidebar = await sidebarResponse.json().catch(() => ({}))
      const birthdays = await birthdayResponse.json().catch(() => ({}))
      const community = await communityResponse.json().catch(() => ({}))
      if (active) {
        const birthdayCount = birthdayResponse.ok ? Number(birthdays.counts?.needsGreeting || 0) : 0
        const communityCount = communityResponse.ok
          ? Number(community.unreadCount || 0) + Number(community.directCount || 0)
          : 0
        const appBadgeCount = (sidebarResponse.ok ? Number(sidebar.appBadgeCount || 0) : 0) + birthdayCount + communityCount
        const birthdayToday = birthdayResponse.ok ? Number(birthdays.counts?.today || 0) : 0
        const firstBirthday = Array.isArray(birthdays.birthdays)
          ? birthdays.birthdays.find((birthday: any) => birthday.window === 'today')
          : null
        setAttentionCounts({
          ...(sidebarResponse.ok ? sidebar.counts || {} : {}),
          '/admin/birthdays': birthdayCount,
          '/admin/community-feed': communityCount,
        })
        setHomeBadgeCount(appBadgeCount)
        setStandaloneNotificationCount(sidebarResponse.ok ? Number(sidebar.standaloneNotificationCount || 0) : 0)
        setBirthdayTodayCount(birthdayToday)
        setBirthdayPreview(firstBirthday
          ? `${firstBirthday.name}${firstBirthday.lotNumber ? ` · Lot ${firstBirthday.lotNumber}` : ''}`
          : '')
        void syncHomeScreenBadge(appBadgeCount)
      }
    }

    loadAttentionCounts()
    const refresh = window.setInterval(loadAttentionCounts, 15_000)
    const liveChanges = supabase
      .channel('admin-attention-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_notifications' }, loadAttentionCounts)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'waitlist' }, loadAttentionCounts)
      .subscribe()
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') loadAttentionCounts()
    }
    window.addEventListener('focus', loadAttentionCounts)
    window.addEventListener('online', loadAttentionCounts)
    window.addEventListener('pageshow', loadAttentionCounts)
    window.addEventListener('admin-attention-changed', loadAttentionCounts)
    window.addEventListener('community-unread-changed', loadAttentionCounts)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      active = false
      window.clearInterval(refresh)
      supabase.removeChannel(liveChanges)
      window.removeEventListener('focus', loadAttentionCounts)
      window.removeEventListener('online', loadAttentionCounts)
      window.removeEventListener('pageshow', loadAttentionCounts)
      window.removeEventListener('admin-attention-changed', loadAttentionCounts)
      window.removeEventListener('community-unread-changed', loadAttentionCounts)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const section = pathname.split('/')[2] || ''
  const pageTitle = pathname === '/admin' ? 'Operations Dashboard' : pageNames[section] || 'Operations'
  const isDetailPage = pathname.split('/').filter(Boolean).length > 2
  const mobileAlertItems: Array<{ href: string; label: string; count: number; icon: LucideIcon; detail?: string }> = [
    { href: '/admin/notifications', label: 'Needs Attention', count: standaloneNotificationCount, icon: Bell },
    { href: '/admin/messages', label: 'Office Inbox', count: Number(attentionCounts['/admin/messages'] || 0), icon: MessageCircle },
    { href: '/admin/maintenance', label: 'Maintenance', count: Number(attentionCounts['/admin/maintenance'] || 0), icon: Wrench },
    { href: '/admin/maintenance/supplies', label: 'Supply Requests', count: Number(attentionCounts['/admin/maintenance/supplies'] || 0), icon: ShoppingBasket },
    { href: '/admin/pump-outs', label: 'Pump-Outs', count: Number(attentionCounts['/admin/pump-outs'] || 0), icon: Hammer },
    { href: '/admin/site-care', label: 'Site Care', count: Number(attentionCounts['/admin/site-care'] || 0), icon: ClipboardCheck },
    { href: '/admin/birthdays', label: 'Birthday Office', count: Number(attentionCounts['/admin/birthdays'] || 0), icon: CakeSlice, detail: birthdayPreview || undefined },
    { href: '/admin/community-feed', label: 'Community', count: Number(attentionCounts['/admin/community-feed'] || 0), icon: Users },
  ].filter((item) => item.count > 0)
  const showBirthdayToday = birthdayTodayCount > 0 && !mobileAlertItems.some((item) => item.href === '/admin/birthdays')

  return (
    <div className={`admin-workspace-page seasonal-theme seasonal-theme-${theme.key}`}>
      <div className="admin-workspace-shell">
        <aside className="admin-sidebar" aria-label="Admin navigation">
          <div className="admin-sidebar-mobile-head">
            <a className="admin-sidebar-brand" href="/admin">
              <img src="/bur-oaks-logo.png" alt="" />
              <span>
                <strong>Bur Oaks</strong>
                <small>Command Center</small>
              </span>
            </a>
            <button
              type="button"
              className="admin-sidebar-menu-button"
              aria-label={mobileMenuOpen ? 'Close admin menu' : 'Open admin menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              <span>{mobileMenuOpen ? 'Close' : 'Menu'}</span>
            </button>
          </div>

          <div className={`admin-mobile-alerts${mobileAlertsOpen ? ' open' : ''}`}>
            <button
              type="button"
              className="admin-mobile-alerts-toggle"
              aria-expanded={mobileAlertsOpen}
              aria-controls="admin-mobile-alert-list"
              onClick={() => setMobileAlertsOpen((open) => !open)}
            >
              <span className="admin-mobile-alerts-icon"><Bell size={18} /></span>
              <span className="admin-mobile-alerts-copy">
                <strong>{homeBadgeCount > 0 ? `${homeBadgeCount} alert${homeBadgeCount === 1 ? '' : 's'} need attention` : 'Alerts are clear'}</strong>
                <small>{homeBadgeCount > 0 ? 'Tap to see exactly what the red badge means' : birthdayTodayCount > 0 ? `${birthdayTodayCount} birthday${birthdayTodayCount === 1 ? '' : 's'} today` : 'Nothing new is waiting'}</small>
              </span>
              {homeBadgeCount > 0 && <b>{homeBadgeCount > 99 ? '99+' : homeBadgeCount}</b>}
              <ChevronRight className="admin-mobile-alerts-chevron" size={18} />
            </button>

            {mobileAlertsOpen && (
              <div className="admin-mobile-alert-list" id="admin-mobile-alert-list">
                {mobileAlertItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <a href={item.href} key={item.href}>
                      <span><Icon size={17} /></span>
                      <span>
                        <strong>{item.label}</strong>
                        <small>{item.detail || `${item.count} item${item.count === 1 ? '' : 's'} waiting`}</small>
                      </span>
                      <b>{item.count}</b>
                      <ChevronRight size={16} />
                    </a>
                  )
                })}
                {showBirthdayToday && (
                  <a href="/admin/birthdays" className="today">
                    <span><CakeSlice size={17} /></span>
                    <span><strong>Birthday today</strong><small>{birthdayPreview || `${birthdayTodayCount} camper birthday${birthdayTodayCount === 1 ? '' : 's'}`}</small></span>
                    <ChevronRight size={16} />
                  </a>
                )}
                {mobileAlertItems.length === 0 && !showBirthdayToday && (
                  <p><ShieldCheck size={17} /> You’re all caught up.</p>
                )}
                <AppBadgePermission label="automatic Home Screen alerts" staffApp="admin" />
              </div>
            )}
          </div>

          <a className="admin-sidebar-create" href="/admin/notifications">
            <Bell size={18} />
            <span>
              <strong>What needs attention?</strong>
              <small>Supplies, tickets, balances, messages</small>
            </span>
            {Number(attentionCounts['/admin/notifications'] || 0) > 0 && <b className="admin-attention-badge">{attentionCounts['/admin/notifications'] > 99 ? '99+' : attentionCounts['/admin/notifications']}</b>}
          </a>

          <SeasonalThemeCard theme={theme} />

          <nav className={`admin-sidebar-nav${mobileMenuOpen ? ' mobile-open' : ''}`}>
            {navGroups.map((group) => (
              <section key={group.label} className="admin-sidebar-group">
                <p>{group.label}</p>
                {group.links.map((link) => {
                  const Icon = link.icon
                  const active = isActiveLink(pathname, link.href)
                  const attentionCount = Number(attentionCounts[link.href] || 0)

                  return (
                    <a
                      key={link.href}
                      className={active ? 'active' : ''}
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon size={17} />
                      <span>{link.label}</span>
                      {attentionCount > 0 && <b className="admin-attention-badge" aria-label={`${attentionCount} item${attentionCount === 1 ? '' : 's'} need attention`}>{attentionCount > 99 ? '99+' : attentionCount}</b>}
                      {link.href === '/admin/community-feed' && <CommunityUnreadBadge syncHomeScreen={false} />}
                    </a>
                  )
                })}
              </section>
            ))}
          </nav>

          <div className="admin-sidebar-footer">
            <ShieldCheck size={15} />
            <span>Secure admin workspace</span>
          </div>
        </aside>

        <div className="admin-workspace-main">
          {pathname !== '/admin' && (
            <header className="admin-workspace-header">
              <nav>
                <a className="admin-workspace-brand" href="/admin">
                  <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
                  <span>
                    <strong>Bur Oaks</strong>
                    <small>Operations Center</small>
                  </span>
                </a>

                <div className="admin-workspace-nav-actions">
                  <form className="admin-global-search" action="/admin/system-health" method="get">
                    <Search size={15} />
                    <input name="q" aria-label="Search all admin records" placeholder="Search everything…" />
                  </form>
                  <span><ShieldCheck size={15} /> Admin workspace</span>
                  <a href="/admin"><Home size={17} /> Dashboard</a>
                </div>
              </nav>

              <div className="admin-workspace-title">
                <div>
                  <span><TentTree size={15} /> CAMPGROUND OPERATIONS</span>
                  <h1>{pageTitle}</h1>
                  <p>{isDetailPage ? 'Review and manage this record.' : 'Jump straight into the work that keeps Bur Oaks moving.'}</p>
                </div>
                <a href={isDetailPage ? `/admin/${section}` : '/admin'}>
                  <ArrowLeft size={17} /> {isDetailPage ? `Back to ${pageTitle}` : 'Back to dashboard'}
                </a>
              </div>
            </header>
          )}

          <div className="admin-workspace-content">{children}</div>

          <footer className="admin-workspace-footer">
            <span>Bur Oaks Campground</span>
            <span>Secure Admin Operations</span>
          </footer>
        </div>
      </div>
    </div>
  )
}
