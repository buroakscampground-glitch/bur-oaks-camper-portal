import type { ReactNode } from 'react'
import CommunityChrome from '../../components/CommunityChrome'
import RoleGuard from '../../components/RoleGuard'

export default function CommunityLayout({ children }: { children: ReactNode }) {
  return (
    <RoleGuard allowedRoles={['event_coordinator', 'admin']}>
      <CommunityChrome>{children}</CommunityChrome>
    </RoleGuard>
  )
}
