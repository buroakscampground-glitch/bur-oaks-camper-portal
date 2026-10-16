'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
import { supabase } from '../../lib/supabase'

const SETUP_TOKEN_STORAGE_KEY = 'bur-oaks-portal-setup-token'

type SetupToken = {
  tokenHash: string
  type: 'invite' | 'recovery'
}

function cacheSetupToken(token: SetupToken | null) {
  try {
    if (token) {
      window.sessionStorage.setItem(SETUP_TOKEN_STORAGE_KEY, JSON.stringify(token))
    } else {
      window.sessionStorage.removeItem(SETUP_TOKEN_STORAGE_KEY)
    }
  } catch {
    // Some privacy modes block session storage. The in-memory token still works.
  }
}

function readCachedSetupToken(): SetupToken | null {
  try {
    const cached = JSON.parse(window.sessionStorage.getItem(SETUP_TOKEN_STORAGE_KEY) || 'null')
    if (
      cached &&
      typeof cached.tokenHash === 'string' &&
      cached.tokenHash &&
      (cached.type === 'invite' || cached.type === 'recovery')
    ) {
      return cached
    }
  } catch {
    cacheSetupToken(null)
  }
  return null
}

export default function SetPasswordForm({
  initialToken,
  initialMessage = '',
}: {
  initialToken: SetupToken | null
  initialMessage?: string
}) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState(initialMessage)
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(Boolean(initialToken))
  const [setupToken, setSetupToken] = useState<SetupToken | null>(initialToken)

  useEffect(() => {
    async function prepareSecureSession() {
      if (initialToken) {
        cacheSetupToken(initialToken)
        window.history.replaceState({}, '', '/set-password')
        setReady(true)
        return
      }

      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const tokenHash = params.get('token_hash')
      const requestedType = params.get('type')
      if (
        tokenHash &&
        (requestedType === 'invite' || requestedType === 'recovery')
      ) {
        const token: SetupToken = { tokenHash, type: requestedType }
        cacheSetupToken(token)
        setSetupToken(token)
        window.history.replaceState({}, '', '/set-password')
        setReady(true)
        return
      }

      // iOS can reload a page opened from Mail while someone is entering a
      // password. Recover the one-time token for this tab after the clean URL
      // replaces the emailed URL, instead of leaving the button stuck.
      const cachedToken = readCachedSetupToken()
      if (cachedToken) {
        setSetupToken(cachedToken)
        setReady(true)
        return
      }

      let { data } = await supabase.auth.getSession()

      if (code) {
        if (data.session) await supabase.auth.signOut({ scope: 'local' })
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setMessage('This setup link is invalid or expired. Please ask the Bur Oaks office for a fresh setup link.')
          return
        }
        const sessionResult = await supabase.auth.getSession()
        data = sessionResult.data
        window.history.replaceState({}, '', '/set-password')
      }

      if (!data.session) {
        setMessage('This setup link is invalid or expired. Please ask the Bur Oaks office for a fresh setup link.')
        return
      }

      setReady(true)
    }

    prepareSecureSession()
  }, [initialToken])

  async function savePassword() {
    if (password.length < 10) {
      setMessage('Use at least 10 characters for your password.')
      return
    }

    if (password !== confirmation) {
      setMessage('The passwords do not match.')
      return
    }

    setSaving(true)
    let errorMessage = ''

    if (setupToken) {
      const response = await fetch('/api/complete-portal-setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tokenHash: setupToken.tokenHash,
          type: setupToken.type,
          password,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) errorMessage = result.error || 'The password could not be saved.'
    } else {
      const { error } = await supabase.auth.updateUser({
        password,
        data: { portal_setup_complete: true },
      })
      if (error) errorMessage = error.message
      if (!error) await supabase.auth.signOut({ scope: 'local' })
    }

    if (errorMessage) {
      if (setupToken) cacheSetupToken(null)
      setMessage(
        errorMessage.includes('session')
          ? 'This link is invalid or expired. Ask the Bur Oaks office for a fresh setup link.'
          : errorMessage
      )
      setSaving(false)
      return
    }

    setPassword('')
    setConfirmation('')
    cacheSetupToken(null)
    setSetupToken(null)
    setMessage('Password saved successfully. For your privacy, this setup session is closed. Redirecting to sign in…')
    window.setTimeout(() => window.location.replace('/login'), 1400)
  }

  return (
    <main className="account-recovery-page">
      <form
        className="account-recovery-card"
        action="/api/complete-portal-setup"
        method="post"
        onSubmit={(event) => {
          event.preventDefault()
          void savePassword()
        }}
      >
        <div className="account-recovery-brand">
          <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
          <span><strong>Bur Oaks</strong><small>Camper Portal</small></span>
        </div>
        <span><Sparkles size={15} /> SECURE YOUR ACCOUNT</span>
        <h1>Create your portal password.</h1>
        <p>Use at least 10 characters and avoid reusing a password from another site. Once saved, you’ll sign in to your Bur Oaks camper portal.</p>

        <div className="account-recovery-trust">
          <ShieldCheck size={18} />
          <span>This secure setup link is private to your camper account.</span>
        </div>

        <input type="hidden" name="tokenHash" value={setupToken?.tokenHash || ''} />
        <input type="hidden" name="type" value={setupToken?.type || ''} />

        <label htmlFor="new-password">New password</label>
        <div className="signin-input-wrap">
          <LockKeyhole size={18} />
          <input
            id="new-password"
            name="password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            required
          />
        </div>

        <label htmlFor="confirm-password">Confirm password</label>
        <div className="signin-input-wrap">
          <CheckCircle2 size={18} />
          <input
            id="confirm-password"
            name="confirmation"
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
            minLength={10}
            maxLength={128}
            required
          />
        </div>

        <button type="submit" disabled={saving || !ready}>
          {!ready ? 'Verifying invitation…' : saving ? 'Saving…' : 'Save password'}
        </button>
        {message && <p className="account-recovery-message">{message}</p>}
      </form>
    </main>
  )
}
