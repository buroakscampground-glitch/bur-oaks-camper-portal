'use client'

import Script from 'next/script'
import { useEffect } from 'react'

type GoogleAnalyticsWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

export default function GoogleAnalytics() {
  const measurementId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

  useEffect(() => {
    if (!measurementId) return

    const analyticsWindow = window as GoogleAnalyticsWindow
    analyticsWindow.dataLayer = analyticsWindow.dataLayer || []
    analyticsWindow.gtag = (...args: unknown[]) => analyticsWindow.dataLayer?.push(args)
    analyticsWindow.gtag('js', new Date())
    analyticsWindow.gtag('config', measurementId, { anonymize_ip: true })
  }, [measurementId])

  if (!measurementId) return null

  return <Script src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`} strategy="afterInteractive" />
}
