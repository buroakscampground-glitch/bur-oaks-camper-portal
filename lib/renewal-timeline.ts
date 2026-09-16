export const RENEWAL_SEND_MONTHS_BEFORE_EXPIRATION = 4
export const RENEWAL_RESPONSE_MONTHS_BEFORE_EXPIRATION = 3
export const RENEWAL_OFFICE_REVIEW_DAYS_BEFORE_SEND = 14

export function shiftCalendarDays(value: string, amount: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1, day + amount))
  if (Number.isNaN(target.getTime())) return ''
  return target.toISOString().slice(0, 10)
}

export function shiftCalendarMonths(value: string, amount: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  const targetMonth = new Date(Date.UTC(year, month - 1 + amount, 1))
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate()
  targetMonth.setUTCDate(Math.min(day, lastDay))
  return targetMonth.toISOString().slice(0, 10)
}

export function renewalSendDate(contractEndDate: string) {
  return shiftCalendarMonths(contractEndDate, -RENEWAL_SEND_MONTHS_BEFORE_EXPIRATION)
}

export function renewalResponseDueDate(contractEndDate: string) {
  return shiftCalendarMonths(contractEndDate, -RENEWAL_RESPONSE_MONTHS_BEFORE_EXPIRATION)
}

export function renewalOfficeReviewDate(contractEndDate: string) {
  return shiftCalendarDays(renewalSendDate(contractEndDate), -RENEWAL_OFFICE_REVIEW_DAYS_BEFORE_SEND)
}

export function renewalResponseDaysRemaining(contractEndDate: string, today: string) {
  const dueDate = renewalResponseDueDate(contractEndDate)
  if (!dueDate || !/^\d{4}-\d{2}-\d{2}$/.test(today)) return null
  const [fromYear, fromMonth, fromDay] = today.split('-').map(Number)
  const [toYear, toMonth, toDay] = dueDate.split('-').map(Number)
  return Math.round((Date.UTC(toYear, toMonth - 1, toDay) - Date.UTC(fromYear, fromMonth - 1, fromDay)) / 86_400_000)
}

export function renewalResponseCountdownLabel(daysRemaining: number | null) {
  if (daysRemaining === null) return ''
  if (daysRemaining < 0) return `${Math.abs(daysRemaining)} day${daysRemaining === -1 ? '' : 's'} overdue`
  if (daysRemaining === 0) return 'Due today'
  return `${daysRemaining} day${daysRemaining === 1 ? '' : 's'} left to sign`
}
