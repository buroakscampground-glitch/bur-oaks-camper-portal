import React from 'react'
import './globals.css'
import Nav from '../components/Nav'

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
        <Nav />
        {children}
      </body>
    </html>
  )
}