'use client'

import { useEffect, useState } from 'react'
import { syncHomeScreenBadge } from '../lib/home-screen-badge'
import { supabase } from '../lib/supabase'

export default function CamperAttentionBadge() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let active = true

    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return

      const headers = { Authorization: `Bearer ${session.access_token}` }
      const portalResponse = await fetch('/api/camper-attention-summary', { headers })
      const portal = await portalResponse.json().catch(() => ({}))
      const nextCount = portalResponse.ok ? Number(portal.count || 0) : 0

      if (active) {
        setCount(nextCount)
        void syncHomeScreenBadge(nextCount)
      }
    }

    load()
    const interval = window.setInterval(load, 30_000)
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') load()
    }
    window.addEventListener('portal-attention-changed', load)
    window.addEventListener('focus', load)
    window.addEventListener('online', load)
    window.addEventListener('pageshow', load)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      active = false
      window.clearInterval(interval)
      window.removeEventListener('portal-attention-changed', load)
      window.removeEventListener('focus', load)
      window.removeEventListener('online', load)
      window.removeEventListener('pageshow', load)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  if (!count) return null
  return <b className="camper-community-badge" aria-label={`${count} portal item${count === 1 ? '' : 's'} needing attention`}>{count > 99 ? '99+' : count}</b>
}
