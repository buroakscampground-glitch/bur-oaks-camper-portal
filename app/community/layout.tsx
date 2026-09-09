import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import CommunityChrome from '../../components/CommunityChrome'
import RoleGuard from '../../components/RoleGuard'

export const metadata: Metadata = {
  title: 'Bur Oaks Community',
  manifest: '/community/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bur Oaks Community',
  },
  icons: {
    apple: [{ url: '/bur-oaks-logo.png', sizes: '1254x1254', type: 'image/png' }],
  },
}

export default function CommunityLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['event_coordinator', 'admin']}>
      <CommunityChrome>{children}</CommunityChrome>
    </RoleGuard>
  )
}
