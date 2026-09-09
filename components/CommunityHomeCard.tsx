'use client'

import { UsersRound } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function CommunityHomeCard() {
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const response = await fetch('/api/community-feed?mode=summary', { headers: { Authorization: `Bearer ${session.access_token}` } })
      if (!response.ok) return
      const result = await response.json().catch(() => ({}))
      setUnread(Number(result.unreadCount || 0) + Number(result.directCount || 0))
    }
    load()
  }, [])

  return (
    <a className={unread > 0 ? 'attention portal-community-action' : 'portal-community-action'} href="/campground-community">
      <UsersRound size={20} />
      <span><small>{unread > 0 ? 'Community activity' : 'Community'}</small><strong>{unread > 0 ? `${unread} new` : 'Join the conversation'}</strong></span>
    </a>
  )
}
