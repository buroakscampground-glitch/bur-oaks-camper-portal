'use client'

import { ArrowLeft, Home, MapPin, TentTree } from 'lucide-react'
import { usePathname } from 'next/navigation'

const camperPages: Record<string, string> = {
  '/profile': 'Camper Profile',
  '/documents': 'My Documents',
  '/electric': 'Electric Usage',
  '/calendar': 'Events Calendar',
  '/directory': 'Camper Directory',
  '/maintenance': 'Maintenance Requests',
  '/maintenance/history': 'Maintenance History',
}

export default function CamperChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const title = camperPages[pathname]

  if (!title) return <>{children}</>

  const backHref = pathname === '/maintenance/history' ? '/maintenance' : '/portal'
  const backLabel = pathname === '/maintenance/history' ? 'Back to maintenance' : 'Back to portal'

  return (
    <div className="camper-workspace-page">
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

      <div className="camper-workspace-content">{children}</div>
      <footer className="camper-workspace-footer">
        <span><MapPin size={13} /> Bur Oaks Campground</span>
        <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a></span>
      </footer>
    </div>
  )
}
