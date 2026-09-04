export function priorPaymentReview(invoices: any[], newPaymentReference: unknown) {
  const incoming = String(newPaymentReference || '').trim()
  const paidInvoices = (invoices || []).filter((invoice) => String(invoice?.status || '').toLowerCase() === 'paid')
  const existingReferences = Array.from(new Set(
    paidInvoices.map((invoice) => String(invoice?.payment_reference || '').trim()).filter(Boolean)
  ))
  const hasUnknownPriorPayment = paidInvoices.some((invoice) => !String(invoice?.payment_reference || '').trim())
  const distinctReferences = existingReferences.filter((reference) => reference !== incoming)

  return {
    existingReferences,
    distinctReferences,
    hasUnknownPriorPayment,
    samePayment: Boolean(incoming) && paidInvoices.length > 0 && !hasUnknownPriorPayment && distinctReferences.length === 0,
    needsReview: paidInvoices.length > 0 && (hasUnknownPriorPayment || distinctReferences.length > 0),
  }
}
