'use client'

import { useState } from 'react'
import { ArrowRight, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError('')
    setLoading(true)

    try {
      const normalizedEmail = email.trim().toLowerCase()
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      })

      if (authError) {
        setError(authError.message)
        return
      }

      const { data: sessionData } = await supabase.auth.getSession()
      const token = sessionData.session?.access_token

      if (!token) {
        await supabase.auth.signOut()
        setError('Login session could not be verified. Please try again.')
        return
      }

      const destinationResponse = await fetch('/api/login-destination', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const destinationResult = await destinationResponse.json().catch(() => null)

      if (!destinationResponse.ok || !destinationResult?.destination) {
        await supabase.auth.signOut()
        const diagnosticDetails = [
          destinationResult?.email ? `Signed in as ${destinationResult.email}.` : '',
          destinationResult?.serviceRoleConfigured === false ? 'Server service key missing.' : '',
          typeof destinationResult?.camperMatchCount === 'number' ? `Camper matches: ${destinationResult.camperMatchCount}.` : '',
          destinationResult?.camperSummary ? `Records: ${destinationResult.camperSummary}.` : '',
        ].filter(Boolean).join(' ')
        setError(
          diagnosticDetails
            ? `${destinationResult?.error || 'This login is not connected to a camper record.'} ${diagnosticDetails}`
            : destinationResult?.error || 'This login is not connected to a camper record. Please contact the campground office.'
        )
        return
      }

      window.location.href = destinationResult.destination
    } catch (err) {
      console.error(err)
      setError('Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="signin-page">
      <section className="signin-story">
        <a className="signin-brand" href="/">
          <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
          <span><strong>Bur Oaks</strong><small>Campground</small></span>
        </a>

        <div className="signin-story-copy">
          <span><ShieldCheck size={16} /> Secure member access</span>
          <h1>Welcome back to your place in the oaks.</h1>
          <p>Your account, your site, and your campground community—together in one portal.</p>
        </div>

        <small className="signin-est">A site to remember · Est. 1972</small>
      </section>

      <section className="signin-form-side">
        <div className="signin-form-card">
          <span className="signin-form-kicker">BUR OAKS CAMPER PORTAL</span>
          <h2>Sign in to continue</h2>
          <p>Use the email and password connected to your camper account.</p>

          <label htmlFor="signin-email">Email address</label>
          <div className="signin-input-wrap">
            <Mail size={18} />
            <input
              id="signin-email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
            />
          </div>

          <label htmlFor="signin-password">Password</label>
          <div className="signin-input-wrap">
            <LockKeyhole size={18} />
            <input
              id="signin-password"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !loading) handleLogin()
              }}
              autoComplete="current-password"
            />
          </div>

          {error && <div className="signin-error">{error}</div>}

          <button className="signin-submit" onClick={handleLogin} disabled={loading}>
            {loading ? 'Signing in…' : 'Sign in'}
            {!loading && <ArrowRight size={18} />}
          </button>

          <a className="signin-forgot-link" href="/forgot-password">
            Forgot your password?
          </a>

          <small className="signin-help">
            Need account help? Contact the campground office.<br />
            <a href="/privacy">Privacy</a> · <a href="/terms">Terms</a>
          </small>
        </div>
      </section>
    </main>
  )
}
