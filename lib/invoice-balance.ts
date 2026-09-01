export type BalanceInvoice = {
  status?: string | null
  due_date?: string | null
  total_due?: number | string | null
}

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

export function isInvoiceOutstanding(invoice: BalanceInvoice) {
  return !['paid', 'cancelled'].includes(String(invoice.status || '').toLowerCase())
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

export function totalInvoiceBalance(invoices: BalanceInvoice[]) {
  return invoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)
}
