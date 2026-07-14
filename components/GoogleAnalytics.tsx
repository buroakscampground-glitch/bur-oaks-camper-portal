'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import PublicAnalyticsTracker from './PublicAnalyticsTracker'

type AnalyticsWindow = Window & {
  dataLayer?: unknown[][]
  gtag?: (...args: unknown[]) => void
  __burOaksAnalyticsInitialized?: boolean
}

export default function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

  useEffect(() => {
    if (!measurementId) return

    const analyticsWindow = window as AnalyticsWindow
    analyticsWindow.dataLayer = analyticsWindow.dataLayer || []
    analyticsWindow.gtag = analyticsWindow.gtag || ((...args: unknown[]) => analyticsWindow.dataLayer?.push(args))

    if (!analyticsWindow.__burOaksAnalyticsInitialized) {
      analyticsWindow.gtag('js', new Date())
      analyticsWindow.gtag('config', measurementId, { anonymize_ip: true })
      analyticsWindow.__burOaksAnalyticsInitialized = true
    }

    document.documentElement.dataset.analyticsReady = measurementId
  }, [measurementId])

  if (!measurementId) return null

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
      <PublicAnalyticsTracker />
    </>
  )
}
