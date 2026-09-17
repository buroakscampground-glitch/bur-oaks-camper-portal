export function isRenewalDocument(document: { document_name?: unknown; document_type?: unknown }) {
  return /renewal/i.test(`${document.document_name || ''} ${document.document_type || ''}`)
}

export function renewalDocumentHasRequiredDetails(
  renewal: { lot_number?: unknown; contract_end_date?: unknown } | null | undefined,
  camper?: { first_name?: unknown; last_name?: unknown } | null,
) {
  if (!renewal) return false
  const validEndDate = /^\d{4}-\d{2}-\d{2}$/.test(String(renewal.contract_end_date || ''))
  const hasCamperName = !camper || Boolean(String(camper.first_name || '').trim() && String(camper.last_name || '').trim())
  return Boolean(String(renewal.lot_number || '').trim() && validEndDate && hasCamperName)
}
