export const DOCUMENT_SIGNATURE_REMINDER_DAYS = 3
export const DOCUMENT_SIGNATURE_SMS_ALERT = 'DOCUMENT NEEDS SIGNED'

function todayInCentral() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return `${year}-${month}-${day}`
}

function elapsedCalendarDays(earlier: string, later: string) {
  const toUtc = (value: string) => {
    const [year, month, day] = value.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }
  return Math.round((toUtc(later) - toUtc(earlier)) / 86_400_000)
}

function centralDayFromTimestamp(value: unknown) {
  const date = new Date(String(value || ''))
  if (Number.isNaN(date.getTime())) return ''
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const day = parts.find((part) => part.type === 'day')?.value
  return year && month && day ? `${year}-${month}-${day}` : ''
}

export function documentReminderCentralDay(value: unknown) {
  return centralDayFromTimestamp(value)
}

export function documentReminderIsDue(lastSentAt: unknown, today = todayInCentral()) {
  if (!lastSentAt) return true
  const lastDay = centralDayFromTimestamp(lastSentAt)
  return !lastDay || elapsedCalendarDays(lastDay, today) >= DOCUMENT_SIGNATURE_REMINDER_DAYS
}
