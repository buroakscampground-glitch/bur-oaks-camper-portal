'use client'

import { useEffect, useState } from 'react'
import { syncHomeScreenBadge } from '../lib/home-screen-badge'
import { supabase } from '../lib/supabase'

export default function CommunityUnreadBadge({ syncHomeScreen = true }: { syncHomeScreen?: boolean }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const response = await fetch('/api/community-feed?mode=summary', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const result = await response.json().catch(() => ({}))
      if (active && response.ok) {
        const nextCount = Number(result.unreadCount || 0) + Number(result.directCount || 0)
        setCount(nextCount)
        if (syncHomeScreen) void syncHomeScreenBadge(nextCount)
      }
    }
    load()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') load()
    }, 5 * 60_000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }
    window.addEventListener('community-unread-changed', load)
    window.addEventListener('focus', load)
    window.addEventListener('online', load)
    window.addEventListener('pageshow', load)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('community-unread-changed', load)
      window.removeEventListener('focus', load)
      window.removeEventListener('online', load)
      window.removeEventListener('pageshow', load)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [syncHomeScreen])

  if (!count) return null
  return <b className="camper-community-badge" aria-label={`${count} unread Community alert${count === 1 ? '' : 's'}`}>{count > 99 ? '99+' : count}</b>
}
