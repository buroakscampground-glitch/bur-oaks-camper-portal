import { NextResponse } from 'next/server'
import { checkRateLimit } from '../../../lib/rate-limit'

type CensusAddressMatch = {
  matchedAddress?: string
  addressComponents?: {
    fromAddress?: string
    preDirection?: string
    preType?: string
    streetName?: string
    suffixType?: string
    suffixDirection?: string
    city?: string
    state?: string
    zip?: string
  }
}

function cleanPart(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function titleCase(value: string) {
  return value
    .toLowerCase()
    .replace(/(^|[\s.-])([a-z])/g, (_match, separator: string, letter: string) => `${separator}${letter.toUpperCase()}`)
}

function formatMatch(match: CensusAddressMatch) {
  const parts = match.addressComponents || {}
  const line1 = [
    parts.fromAddress,
    parts.preDirection,
    parts.preType,
    parts.streetName,
    parts.suffixType,
    parts.suffixDirection,
  ]
    .map(cleanPart)
    .filter(Boolean)
    .join(' ')

  const matchedParts = cleanPart(match.matchedAddress)
    .split(',')
    .map((part) => part.trim())

  const city = cleanPart(parts.city) || matchedParts.at(-3) || ''
  const state = cleanPart(parts.state) || matchedParts.at(-2) || ''
  const zip = cleanPart(parts.zip) || matchedParts.at(-1) || ''
  const street = line1 || matchedParts.slice(0, -3).join(', ')

  if (!street || !city || !state || !zip) return null

  const normalized = {
    line1: titleCase(street),
    city: titleCase(city),
    state: state.toUpperCase(),
    zip,
  }

  return {
    ...normalized,
    formatted: `${normalized.line1}, ${normalized.city}, ${normalized.state} ${normalized.zip}`,
  }
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'address-lookup', 20, 10 * 60_000)

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many address searches. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  let body: { address?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Enter an address to search.' }, { status: 400 })
  }

  const address = cleanPart(body.address)
  if (address.length < 8 || address.length > 200) {
    return NextResponse.json(
      { error: 'Enter the full street address, city, state, and ZIP code.' },
      { status: 400 }
    )
  }

  const search = new URLSearchParams({
    address,
    benchmark: 'Public_AR_Current',
    format: 'json',
  })

  try {
    const response = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${search.toString()}`,
      { cache: 'no-store', signal: AbortSignal.timeout(8_000) }
    )

    if (!response.ok) throw new Error(`Census address service returned ${response.status}`)

    const payload = await response.json()
    const match = formatMatch(payload?.result?.addressMatches?.[0] || {})

    if (!match) {
      return NextResponse.json(
        { error: 'We could not verify that address. Try adding the city, state, and ZIP, or enter it manually below.' },
        { status: 404 }
      )
    }

    return NextResponse.json({ match })
  } catch (error) {
    console.error('Address lookup failed:', error)
    return NextResponse.json(
      { error: 'The address finder is temporarily unavailable. You can still enter the address manually below.' },
      { status: 502 }
    )
  }
}
