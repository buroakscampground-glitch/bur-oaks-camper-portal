import React from 'react'
import RoleGuard from '../../components/RoleGuard'
import AdminChrome from '../../components/AdminChrome'

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
