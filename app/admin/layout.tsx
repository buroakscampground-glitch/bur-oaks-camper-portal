import React from 'react'
import type { Metadata } from 'next'
import RoleGuard from '../../components/RoleGuard'
import AdminChrome from '../../components/AdminChrome'

export const metadata: Metadata = {
  title: 'Bur Oaks Admin',
  manifest: '/admin/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Bur Oaks Admin',
  },
  icons: {
    apple: [{ url: '/bur-oaks-logo.png', sizes: '1254x1254', type: 'image/png' }],
  },
}

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <RoleGuard allowedRoles={['admin']}>
      <AdminChrome>{children}</AdminChrome>
    </RoleGuard>
  )
}
