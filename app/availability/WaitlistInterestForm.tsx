'use client'

import type { FormEvent } from 'react'
import { useState } from 'react'

export default function WaitlistInterestForm() {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [desiredSite, setDesiredSite] = useState('')
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
          desiredSite,
          notes,
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok) {
        setMessage(result?.error || 'We could not send your request. Please call the campground.')
        return
      }

      setSubmitted(true)
      setMessage('You are on our interest list! We will reach out when we can talk through availability.')
      setFirstName('')
      setLastName('')
      setPhone('')
      setEmail('')
      setDesiredSite('')
      setNotes('')
    } catch {
      setMessage('We could not send your request. Please call the campground.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="public-waitlist-form" onSubmit={submitInterest}>
      <span className="public-kicker">Join the waitlist</span>
      <h3>Want a seasonal site?</h3>
      <p>
        Tell us a little about what you are looking for and we will add you to
        the Bur Oaks waitlist in our office portal.
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

      <label>
        Desired site or camper size
        <input
          value={desiredSite}
          onChange={(event) => setDesiredSite(event.target.value)}
          placeholder="Example: seasonal site, larger camper, near friends, etc."
        />
      </label>

      <label>
        Anything else we should know?
        <textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder="Tell us timing, camper size, family needs, or questions."
        />
      </label>

      <button type="submit" disabled={submitting || submitted}>
        {submitting ? 'Sending…' : submitted ? 'Added to waitlist' : 'Send my information'}
      </button>

      {message && <small className={submitted ? 'success' : ''}>{message}</small>}
    </form>
  )
}
