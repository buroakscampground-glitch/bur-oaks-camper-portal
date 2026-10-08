export type MoneyException = {
  id: string
  kind: 'payment-alert' | 'late-ach' | 'unmatched' | 'deposit' | 'dispute' | 'refund'
  severity: 'urgent' | 'watch'
  title: string
  detail: string
  amountCents: number | null
  occurredAt: string | null
  href: string
  lotNumber: string | null
}

type ExceptionCamper = { lot_number?: string | null }
type ExceptionCamperRelation = ExceptionCamper | ExceptionCamper[] | null

export type ExceptionInvoice = {
  id?: string | null
  invoice_number?: string | number | null
  payment_reference?: string | null
  total_due?: number | string | null
  subtotal?: number | string | null
  paid_at?: string | null
  ach_expected_date?: string | null
  campers?: ExceptionCamperRelation
}

export type PaymentAlertRecord = {
  id: string
  title?: string | null
  message?: string | null
  created_at?: string | null
  source_table?: string | null
  source_id?: string | null
  lot_number?: string | null
}

export type ProcessorPayout = {
  id: string
  status?: string | null
  amount?: number | null
  created?: number | null
}

export type ProcessorDispute = {
  id: string
  amount?: number | null
  status?: string | null
  created?: number | null
  paymentIntent?: string | null
}

export type ProcessorRefund = ProcessorDispute

function invoiceHref(invoice?: ExceptionInvoice) {
  return invoice?.id ? `/admin/invoices/${encodeURIComponent(String(invoice.id))}` : '/admin/invoices'
}

function invoiceForReference(invoices: ExceptionInvoice[], reference: unknown) {
  return invoices.find((invoice) => String(invoice.payment_reference || '') === String(reference || ''))
}

function invoiceCamper(invoice?: ExceptionInvoice) {
  const relation = invoice?.campers
  return Array.isArray(relation) ? relation[0] || null : relation || null
}

function alertHref(alert: PaymentAlertRecord) {
  if (alert.source_table === 'invoices' && alert.source_id) return `/admin/invoices/${encodeURIComponent(String(alert.source_id))}`
  if (alert.source_table === 'stripe_payouts') return '/admin/stripe-deposits'
  return '/admin/notifications?filter=payment_problem'
}

export function buildMoneyExceptionQueue({
  alerts = [], lateAchInvoices = [], unmatchedInvoices = [], payouts = [], disputes = [], refunds = [], referencedInvoices = [],
}: {
  alerts?: PaymentAlertRecord[]
  lateAchInvoices?: ExceptionInvoice[]
  unmatchedInvoices?: ExceptionInvoice[]
  payouts?: ProcessorPayout[]
  disputes?: ProcessorDispute[]
  refunds?: ProcessorRefund[]
  referencedInvoices?: ExceptionInvoice[]
}) {
  const items: MoneyException[] = []

  for (const alert of alerts) items.push({
    id: `alert-${alert.id}`,
    kind: 'payment-alert',
    severity: 'urgent',
    title: String(alert.title || 'Payment problem needs review'),
    detail: String(alert.message || 'Open the payment record and verify what happened.'),
    amountCents: null,
    occurredAt: alert.created_at || null,
    href: alertHref(alert),
    lotNumber: alert.lot_number || null,
  })

  for (const invoice of lateAchInvoices) items.push({
    id: `late-ach-${invoice.id}`,
    kind: 'late-ach',
    severity: 'urgent',
    title: `ACH payment is past its expected date${invoice.invoice_number ? ` · Invoice #${invoice.invoice_number}` : ''}`,
    detail: `Lot ${invoiceCamper(invoice)?.lot_number || '—'} still shows payment processing. Verify the bank result before treating it as paid.`,
    amountCents: Math.round(Number(invoice.total_due || invoice.subtotal || 0) * 100),
    occurredAt: invoice.ach_expected_date || null,
    href: invoiceHref(invoice),
    lotNumber: invoiceCamper(invoice)?.lot_number || null,
  })

  for (const invoice of unmatchedInvoices) items.push({
    id: `unmatched-${invoice.id}`,
    kind: 'unmatched',
    severity: 'urgent',
    title: `Paid invoice has no payment ledger${invoice.invoice_number ? ` · Invoice #${invoice.invoice_number}` : ''}`,
    detail: `Lot ${invoiceCamper(invoice)?.lot_number || '—'} was marked paid without a payment method or matching reference. Verify the original receipt before correcting the record.`,
    amountCents: Math.round(Number(invoice.total_due || invoice.subtotal || 0) * 100),
    occurredAt: invoice.paid_at || null,
    href: invoiceHref(invoice),
    lotNumber: invoiceCamper(invoice)?.lot_number || null,
  })

  for (const payout of payouts.filter((row) => ['failed', 'canceled'].includes(String(row.status || '').toLowerCase()))) items.push({
    id: `deposit-${payout.id}`,
    kind: 'deposit',
    severity: 'urgent',
    title: `Bank deposit ${String(payout.status).toLowerCase()}`,
    detail: 'Stripe did not complete this bank deposit. Open the exact deposit reconciliation before relying on the funds.',
    amountCents: Number(payout.amount || 0),
    occurredAt: payout.created ? new Date(Number(payout.created) * 1000).toISOString() : null,
    href: '/admin/stripe-deposits',
    lotNumber: null,
  })

  for (const dispute of disputes) {
    const invoice = invoiceForReference(referencedInvoices, dispute.paymentIntent)
    items.push({
      id: `dispute-${dispute.id}`,
      kind: 'dispute',
      severity: 'urgent',
      title: `Card payment dispute · ${String(dispute.status || 'review needed').replaceAll('_', ' ')}`,
      detail: invoice
        ? `Invoice #${invoice.invoice_number || '—'} for Lot ${invoiceCamper(invoice)?.lot_number || '—'} is connected to this dispute.`
        : 'A card payment has an open dispute. Match it to the camper record and respond in Stripe.',
      amountCents: Number(dispute.amount || 0),
      occurredAt: dispute.created ? new Date(Number(dispute.created) * 1000).toISOString() : null,
      href: invoiceHref(invoice),
      lotNumber: invoiceCamper(invoice)?.lot_number || null,
    })
  }

  const stuckRefundBefore = Date.now() - 7 * 24 * 60 * 60 * 1000
  for (const refund of refunds.filter((row) => {
    const status = String(row.status || '').toLowerCase()
    return status === 'failed' || (status === 'pending' && Number(row.created || 0) * 1000 < stuckRefundBefore)
  })) {
    const invoice = invoiceForReference(referencedInvoices, refund.paymentIntent)
    items.push({
      id: `refund-${refund.id}`,
      kind: 'refund',
      severity: refund.status === 'failed' ? 'urgent' : 'watch',
      title: `Refund ${String(refund.status || 'needs review').toLowerCase()}`,
      detail: invoice
        ? `Invoice #${invoice.invoice_number || '—'} for Lot ${invoiceCamper(invoice)?.lot_number || '—'} is connected to this refund.`
        : 'This refund has not completed. Verify its destination and current status in Stripe.',
      amountCents: Number(refund.amount || 0),
      occurredAt: refund.created ? new Date(Number(refund.created) * 1000).toISOString() : null,
      href: invoiceHref(invoice),
      lotNumber: invoiceCamper(invoice)?.lot_number || null,
    })
  }

  const seen = new Set<string>()
  return items
    .filter((item) => {
      const key = `${item.kind}:${item.id}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => Number(b.severity === 'urgent') - Number(a.severity === 'urgent') || String(b.occurredAt || '').localeCompare(String(a.occurredAt || '')))
}
