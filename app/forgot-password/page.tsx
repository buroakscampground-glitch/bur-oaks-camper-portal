'use client'

import { useState } from 'react'
import { Mail, Send } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [cooldown, setCooldown] = useState(false)

  async function sendResetLink() {
    setSending(true)
    setMessage('')

    try {
      const response = await fetch('/api/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const result = await response.json().catch(() => null)

      if (!response.ok) {
        setMessage(result?.error || 'The reset link could not be sent. Please try again.')
      } else {
        setCooldown(true)
        setMessage(result?.cooldown
          ? 'A reset link was already sent recently. Wait up to five minutes and use the newest message—requesting repeatedly cancels older links.'
          : 'Your newest reset request is active. Wait up to five minutes for the email or text and do not request another link; a newer request would cancel this one.')
      }
    } catch {
      setMessage('The portal could not reach the reset service. Check your connection and try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <main className="account-recovery-page">
      <form
        className="account-recovery-card"
        onSubmit={(event) => { event.preventDefault(); if (!sending && !cooldown && email.trim()) sendResetLink() }}
        aria-busy={sending}
      >
        <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
        <span>ACCOUNT RECOVERY</span>
        <h1>Reset your password</h1>
        <p>Enter the email or mobile number connected to your camper account.</p>

        <label htmlFor="reset-email">Email address or mobile number</label>
        <div className="signin-input-wrap">
          <Mail size={18} />
          <input
            id="reset-email"
            type="text"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="Email or mobile number"
            autoComplete="username"
            required
            aria-describedby={message ? 'reset-message' : undefined}
          />
        </div>

        <button type="submit" disabled={sending || cooldown || !email.trim()}>
          <Send size={17} /> {sending ? 'Sending…' : cooldown ? 'Reset requested' : 'Send reset link'}
        </button>

        {message && <p className="account-recovery-message" id="reset-message" role="status" aria-live="polite">{message}</p>}
        <a href="/login">Return to sign in</a>
      </form>
    </main>
  )
}
