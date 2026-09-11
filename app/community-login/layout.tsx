import type { Metadata } from 'next'
import type { ReactNode } from 'react'

export const metadata: Metadata = {
  title: 'Bur Oaks Community Sign In',
  manifest: '/community/manifest.webmanifest',
  robots: { index: false, follow: false },
}

export default function CommunityLoginLayout({ children }: { children: ReactNode }) {
  return children
}
