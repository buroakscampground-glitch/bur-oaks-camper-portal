'use client'

import { CakeSlice, CalendarDays, ClipboardList, Home, LogOut, Megaphone, Menu, Soup, Sparkles, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { supabase } from '../lib/supabase'

const links = [
  { href: '/community', label: 'Community Home', icon: Home },
  { href: '/community/birthdays', label: 'Birthdays', icon: CakeSlice },
  { href: '/community/announcements', label: 'Announcements', icon: Megaphone },
  { href: '/community/events', label: 'Events', icon: CalendarDays },
  { href: '/community/dinners', label: 'Saturday Dinners', icon: Soup },
  { href: '/community/rsvps', label: 'RSVPs', icon: ClipboardList },
]

function active(pathname: string, href: string) {
  return href === '/community' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

export default function CommunityChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

  async function logout() {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  return (
    <div className="community-workspace">
      <aside className="community-sidebar" aria-label="Event coordinator navigation">
        <div className="community-sidebar-head">
          <a href="/community"><img src="/bur-oaks-logo.png" alt="" /><span><strong>Bur Oaks</strong><small>Community Center</small></span></a>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close community menu' : 'Open community menu'}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />} <span>{menuOpen ? 'Close' : 'Menu'}</span>
          </button>
        </div>
        <div className="community-role-card"><Sparkles size={20} /><span><strong>Event Coordinator</strong><small>Community tools only</small></span></div>
        <nav className={menuOpen ? 'open' : ''}>
          {links.map((link) => {
            const Icon = link.icon
            return <a className={active(pathname, link.href) ? 'active' : ''} href={link.href} key={link.href}><Icon size={18} /> {link.label}</a>
          })}
        </nav>
        <button className="community-logout" type="button" onClick={logout}><LogOut size={17} /> Log out</button>
      </aside>
      <div className="community-main">
        <header><span>BUR OAKS COMMUNITY</span><strong>Events, celebrations, and camper fun.</strong></header>
        <div className="community-content">{children}</div>
        <footer>Event Coordinator Workspace · No billing or maintenance access</footer>
      </div>
    </div>
  )
}
