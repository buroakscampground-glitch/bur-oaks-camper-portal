import { isInvoiceOutstanding, totalInvoiceBalance, type BalanceInvoice } from './invoice-balance.ts'

type ReminderInvoice = BalanceInvoice & {
  invoice_number?: string | null
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

function formatMoney(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function formatDate(value: string) {
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

export function buildBillingReminderMessage(invoices: ReminderInvoice[], today = todayInCentral()) {
  const openInvoices = invoices.filter((invoice) =>
    isInvoiceOutstanding(invoice) && Number(invoice.total_due || 0) > 0
  )
  const openBalance = totalInvoiceBalance(openInvoices)
  const pastDueInvoices = openInvoices.filter((invoice) => Boolean(invoice.due_date && invoice.due_date < today))
  const pastDueBalance = totalInvoiceBalance(pastDueInvoices)
  const oldestPastDueDate = pastDueInvoices
    .map((invoice) => invoice.due_date)
    .filter((date): date is string => Boolean(date))
    .sort()[0]

  if (openBalance <= 0) {
    return 'Your Bur Oaks account does not currently have an outstanding balance. Please contact the office with questions.'
  }

  const balanceSummary = `Your Bur Oaks account has an open balance of ${formatMoney(openBalance)}.`
  const pastDueSummary = pastDueBalance > 0
    ? ` Of that, ${formatMoney(pastDueBalance)} is past due${oldestPastDueDate ? `; the oldest past-due invoice was due ${formatDate(oldestPastDueDate)}` : ''}.`
    : ''

  return `${balanceSummary}${pastDueSummary} Please check your camper portal or contact the office with questions.`
}
