'use client'

import {
  Archive,
  ArrowLeft,
  Bell,
  BookOpen,
  CalendarDays,
  CalendarClock,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  FileText,
  Hammer,
  Home,
  KeyRound,
  LayoutDashboard,
  Mail,
  Map,
  Menu,
  Megaphone,
  MessageCircle,
  ReceiptText,
  Rocket,
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
import { usePathname } from 'next/navigation'
import { useState } from 'react'

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
  settings: 'Campground Settings',
  'pump-outs': 'Pump-Out Requests',
  'site-care': 'Site Care Notices',
  renewals: 'Season Renewal Forecast',
}

const navGroups = [
  {
    label: 'Today',
    links: [
      { href: '/admin', label: 'Command Center', icon: LayoutDashboard },
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
      { href: '/admin/credits', label: 'Credits', icon: WalletCards },
      { href: '/admin/reports', label: 'Reports', icon: ClipboardList },
    ],
  },
  {
    label: 'Campers',
    links: [
      { href: '/admin/campers', label: 'Camper Records', icon: Users },
      { href: '/admin/renewals', label: 'Renewal Forecast', icon: CalendarClock },
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
      { href: '/admin/dinners', label: 'Saturday Dinners', icon: Utensils },
      { href: '/admin/events', label: 'Events', icon: CalendarDays },
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
  if (href === '/admin/maintenance') {
    return pathname === href || (
      pathname.startsWith(`${href}/`) &&
      !pathname.startsWith('/admin/maintenance/supplies') &&
      !pathname.startsWith('/admin/maintenance/inventory')
    )
  }
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const section = pathname.split('/')[2] || ''
  const pageTitle = pathname === '/admin' ? 'Operations Dashboard' : pageNames[section] || 'Operations'
  const isDetailPage = pathname.split('/').filter(Boolean).length > 2

  return (
    <div className="admin-workspace-page">
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

          <a className="admin-sidebar-create" href="/admin/notifications">
            <Bell size={18} />
            <span>
              <strong>What needs attention?</strong>
              <small>Supplies, tickets, balances, pump-outs</small>
            </span>
          </a>

          <nav className={`admin-sidebar-nav${mobileMenuOpen ? ' mobile-open' : ''}`}>
            {navGroups.map((group) => (
              <section key={group.label} className="admin-sidebar-group">
                <p>{group.label}</p>
                {group.links.map((link) => {
                  const Icon = link.icon
                  const active = isActiveLink(pathname, link.href)

                  return (
                    <a
                      key={link.href}
                      className={active ? 'active' : ''}
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                    >
                      <Icon size={17} />
                      <span>{link.label}</span>
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
