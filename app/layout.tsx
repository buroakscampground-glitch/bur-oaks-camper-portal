import React from 'react'
import './globals.css'

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
      <body>{children}</body>
    </html>
  )
}