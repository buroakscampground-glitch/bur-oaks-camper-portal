export function isRenewalDocument(document: { document_name?: unknown; document_type?: unknown }) {
  return /renewal/i.test(`${document.document_name || ''} ${document.document_type || ''}`)
}

export function renewalDocumentHasRequiredDetails(
  renewal: { lot_number?: unknown; contract_end_date?: unknown; annual_rent?: unknown; rent_payment_plan?: unknown } | null | undefined,
  camper?: { first_name?: unknown; last_name?: unknown } | null,
) {
  if (!renewal) return false
  const validEndDate = /^\d{4}-\d{2}-\d{2}$/.test(String(renewal.contract_end_date || ''))
  const hasCamperName = !camper || Boolean(String(camper.first_name || '').trim() && String(camper.last_name || '').trim())
  const annualRent = Number(renewal.annual_rent || 0)
  const validPlan = renewal.rent_payment_plan === 'semiannual' || renewal.rent_payment_plan === 'quarterly'
  return Boolean(String(renewal.lot_number || '').trim() && validEndDate && hasCamperName && annualRent > 0 && validPlan)
}
