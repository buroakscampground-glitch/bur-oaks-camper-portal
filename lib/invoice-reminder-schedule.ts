export type InvoiceNoticeKind = 'new' | 'upcoming' | 'due_3_days' | 'due_1_day' | 'due_today' | 'past_due' | 'late_fee'

export const FIRST_INVOICE_NOTICE_DAYS = 30

export function todayInCentral() {
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

export function daysUntilDate(dateValue: string, todayValue = todayInCentral()) {
  const toUtc = (value: string) => {
    const [year, month, day] = value.split('-').map(Number)
    return Date.UTC(year, month - 1, day)
  }

  return Math.round((toUtc(dateValue) - toUtc(todayValue)) / 86_400_000)
}

export function creationInvoiceNoticeKind(dueDate: string | null | undefined, today = todayInCentral()): 'new' | 'upcoming' | 'past_due' | null {
  if (!dueDate) return 'new'
  const daysUntilDue = daysUntilDate(dueDate, today)
  if (daysUntilDue > FIRST_INVOICE_NOTICE_DAYS) return null
  return daysUntilDue >= 0 ? 'upcoming' : 'past_due'
}

export function shouldSendUpcomingInvoiceNotice(daysUntilDue: number, alreadySent: boolean) {
  return !alreadySent && daysUntilDue <= FIRST_INVOICE_NOTICE_DAYS && daysUntilDue > 3
}

export function scheduledInvoiceNoticeKind(daysUntilDue: number): Exclude<InvoiceNoticeKind, 'new' | 'late_fee'> | null {
  if (daysUntilDue > FIRST_INVOICE_NOTICE_DAYS) return null
  if (daysUntilDue > 3) return 'upcoming'
  if (daysUntilDue > 1) return 'due_3_days'
  if (daysUntilDue === 1) return 'due_1_day'
  if (daysUntilDue === 0) return 'due_today'
  return 'past_due'
}

export function pastDueReminderMilestone(daysPastDue: number) {
  if (daysPastDue < 1) return 0
  if (daysPastDue < 7) return 1
  if (daysPastDue < 14) return 7
  if (daysPastDue < 30) return 14
  return Math.floor(daysPastDue / 30) * 30
}
