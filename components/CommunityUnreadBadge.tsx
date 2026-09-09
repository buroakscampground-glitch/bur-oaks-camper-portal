'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CommunityUnreadBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let active = true
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const response = await fetch('/api/community-feed?mode=summary', { headers: { Authorization: `Bearer ${session.access_token}` } })
      const result = await response.json().catch(() => ({}))
      if (active && response.ok) setCount(Number(result.unreadCount || 0) + Number(result.directCount || 0))
    }
    load()
    window.addEventListener('community-unread-changed', load)
    return () => { active = false; window.removeEventListener('community-unread-changed', load) }
  }, [])

  if (!count) return null
  return <b className="camper-community-badge" aria-label={`${count} unread Community alert${count === 1 ? '' : 's'}`}>{count > 99 ? '99+' : count}</b>
}
