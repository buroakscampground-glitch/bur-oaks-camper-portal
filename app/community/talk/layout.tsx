import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Bur Oaks Community Talk',
  manifest: '/community/talk/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Community Talk',
  },
}

export default function CommunityTalkLayout({ children }: { children: ReactNode }) {
  return children
}
