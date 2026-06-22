import React from 'react'
import './globals.css'
import GlobalBackButton from '../components/GlobalBackButton'
import CamperChrome from '../components/CamperChrome'

export const metadata = {
  title: 'Bur Oaks Camper Portal',
  description: 'Camper Portal for Bur Oaks Campground',
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
