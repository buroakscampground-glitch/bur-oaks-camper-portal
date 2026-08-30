'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: string[]
  children: React.ReactNode
}) {
  const [allowed, setAllowed] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [checkAttempt, setCheckAttempt] = useState(0)
  const allowedRolesKey = allowedRoles.join(',')

  useEffect(() => {
    let active = true

    function withTimeout<T>(promise: PromiseLike<T>, milliseconds: number): Promise<T> {
      return Promise.race([
        Promise.resolve(promise),
        new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error('timeout')), milliseconds)),
      ])
    }

    async function checkRole() {
      setCheckError('')
      try {
        const { data: sessionData } = await withTimeout(supabase.auth.getSession(), 6000)
        const session = sessionData.session
        const token = session?.access_token

        if (!token || !session.user?.email) {
          const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
          window.location.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`)
          return
        }

        const controller = new AbortController()
        const timer = window.setTimeout(() => controller.abort(), 9000)
        const response = await fetch('/api/login-destination', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        }).finally(() => window.clearTimeout(timer))
        const result = await response.json().catch(() => null)
        const role = String(result?.role || '').toLowerCase()

        if (response.ok && allowedRolesKey.split(',').includes(role)) {
          if (active) setAllowed(true)
          return
        }

        if (response.ok && role) {
          window.location.replace(role === 'camper' ? '/portal' : '/login')
          return
        }

        // If the server check is temporarily unavailable, verify the signed-in
        // user's own camper row before showing an error. This keeps a refresh
        // from sitting on a permanent loading screen during a brief API hiccup.
        const userEmail = session.user.email?.trim().toLowerCase()
        if (userEmail) {
          const { data: camperMatches } = await withTimeout(
            supabase
              .from('campers')
              .select('role,active')
              .or(`email.ilike.${userEmail},secondary_email.ilike.${userEmail}`)
              .limit(10),
            7000
          )
          const camper = (camperMatches || []).find((match) => match.active !== false && match.role)
          const fallbackRole = String(camper?.role || '').toLowerCase()
          if (allowedRolesKey.split(',').includes(fallbackRole)) {
            if (active) setAllowed(true)
            return
          }
        }

        throw new Error(result?.error || 'Permission check failed')
      } catch (error) {
        console.error('Role check failed:', error)
        if (active) setCheckError(error instanceof Error && error.message !== 'timeout'
          ? error.message
          : 'The permission check took too long. Your login is still safe—please try again.')
      }
    }

    checkRole()
    return () => { active = false }
  }, [allowedRolesKey, checkAttempt])

  if (!allowed) {
    return (
      <main className="page">
        <div className="admin-command-loading">
          <ShieldCheck size={34} />
          <p>{checkError || 'Checking permissions…'}</p>
          {checkError && <button type="button" onClick={() => setCheckAttempt((attempt) => attempt + 1)}>Try again</button>}
        </div>
      </main>
    )
  }

  return <>{children}</>
}
