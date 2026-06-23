'use client'

import { ArrowLeft, LayoutDashboard, ShieldCheck, TentTree } from 'lucide-react'
import { usePathname } from 'next/navigation'

const pageNames: Record<string, string> = {
  campers: 'Camper Management',
  invoices: 'Invoices & Billing',
  'open-balance': 'Open Balances',
  electric: 'Electric Operations',
  maintenance: 'Maintenance Operations',
  lots: 'Lots & Sites',
  waitlist: 'Waitlist',
  events: 'Events',
  rsvps: 'RSVP Tracking',
  announcements: 'Announcements',
  texts: 'Text Alerts',
  documents: 'Documents',
  'email-test': 'Email Alert Test',
  gatecards: 'Gate Cards',
  directory: 'Camper Directory',
  'archived-campers': 'Camper Archive',
  'individual-invoices': 'Individual Invoices',
}

export default function AdminChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  if (pathname === '/admin') return <>{children}</>

  const section = pathname.split('/')[2] || ''
  const pageTitle = pageNames[section] || 'Operations'
  const isDetailPage = pathname.split('/').filter(Boolean).length > 2

  return (
    <div className="admin-workspace-page">
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
            <a href="/admin"><LayoutDashboard size={17} /> Dashboard</a>
          </div>
        </nav>

        <div className="admin-workspace-title">
          <div>
            <span><TentTree size={15} /> CAMPGROUND OPERATIONS</span>
            <h1>{pageTitle}</h1>
            <p>{isDetailPage ? 'Review and manage this record.' : 'Everything you need to keep this part of Bur Oaks running smoothly.'}</p>
          </div>
          <a href={isDetailPage ? `/admin/${section}` : '/admin'}>
            <ArrowLeft size={17} /> {isDetailPage ? `Back to ${pageTitle}` : 'Back to dashboard'}
          </a>
        </div>
      </header>

      <div className="admin-workspace-content">{children}</div>

      <footer className="admin-workspace-footer">
        <span>Bur Oaks Campground</span>
        <span>Secure Admin Operations</span>
      </footer>
    </div>
  )
}
