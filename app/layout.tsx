import React from 'react'
import './globals.css'
import GlobalBackButton from '../components/GlobalBackButton'
import CamperChrome from '../components/CamperChrome'

export const metadata = {
  title: 'Bur Oaks Campground | A Site to Remember',
  description: 'A private seasonal campground and members-only community in Alhambra, Illinois.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <CamperChrome>{children}</CamperChrome>
        <GlobalBackButton />
      </body>
    </html>
  )
}
