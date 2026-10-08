'use client'

import { Wifi, WifiOff } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

type ConnectionState = 'online' | 'offline' | 'restored'

export default function ConnectionStatus() {
  const [connectionState, setConnectionState] = useState<ConnectionState>('online')
  const wasOffline = useRef(false)
  const restoredTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const clearRestoredTimer = () => {
      if (restoredTimer.current) clearTimeout(restoredTimer.current)
      restoredTimer.current = null
    }
    const handleOffline = () => {
      clearRestoredTimer()
      wasOffline.current = true
      setConnectionState('offline')
    }
    const handleOnline = () => {
      clearRestoredTimer()
      if (!wasOffline.current) {
        setConnectionState('online')
        return
      }
      wasOffline.current = false
      setConnectionState('restored')
      restoredTimer.current = setTimeout(() => setConnectionState('online'), 5000)
    }

    if (!navigator.onLine) handleOffline()
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    return () => {
      clearRestoredTimer()
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  if (connectionState === 'online') {
    return <span className="global-connection-monitor" data-ready="true" hidden aria-hidden="true" />
  }

  const offline = connectionState === 'offline'
  return (
    <aside
      className={`global-connection-status ${offline ? 'offline' : 'restored'}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      {offline ? <WifiOff size={20} aria-hidden="true" /> : <Wifi size={20} aria-hidden="true" />}
      <span>
        <strong>{offline ? 'Connection lost' : 'Connection restored'}</strong>
        <small>
          {offline
            ? 'Unsaved changes may not have reached Bur Oaks. Reconnect and check the page before trying again.'
            : 'Check the page before repeating a payment, message, or request.'}
        </small>
      </span>
    </aside>
  )
}
