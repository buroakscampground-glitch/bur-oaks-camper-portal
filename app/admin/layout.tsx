import React from 'react'
import { redirect } from 'next/navigation'
import { requireAdminUser } from '../../lib/admin'

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const user = await requireAdminUser()

  if (!user || user.role !== 'admin') {
    redirect('/')
  }

  return <>{children}</>
}