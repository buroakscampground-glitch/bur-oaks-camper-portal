'use client'

import { useEffect, useState } from 'react'
import { ArrowRight, LogOut, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { effectivePortalRole, portalDestinationForRole } from '../lib/staff-roles'

type RoleMismatch = {
  role: string
  destination: string
}

function accountLabel(role: string) {
  if (role === 'admin') return 'administrator account'
  if (role === 'maintenance') return 'maintenance account'
  if (role === 'event_coordinator') return 'event coordinator account'
  return 'camper account'
}

export default function RoleGuard({
  allowedRoles,
  loginPath = '/login',
  children,
}: {
  allowedRoles: string[]
  loginPath?: string
  children: React.ReactNode
}) {
  const [allowed, setAllowed] = useState(false)
  const [checkError, setCheckError] = useState('')
  const [checkAttempt, setCheckAttempt] = useState(0)
  const [roleMismatch, setRoleMismatch] = useState<RoleMismatch | null>(null)
  const [switchingAccount, setSwitchingAccount] = useState(false)
  const [switchError, setSwitchError] = useState('')
  const allowedRolesKey = allowedRoles.join(',')
  const isAdminOnly = allowedRoles.length === 1 && allowedRoles[0] === 'admin'

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
      setRoleMismatch(null)
      try {
        const { data: sessionData } = await withTimeout(supabase.auth.getSession(), 6000)
        const session = sessionData.session
        const token = session?.access_token

        if (!token || !session.user?.email) {
          const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
          window.location.replace(`${loginPath}?returnTo=${encodeURIComponent(returnTo)}`)
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
          const destination = portalDestinationForRole(role) || '/login'
          if (active) setRoleMismatch({ role, destination })
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
              .select('role,active,lot_number')
              .or(`email.ilike.${userEmail},secondary_email.ilike.${userEmail}`)
              .limit(10),
            7000
          )
          const activeMatches = (camperMatches || []).filter((match) => match.active !== false && match.role)
          const camper = activeMatches.length === 1 ? activeMatches[0] : null
          const fallbackRole = camper ? effectivePortalRole(camper) : ''
          if (allowedRolesKey.split(',').includes(fallbackRole)) {
            if (active) setAllowed(true)
            return
          }
          if (fallbackRole) {
            if (active) setRoleMismatch({ role: fallbackRole, destination: portalDestinationForRole(fallbackRole) || '/login' })
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
  }, [allowedRolesKey, checkAttempt, loginPath])

  async function switchAccount() {
    setSwitchingAccount(true)
    setSwitchError('')
    try {
      const returnTo = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      window.location.href = `${loginPath}?returnTo=${encodeURIComponent(returnTo)}&reason=wrong-account`
    } catch {
      setSwitchError('This account could not be signed out. Please try again; no account information was changed.')
      setSwitchingAccount(false)
    }
  }

  if (roleMismatch) {
    const requiredAccount = isAdminOnly ? 'administrator account' : 'account assigned to this workspace'
    return (
      <main className="page">
        <section className="role-mismatch-card" role="alert" aria-labelledby="role-mismatch-heading">
          <span><ShieldCheck size={30} /></span>
          <small>RIGHT PERSON · WRONG WORKSPACE</small>
          <h1 id="role-mismatch-heading">This {accountLabel(roleMismatch.role)} cannot open this page.</h1>
          <p>You are still safely signed in. This page requires an {requiredAccount}.</p>
          <div>
            <a href={roleMismatch.destination}><ArrowRight size={16} /> Return to this account’s home</a>
            <button type="button" onClick={switchAccount} disabled={switchingAccount}>
              <LogOut size={16} /> {switchingAccount ? 'Signing out…' : `Sign out and use an ${requiredAccount}`}
            </button>
          </div>
          {switchError && <p className="role-mismatch-error">{switchError}</p>}
        </section>
      </main>
    )
  }

  if (!allowed) {
    return (
      <main className="page">
        <div className={`admin-command-loading${isAdminOnly && !checkError ? ' admin-birds-loading' : ''}`}>
          {isAdminOnly && !checkError
            ? <img src="/philadelphia-eagles-logo.png" alt="Philadelphia Eagles logo" />
            : <ShieldCheck size={34} />}
          <p>{checkError || (isAdminOnly ? 'GO BIRDS' : 'Checking permissions…')}</p>
          {checkError && <button type="button" onClick={() => setCheckAttempt((attempt) => attempt + 1)}>Try again</button>}
        </div>
      </main>
    )
  }

  return <>{children}</>
}
