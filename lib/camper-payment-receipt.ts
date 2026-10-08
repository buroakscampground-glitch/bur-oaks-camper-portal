import type { SupabaseClient } from '@supabase/supabase-js'
import { invoiceRecordedTotal, isInvoicePaid, type BalanceInvoice } from './invoice-balance.ts'

type ReceiptAllocation = {
  invoiceId: string
  invoiceNumber: string
  invoiceType: string
  amount: number
}

export type CamperPaymentReceipt = {
  kind: 'online' | 'manual' | 'account_credit' | 'recorded'
  totalReceived: number
  receivedOn: string | null
  method: string
  allocations: ReceiptAllocation[]
  savedCredit: null | {
    amount: number
    remainingAmount: number
    destination: 'general' | 'lot_rent'
  }
}

type ReceiptInvoiceRow = BalanceInvoice & {
  id: unknown
  invoice_number?: unknown
  invoice_type?: unknown
  payment_method?: unknown
  payment_reference?: unknown
  paid_at?: string | null
}

type ReceiptCreditRow = {
  id?: unknown
  original_amount?: unknown
  remaining_amount?: unknown
  applies_to?: unknown
}

type ManualPaymentRow = {
  amount?: unknown
  payment_method?: unknown
  received_on?: string | null
  credit_id?: unknown
  result?: { creditAmount?: unknown } | null
}

type ManualAllocationRow = {
  payment_id?: unknown
  invoice_id?: unknown
  amount_applied?: unknown
}

type CreditApplicationRow = {
  amount_applied?: unknown
  applied_at?: string | null
}

function money(value: unknown) {
  return Math.round(Number(value || 0) * 100) / 100
}

function allocation(invoice: ReceiptInvoiceRow, amount: unknown = invoiceRecordedTotal(invoice)): ReceiptAllocation {
  return {
    invoiceId: String(invoice.id),
    invoiceNumber: String(invoice.invoice_number || 'Invoice'),
    invoiceType: String(invoice.invoice_type || 'Campground charge'),
    amount: money(amount),
  }
}

async function safeRows<T>(query: PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  try {
    const result = await query
    return result?.error ? [] : (result?.data || [])
  } catch {
    return []
  }
}

/** Builds a camper-safe receipt from existing ledgers. Provider IDs and office-only fields never leave this helper. */
export async function loadCamperPaymentReceipt(admin: SupabaseClient, camperId: string, invoice: ReceiptInvoiceRow): Promise<CamperPaymentReceipt | null> {
  if (!isInvoicePaid(invoice)) return null

  const base: CamperPaymentReceipt = {
    kind: /account credit/i.test(String(invoice.payment_method || '')) ? 'account_credit' : 'recorded',
    totalReceived: money(invoiceRecordedTotal(invoice)),
    receivedOn: invoice.paid_at || null,
    method: String(invoice.payment_method || 'Payment recorded by Bur Oaks'),
    allocations: [allocation(invoice)],
    savedCredit: null,
  }

  const paymentReference = String(invoice.payment_reference || '')
  if (paymentReference && /^Online\b/i.test(String(invoice.payment_method || ''))) {
    const siblingInvoices = await safeRows<ReceiptInvoiceRow>(
      admin.from('invoices')
        .select('id,invoice_number,invoice_type,total_due,status,payment_method,payment_reference,paid_at')
        .eq('camper_id', camperId)
        .eq('payment_reference', paymentReference)
        .order('invoice_number', { ascending: true }),
    )
    if (siblingInvoices.length) {
      const allocations = siblingInvoices.filter(isInvoicePaid).map((row) => allocation(row))
      const extraCredits = await safeRows<ReceiptCreditRow>(
        admin.from('account_credits')
          .select('original_amount,remaining_amount,applies_to')
          .eq('camper_id', camperId)
          .eq('source_reference', `stripe-extra:${paymentReference}`)
          .limit(1),
      )
      const extra = extraCredits[0]
      const savedCredit = extra ? {
        amount: money(extra.original_amount),
        remainingAmount: money(extra.remaining_amount),
        destination: extra.applies_to === 'lot_rent' ? 'lot_rent' as const : 'general' as const,
      } : null
      return {
        ...base,
        kind: 'online',
        allocations: allocations.length ? allocations : base.allocations,
        totalReceived: money(allocations.reduce((sum: number, item: ReceiptAllocation) => sum + item.amount, 0) + (savedCredit?.amount || 0)),
        receivedOn: siblingInvoices.find((row) => row.paid_at)?.paid_at || base.receivedOn,
        savedCredit,
      }
    }
  }

  const matchingAllocations = await safeRows<ManualAllocationRow>(
    admin.from('manual_payment_allocations')
      .select('payment_id,invoice_id,amount_applied')
      .eq('camper_id', camperId)
      .eq('invoice_id', invoice.id)
      .limit(1),
  )
  const paymentId = matchingAllocations[0]?.payment_id
  if (paymentId) {
    const [payments, allAllocations] = await Promise.all([
      safeRows<ManualPaymentRow>(admin.from('manual_payments').select('id,amount,payment_method,received_on,credit_id,result').eq('id', paymentId).eq('camper_id', camperId).limit(1)),
      safeRows<ManualAllocationRow>(admin.from('manual_payment_allocations').select('invoice_id,amount_applied').eq('payment_id', paymentId).eq('camper_id', camperId)),
    ])
    const payment = payments[0]
    const invoiceIds = allAllocations.map((row) => row.invoice_id).filter(Boolean)
    const invoiceRows = invoiceIds.length
      ? await safeRows<ReceiptInvoiceRow>(admin.from('invoices').select('id,invoice_number,invoice_type').eq('camper_id', camperId).in('id', invoiceIds))
      : []
    const invoicesById = new Map(invoiceRows.map((row) => [String(row.id), row]))
    const allocations = allAllocations.map((row) => allocation(
      invoicesById.get(String(row.invoice_id)) || { id: row.invoice_id, invoice_number: 'Invoice', invoice_type: 'Campground charge' },
      row.amount_applied,
    ))
    if (payment) {
      const creditRows = payment.credit_id
        ? await safeRows<ReceiptCreditRow>(admin.from('account_credits').select('id,remaining_amount,applies_to').eq('id', payment.credit_id).eq('camper_id', camperId).limit(1))
        : []
      const credit = creditRows[0]
      const originallySaved = money(payment.result?.creditAmount)
      return {
        ...base,
        kind: 'manual',
        totalReceived: money(payment.amount),
        receivedOn: payment.received_on || base.receivedOn,
        method: String(payment.payment_method || base.method),
        allocations: allocations.length ? allocations : base.allocations,
        savedCredit: credit && originallySaved > 0 ? {
          amount: originallySaved,
          remainingAmount: money(credit.remaining_amount),
          destination: credit.applies_to === 'lot_rent' ? 'lot_rent' : 'general',
        } : null,
      }
    }
  }

  if (base.kind === 'account_credit') {
    const applications = await safeRows<CreditApplicationRow>(
      admin.from('account_credit_applications')
        .select('credit_id,amount_applied,applied_at')
        .eq('camper_id', camperId)
        .eq('invoice_id', invoice.id),
    )
    if (applications.length) {
      return {
        ...base,
        totalReceived: money(applications.reduce((sum, item) => sum + Number(item.amount_applied || 0), 0)),
        receivedOn: applications[applications.length - 1]?.applied_at || base.receivedOn,
      }
    }
  }

  return base
}
