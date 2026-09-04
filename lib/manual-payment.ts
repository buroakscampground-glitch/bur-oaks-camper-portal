export type PaymentInvoice = {
  id: string
  invoice_number?: string | null
  invoice_type?: string | null
  due_date?: string | null
  created_at?: string | null
  status?: string | null
  total_due?: number | string | null
}

export type PaymentAllocation = {
  invoiceId: string
  invoiceNumber: string
  invoiceType: string
  dueDate: string | null
  amount: number
}

const CLOSED_STATUSES = new Set(['paid', 'processing', 'void', 'canceled', 'cancelled'])

function cents(value: unknown) {
  const amount = Number(value)
  return Number.isFinite(amount) ? Math.max(0, Math.round(amount * 100)) : 0
}

export function eligiblePaymentInvoices(invoices: PaymentInvoice[], selectedInvoiceId: string) {
  return invoices
    .filter((invoice) => !CLOSED_STATUSES.has(String(invoice.status || '').toLowerCase()) && cents(invoice.total_due) > 0)
    .sort((left, right) => {
      if (left.id === selectedInvoiceId) return -1
      if (right.id === selectedInvoiceId) return 1
      const leftDate = left.due_date || '9999-12-31'
      const rightDate = right.due_date || '9999-12-31'
      return leftDate.localeCompare(rightDate) || String(left.created_at || '').localeCompare(String(right.created_at || ''))
    })
}

export function buildPaymentAllocationPreview(
  invoices: PaymentInvoice[],
  selectedInvoiceId: string,
  paymentAmount: unknown,
) {
  let remainingCents = cents(paymentAmount)
  const allocations: PaymentAllocation[] = []

  for (const invoice of eligiblePaymentInvoices(invoices, selectedInvoiceId)) {
    if (remainingCents <= 0) break
    const appliedCents = Math.min(cents(invoice.total_due), remainingCents)
    if (appliedCents <= 0) continue
    allocations.push({
      invoiceId: invoice.id,
      invoiceNumber: String(invoice.invoice_number || invoice.id),
      invoiceType: String(invoice.invoice_type || 'Campground invoice'),
      dueDate: invoice.due_date || null,
      amount: appliedCents / 100,
    })
    remainingCents -= appliedCents
  }

  return {
    allocations,
    appliedTotal: allocations.reduce((sum, allocation) => sum + allocation.amount, 0),
    creditAmount: remainingCents / 100,
  }
}

export async function submitManualPayment({
  client,
  invoiceId,
  amount,
  method,
  receivedOn,
  reference,
}: {
  client: any
  invoiceId: string
  amount: number
  method: string
  receivedOn: string
  reference?: string
}) {
  const { data } = await client.auth.getSession()
  const token = data.session?.access_token || ''
  if (!token) throw new Error('Your session expired. Sign in again before recording the payment.')

  const response = await fetch('/api/admin-manual-payments', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      invoiceId,
      amount,
      method,
      receivedOn,
      reference: reference?.trim() || null,
      operationKey: crypto.randomUUID(),
    }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'The payment could not be recorded.')
  return result
}
