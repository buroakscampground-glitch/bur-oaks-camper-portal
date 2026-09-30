const CREDIT_ELIGIBLE_STATUSES = new Set(['open', 'sent', 'overdue'])

export type DueCreditInvoice = {
  due_date?: string | null
  status?: string | null
  total_due?: number | string | null
  camper_id?: string | null
}

export function isInvoiceReadyForAccountCredit(invoice: DueCreditInvoice, today: string) {
  const dueDate = String(invoice.due_date || '').slice(0, 10)
  return Boolean(
    invoice.camper_id &&
    /^\d{4}-\d{2}-\d{2}$/.test(dueDate) &&
    dueDate <= today &&
    CREDIT_ELIGIBLE_STATUSES.has(String(invoice.status || '').trim().toLowerCase()) &&
    Number(invoice.total_due || 0) > 0
  )
}

