import { invoiceRecordedTotal, isInvoiceClosed, isInvoicePaid, normalizedInvoiceStatus } from './invoice-balance.ts'
import { isOperationalCamper } from './camper-records.ts'

export type AssociationFeeInvoice = {
  status?: string | null
  total_due?: number | string | null
  subtotal?: number | string | null
  late_fee?: number | string | null
  due_date?: string | null
  paid_at?: string | null
}

export type AssociationFeeBucket = 'owes' | 'processing' | 'paid' | 'excluded'
export type AssociationFeeSiteBucket = 'owes' | 'processing' | 'paid' | 'missing' | 'exempt'

export type AssociationFeeCamper = {
  id?: string | null
  active?: boolean | null
  role?: string | null
  lot_number?: string | null
  first_name?: string | null
  last_name?: string | null
}

export function associationFeeBucket(invoice: AssociationFeeInvoice): AssociationFeeBucket {
  if (isInvoiceClosed(invoice)) return 'excluded'
  if (isInvoicePaid(invoice)) return 'paid'
  if (normalizedInvoiceStatus(invoice) === 'processing') return 'processing'
  return 'owes'
}

export function associationFeeAmount(invoice: AssociationFeeInvoice) {
  return invoiceRecordedTotal(invoice)
}

export function isPhysicalAssociationFeeCamper(camper: AssociationFeeCamper) {
  const lot = String(camper.lot_number || '').trim().toUpperCase()
  return camper.active !== false && isOperationalCamper(camper) && Boolean(lot) && !lot.startsWith('TEMP PORTAL')
}

export function isAssociationFeeExemptCamper(camper: AssociationFeeCamper) {
  return `${String(camper.first_name || '').trim()} ${String(camper.last_name || '').trim()}`.toLowerCase() === 'anthony finley'
}

export function associationFeeSiteBucket(invoices: AssociationFeeInvoice[]): Exclude<AssociationFeeSiteBucket, 'exempt'> {
  const current = invoices.filter((invoice) => associationFeeBucket(invoice) !== 'excluded')
  if (current.some((invoice) => associationFeeBucket(invoice) === 'processing')) return 'processing'
  if (current.some((invoice) => associationFeeBucket(invoice) === 'owes')) return 'owes'
  if (current.some((invoice) => associationFeeBucket(invoice) === 'paid')) return 'paid'
  return 'missing'
}

export function associationFeeYear(invoice: AssociationFeeInvoice) {
  const value = String(invoice.due_date || invoice.paid_at || '')
  const year = value.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : 'No year'
}
