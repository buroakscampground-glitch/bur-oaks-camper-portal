'use client'

import { useEffect } from 'react'

export default function AuthLinkRedirect() {
  useEffect(() => {
    if (window.location.pathname !== '/') return

    const hash = window.location.hash
    const search = window.location.search
    const isAuthLink =
      hash.includes('access_token=') ||
      hash.includes('type=invite') ||
      hash.includes('type=recovery') ||
      search.includes('code=') ||
      search.includes('error_description=')

    if (isAuthLink) {
      window.location.replace(`/set-password${search}${hash}`)
    }
  }, [])

  return null
}
