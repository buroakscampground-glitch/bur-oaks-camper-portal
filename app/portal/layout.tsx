import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Bur Oaks Camper Portal',
  manifest: '/portal/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bur Oaks Camper',
  },
  icons: {
    apple: [{ url: '/bur-oaks-logo.png', sizes: '1254x1254', type: 'image/png' }],
  },
}

export default function PortalLayout({ children }: { children: ReactNode }) {
  return children
}
