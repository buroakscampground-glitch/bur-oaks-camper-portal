import type { ReactNode } from 'react'
import RoleGuard from '../../../components/RoleGuard'

export default function MaintenanceDashboardLayout({ children }: { children: ReactNode }) {
  return <RoleGuard allowedRoles={['maintenance', 'admin']}>{children}</RoleGuard>
}
