'use client'

import { FormEvent, useState } from 'react'
import { CheckCircle2, LoaderCircle, MapPin, Search } from 'lucide-react'

export type FoundAddress = {
  line1: string
  city: string
  state: string
  zip: string
  formatted: string
}

export default function AddressFinder({
  onSelect,
  initialAddress = '',
}: {
  onSelect: (address: FoundAddress) => void
  initialAddress?: string
}) {
  const [query, setQuery] = useState(initialAddress)
  const [searching, setSearching] = useState(false)
  const [message, setMessage] = useState('')
  const [found, setFound] = useState(false)

  async function findAddress(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setMessage('')
    setFound(false)

    if (query.trim().length < 8) {
      setMessage('Enter the street address, city, state, and ZIP code.')
      return
    }

    setSearching(true)
    try {
      const response = await fetch('/api/address-lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: query.trim() }),
      })
      const result = await response.json()

      if (!response.ok || !result.match) {
        setMessage(result.error || 'We could not verify that address. You can enter it manually below.')
        return
      }

      onSelect(result.match as FoundAddress)
      setQuery(result.match.formatted)
      setFound(true)
      setMessage('Address found. The fields below have been filled in for you.')
    } catch {
      setMessage('The address finder is temporarily unavailable. You can still enter it manually below.')
    } finally {
      setSearching(false)
    }
  }

  return (
    <div className="address-finder">
      <div className="address-finder-heading">
        <span><MapPin size={18} /></span>
        <div>
          <strong>Find the address automatically</strong>
          <small>Enter the complete address, then choose Find &amp; fill.</small>
        </div>
      </div>
      <form onSubmit={findAddress}>
        <label>
          <span className="sr-only">Complete mailing address</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="123 Main St, Edwardsville, IL 62025"
            autoComplete="off"
            disabled={searching}
          />
        </label>
        <button type="submit" disabled={searching}>
          {searching ? <LoaderCircle className="address-finder-spinner" size={17} /> : <Search size={17} />}
          {searching ? 'Finding…' : 'Find & fill'}
        </button>
      </form>
      {message ? (
        <p aria-live="polite" className={found ? 'address-finder-message success' : 'address-finder-message'}>
          {found ? <CheckCircle2 size={15} /> : null}
          {message}
        </p>
      ) : null}
    </div>
  )
}
