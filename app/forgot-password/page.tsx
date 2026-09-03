'use client'

import { useState } from 'react'
import { Mail, Send } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)

  async function sendResetLink() {
    setSending(true)
    setMessage('')

    const response = await fetch('/api/request-password-reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim() }),
    })
    const result = await response.json().catch(() => null)

    setMessage(
      !response.ok
        ? result?.error || 'The reset email could not be sent. Please try again.'
        : 'If that email belongs to an account, a password-reset link is on its way.'
    )
    setSending(false)
  }

  return (
    <main className="account-recovery-page">
      <section className="account-recovery-card">
        <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
        <span>ACCOUNT RECOVERY</span>
        <h1>Reset your password</h1>
        <p>Enter the email connected to your camper account.</p>

        <label htmlFor="reset-email">Email address</label>
        <div className="signin-input-wrap">
          <Mail size={18} />
          <input
            id="reset-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
          />
        </div>

        <button onClick={sendResetLink} disabled={sending || !email.trim()}>
          <Send size={17} /> {sending ? 'Sending…' : 'Send reset link'}
        </button>

        {message && <p className="account-recovery-message">{message}</p>}
        <a href="/login">Return to sign in</a>
      </section>
    </main>
  )
}
