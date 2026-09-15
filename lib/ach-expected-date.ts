const ONE_DAY_MS = 24 * 60 * 60 * 1000

export function addAchBusinessDays(value: Date | string | number, businessDays: number) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null

  const result = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  ))
  let remaining = Math.max(0, Math.floor(businessDays))

  while (remaining > 0) {
    result.setTime(result.getTime() + ONE_DAY_MS)
    const day = result.getUTCDay()
    if (day !== 0 && day !== 6) remaining -= 1
  }

  return result.toISOString().slice(0, 10)
}

export function achExpectedFromStripeEvent(eventCreatedSeconds: number, fromCheckout = false) {
  return addAchBusinessDays(eventCreatedSeconds * 1000, fromCheckout ? 6 : 5)
}

export function achExpectedLabel(invoice: any, style: 'short' | 'long' = 'short') {
  if (String(invoice?.status || '').toLowerCase() !== 'processing') return ''
  if (!String(invoice?.payment_method || '').toLowerCase().includes('ach')) return ''
  if (!invoice?.ach_expected_date) return 'ACH processing'

  const date = new Date(`${invoice.ach_expected_date}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return 'ACH processing'

  const includeYear = date.getUTCFullYear() !== new Date().getUTCFullYear()
  const formatted = date.toLocaleDateString('en-US', {
    timeZone: 'UTC',
    month: style === 'long' ? 'long' : 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' as const } : {}),
  })

  return `ACH expected ${formatted}`
}
