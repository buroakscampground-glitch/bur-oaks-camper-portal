'use client'

import type { FormEvent } from 'react'
import { useRef, useState } from 'react'
import { trackPublicEvent } from '../../lib/publicAnalytics'

export default function WaitlistInterestForm() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [camperType, setCamperType] = useState('')
  const [camperLength, setCamperLength] = useState('')
  const [timeline, setTimeline] = useState('Flexible')
  const [desiredSite, setDesiredSite] = useState('')
  const [tourRequested, setTourRequested] = useState(false)
  const [preferredTourDate, setPreferredTourDate] = useState('')
  const [preferredTourTime, setPreferredTourTime] = useState('Flexible')
  const [notes, setNotes] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submissionLock = useRef(false)
  const started = useRef(false)
  const messageRef = useRef<HTMLElement>(null)

  function trackStart() {
    if (started.current) return
    started.current = true
    trackPublicEvent('membership_inquiry_started', { form: 'public_waitlist', source: 'website' })
  }

  function showMessage(nextMessage: string) {
    setMessage(nextMessage)
    window.setTimeout(() => messageRef.current?.focus(), 0)
  }

  async function submitInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submissionLock.current || submitted) return
    trackStart()
    setMessage('')

    if (!firstName.trim() || !lastName.trim()) {
      trackPublicEvent('membership_inquiry_validation_error', { field_group: 'name' })
      showMessage('Please add your first and last name.')
      return
    }

    if (!phone.trim() && !email.trim()) {
      trackPublicEvent('membership_inquiry_validation_error', { field_group: 'contact' })
      showMessage('Please add a phone number or email so we can reach you.')
      return
    }

    submissionLock.current = true
    setSubmitting(true)
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 20_000)

    try {
      const response = await fetch('/api/public-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          firstName,
          lastName,
          phone,
          email,
          camperType,
          camperLength,
          timeline,
          desiredSite,
          tourRequested,
          preferredTourDate,
          preferredTourTime,
          notes,
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        const reference = response.headers.get('x-request-id')?.slice(0, 8)
        trackPublicEvent('membership_inquiry_failed', { reason: `http_${response.status}` })
        showMessage(`${result?.error || 'We could not send your request. Please call the campground.'}${reference ? ` Reference: ${reference}.` : ''}`)
        return
      }

      setSubmitted(true)
      trackPublicEvent('membership_inquiry_submitted', { form: 'public_waitlist', source: 'website' })
      if (tourRequested) {
        trackPublicEvent('tour_request_submitted', { form: 'public_waitlist', source: 'website' })
      }
      showMessage('Your membership inquiry was received! We will reach out to talk through availability.')
      setFirstName('')
      setLastName('')
      setPhone('')
      setEmail('')
      setCamperType('')
      setCamperLength('')
      setTimeline('Flexible')
      setDesiredSite('')
      setTourRequested(false)
      setPreferredTourDate('')
      setPreferredTourTime('Flexible')
      setNotes('')
    } catch {
      trackPublicEvent('membership_inquiry_failed', { reason: 'unconfirmed_connection' })
      showMessage('We could not confirm whether your inquiry was received. Please wait a minute and call the campground before trying again, so your name is not added twice.')
    } finally {
      window.clearTimeout(timeout)
      submissionLock.current = false
      setSubmitting(false)
    }
  }

  return (
    <form
      id="membership-inquiry"
      className="public-waitlist-form"
      onSubmit={submitInterest}
      onFocusCapture={trackStart}
      aria-busy={submitting}
    >
      <span className="public-kicker">Seasonal interest list</span>
      <h3>Tell us what would make a good fit.</h3>
      <p>
        Share your contact details and camping setup. Your inquiry goes straight
        into the Bur Oaks office waitlist for future availability.
      </p>

      <div className="public-waitlist-grid">
        <label>
          First name
          <input required maxLength={80} value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
        </label>
        <label>
          Last name
          <input required maxLength={80} value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
        </label>
      </div>

      <label>
        Phone number <small>Phone or email required</small>
        <input type="tel" inputMode="tel" maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
      </label>

      <label>
        Email <small>Phone or email required</small>
        <input type="email" maxLength={120} value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
      </label>

      <div className="public-waitlist-grid">
        <label>
          Camper type
          <select value={camperType} onChange={(event) => setCamperType(event.target.value)}>
            <option value="">Select one</option>
            <option>Travel trailer</option>
            <option>Fifth wheel</option>
            <option>Park model</option>
            <option>Motorhome</option>
            <option>Tent / smaller setup</option>
            <option>Still deciding</option>
          </select>
        </label>
        <label>
          Camper length
          <input
            value={camperLength}
            maxLength={60}
            onChange={(event) => setCamperLength(event.target.value)}
            placeholder="Example: 32 ft"
          />
        </label>
      </div>

      <label>
        When are you hoping to start?
        <select value={timeline} onChange={(event) => setTimeline(event.target.value)}>
          <option>Flexible</option>
          <option>As soon as the right site opens</option>
          <option>This season</option>
          <option>Next season</option>
          <option>Just researching</option>
        </select>
      </label>

      <label>
        Preferred site feel
        <input
          value={desiredSite}
          maxLength={180}
          onChange={(event) => setDesiredSite(event.target.value)}
          placeholder="Example: near friends, quiet area, lake area, larger camper, etc."
        />
      </label>

      <label className="public-tour-option">
        <input
          type="checkbox"
          checked={tourRequested}
          onChange={(event) => setTourRequested(event.target.checked)}
        />
        <span><strong>I would like to tour the campground</strong><small>We will contact you to confirm a date and time.</small></span>
      </label>

      {tourRequested && <div className="public-waitlist-grid public-tour-fields">
        <label>
          Preferred tour date
          <input
            type="date"
            value={preferredTourDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(event) => setPreferredTourDate(event.target.value)}
          />
        </label>
        <label>
          Preferred time
          <select value={preferredTourTime} onChange={(event) => setPreferredTourTime(event.target.value)}>
            <option>Flexible</option>
            <option>Morning</option>
            <option>Afternoon</option>
            <option>Early evening</option>
          </select>
        </label>
      </div>}

      <label>
        Anything else we should know?
        <textarea
          value={notes}
          maxLength={900}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Tell us timing, camper size, family needs, or questions."
        />
      </label>

      <button type="submit" disabled={submitting || submitted}>
        {submitting ? 'Sending…' : submitted ? 'Inquiry received' : 'Join the seasonal interest list'}
      </button>

      {message && (
        <small
          ref={messageRef}
          className={submitted ? 'success' : ''}
          role={submitted ? 'status' : 'alert'}
          aria-live={submitted ? 'polite' : 'assertive'}
          tabIndex={-1}
        >
          {message}
        </small>
      )}
    </form>
  )
}
