export type SeasonalTheme = {
  key: string
  label: string
  detail: string
  symbol: string
}

type DateParts = {
  year: number
  month: number
  day: number
}

function centralDateParts(date: Date): DateParts {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  }).formatToParts(date)

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)
  return { year: value('year'), month: value('month'), day: value('day') }
}

function dateNumber(parts: DateParts) {
  return parts.month * 100 + parts.day
}

function nthWeekday(year: number, month: number, weekday: number, occurrence: number) {
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
  return 1 + ((7 + weekday - firstWeekday) % 7) + (occurrence - 1) * 7
}

function lastWeekday(year: number, month: number, weekday: number) {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  const lastDayWeekday = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay()
  return lastDay - ((7 + lastDayWeekday - weekday) % 7)
}

function easterSunday(year: number) {
  const a = year % 19
  const b = Math.floor(year / 100)
  const c = year % 100
  const d = Math.floor(b / 4)
  const e = b % 4
  const f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3)
  const h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4)
  const k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return { month, day }
}

function daysFrom(parts: DateParts, target: DateParts) {
  const current = Date.UTC(parts.year, parts.month - 1, parts.day)
  const comparison = Date.UTC(target.year, target.month - 1, target.day)
  return Math.round((current - comparison) / 86_400_000)
}

export function getSeasonalTheme(date = new Date()): SeasonalTheme {
  const parts = centralDateParts(date)
  const mmdd = dateNumber(parts)
  const easter = easterSunday(parts.year)
  const memorialDay = lastWeekday(parts.year, 5, 1)
  const laborDay = nthWeekday(parts.year, 9, 1, 1)
  const thanksgiving = nthWeekday(parts.year, 11, 4, 4)

  if (mmdd >= 1227 || mmdd <= 102) return { key: 'new-year', label: 'Happy New Year', detail: 'A fresh season at Bur Oaks', symbol: '✦' }
  if (mmdd >= 1201 && mmdd <= 1226) return { key: 'christmas', label: 'Christmas at Bur Oaks', detail: 'Warm wishes from the campground', symbol: '★' }
  if (parts.month === 11 && parts.day >= thanksgiving - 7 && parts.day <= thanksgiving + 2) return { key: 'thanksgiving', label: 'Thanksgiving at Bur Oaks', detail: 'Grateful for our campground family', symbol: '◆' }
  if (mmdd >= 1020 && mmdd <= 1031) return { key: 'halloween', label: 'Halloween at Bur Oaks', detail: 'Campfire nights and autumn fun', symbol: '☾' }
  if (parts.month === 9 && parts.day >= laborDay - 3 && parts.day <= laborDay + 1) return { key: 'patriotic', label: 'Labor Day Weekend', detail: 'One more summer weekend together', symbol: '★' }
  if (mmdd >= 629 && mmdd <= 705) return { key: 'patriotic', label: 'Fourth of July', detail: 'Summer celebration at Bur Oaks', symbol: '★' }
  if (parts.month === 5 && parts.day >= memorialDay - 3 && parts.day <= memorialDay + 1) return { key: 'patriotic', label: 'Memorial Day Weekend', detail: 'Remembering and honoring together', symbol: '★' }
  if (Math.abs(daysFrom(parts, { year: parts.year, ...easter })) <= 5) return { key: 'easter', label: 'Easter at Bur Oaks', detail: 'Springtime is here', symbol: '✿' }
  if (mmdd >= 314 && mmdd <= 317) return { key: 'st-patricks', label: "St. Patrick's Day", detail: 'A little extra green at Bur Oaks', symbol: '♣' }
  if (mmdd >= 210 && mmdd <= 214) return { key: 'valentines', label: 'Valentine’s at Bur Oaks', detail: 'Celebrating the people who make this place special', symbol: '♥' }

  if (mmdd >= 301 && mmdd <= 531) return { key: 'spring', label: 'Spring at Bur Oaks', detail: 'Fresh air and a new camping season', symbol: '✿' }
  if (mmdd >= 601 && mmdd <= 831) return { key: 'summer', label: 'Summer at Bur Oaks', detail: 'Lake days, campfires, and good company', symbol: '☀' }
  if (mmdd >= 901 && mmdd <= 1130) return { key: 'fall', label: 'Fall at Bur Oaks', detail: 'Cool nights and colorful weekends', symbol: '◆' }
  return { key: 'winter', label: 'Winter at Bur Oaks', detail: 'Quiet oaks and cozy planning', symbol: '❄' }
}
