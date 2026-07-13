'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, LockKeyhole, ShieldCheck, Sparkles } from 'lucide-react'
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
        tokenHash &&
        (requestedType === 'invite' || requestedType === 'recovery')
      ) {
        if (data.session) {
          await supabase.auth.signOut()
        }

        const verification = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: requestedType,
        })

        if (verification.error) {
          setMessage('This setup link is invalid or expired. Please ask the Bur Oaks office for a fresh setup link.')
          return
        }

        data = { session: verification.data.session }
      }

      if (!data.session && code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (error) {
          setMessage('This setup link is invalid or expired. Please ask the Bur Oaks office for a fresh setup link.')
          return
        }
        const sessionResult = await supabase.auth.getSession()
        data = sessionResult.data
      }

      if (!data.session) {
        setMessage('This setup link is invalid or expired. Please ask the Bur Oaks office for a fresh setup link.')
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
          ? 'This link is invalid or expired. Ask the Bur Oaks office for a fresh setup link.'
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
