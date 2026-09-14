import type { Metadata } from 'next'
import CommunityFeed from '../../components/CommunityFeed'
import RoleGuard from '../../components/RoleGuard'

export const metadata: Metadata = {
  title: 'Campground Messenger',
  description: 'Private Campground Messenger for Bur Oaks campers.',
  robots: { index: false, follow: false },
}

export default function CamperCommunityPage() {
  return <RoleGuard allowedRoles={['camper']}><CommunityFeed /></RoleGuard>
}
