'use client'

import { BellRing, CakeSlice, CalendarDays, ClipboardList, Home, LogOut, Megaphone, Menu, Soup, Sparkles, UsersRound, X } from 'lucide-react'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { syncHomeScreenBadge } from '../lib/home-screen-badge'
import { getSeasonalTheme } from '../lib/seasonal-theme'
import { supabase } from '../lib/supabase'
import { removeStaffPushFromThisPhone } from '../lib/staff-push-client'
import SeasonalThemeCard from './SeasonalThemeCard'

const links = [
  { href: '/community', label: 'Community Home', icon: Home, countKey: 'total' },
  { href: '/community/feed', label: 'Community Feed', icon: UsersRound, countKey: 'feed' },
  { href: '/community/birthdays', label: 'Birthdays', icon: CakeSlice, countKey: 'birthdays' },
  { href: '/community/announcements', label: 'Announcements', icon: Megaphone, countKey: 'announcements' },
  { href: '/community/events', label: 'Events', icon: CalendarDays, countKey: 'events' },
  { href: '/community/dinners', label: 'Saturday Dinners', icon: Soup, countKey: 'dinners' },
  { href: '/community/rsvps', label: 'RSVPs', icon: ClipboardList, countKey: 'rsvps' },
]

type CommunityCounts = Record<(typeof links)[number]['countKey'], number>

const emptyCounts: CommunityCounts = {
  total: 0,
  feed: 0,
  birthdays: 0,
  announcements: 0,
  events: 0,
  dinners: 0,
  rsvps: 0,
}

const badgeHelp = {
  '/community/feed': { title: 'New Community activity', detail: 'The badge counts new posts, comments, and likes. Opening the feed marks that activity viewed.' },
  '/community/birthdays': { title: 'Birthday greeting needs attention', detail: 'The badge stays until the birthday greeting or private portal surprise is handled.' },
  '/community/announcements': { title: 'Announcements to review', detail: 'The badge counts announcements added since Rachel last opened this page. Opening it clears the badge.' },
  '/community/events': { title: 'Events to review', detail: 'The badge counts upcoming events added since Rachel last opened this page. Opening it clears the badge.' },
  '/community/dinners': { title: 'New dinner responses', detail: 'The badge counts new or changed responses for the next dinner. Opening this page clears the badge.' },
  '/community/rsvps': { title: 'New event responses', detail: 'The badge counts event RSVPs received since Rachel last opened this page. Opening it clears the badge.' },
} as const

const viewedSections = {
  '/community/announcements': 'announcements',
  '/community/events': 'events',
  '/community/dinners': 'dinners',
  '/community/rsvps': 'rsvps',
} as const

function active(pathname: string, href: string) {
  return href === '/community' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`)
}

export default function CommunityChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const [counts, setCounts] = useState<CommunityCounts>(emptyCounts)
  const [portalRole, setPortalRole] = useState('')
  const theme = getSeasonalTheme()

  useEffect(() => {
    let activeRequest = true

    async function loadCounts() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const response = await fetch('/api/community-workspace-summary', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await response.json().catch(() => ({}))
      if (!activeRequest || !response.ok) return

      const nextCounts = { ...emptyCounts, ...(result.counts || {}), total: Number(result.total || 0) }
      setCounts(nextCounts)
      setPortalRole(String(result.role || '').toLowerCase())
      void syncHomeScreenBadge(nextCounts.total)
    }

    loadCounts()
    const interval = window.setInterval(loadCounts, 30_000)
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadCounts()
    }
    window.addEventListener('community-unread-changed', loadCounts)
    window.addEventListener('community-workspace-changed', loadCounts)
    window.addEventListener('focus', loadCounts)
    window.addEventListener('online', loadCounts)
    window.addEventListener('pageshow', loadCounts)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      activeRequest = false
      window.clearInterval(interval)
      window.removeEventListener('community-unread-changed', loadCounts)
      window.removeEventListener('community-workspace-changed', loadCounts)
      window.removeEventListener('focus', loadCounts)
      window.removeEventListener('online', loadCounts)
      window.removeEventListener('pageshow', loadCounts)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [])

  useEffect(() => {
    const sectionPath = Object.keys(viewedSections).find((path) => pathname === path || pathname.startsWith(`${path}/`)) as keyof typeof viewedSections | undefined
    if (!sectionPath) return
    let cancelled = false

    async function markSectionViewed() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token || cancelled) return
      const response = await fetch('/api/community-workspace-summary', {
        method: 'POST',
        headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: viewedSections[sectionPath!] }),
      })
      if (response.ok && !cancelled) window.dispatchEvent(new Event('community-workspace-changed'))
    }

    void markSectionViewed()
    return () => { cancelled = true }
  }, [pathname])

  async function logout() {
    await removeStaffPushFromThisPhone()
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  const activeHelpPath = Object.keys(badgeHelp).find((path) => pathname === path || pathname.startsWith(`${path}/`)) as keyof typeof badgeHelp | undefined
  const activeHelp = activeHelpPath ? badgeHelp[activeHelpPath] : null

  if (pathname === '/community/talk' || pathname.startsWith('/community/talk/')) {
    return (
      <div className="community-talk-workspace">
        <header className="community-talk-header">
          <a href="/community/talk"><img src="/bur-oaks-logo.png" alt="" /><span><strong>Bur Oaks Community</strong><small>Campground conversation</small></span></a>
          <button type="button" onClick={logout}><LogOut size={17} /> Log out</button>
        </header>
        <div className="community-talk-content">{children}</div>
      </div>
    )
  }

  return (
    <div className={`community-workspace seasonal-theme seasonal-theme-${theme.key}`}>
      <aside className="community-sidebar" aria-label="Event coordinator navigation">
        <div className="community-sidebar-head">
          <a href="/community"><img src="/bur-oaks-logo.png" alt="" /><span><strong>Bur Oaks</strong><small>Community Center</small></span></a>
          <button type="button" onClick={() => setMenuOpen((open) => !open)} aria-label={menuOpen ? 'Close community menu' : 'Open community menu'}>
            {menuOpen ? <X size={20} /> : <Menu size={20} />} <span>{menuOpen ? 'Close' : 'Menu'}</span>
          </button>
        </div>
        <div className="community-role-card"><Sparkles size={20} /><span><strong>{portalRole === 'admin' ? 'Full Admin' : 'Event Coordinator'}</strong><small>Community workspace</small></span></div>
        <SeasonalThemeCard theme={theme} />
        <nav className={menuOpen ? 'open' : ''}>
          {portalRole === 'admin' && <a href="/admin"><Home size={18} /> <span>Admin Command Center</span></a>}
          {links.map((link) => {
            const Icon = link.icon
            const count = counts[link.countKey]
            return <a className={active(pathname, link.href) ? 'active' : ''} href={link.href} key={link.href}><Icon size={18} /> <span>{link.label}</span>{count > 0 && <b className="camper-community-badge" aria-label={`${count} ${link.label} item${count === 1 ? '' : 's'}`}>{count > 99 ? '99+' : count}</b>}</a>
          })}
        </nav>
        <button className="community-logout" type="button" onClick={logout}><LogOut size={17} /> Log out</button>
      </aside>
      <div className="community-main">
        <header><span>BUR OAKS COMMUNITY</span><strong>Events, celebrations, and camper fun.</strong></header>
        <div className="community-content">
          {activeHelp && <aside className="community-badge-help"><BellRing size={19} /><div><strong>{activeHelp.title}</strong><p>{activeHelp.detail}</p></div></aside>}
          {children}
        </div>
        <footer>Community Workspace · Full admins can return to the Admin Command Center anytime</footer>
      </div>
    </div>
  )
}
