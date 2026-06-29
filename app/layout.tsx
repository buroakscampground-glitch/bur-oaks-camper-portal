import React from 'react'
import './globals.css'
import GlobalBackButton from '../components/GlobalBackButton'
import CamperChrome from '../components/CamperChrome'
import AuthLinkRedirect from '../components/AuthLinkRedirect'
import ServiceWorkerRegister from '../components/ServiceWorkerRegister'

export const metadata = {
  title: 'Bur Oaks Campground | A Site to Remember',
  description: 'A private seasonal campground and members-only community in Alhambra, Illinois.',
  manifest: '/manifest.webmanifest',
  applicationName: 'Bur Oaks Camper App',
  appleWebApp: {
    capable: true,
    title: 'Bur Oaks',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
}

export const viewport = {
  themeColor: '#173722',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <AuthLinkRedirect />
        <ServiceWorkerRegister />
        <CamperChrome>{children}</CamperChrome>
        <GlobalBackButton />
      </body>
    </html>
  )
}
