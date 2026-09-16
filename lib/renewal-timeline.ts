export const RENEWAL_SEND_DAYS_BEFORE_EXPIRATION = 60
export const RENEWAL_RESPONSE_DAYS_BEFORE_EXPIRATION = 30
export const RENEWAL_OFFICE_REVIEW_DAYS_BEFORE_SEND = 14

export function shiftCalendarDays(value: string, amount: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return ''
  const [year, month, day] = value.split('-').map(Number)
  const target = new Date(Date.UTC(year, month - 1, day + amount))
  if (Number.isNaN(target.getTime())) return ''
  return target.toISOString().slice(0, 10)
}

export function renewalSendDate(contractEndDate: string) {
  return shiftCalendarDays(contractEndDate, -RENEWAL_SEND_DAYS_BEFORE_EXPIRATION)
}

export function renewalResponseDueDate(contractEndDate: string) {
  return shiftCalendarDays(contractEndDate, -RENEWAL_RESPONSE_DAYS_BEFORE_EXPIRATION)
}

export function renewalOfficeReviewDate(contractEndDate: string) {
  return shiftCalendarDays(renewalSendDate(contractEndDate), -RENEWAL_OFFICE_REVIEW_DAYS_BEFORE_SEND)
}
