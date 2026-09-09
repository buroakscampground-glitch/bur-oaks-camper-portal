'use client'

import { Bell, CheckCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
}

function applicationServerKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4)
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)))
}

export default function AppBadgePermission({
  label = 'Community counts',
  staffBackground = false,
}: {
  label?: string
  staffBackground?: boolean
}) {
  const [available, setAvailable] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<'ready' | 'working' | 'denied' | 'error'>('ready')

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    const supported = standalone && 'Notification' in window && 'setAppBadge' in navigator
    setAvailable(supported)
    if (!supported) return
    if (staffBackground && Notification.permission === 'granted') {
      void enableStaffBackground(false)
    } else if (!staffBackground && Notification.permission === 'granted') {
      setEnabled(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffBackground])

  async function authHeaders() {
    const { data: { session } } = await supabase.auth.getSession()
    return { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }

  async function enableStaffBackground(askPermission: boolean) {
    try {
      setStatus('working')
      if (askPermission && Notification.permission === 'default') await Notification.requestPermission()
      if (Notification.permission !== 'granted') {
        setStatus('denied')
        return
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Background alerts are not supported on this phone.')

      const headers = await authHeaders()
      const keyResponse = await fetch('/api/staff-push-subscription', { headers, cache: 'no-store' })
      const keyResult = await keyResponse.json().catch(() => ({}))
      if (!keyResponse.ok || !keyResult.publicKey) throw new Error(keyResult.error || 'Background alerts are not ready.')

      const registration = await navigator.serviceWorker.register('/staff-sw.js', { scope: '/' })
      await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(keyResult.publicKey) })
      }
      const saveResponse = await fetch('/api/staff-push-subscription', {
        method: 'POST',
        headers,
        body: JSON.stringify({ subscription: subscription.toJSON() }),
      })
      const saveResult = await saveResponse.json().catch(() => ({}))
      if (!saveResponse.ok) throw new Error(saveResult.error || 'Unable to save background alerts.')
      setEnabled(true)
      setStatus('ready')
      window.dispatchEvent(new Event('community-unread-changed'))
      window.dispatchEvent(new Event('community-workspace-changed'))
      window.dispatchEvent(new Event('portal-attention-changed'))
    } catch (error) {
      console.error('Background staff alerts could not be enabled:', error)
      setStatus('error')
    }
  }

  async function enableBadge() {
    if (staffBackground) {
      await enableStaffBackground(true)
      return
    }
    setStatus('working')
    const permission = await Notification.requestPermission()
    if (permission === 'granted') {
      setEnabled(true)
      setStatus('ready')
      window.dispatchEvent(new Event('community-unread-changed'))
      window.dispatchEvent(new Event('community-workspace-changed'))
      window.dispatchEvent(new Event('portal-attention-changed'))
      return
    }
    setStatus('denied')
  }

  if (!available) return null

  return (
    <div className={`admin-app-badge-permission${enabled ? ' enabled' : ''}`}>
      <span>{enabled ? <CheckCircle2 size={17} /> : <Bell size={17} />} {enabled
        ? staffBackground ? 'Background app badges are on for this phone.' : `${label} can appear on this Home Screen icon.`
        : staffBackground ? `Show ${label} even while the app is closed.` : `Show ${label} on the Bur Oaks Home Screen icon.`}</span>
      {!enabled && <button type="button" onClick={enableBadge} disabled={status === 'working'}>
        {status === 'working' ? 'Turning on…' : status === 'denied' ? 'Allow notifications in phone Settings' : status === 'error' ? 'Try background alerts again' : staffBackground ? 'Turn on automatic badges' : 'Turn on red badge'}
      </button>}
    </div>
  )
}
