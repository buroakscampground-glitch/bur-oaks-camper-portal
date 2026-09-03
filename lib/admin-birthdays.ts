export type BirthdayWindow = 'missed' | 'today' | 'upcoming'

type CentralDay = {
  year: number
  month: number
  day: number
}

function parseBirthday(value: unknown) {
  const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (!match) return null
  return { month: Number(match[1]), day: Number(match[2]) }
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

function dayNumber(year: number, month: number, day: number) {
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000)
}

export function birthdayOccurrence(
  value: unknown,
  today: CentralDay,
  range = { pastDays: 30, futureDays: 45 }
) {
  const birthday = parseBirthday(value)
  if (!birthday) return null

  const todayNumber = dayNumber(today.year, today.month, today.day)
  const candidates = [today.year - 1, today.year, today.year + 1].map((year) => {
    const day = Math.min(birthday.day, daysInMonth(year, birthday.month))
    const offsetDays = dayNumber(year, birthday.month, day) - todayNumber
    return {
      year,
      month: birthday.month,
      day,
      iso: `${year}-${String(birthday.month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      offsetDays,
      window: (offsetDays < 0 ? 'missed' : offsetDays === 0 ? 'today' : 'upcoming') as BirthdayWindow,
    }
  })

  return candidates.find((candidate) =>
    candidate.offsetDays >= -range.pastDays && candidate.offsetDays <= range.futureDays
  ) || null
}

export function birthdayWindowLabel(offsetDays: number) {
  if (offsetDays === 0) return 'Today'
  if (offsetDays === 1) return 'Tomorrow'
  if (offsetDays > 1) return `In ${offsetDays} days`
  if (offsetDays === -1) return 'Yesterday'
  return `${Math.abs(offsetDays)} days ago`
}
