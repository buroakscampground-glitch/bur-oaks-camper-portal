import React from 'react'
import { requireAdminUser } from '../../lib/admin'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireAdminUser()

  return <>{children}</>
}
