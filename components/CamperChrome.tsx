'use client'

import {
  ArrowLeft,
  CalendarDays,
  FileText,
  Home,
  Map,
  MapPin,
  Menu,
  MessageCircle,
  ReceiptText,
  Soup,
  TentTree,
  UserRound,
  UsersRound,
  Wrench,
  X,
  Zap,
} from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { getSeasonalTheme } from '../lib/seasonal-theme'
import LiveChatWidget from './PublicLiveChat'
import SeasonalThemeCard from './SeasonalThemeCard'

const camperPages: Record<string, string> = {
  '/portal': 'Portal Home',
  '/invoices': 'Invoices & AutoPay',
  '/profile': 'Camper Profile',
  '/messages': 'Chat with the Office',
  '/documents': 'My Documents',
  '/electric': 'Electric Usage',
  '/calendar': 'Events Calendar',
  '/portal/events': 'Event Details',
  '/dinners': 'Saturday Dinners',
  '/directory': 'Camper Directory',
  '/site': 'My Site',
  '/maintenance': 'Maintenance Requests',
  '/maintenance/history': 'Maintenance History',
}

const camperNav = [
  { href: '/portal', label: 'Portal Home', note: 'Weekend snapshot', icon: Home },
  { href: '/invoices', label: 'Invoices', note: 'Pay or AutoPay', icon: ReceiptText },
  { href: '/messages', label: 'Chat with the Office', note: 'Private messages', icon: MessageCircle },
  { href: '/maintenance', label: 'Maintenance', note: 'Requests & status', icon: Wrench },
  { href: '/documents', label: 'Documents', note: 'Leases & files', icon: FileText },
  { href: '/electric', label: 'Electric', note: 'Usage history', icon: Zap },
  { href: '/dinners', label: 'Dinners', note: 'Menu & bringing', icon: Soup },
  { href: '/calendar', label: 'Events', note: 'What is coming up', icon: CalendarDays },
  { href: '/site', label: 'My Site', note: 'Lot details', icon: MapPin },
  { href: '/directory', label: 'Directory', note: 'Opt-in neighbors', icon: UsersRound },
  { href: '/profile', label: 'Profile', note: 'Contact & vehicles', icon: UserRound },
]

function isActiveLink(pathname: string, href: string) {
  if (href === '/portal') return pathname === '/portal'
  return pathname === href || pathname.startsWith(`${href}/`)
}

export default function CamperChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const title = camperPages[pathname]
  const theme = getSeasonalTheme()

  if (!title) return <>{children}</>

  const isPortalHome = pathname === '/portal'
  const backHref = pathname === '/maintenance/history' ? '/maintenance' : '/portal'
  const backLabel = pathname === '/maintenance/history' ? 'Back to maintenance' : 'Back to portal'

  return (
    <div className={`camper-workspace-page seasonal-theme seasonal-theme-${theme.key}${isPortalHome ? ' camper-workspace-home-page' : ''}`}>
      <div className="camper-workspace-shell">
        <aside className="camper-sidebar" aria-label="Camper portal navigation">
          <div className="camper-sidebar-mobile-head">
            <a className="camper-sidebar-brand" href="/portal">
              <img src="/bur-oaks-logo.png" alt="" />
              <span>
                <strong>Bur Oaks</strong>
                <small>Camper Portal</small>
              </span>
            </a>
            <button
              type="button"
              className="camper-sidebar-menu-button"
              aria-label={mobileMenuOpen ? 'Close camper menu' : 'Open camper menu'}
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen((open) => !open)}
            >
              {mobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
              <span>{mobileMenuOpen ? 'Close' : 'Menu'}</span>
            </button>
          </div>

          <a className="camper-sidebar-feature" href="/portal">
            <TentTree size={18} />
            <span>
              <strong>Back to your home base</strong>
              <small>Weather, alerts, pump-out, events, and quick actions</small>
            </span>
          </a>

          <SeasonalThemeCard theme={theme} />

          <nav className={`camper-sidebar-nav${mobileMenuOpen ? ' mobile-open' : ''}`}>
            {camperNav.map((link) => {
              const Icon = link.icon
              const active = isActiveLink(pathname, link.href)

              return (
                <a key={link.href} className={active ? 'active' : ''} href={link.href} aria-current={active ? 'page' : undefined}>
                  <Icon size={17} />
                  <span>
                    <strong>{link.label}</strong>
                    <small>{link.note}</small>
                  </span>
                </a>
              )
            })}
          </nav>

          <div className="camper-sidebar-footer">
            <Map size={15} />
            <span>Everything for your stay, one tap away.</span>
          </div>
        </aside>

        <div className="camper-workspace-main">
          {!isPortalHome && (
            <header className="camper-workspace-header">
              <nav>
                <a className="camper-workspace-brand" href="/portal">
                  <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
                  <span><strong>Bur Oaks</strong><small>Camper Portal</small></span>
                </a>
                <a className="camper-workspace-home" href="/portal"><Home size={17} /> Portal home</a>
              </nav>
              <div className="camper-workspace-title">
                <div>
                  <span><TentTree size={15} /> YOUR CAMPGROUND HOME BASE</span>
                  <h1>{title}</h1>
                  <p>Everything you need for your stay, kept simple and close at hand.</p>
                </div>
                <a href={backHref}><ArrowLeft size={17} /> {backLabel}</a>
              </div>
            </header>
          )}

          <div className="camper-workspace-content">{children}</div>
          {!isPortalHome && (
            <footer className="camper-workspace-footer">
              <span><MapPin size={13} /> Bur Oaks Campground</span>
              <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span>
            </footer>
          )}
          <LiveChatWidget />
        </div>
      </div>
    </div>
  )
}
