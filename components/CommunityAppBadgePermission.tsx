'use client'

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import AppBadgePermission from './AppBadgePermission'

export default function CommunityAppBadgePermission() {
  const [role, setRole] = useState('')

  useEffect(() => {
    let active = true

    async function loadRole() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const response = await fetch('/api/login-destination', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await response.json().catch(() => ({}))
      if (active && response.ok) setRole(String(result.role || '').toLowerCase())
    }

    void loadRole()
    return () => { active = false }
  }, [])

  if (!role) return null
  if (role === 'admin') return <AppBadgePermission label="your Admin alerts" staffApp="admin" />
  return <AppBadgePermission label="your Event Coordinator alerts" staffApp="community" />
}
