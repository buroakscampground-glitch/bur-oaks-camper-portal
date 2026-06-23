'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, MailCheck, Send } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

export default function AdminEmailTestPage() {
  const [testing, setTesting] = useState(false)
  const [result, setResult] = useState<any | null>(null)

  async function sendTestEmail() {
    setTesting(true)
    setResult(null)

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      window.location.href = '/login'
      return
    }

    try {
      const response = await fetch('/api/admin-email-test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      })

      const body = await response.json().catch(() => null)
      setResult({
        ok: response.ok && body?.success,
        ...body,
      })
    } catch (error: any) {
      setResult({
        ok: false,
        message: error?.message || 'Unable to run email test.',
      })
    } finally {
      setTesting(false)
    }
  }

  return (
    <main className="admin-email-test-page">
      <section className="admin-email-test-card">
        <span><MailCheck size={18} /> ADMIN EMAIL ALERTS</span>
        <h1>Test maintenance and payment emails.</h1>
        <p>
          This sends one real test email using the same Resend setup used by
          maintenance requests, payment alerts, and RSVP alerts.
        </p>

        <button type="button" onClick={sendTestEmail} disabled={testing}>
          <Send size={17} /> {testing ? 'Sending test email…' : 'Send test email'}
        </button>

        {result && (
          <div className={`admin-email-test-result ${result.ok ? 'success' : 'failed'}`}>
            {result.ok ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
            <div>
              <strong>{result.ok ? 'Email test sent' : 'Email test failed'}</strong>
              <p>{result.message || 'No message returned.'}</p>
              {result.configured && (
                <ul>
                  <li>Resend key: {result.configured.hasResendKey ? 'Found' : 'Missing'}</li>
                  <li>To: {result.configured.to}</li>
                  <li>From: {result.configured.from}</li>
                  <li>Reply-to: {result.configured.replyTo}</li>
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
