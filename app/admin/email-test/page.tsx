'use client'

import { useState } from 'react'
import { AlertTriangle, CheckCircle2, MailCheck, Send } from 'lucide-react'
import { supabase } from '../../../lib/supabase'

export default function AdminEmailTestPage() {
  const [testing, setTesting] = useState(false)
  const [testingInvoice, setTestingInvoice] = useState(false)
  const [result, setResult] = useState<any | null>(null)
  const [invoiceResult, setInvoiceResult] = useState<any | null>(null)
  const [testTo, setTestTo] = useState('buroakscampground@gmail.com')

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

  async function sendInvoiceEmailTest() {
    setTestingInvoice(true)
    setInvoiceResult(null)

    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token

    if (!token) {
      window.location.href = '/login'
      return
    }

    try {
      const response = await fetch('/api/invoice-email-test', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to: testTo }),
      })

      const body = await response.json().catch(() => null)
      setInvoiceResult({
        ok: response.ok && body?.success,
        ...body,
      })
    } catch (error: any) {
      setInvoiceResult({
        ok: false,
        message: error?.message || 'Unable to run invoice email test.',
      })
    } finally {
      setTestingInvoice(false)
    }
  }

  return (
    <main className="admin-email-test-page">
      <section className="admin-email-test-card">
        <span><MailCheck size={18} /> ADMIN EMAIL ALERTS</span>
        <h1>Test maintenance and payment emails.</h1>
        <p>
          This sends one real test email using the same admin alert setup used by
          maintenance requests, waitlist requests, payment alerts, and RSVP alerts.
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
                  <li>Provider: {result.configured.provider || 'Not connected'}</li>
                  <li>Ready: {result.configured.ready ? 'Yes' : 'No'}</li>
                  <li>To: {result.configured.to}</li>
                  <li>From: {result.configured.from}</li>
                  <li>Reply-to: {result.configured.replyTo}</li>
                  {result.configured.reason && <li>Reason: {result.configured.reason}</li>}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="admin-email-test-card">
        <span><MailCheck size={18} /> CAMPER INVOICE EMAILS</span>
        <h1>Test automatic invoice emails.</h1>
        <p>
          This sends one real test using the same provider used for new invoice,
          due soon, due today, and past-due camper emails.
        </p>

        <label style={{ display: 'grid', gap: 8, margin: '16px 0', color: '#516158', fontSize: 12, fontWeight: 800 }}>
          Test recipient email
          <input
            value={testTo}
            onChange={(event) => setTestTo(event.target.value)}
            placeholder="buroakscampground@gmail.com"
            style={{ minHeight: 42, borderRadius: 10, border: '1px solid #d9dfd5', padding: '0 12px' }}
          />
        </label>

        <button type="button" onClick={sendInvoiceEmailTest} disabled={testingInvoice}>
          <Send size={17} /> {testingInvoice ? 'Sending invoice test…' : 'Send invoice email test'}
        </button>

        {invoiceResult && (
          <div className={`admin-email-test-result ${invoiceResult.ok ? 'success' : 'failed'}`}>
            {invoiceResult.ok ? <CheckCircle2 size={22} /> : <AlertTriangle size={22} />}
            <div>
              <strong>{invoiceResult.ok ? 'Invoice email test sent' : 'Invoice email test failed'}</strong>
              <p>{invoiceResult.message || 'No message returned.'}</p>
              {invoiceResult.configured && (
                <ul>
                  <li>Provider: {invoiceResult.configured.provider || 'Not connected'}</li>
                  <li>Ready: {invoiceResult.configured.ready ? 'Yes' : 'No'}</li>
                  <li>From: {invoiceResult.configured.from || 'Missing'}</li>
                  <li>Reply-to: {invoiceResult.configured.replyTo || 'Missing'}</li>
                  {invoiceResult.configured.reason && <li>Reason: {invoiceResult.configured.reason}</li>}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    </main>
  )
}
