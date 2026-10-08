import { achExpectedLabel } from './ach-expected-date.ts'
import {
  invoiceTimingBucket,
  isInvoiceClosed,
  isInvoicePaid,
  todayInCentral,
  type BalanceInvoice,
} from './invoice-balance.ts'

export type CamperInvoiceStatus = {
  label: 'Paid' | 'Credited' | 'Processing' | 'Canceled' | 'Needs attention' | 'Due now' | 'Due soon' | 'Scheduled'
  className: 'paid' | 'processing' | 'closed' | 'past-due' | 'due-soon' | 'open'
  detail: string
}

function daysBetween(today: string, dueDate: string) {
  const [todayYear, todayMonth, todayDay] = today.split('-').map(Number)
  const [dueYear, dueMonth, dueDay] = dueDate.slice(0, 10).split('-').map(Number)
  if (![todayYear, todayMonth, todayDay, dueYear, dueMonth, dueDay].every(Number.isFinite)) return null
  return Math.round((Date.UTC(dueYear, dueMonth - 1, dueDay) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / 86_400_000)
}

/** One camper-facing vocabulary for every invoice list, detail, reminder, and receipt entry point. */
export function camperInvoiceStatus(invoice: BalanceInvoice & { payment_method?: string | null; ach_expected_date?: string | null }, today = todayInCentral()): CamperInvoiceStatus {
  if (isInvoicePaid(invoice)) {
    return /account credit/i.test(String(invoice.payment_method || ''))
      ? { label: 'Credited', className: 'paid', detail: 'Bur Oaks account credit paid this invoice in full.' }
      : { label: 'Paid', className: 'paid', detail: 'Payment is confirmed and this invoice is complete.' }
  }

  if (invoiceTimingBucket(invoice, today) === 'processing') {
    const expected = achExpectedLabel(invoice)
    return {
      label: 'Processing',
      className: 'processing',
      detail: expected
        ? `${expected}. The bank is still finishing this payment; do not pay again.`
        : 'The bank is still finishing this payment; do not pay again.',
    }
  }

  if (isInvoiceClosed(invoice)) {
    return { label: 'Canceled', className: 'closed', detail: 'This invoice is closed and nothing is due.' }
  }

  if (!invoice.due_date) {
    return { label: 'Needs attention', className: 'past-due', detail: 'The office has not listed a due date. Contact Bur Oaks before paying.' }
  }

  const bucket = invoiceTimingBucket(invoice, today)
  const days = daysBetween(today, String(invoice.due_date))
  if (bucket === 'late') {
    const lateDays = days === null ? null : Math.abs(days)
    return {
      label: 'Needs attention',
      className: 'past-due',
      detail: lateDays === null ? 'This invoice is past due.' : `Past due by ${lateDays} day${lateDays === 1 ? '' : 's'}.`,
    }
  }
  if (bucket === 'due-now') return { label: 'Due now', className: 'due-soon', detail: 'Payment is due today.' }
  if (bucket === 'due-7' || bucket === 'due-8-30') {
    return {
      label: 'Due soon',
      className: 'due-soon',
      detail: days === null ? 'This payment is coming up.' : `Payment is due in ${days} day${days === 1 ? '' : 's'}.`,
    }
  }
  return { label: 'Scheduled', className: 'open', detail: 'This invoice is scheduled for a future date.' }
}

