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
      const { error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError(authError.message)
        return
      }

      const { data: camper } = await supabase
        .from('campers')
        .select('role')
        .eq('email', email.toLowerCase())
        .single()

      const role = camper?.role?.toLowerCase()

      if (role === 'admin') {
        window.location.href = '/admin'
      } else if (role === 'maintenance') {
        window.location.href = '/maintenance/dashboard'
      } else {
        window.location.href = '/portal'
      }
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

          <small className="signin-help">Need account help? Contact the campground office.</small>
        </div>
      </section>
    </main>
  )
}
