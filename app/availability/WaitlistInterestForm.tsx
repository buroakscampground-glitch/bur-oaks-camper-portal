'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'
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

  async function submitInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')

    if (!firstName.trim() || !lastName.trim()) {
      setMessage('Please add your first and last name.')
      return
    }

    if (!phone.trim() && !email.trim()) {
      setMessage('Please add a phone number or email so we can reach you.')
      return
    }

    setSubmitting(true)

    try {
      const response = await fetch('/api/public-waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        setMessage(result?.error || 'We could not send your request. Please call the campground.')
        return
      }

      setSubmitted(true)
      trackPublicEvent('membership_inquiry_submitted', { form: 'public_waitlist', source: 'website' })
      if (tourRequested) {
        trackPublicEvent('tour_request_submitted', { form: 'public_waitlist', source: 'website' })
      }
      setMessage('Your membership inquiry was received! We will reach out to talk through availability.')
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
      setMessage('We could not send your request. Please call the campground.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form id="membership-inquiry" className="public-waitlist-form" onSubmit={submitInterest}>
      <span className="public-kicker">Seasonal interest list</span>
      <h3>Tell us what would make a good fit.</h3>
      <p>
        Share your contact details and camping setup. Your inquiry goes straight
        into the Bur Oaks office waitlist for future availability.
      </p>

      <div className="public-waitlist-grid">
        <label>
          First name
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
        </label>
        <label>
          Last name
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
        </label>
      </div>

      <label>
        Phone number
        <input value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" />
      </label>

      <label>
        Email
        <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" />
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
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Tell us timing, camper size, family needs, or questions."
        />
      </label>

      <button type="submit" disabled={submitting || submitted}>
        {submitting ? 'Sending…' : submitted ? 'Inquiry received' : 'Join the seasonal interest list'}
      </button>

      {message && <small className={submitted ? 'success' : ''}>{message}</small>}
    </form>
  )
}
