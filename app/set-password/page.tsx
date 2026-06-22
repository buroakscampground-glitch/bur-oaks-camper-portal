'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, LockKeyhole } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    async function prepareSecureSession() {
      const params = new URLSearchParams(window.location.search)
      const code = params.get('code')
      const tokenHash = params.get('token_hash')
      const requestedType = params.get('type')
      let { data } = await supabase.auth.getSession()

      if (
        !data.session &&
        tokenHash &&
        (requestedType === 'invite' || requestedType === 'recovery')
      ) {
        const verification = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: requestedType,
        })

        if (verification.error) {
          setMessage('This setup link is invalid or expired. Please generate a new setup link.')
          return
        }

        data = { session: verification.data.session }
      }

      if (!data.session && code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setMessage('This invitation link is invalid or expired. Please request a new invitation.')
          return
        }
        const sessionResult = await supabase.auth.getSession()
        data = sessionResult.data
      }

      if (!data.session) {
        setMessage('This invitation link is invalid or expired. Please request a new invitation.')
        return
      }

      setReady(true)
    }

    prepareSecureSession()
  }, [])

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
    const { error } = await supabase.auth.updateUser({
      password,
      data: { portal_setup_complete: true },
    })

    if (error) {
      setMessage(
        error.message.includes('session')
          ? 'This link is invalid or expired. Request a new password-reset link.'
          : error.message
      )
      setSaving(false)
      return
    }

    setMessage('Password saved successfully. Redirecting to sign in…')
    window.setTimeout(() => window.location.replace('/login'), 1400)
  }

  return (
    <main className="account-recovery-page">
      <section className="account-recovery-card">
        <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
        <span>SECURE YOUR ACCOUNT</span>
        <h1>Create a new password</h1>
        <p>Use at least 10 characters and avoid reusing a password from another site.</p>

        <label htmlFor="new-password">New password</label>
        <div className="signin-input-wrap">
          <LockKeyhole size={18} />
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="new-password"
          />
        </div>

        <label htmlFor="confirm-password">Confirm password</label>
        <div className="signin-input-wrap">
          <CheckCircle2 size={18} />
          <input
            id="confirm-password"
            type="password"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            autoComplete="new-password"
          />
        </div>

        <button onClick={savePassword} disabled={saving || !ready}>
          {!ready ? 'Verifying invitation…' : saving ? 'Saving…' : 'Save password'}
        </button>
        {message && <p className="account-recovery-message">{message}</p>}
      </section>
    </main>
  )
}
