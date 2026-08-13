'use client'

import { ArrowLeft } from 'lucide-react'
import { usePathname } from 'next/navigation'

function fallbackFor(pathname: string) {
  const publicPages = [
    '/about', '/amenities', '/events', '/event-list', '/calander', '/gallery',
    '/faq', '/contact', '/contact-4', '/availability', '/check-availability',
    '/shop', '/blog',
  ]

  if (publicPages.includes(pathname)) {
    return '/'
  }

  if (pathname.startsWith('/admin/') && pathname !== '/admin') {
    const section = pathname.split('/')[2]
    const isDetailPage = pathname.split('/').filter(Boolean).length > 2

    if (section && isDetailPage) {
      return `/admin/${section}`
    }

    return '/admin'
  }

  if (
    pathname.startsWith('/maintenance/dashboard/')
  ) {
    return '/maintenance/dashboard'
  }

  if (pathname === '/maintenance/history') {
    return '/maintenance'
  }

  if (pathname === '/maintenance/dashboard') {
    return '/login'
  }

  if (pathname.startsWith('/portal/events/')) {
    return '/portal'
  }

  if (
    pathname === '/portal' ||
    pathname === '/admin' ||
    pathname === '/login'
  ) {
    return '/'
  }

  return '/portal'
}

export default function GlobalBackButton() {
  const pathname = usePathname()

  if (pathname === '/') return null

  return (
    <a
      className="global-back-button"
      href={fallbackFor(pathname)}
      aria-label="Go back to the previous page"
    >
      <ArrowLeft size={18} aria-hidden="true" />
      <span>Back</span>
    </a>
  )
}
