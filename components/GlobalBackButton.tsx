'use client'

import { ArrowLeft } from 'lucide-react'
import { usePathname, useRouter } from 'next/navigation'

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
    return '/admin'
  }

  if (
    pathname.startsWith('/maintenance/dashboard/') ||
    pathname === '/maintenance/history'
  ) {
    return '/maintenance/dashboard'
  }

  if (pathname === '/maintenance/dashboard') {
    return '/login'
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
  const router = useRouter()

  if (pathname === '/') return null

  function goBack() {
    const referrer = document.referrer
    const cameFromThisSite =
      referrer && new URL(referrer).origin === window.location.origin

    if (cameFromThisSite && window.history.length > 1) {
      router.back()
      return
    }

    router.push(fallbackFor(pathname))
  }

  return (
    <button
      type="button"
      className="global-back-button"
      onClick={goBack}
      aria-label="Go back to the previous page"
    >
      <ArrowLeft size={18} aria-hidden="true" />
      <span>Back</span>
    </button>
  )
}
