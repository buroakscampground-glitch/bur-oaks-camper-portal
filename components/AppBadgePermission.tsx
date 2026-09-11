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

function withTimeout<T>(promise: PromiseLike<T>, message: string, milliseconds = 12000) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), milliseconds)
    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeout)
        resolve(value)
      },
      (error) => {
        window.clearTimeout(timeout)
        reject(error)
      },
    )
  })
}

async function waitForActiveWorker(registration: ServiceWorkerRegistration) {
  if (registration.active) return
  const worker = registration.installing || registration.waiting
  if (!worker) throw new Error('The background alert connection did not start. Please try again.')

  await withTimeout(new Promise<void>((resolve, reject) => {
    const checkState = () => {
      if (registration.active || worker.state === 'activated') {
        worker.removeEventListener('statechange', checkState)
        resolve()
      } else if (worker.state === 'redundant') {
        worker.removeEventListener('statechange', checkState)
        reject(new Error('The background alert connection was replaced. Please try again.'))
      }
    }
    worker.addEventListener('statechange', checkState)
    checkState()
  }), 'Background alert setup took too long. Please try again.')
}

export default function AppBadgePermission({
  label = 'Community counts',
  staffApp,
}: {
  label?: string
  staffApp?: 'admin' | 'community'
}) {
  const [available, setAvailable] = useState(false)
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<'ready' | 'working' | 'denied' | 'error'>('ready')
  const [detail, setDetail] = useState('')

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    const supported = standalone && 'Notification' in window && 'setAppBadge' in navigator
    setAvailable(supported)
    if (!supported) return
    if (staffApp && Notification.permission === 'granted') {
      void enableStaffBackground(false)
    } else if (!staffApp && Notification.permission === 'granted') {
      setEnabled(true)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffApp])

  async function authHeaders() {
    const { data: { session } } = await withTimeout(
      supabase.auth.getSession(),
      'Your sign-in could not be checked. Please try again.',
    )
    return { Authorization: `Bearer ${session?.access_token || ''}`, 'Content-Type': 'application/json' }
  }

  async function removeLegacyWorker(headers: Record<string, string>) {
    try {
      const legacyRegistration = await withTimeout(
        navigator.serviceWorker.getRegistration('/'),
        'The old alert connection took too long to check.',
        6000,
      )
      const scriptPath = legacyRegistration?.active ? new URL(legacyRegistration.active.scriptURL).pathname : ''
      if (legacyRegistration && scriptPath === '/staff-sw.js') {
        const legacySubscription = await withTimeout(
          legacyRegistration.pushManager.getSubscription(),
          'The old alert connection took too long to check.',
          6000,
        )
        if (legacySubscription) {
          await withTimeout(fetch('/api/staff-push-subscription', {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ endpoint: legacySubscription.endpoint }),
          }), 'The old alert connection took too long to remove.', 6000).catch(() => undefined)
          await withTimeout(legacySubscription.unsubscribe(), 'The old alert connection took too long to remove.', 6000).catch(() => false)
        }
        await withTimeout(legacyRegistration.unregister(), 'The old alert connection took too long to remove.', 6000).catch(() => false)
      }
    } catch (error) {
      console.warn('The legacy staff alert connection will be cleaned up later:', error)
    }
  }

  async function enableStaffBackground(askPermission: boolean) {
    try {
      setStatus('working')
      setDetail('')
      if (askPermission && Notification.permission === 'default') await Notification.requestPermission()
      if (Notification.permission !== 'granted') {
        setStatus('denied')
        setDetail('Notifications are blocked for this app. Open iPhone Settings, choose Notifications, then Bur Oaks, and turn on Allow Notifications.')
        return
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('Background alerts are not supported on this phone.')

      const headers = await authHeaders()
      const keyResponse = await withTimeout(
        fetch('/api/staff-push-subscription', { headers, cache: 'no-store' }),
        'Background alerts took too long to connect. Please try again.',
      )
      const keyResult = await keyResponse.json().catch(() => ({}))
      if (!keyResponse.ok || !keyResult.publicKey) throw new Error(keyResult.error || 'Background alerts are not ready.')

      const app = staffApp || 'community'
      const registration = await withTimeout(
        navigator.serviceWorker.register(`/${app}/staff-sw.js`, { scope: `/${app}/` }),
        'Background alerts took too long to connect. Please try again.',
      )
      await waitForActiveWorker(registration)
      let subscription = await withTimeout(
        registration.pushManager.getSubscription(),
        'Background alerts took too long to check. Please try again.',
      )
      if (!subscription) {
        subscription = await withTimeout(
          registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(keyResult.publicKey) }),
          'Background alerts took too long to connect. Please try again.',
          15000,
        )
      }
      const saveResponse = await withTimeout(fetch('/api/staff-push-subscription', {
        method: 'POST',
        headers,
        body: JSON.stringify({ app, subscription: subscription.toJSON() }),
      }), 'Background alerts took too long to save. Please try again.')
      const saveResult = await saveResponse.json().catch(() => ({}))
      if (!saveResponse.ok) throw new Error(saveResult.error || 'Unable to save background alerts.')
      setEnabled(true)
      setStatus('ready')
      void removeLegacyWorker(headers)
      window.dispatchEvent(new Event('community-unread-changed'))
      window.dispatchEvent(new Event('community-workspace-changed'))
      window.dispatchEvent(new Event('portal-attention-changed'))
    } catch (error) {
      console.error('Background staff alerts could not be enabled:', error)
      setStatus('error')
      setDetail(error instanceof Error ? error.message : 'Background alerts could not be enabled. Please try again.')
    }
  }

  async function enableBadge() {
    if (staffApp) {
      await enableStaffBackground(true)
      return
    }
    setStatus('working')
    setDetail('')
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
    setDetail('Notifications are blocked for this app. Open iPhone Settings, choose Notifications, then Bur Oaks, and turn on Allow Notifications.')
  }

  if (!available) return null

  return (
    <div className={`admin-app-badge-permission${enabled ? ' enabled' : ''}`}>
      <span>{enabled ? <CheckCircle2 size={17} /> : <Bell size={17} />} {enabled
        ? staffApp ? 'Background app badges are on for this phone.' : `${label} can appear on this Home Screen icon.`
        : staffApp ? `Show ${label} even while the app is closed.` : `Show ${label} on the Bur Oaks Home Screen icon.`}</span>
      {!enabled && <button type="button" onClick={enableBadge} disabled={status === 'working'}>
        {status === 'working' ? 'Turning on…' : status === 'denied' ? 'Allow notifications in phone Settings' : status === 'error' ? 'Try background alerts again' : staffApp ? 'Turn on automatic badges' : 'Turn on red badge'}
      </button>}
      {detail && <small role="alert">{detail}</small>}
    </div>
  )
}
