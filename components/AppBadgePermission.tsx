'use client'

import { Bell } from 'lucide-react'
import { useEffect, useState } from 'react'

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
}

export default function AppBadgePermission({ label = 'Community counts' }: { label?: string }) {
  const [available, setAvailable] = useState(false)
  const [status, setStatus] = useState<'ready' | 'working' | 'denied'>('ready')

  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
    setAvailable(standalone && 'Notification' in window && 'setAppBadge' in navigator && Notification.permission === 'default')
  }, [])

  async function enableBadge() {
    setStatus('working')
    const permission = await Notification.requestPermission()

    if (permission === 'granted') {
      setAvailable(false)
      window.dispatchEvent(new Event('community-unread-changed'))
      window.dispatchEvent(new Event('portal-attention-changed'))
      return
    }

    setStatus('denied')
  }

  if (!available) return null

  return (
    <div className="admin-app-badge-permission">
      <span><Bell size={17} /> Show {label} on the Bur Oaks Home Screen icon.</span>
      <button type="button" onClick={enableBadge} disabled={status === 'working'}>
        {status === 'working' ? 'Turning on…' : status === 'denied' ? 'Not allowed in iPhone Settings' : 'Turn on red badge'}
      </button>
    </div>
  )
}
