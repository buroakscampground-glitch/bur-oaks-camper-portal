export type SaturdayDinnerSignupRecord = {
  id?: unknown
  dinner_date?: unknown
  camper_id?: unknown
  lot_number?: unknown
  camper_name?: unknown
  attending_status?: unknown
  bringing?: unknown
  guest_count?: unknown
  created_at?: unknown
  updated_at?: unknown
}

export type SaturdayDinnerMetrics = {
  responses: number
  goingCampsites: number
  maybeCampsites: number
  notGoingCampsites: number
  confirmedPeople: number
  possiblePeople: number
  confirmedDishes: number
  possibleDishes: number
  goingWithoutDish: number
}

// Camper response history starts with the first dinner promoted through the
// portal. Earlier menu dates were not consistently collected and must never be
// misreported as ignored invitations.
export const saturdayDinnerEngagementStartDate = '2026-10-10'

function safeCount(value: unknown) {
  const count = Math.round(Number(value || 1))
  return Number.isFinite(count) ? Math.max(1, Math.min(99, count)) : 1
}

function recordTimestamp(record: SaturdayDinnerSignupRecord) {
  const value = String(record.updated_at || record.created_at || '')
  const timestamp = Date.parse(value)
  return Number.isNaN(timestamp) ? 0 : timestamp
}

function signupIdentity(record: SaturdayDinnerSignupRecord) {
  const camperId = String(record.camper_id || '').trim()
  if (camperId) return `camper:${camperId}`

  const lot = String(record.lot_number || '').trim().toUpperCase()
  const name = String(record.camper_name || '').trim().toLowerCase()
  if (lot || name) return `legacy:${lot}:${name}`

  return `row:${String(record.id || '')}`
}

/**
 * Keeps one authoritative response per campsite and dinner. The database has a
 * unique constraint for current records, while this also protects the screens
 * from older/imported duplicate rows by preferring the most recently updated.
 */
export function canonicalSaturdayDinnerSignups<T extends SaturdayDinnerSignupRecord>(records: T[]) {
  const canonical = new Map<string, T>()

  for (const record of records) {
    const date = String(record.dinner_date || '').trim()
    if (!date) continue
    const key = `${date}:${signupIdentity(record)}`
    const existing = canonical.get(key)
    if (!existing || recordTimestamp(record) >= recordTimestamp(existing)) {
      canonical.set(key, record)
    }
  }

  return Array.from(canonical.values())
}

export function saturdayDinnerMetrics(records: SaturdayDinnerSignupRecord[]): SaturdayDinnerMetrics {
  const signups = canonicalSaturdayDinnerSignups(records)
  const going = signups.filter((signup) => String(signup.attending_status || '') === 'Going')
  const maybe = signups.filter((signup) => String(signup.attending_status || '') === 'Maybe')
  const notGoing = signups.filter((signup) => String(signup.attending_status || '') === 'Not Going')
  const hasDish = (signup: SaturdayDinnerSignupRecord) => Boolean(String(signup.bringing || '').trim())

  return {
    responses: signups.length,
    goingCampsites: going.length,
    maybeCampsites: maybe.length,
    notGoingCampsites: notGoing.length,
    confirmedPeople: going.reduce((total, signup) => total + safeCount(signup.guest_count), 0),
    possiblePeople: maybe.reduce((total, signup) => total + safeCount(signup.guest_count), 0),
    confirmedDishes: going.filter(hasDish).length,
    possibleDishes: maybe.filter(hasDish).length,
    goingWithoutDish: going.filter((signup) => !hasDish(signup)).length,
  }
}
