'use client'

import Script from 'next/script'

export default function PublicLiveChat() {
  const propertyId = process.env.NEXT_PUBLIC_TAWK_PROPERTY_ID?.trim() || '6a71c26a2502921d483eba05'
  const widgetId = process.env.NEXT_PUBLIC_TAWK_WIDGET_ID?.trim() || '1jv65usjd'

  return (
    <Script
      id="tawk-to-live-chat"
      src={`https://embed.tawk.to/${encodeURIComponent(propertyId)}/${encodeURIComponent(widgetId)}`}
      strategy="lazyOnload"
      crossOrigin="anonymous"
    />
  )
}
