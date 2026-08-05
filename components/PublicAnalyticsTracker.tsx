'use client'

import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { trackPublicEvent } from '../lib/publicAnalytics'

function linkLocation(link: HTMLAnchorElement) {
  if (link.dataset.analyticsLocation) return link.dataset.analyticsLocation
  if (link.closest('.public-mobile-actions')) return 'mobile_action_bar'
  if (link.closest('header')) return 'header'
  if (link.closest('footer')) return 'footer'
  return 'page'
}

export default function PublicAnalyticsTracker() {
  const pathname = usePathname()

  useEffect(() => {
    trackPublicEvent('page_view', {
      page_title: document.title,
      page_location: window.location.href,
      page_path: `${pathname}${window.location.search}`,
    })
  }, [pathname])

  useEffect(() => {
    function trackClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof Element)) return

      const link = target.closest('a') as HTMLAnchorElement | null
      if (!link) return

      const href = link.getAttribute('href') || ''
      const location = linkLocation(link)
      const explicitEvent = link.dataset.analyticsEvent

      if (explicitEvent) {
        trackPublicEvent(explicitEvent, { location, link_url: link.href })
      } else if (href.startsWith('tel:')) {
        trackPublicEvent('click_to_call', { location })
      } else if (href.startsWith('sms:')) {
        trackPublicEvent('click_to_text', { location })
      } else if (href.startsWith('mailto:')) {
        trackPublicEvent('click_to_email', { location })
      } else if (/google\.[^/]+\/maps|maps\.app\.goo\.gl/i.test(href)) {
        trackPublicEvent('directions_click', { location, link_url: link.href })
      } else if (href.startsWith('/availability')) {
        trackPublicEvent('membership_information_click', { location })
      } else if (/facebook\.com|instagram\.com/i.test(href)) {
        trackPublicEvent('social_profile_click', { location, link_url: link.href })
      }
    }

    document.addEventListener('click', trackClick)
    return () => document.removeEventListener('click', trackClick)
  }, [])

  return null
}
