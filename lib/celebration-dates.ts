export type CentralDate = {
  year: number
  month: number
  day: number
  iso: string
}

export function centralDate(now = new Date()): CentralDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
  const year = value('year')
  const month = value('month')
  const day = value('day')
  return { year, month, day, iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` }
}

function parseDate(value: unknown) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  const normalized = new Date(Date.UTC(year, month - 1, day))
  if (
    normalized.getUTCFullYear() !== year ||
    normalized.getUTCMonth() + 1 !== month ||
    normalized.getUTCDate() !== day
  ) return null
  return { year, month, day }
}

export function birthdayIsToday(value: unknown, today: CentralDate) {
  const date = parseDate(value)
  return Boolean(date && date.month === today.month && date.day === today.day)
}

export function anniversaryYears(value: unknown, today: CentralDate) {
  const date = parseDate(value)
  if (!date || date.month !== today.month || date.day !== today.day) return 0
  return Math.max(0, today.year - date.year)
}
