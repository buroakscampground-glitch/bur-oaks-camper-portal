'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

async function syncHomeScreenBadge(count: number) {
  const badgeNavigator = navigator as BadgeNavigator

  try {
    if (count > 0 && badgeNavigator.setAppBadge) {
      await badgeNavigator.setAppBadge(count)
    } else if (count === 0 && badgeNavigator.clearAppBadge) {
      await badgeNavigator.clearAppBadge()
    }
  } catch {
    // iPhone only displays Home Screen badges after notification permission is granted.
  }
}

export default function CommunityUnreadBadge() {
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
        void syncHomeScreenBadge(nextCount)
      }
    }
    load()
    const interval = window.setInterval(load, 30_000)
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
  }, [])

  if (!count) return null
  return <b className="camper-community-badge" aria-label={`${count} unread Community alert${count === 1 ? '' : 's'}`}>{count > 99 ? '99+' : count}</b>
}
