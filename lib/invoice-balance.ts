export type BalanceInvoice = {
  status?: string | null
  due_date?: string | null
  total_due?: number | string | null
  subtotal?: number | string | null
  late_fee?: number | string | null
}

export type InvoiceMonthGroup<T extends BalanceInvoice = BalanceInvoice> = {
  key: string
  label: string
  invoices: T[]
  total: number
  openTotal: number
  paidTotal: number
  electricOpenTotal: number
  openCount: number
  paidCount: number
}

export function normalizedInvoiceStatus(invoice: BalanceInvoice) {
  return String(invoice.status || '').trim().toLowerCase()
}

export function isInvoicePaid(invoice: BalanceInvoice) {
  return normalizedInvoiceStatus(invoice) === 'paid'
}

export function invoiceRecordedTotal(invoice: BalanceInvoice) {
  const currentTotal = Number(invoice.total_due || 0)
  if (!isInvoicePaid(invoice)) return currentTotal

  const originalCharge = Number(invoice.subtotal || 0) + Number(invoice.late_fee || 0)
  return Math.max(currentTotal, originalCharge)
}

export function isInvoiceClosed(invoice: BalanceInvoice) {
  return ['void', 'cancelled', 'canceled', 'refunded'].includes(normalizedInvoiceStatus(invoice))
}

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

export type InvoiceTimingBucket = 'late' | 'due-now' | 'due-7' | 'due-8-30' | 'future' | 'processing' | 'paid'

function calendarDaysBetween(today: string, dueDate: string) {
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number)
  const [dueYear, dueMonth, dueDay] = dueDate.split('-').map(Number)
  if (![todayYear, todayMonth, todayDay, dueYear, dueMonth, dueDay].every(Number.isFinite)) return null
  return Math.round((Date.UTC(dueYear, dueMonth - 1, dueDay) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86_400_000)
}

export function invoiceTimingBucket(invoice: BalanceInvoice, today = todayInCentral()): InvoiceTimingBucket | null {
  if (isInvoicePaid(invoice)) return 'paid'
  if (normalizedInvoiceStatus(invoice) === 'processing') return 'processing'
  if (!isInvoiceOutstanding(invoice)) return null
  if (!invoice.due_date) return 'due-now'

  const daysUntilDue = calendarDaysBetween(today, String(invoice.due_date).slice(0, 10))
  if (daysUntilDue === null) return 'due-now'
  if (daysUntilDue < 0) return 'late'
  if (daysUntilDue === 0) return 'due-now'
  if (daysUntilDue <= 7) return 'due-7'
  if (daysUntilDue <= 30) return 'due-8-30'
  return 'future'
}

export function isInvoiceOutstanding(invoice: BalanceInvoice) {
  return !isInvoicePaid(invoice) && !isInvoiceClosed(invoice)
}

export function invoiceDueMonthKey(invoice: BalanceInvoice) {
  const month = String(invoice.due_date || '').slice(0, 7)
  return /^\d{4}-\d{2}$/.test(month) ? month : 'undated'
}

export function invoiceMonthLabel(monthKey: string) {
  if (monthKey === 'undated') return 'No due date'
  const date = new Date(`${monthKey}-01T12:00:00Z`)
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', year: 'numeric' })
}

export function groupInvoicesByDueMonth<T extends BalanceInvoice & { invoice_type?: string | null }>(invoices: T[]) {
  const grouped = new Map<string, T[]>()

  for (const invoice of invoices) {
    const key = invoiceDueMonthKey(invoice)
    grouped.set(key, [...(grouped.get(key) || []), invoice])
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => {
      if (left === 'undated') return 1
      if (right === 'undated') return -1
      return left.localeCompare(right)
    })
    .map(([key, monthInvoices]): InvoiceMonthGroup<T> => {
      const openInvoices = monthInvoices.filter(isInvoiceOutstanding)
      const paidInvoices = monthInvoices.filter(isInvoicePaid)
      const electricOpenInvoices = openInvoices.filter((invoice) =>
        String(invoice.invoice_type || '').toLowerCase().includes('electric')
      )

      return {
        key,
        label: invoiceMonthLabel(key),
        invoices: [...monthInvoices].sort((left, right) =>
          String(left.due_date || '9999-99-99').localeCompare(String(right.due_date || '9999-99-99'))
        ),
        total: totalInvoiceBalance(monthInvoices),
        openTotal: totalInvoiceBalance(openInvoices),
        paidTotal: totalInvoiceBalance(paidInvoices),
        electricOpenTotal: totalInvoiceBalance(electricOpenInvoices),
        openCount: openInvoices.length,
        paidCount: paidInvoices.length,
      }
    })
}

export function isInvoiceDueNow(invoice: BalanceInvoice, today = todayInCentral()) {
  return isInvoiceOutstanding(invoice) && (!invoice.due_date || invoice.due_date <= today)
}

export function isInvoiceDueThroughCurrentMonth(invoice: BalanceInvoice, today = todayInCentral()) {
  const currentMonth = today.slice(0, 7)
  return isInvoiceOutstanding(invoice) && (!invoice.due_date || invoice.due_date.slice(0, 7) <= currentMonth)
}

export function isInvoiceUpcoming(invoice: BalanceInvoice, today = todayInCentral()) {
  return isInvoiceOutstanding(invoice) && Boolean(invoice.due_date && invoice.due_date > today)
}

export function isInvoiceDueWithinDays(invoice: BalanceInvoice, days: number, today = todayInCentral()) {
  if (!isInvoiceUpcoming(invoice, today) || !invoice.due_date || days < 1) return false

  const [year, month, day] = today.split('-').map(Number)
  const cutoff = new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
  return invoice.due_date <= cutoff
}

export function isInvoiceDueAfterCurrentMonthWithinDays(invoice: BalanceInvoice, days: number, today = todayInCentral()) {
  return isInvoiceDueWithinDays(invoice, days, today) && Boolean(
    invoice.due_date && invoice.due_date.slice(0, 7) > today.slice(0, 7)
  )
}

export function totalInvoiceBalance(invoices: BalanceInvoice[]) {
  return invoices.reduce((sum, invoice) => sum + invoiceRecordedTotal(invoice), 0)
}
