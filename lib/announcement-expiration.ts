const centralTimeZone = 'America/Chicago'

type CalendarDate = { year: number; month: number; day: number }

export type ExpirableAnnouncement = {
  title?: unknown
  message?: unknown
  created_at?: unknown
}

function centralDate(value: Date): CalendarDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: centralTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value)
  const number = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
  return { year: number('year'), month: number('month'), day: number('day') }
}

function fromIso(value: string): CalendarDate | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  if (Number.isNaN(date.getTime())) return null
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function toIso(value: CalendarDate) {
  return `${value.year}-${String(value.month).padStart(2, '0')}-${String(value.day).padStart(2, '0')}`
}

function addDays(value: CalendarDate, days: number): CalendarDate {
  const date = new Date(Date.UTC(value.year, value.month - 1, value.day + days))
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() }
}

function validDate(year: number, month: number, day: number): CalendarDate | null {
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null
  return { year, month, day }
}

function resolveYear(month: number, day: number, created: CalendarDate, suppliedYear?: number) {
  if (suppliedYear) return suppliedYear < 100 ? 2000 + suppliedYear : suppliedYear
  const thisYear = validDate(created.year, month, day)
  if (!thisYear) return created.year
  return toIso(thisYear) < toIso(addDays(created, -45)) ? created.year + 1 : created.year
}

function latest(values: CalendarDate[]) {
  return values.sort((a, b) => toIso(a).localeCompare(toIso(b))).at(-1) || null
}

function weekdayOnOrAfter(created: CalendarDate, weekday: number) {
  const date = new Date(Date.UTC(created.year, created.month - 1, created.day))
  const distance = (weekday - date.getUTCDay() + 7) % 7
  return addDays(created, distance)
}

const months: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4,
  may: 5, june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8,
  september: 9, sep: 9, sept: 9, october: 10, oct: 10, november: 11, nov: 11,
  december: 12, dec: 12,
}

const weekdays: Record<string, number> = {
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
}

export function announcementRemoveOnDate(announcement: ExpirableAnnouncement): string | null {
  const createdValue = new Date(String(announcement.created_at || ''))
  if (Number.isNaN(createdValue.getTime())) return null
  const created = centralDate(createdValue)
  const text = `${String(announcement.title || '')}\n${String(announcement.message || '')}`.toLowerCase()
  const eventDates: CalendarDate[] = []

  for (const match of text.matchAll(/\b(20\d{2})-(0?[1-9]|1[0-2])-(0?[1-9]|[12]\d|3[01])\b/g)) {
    const date = validDate(Number(match[1]), Number(match[2]), Number(match[3]))
    if (date) eventDates.push(date)
  }

  for (const match of text.matchAll(/\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/g)) {
    const month = months[match[1]]
    const day = Number(match[2])
    const date = validDate(resolveYear(month, day, created, match[3] ? Number(match[3]) : undefined), month, day)
    if (date) eventDates.push(date)
  }

  for (const match of text.matchAll(/\b(0?[1-9]|1[0-2])\/(0?[1-9]|[12]\d|3[01])(?:\/(\d{2}|20\d{2}))?\b/g)) {
    const month = Number(match[1])
    const day = Number(match[2])
    const date = validDate(resolveYear(month, day, created, match[3] ? Number(match[3]) : undefined), month, day)
    if (date) eventDates.push(date)
  }

  for (const [name, weekday] of Object.entries(weekdays)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(text)) eventDates.push(weekdayOnOrAfter(created, weekday))
  }

  if (/\btomorrow\b/.test(text)) eventDates.push(addDays(created, 1))
  if (/\b(today|tonight|this evening|is ready)\b/.test(text)) eventDates.push(created)
  if (/\bweekend\b/.test(text)) eventDates.push(weekdayOnOrAfter(created, 0))
  if (/\b(weather alert|storm warning|storms? (?:are |is )?expected)\b/.test(text)) eventDates.push(addDays(created, 1))

  const finalEventDate = latest(eventDates)
  return finalEventDate ? toIso(addDays(finalEventDate, 1)) : null
}

export function isAnnouncementExpired(announcement: ExpirableAnnouncement, now = new Date()) {
  const removeOn = announcementRemoveOnDate(announcement)
  return Boolean(removeOn && toIso(centralDate(now)) >= removeOn)
}

export function formatAnnouncementRemoveDate(value: string | null) {
  const date = value ? fromIso(value) : null
  if (!date) return ''
  return new Date(Date.UTC(date.year, date.month - 1, date.day, 12)).toLocaleDateString('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}
