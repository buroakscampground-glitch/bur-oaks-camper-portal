import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Bur Oaks Campground Messenger',
  manifest: '/community/talk/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Campground Messenger',
  },
}

export default function CommunityTalkLayout({ children }: { children: ReactNode }) {
  return children
}
