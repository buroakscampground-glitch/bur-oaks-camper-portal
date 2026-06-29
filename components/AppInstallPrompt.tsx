'use client'

import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Download, Share, Smartphone, Sparkles, X } from 'lucide-react'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

function isStandalone() {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
}

function deviceKind() {
  if (typeof window === 'undefined') return 'phone'
  const ua = window.navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return 'ios'
  if (/android/.test(ua)) return 'android'
  return 'phone'
}

export default function AppInstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [dismissed, setDismissed] = useState(true)
  const [installed, setInstalled] = useState(false)
  const kind = useMemo(deviceKind, [])

  useEffect(() => {
    setInstalled(isStandalone())
    setDismissed(window.localStorage.getItem('bur-oaks-install-dismissed') === 'yes')

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setInstallEvent(event as BeforeInstallPromptEvent)
      if (window.localStorage.getItem('bur-oaks-install-dismissed') !== 'yes') {
        setDismissed(false)
      }
    }

    const onInstalled = () => {
      setInstalled(true)
      setDismissed(true)
      window.localStorage.setItem('bur-oaks-install-dismissed', 'yes')
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || dismissed) return null

  async function installApp() {
    if (!installEvent) return
    await installEvent.prompt()
    const choice = await installEvent.userChoice
    if (choice.outcome === 'accepted') {
      window.localStorage.setItem('bur-oaks-install-dismissed', 'yes')
      setDismissed(true)
    }
    setInstallEvent(null)
  }

  function dismiss() {
    window.localStorage.setItem('bur-oaks-install-dismissed', 'yes')
    setDismissed(true)
  }

  return (
    <section className="portal-app-install-card" aria-label="Install Bur Oaks Camper App">
      <button className="portal-app-install-close" type="button" onClick={dismiss} aria-label="Hide install app card">
        <X size={16} />
      </button>
      <div className="portal-app-install-icon">
        <img src="/bur-oaks-logo.png" alt="" />
      </div>
      <div className="portal-app-install-copy">
        <span><Sparkles size={14} /> New phone app feel</span>
        <h2>Install the Bur Oaks Camper App</h2>
        <p>Keep invoices, weather, work orders, dinners, documents, and office messages one tap away from your phone home screen.</p>
        <div className="portal-app-install-steps">
          {installEvent ? (
            <button type="button" onClick={installApp}>
              <Download size={16} /> Install app
            </button>
          ) : kind === 'ios' ? (
            <p><Share size={15} /> iPhone: tap Share, then Add to Home Screen.</p>
          ) : (
            <p><Smartphone size={15} /> Phone: open your browser menu and choose Install App or Add to Home Screen.</p>
          )}
          <small><CheckCircle2 size={13} /> Same secure portal. No App Store needed.</small>
        </div>
      </div>
    </section>
  )
}
