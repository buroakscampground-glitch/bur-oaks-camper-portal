'use client'

import { useEffect, useState } from 'react'
import { AlertTriangle, Check, MessageSquareText } from 'lucide-react'

type InvoiceSmsOptInAlertProps = {
  optedIn: boolean
  saving: boolean
  message?: string
  onOptIn: () => Promise<void> | void
}

export default function InvoiceSmsOptInAlert({
  optedIn,
  saving,
  message = '',
  onOptIn,
}: InvoiceSmsOptInAlertProps) {
  const [consentChecked, setConsentChecked] = useState(false)

  useEffect(() => {
    if (optedIn) setConsentChecked(false)
  }, [optedIn])

  if (optedIn) return null

  return (
    <section className="invoice-sms-alert" role="alert" aria-labelledby="invoice-sms-alert-title">
      <div className="invoice-sms-alert-icon" aria-hidden="true">
        <AlertTriangle size={27} />
      </div>

      <div className="invoice-sms-alert-content">
        <span><MessageSquareText size={15} /> IMPORTANT — TEXT ALERTS ARE OFF</span>
        <h2 id="invoice-sms-alert-title">Do not miss a new bill or campground update.</h2>
        <p>Turn on texts for instant invoice notices, due-date reminders, private office messages, and important campground alerts.</p>

        <label className="invoice-sms-alert-consent">
          <input
            type="checkbox"
            checked={consentChecked}
            onChange={(event) => setConsentChecked(event.target.checked)}
            disabled={saving}
          />
          <span>
            <strong>I agree to receive Bur Oaks Campground text alerts.</strong>
            <small>
              I agree to recurring, non-marketing SMS messages at every mobile number saved on my household profile for invoices, payment reminders, private office and account notices, maintenance and pump-out updates, gate and utility notices, event reminders, and safety or weather alerts. I confirm I have permission to enroll each saved number. Message frequency varies. Message and data rates may apply. Reply STOP to opt out. Consent is optional and is not a condition of service. <a href="/sms-terms">SMS Terms</a> · <a href="/privacy">Privacy Policy</a>
            </small>
          </span>
        </label>

        <button type="button" onClick={onOptIn} disabled={!consentChecked || saving}>
          <Check size={18} /> {saving ? 'Turning on texts…' : 'Opt In to Text Alerts'}
        </button>
        {message && <p className="invoice-sms-alert-message">{message}</p>}
      </div>
    </section>
  )
}
