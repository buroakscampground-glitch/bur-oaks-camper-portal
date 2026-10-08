export type CentralDate = {
  year: number
  month: number
  day: number
  iso: string
}

function dateAtUtc(date: CentralDate) {
  return Date.UTC(date.year, date.month - 1, date.day)
}

export function addCentralDays(date: CentralDate, days: number) {
  const shifted = new Date(dateAtUtc(date) + days * 86_400_000)
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-${String(shifted.getUTCDate()).padStart(2, '0')}`
}

export function daysUntilEvent(eventDate: string, today: CentralDate) {
  const match = String(eventDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
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
  return Math.round((normalized.getTime() - dateAtUtc(today)) / 86_400_000)
}
