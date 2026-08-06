import type { ReactNode } from 'react'
import RoleGuard from '../../../components/RoleGuard'
import MaintenanceLogoutButton from '../../../components/MaintenanceLogoutButton'
import LiveChatWidget from '../../../components/PublicLiveChat'

export default function MaintenanceDashboardLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['maintenance', 'admin']}>
      <MaintenanceLogoutButton />
      {children}
      <LiveChatWidget />
    </RoleGuard>
  )
}
