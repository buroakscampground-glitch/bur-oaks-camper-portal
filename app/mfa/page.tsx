'use client'

import { useEffect, useState } from 'react'
import { KeyRound, Loader2, LockKeyhole, LogOut, ShieldCheck, Smartphone } from 'lucide-react'
import { supabase } from '../../lib/supabase'

type Enrollment = {
  id: string
  qrCode: string
  secret: string
}

export default function MfaPage() {
  const [factorId, setFactorId] = useState('')
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null)
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    async function prepare() {
      const { data: userData } = await supabase.auth.getUser()
      if (!userData.user) {
        window.location.replace('/login')
        return
      }

      const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
      if (aal?.currentLevel === 'aal2') {
        await openPortal()
        return
      }

      const { data, error } = await supabase.auth.mfa.listFactors()
      if (error) setMessage(error.message)
      const verifiedFactor = data?.totp?.find((factor) => factor.status === 'verified')
      if (verifiedFactor) setFactorId(verifiedFactor.id)
      setLoading(false)
    }

    prepare()
  }, [])

  async function openPortal() {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) {
      window.location.replace('/login')
      return
    }

    const response = await fetch('/api/login-destination', {
      headers: { Authorization: `Bearer ${token}` },
    })
    const result = await response.json().catch(() => null)
    window.location.replace(response.ok && result?.destination && result.destination !== '/mfa' ? result.destination : '/login')
  }

  async function beginEnrollment() {
    setBusy(true)
    setMessage('')
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: 'Bur Oaks portal',
    })

    if (error || !data?.totp) {
      setMessage(error?.message || 'Unable to start security setup.')
      setBusy(false)
      return
    }

    setFactorId(data.id)
    setEnrollment({ id: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret })
    setBusy(false)
  }

  async function verifyCode() {
    const cleanCode = code.replace(/\D/g, '').slice(0, 6)
    if (!factorId || cleanCode.length !== 6) {
      setMessage('Enter the current 6-digit code from your authenticator app.')
      return
    }

    setBusy(true)
    setMessage('Checking your security code…')
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: cleanCode })

    if (error) {
      setMessage('That code did not work. Wait for a new code and try again.')
      setBusy(false)
      return
    }

    await supabase.auth.refreshSession()
    setMessage('Verified. Opening your secure workspace…')
    await openPortal()
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  return (
    <main className="mfa-page">
      <section className="mfa-card">
        <div className="mfa-brand">
          <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
          <span><strong>Bur Oaks</strong><small>Secure staff access</small></span>
        </div>

        <span className="mfa-shield"><ShieldCheck size={30} /></span>
        <small className="mfa-eyebrow">EXTRA ACCOUNT PROTECTION</small>
        <h1>One quick security check.</h1>
        <p>Admin and maintenance accounts use a six-digit authenticator code in addition to the password.</p>

        {loading ? (
          <div className="mfa-loading"><Loader2 className="admin-spin" size={22} /> Checking security setup…</div>
        ) : !factorId ? (
          <div className="mfa-setup">
            <div><Smartphone size={21} /><span><strong>Use an authenticator app</strong><small>Google Authenticator, Microsoft Authenticator, Authy, or your password manager will work.</small></span></div>
            <button type="button" onClick={beginEnrollment} disabled={busy}>
              {busy ? <Loader2 className="admin-spin" size={17} /> : <KeyRound size={17} />} Set up secure login
            </button>
          </div>
        ) : (
          <div className="mfa-verify">
            {enrollment && (
              <div className="mfa-qr">
                <img src={enrollment.qrCode} alt="Authenticator setup QR code" />
                <div><strong>Scan this code</strong><small>In your authenticator app, add an account and scan the square code.</small><code>{enrollment.secret}</code></div>
              </div>
            )}
            <label>
              <span>6-digit security code</span>
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                onKeyDown={(event) => event.key === 'Enter' && verifyCode()}
              />
            </label>
            <button type="button" onClick={verifyCode} disabled={busy || code.length !== 6}>
              {busy ? <Loader2 className="admin-spin" size={17} /> : <LockKeyhole size={17} />} Verify and continue
            </button>
          </div>
        )}

        {message && <p className="mfa-message" role="status">{message}</p>}
        <button className="mfa-signout" type="button" onClick={signOut}><LogOut size={15} /> Use a different account</button>
      </section>
    </main>
  )
}
