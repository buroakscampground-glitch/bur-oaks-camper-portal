import type { ReactNode } from 'react'
import RoleGuard from '../../../components/RoleGuard'
import MaintenanceLogoutButton from '../../../components/MaintenanceLogoutButton'

export default function MaintenanceDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['maintenance', 'admin']}>
      <MaintenanceLogoutButton />
      {children}
    </RoleGuard>
  )
}
