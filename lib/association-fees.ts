import { invoiceRecordedTotal, isInvoiceClosed, isInvoicePaid, normalizedInvoiceStatus } from './invoice-balance.ts'

export type AssociationFeeInvoice = {
  status?: string | null
  total_due?: number | string | null
  subtotal?: number | string | null
  late_fee?: number | string | null
  due_date?: string | null
  paid_at?: string | null
}

export type AssociationFeeBucket = 'owes' | 'processing' | 'paid' | 'excluded'

export function associationFeeBucket(invoice: AssociationFeeInvoice): AssociationFeeBucket {
  if (isInvoiceClosed(invoice)) return 'excluded'
  if (isInvoicePaid(invoice)) return 'paid'
  if (normalizedInvoiceStatus(invoice) === 'processing') return 'processing'
  return 'owes'
}

export function associationFeeAmount(invoice: AssociationFeeInvoice) {
  return invoiceRecordedTotal(invoice)
}

export function associationFeeYear(invoice: AssociationFeeInvoice) {
  const value = String(invoice.due_date || invoice.paid_at || '')
  const year = value.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : 'No year'
}
