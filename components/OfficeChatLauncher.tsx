'use client'

import { MessageCircle } from 'lucide-react'
import { usePathname } from 'next/navigation'

export default function OfficeChatLauncher() {
  const pathname = usePathname()

  if (pathname === '/messages') return null

  return (
    <a
      className={`office-chat-launcher${pathname === '/portal' ? ' portal-home' : ''}`}
      href="/messages"
      aria-label="Chat with the Bur Oaks office"
    >
      <span className="office-chat-launcher-icon">
        <MessageCircle size={21} aria-hidden="true" />
        <i aria-hidden="true" />
      </span>
      <span className="office-chat-launcher-copy">
        <small>Bur Oaks office</small>
        <strong>Chat now</strong>
      </span>
    </a>
  )
}
