'use client'

import { useEffect } from 'react'

export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return
    if (window.location.protocol !== 'https:' && window.location.hostname !== 'localhost') return

    window.addEventListener('load', () => {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // The portal still works normally if a browser refuses service workers.
      })
    })
  }, [])

  return null
}
