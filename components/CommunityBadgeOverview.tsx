'use client'

import { ArrowRight, BellRing, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const explanations = [
  { key: 'feed', href: '/community/feed', label: 'Community Feed', cause: 'new posts, comments, or likes', action: 'Open the feed to mark them viewed' },
  { key: 'birthdays', href: '/community/birthdays', label: 'Birthdays', cause: 'greetings or private surprises that still need attention', action: 'Send or post the birthday greeting' },
  { key: 'announcements', href: '/community/announcements', label: 'Announcements', cause: 'announcements added since the last review', action: 'Open Announcements to review them' },
  { key: 'events', href: '/community/events', label: 'Events', cause: 'upcoming events added since the last review', action: 'Open Events to review them' },
  { key: 'dinners', href: '/community/dinners', label: 'Saturday Dinners', cause: 'new or changed dinner responses', action: 'Open Saturday Dinners to review them' },
  { key: 'rsvps', href: '/community/rsvps', label: 'RSVPs', cause: 'new event responses', action: 'Open RSVPs to review them' },
] as const

type Counts = Record<(typeof explanations)[number]['key'], number>
const emptyCounts: Counts = { feed: 0, birthdays: 0, announcements: 0, events: 0, dinners: 0, rsvps: 0 }

export default function CommunityBadgeOverview() {
  const [counts, setCounts] = useState<Counts>(emptyCounts)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const response = await fetch('/api/community-workspace-summary', { cache: 'no-store', headers: { Authorization: `Bearer ${session.access_token}` } })
      const result = await response.json().catch(() => ({}))
      if (!active || !response.ok) return
      setCounts({ ...emptyCounts, ...(result.counts || {}) })
      setLoaded(true)
    }
    void load()
    const interval = window.setInterval(load, 30_000)
    window.addEventListener('community-workspace-changed', load)
    window.addEventListener('community-unread-changed', load)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('community-workspace-changed', load)
      window.removeEventListener('community-unread-changed', load)
    }
  }, [])

  const activeItems = explanations.filter((item) => counts[item.key] > 0)
  if (!loaded) return null

  return (
    <section className="community-badge-overview" aria-live="polite">
      <header><BellRing size={21} /><div><strong>What the badges mean</strong><p>Each red number shows exactly what is new or still needs action.</p></div></header>
      {activeItems.length ? (
        <div>
          {activeItems.map((item) => <a href={item.href} key={item.key}>
            <b>{counts[item.key] > 99 ? '99+' : counts[item.key]}</b>
            <span><strong>{item.label}: {item.cause}</strong><small>{item.action}. This clears only the account you are signed into.</small></span>
            <ArrowRight size={18} />
          </a>)}
        </div>
      ) : <p className="community-badge-clear"><CheckCircle2 size={18} /> No Community badges need attention.</p>}
    </section>
  )
}
