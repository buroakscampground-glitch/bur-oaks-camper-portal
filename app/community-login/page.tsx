'use client'

import { ArrowRight, CalendarDays, CakeSlice, LockKeyhole, Mail, MessageCircle, ShieldCheck, Soup } from 'lucide-react'
import { useState } from 'react'
import { safeLoginReturnPath } from '../../lib/login-return-path'
import { portalLoginEmail } from '../../lib/phone-portal-login'
import { supabase } from '../../lib/supabase'

export default function CommunityLoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError('')
    setLoading(true)
    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: portalLoginEmail(email),
        password,
      })
      if (authError) {
        setError(authError.message)
        return
      }

      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) throw new Error('Login session could not be verified. Please try again.')
      const response = await fetch('/api/login-destination', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const result = await response.json().catch(() => ({}))
      const role = String(result.role || '').toLowerCase()
      if (!response.ok || !['admin', 'event_coordinator'].includes(role)) {
        await supabase.auth.signOut()
        setError('This login does not have access to the Community workspace.')
        return
      }

      const requested = new URLSearchParams(window.location.search).get('returnTo')
      window.location.href = safeLoginReturnPath(requested, role) || '/community'
    } catch (loginError) {
      console.error(loginError)
      setError(loginError instanceof Error ? loginError.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="signin-page">
      <section className="signin-story">
        <a className="signin-brand" href="/"><img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" /><span><strong>Bur Oaks</strong><small>Community</small></span></a>
        <div className="signin-story-copy">
          <span><ShieldCheck size={16} /> Separate Community entrance</span>
          <h1>Campground talk, events, and celebrations.</h1>
          <p>This entrance opens the Community workspace without the billing, finance, or maintenance screens.</p>
        </div>
        <div className="signin-feature-strip" aria-label="Community workspace highlights">
          <article><MessageCircle size={18} /><span><strong>Community feed</strong><small>Keep up with campground talk</small></span></article>
          <article><CalendarDays size={18} /><span><strong>Events & RSVPs</strong><small>Plan and track attendance</small></span></article>
          <article><Soup size={18} /><span><strong>Dinners & birthdays</strong><small>Everything fun in one place</small></span></article>
        </div>
        <small className="signin-est">Bur Oaks Community · Separate from Admin</small>
      </section>

      <section className="signin-form-side">
        <div className="signin-form-card">
          <div className="signin-card-badge"><CakeSlice size={17} /><span>Community workspace</span></div>
          <span className="signin-form-kicker">BUR OAKS COMMUNITY</span>
          <h2>Sign in to Community</h2>
          <p>Dawn can use the same email and password as her Admin account.</p>

          <label htmlFor="community-email">Email address</label>
          <div className="signin-input-wrap"><Mail size={18} /><input id="community-email" type="email" inputMode="email" placeholder="Email address" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" /></div>
          <label htmlFor="community-password">Password</label>
          <div className="signin-input-wrap"><LockKeyhole size={18} /><input id="community-password" type="password" placeholder="Enter your password" value={password} onChange={(event) => setPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !loading) void handleLogin() }} autoComplete="current-password" /></div>
          {error && <div className="signin-error">{error}</div>}
          <button className="signin-submit" type="button" onClick={() => void handleLogin()} disabled={loading}>{loading ? 'Opening Community…' : 'Open Community'}{!loading && <ArrowRight size={18} />}</button>
          <a className="signin-forgot-link" href="/forgot-password">Forgot your password?</a>
          <small className="signin-help">Need Admin instead? <a href="/login">Open the Admin sign-in</a>.</small>
        </div>
      </section>
    </main>
  )
}
