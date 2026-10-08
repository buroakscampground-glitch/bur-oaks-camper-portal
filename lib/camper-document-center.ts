export type CamperDocumentFilter = 'all' | 'action' | 'waiting' | 'signed' | 'renewals' | 'insurance' | 'records'

export const camperDocumentFilters: Array<{ key: CamperDocumentFilter; label: string }> = [
  { key: 'all', label: 'All documents' },
  { key: 'action', label: 'Needs my signature' },
  { key: 'waiting', label: 'Waiting on someone' },
  { key: 'signed', label: 'Signed' },
  { key: 'renewals', label: 'Renewals' },
  { key: 'insurance', label: 'Insurance' },
  { key: 'records', label: 'Other records' },
]

function status(document: any) {
  return String(document?.signature_status || '').trim().toLowerCase()
}

function signedEmails(document: any) {
  return [document?.signed_email, document?.second_signed_email]
    .map((email) => String(email || '').trim().toLowerCase())
    .filter(Boolean)
}

export function normalizeCamperDocumentFilter(value: unknown): CamperDocumentFilter {
  const normalized = String(value || '').trim().toLowerCase()
  return camperDocumentFilters.some((filter) => filter.key === normalized)
    ? normalized as CamperDocumentFilter
    : 'all'
}

export function hasCamperSignedDocument(document: any, email: unknown) {
  const normalizedEmail = String(email || '').trim().toLowerCase()
  return Boolean(normalizedEmail && signedEmails(document).includes(normalizedEmail))
}

export function camperCanSignDocument(document: any, email: unknown) {
  return !['signed', 'not_required', 'declined'].includes(status(document)) && !hasCamperSignedDocument(document, email)
}

export function camperDocumentWaitsForAnotherSigner(document: any, email: unknown) {
  return !['signed', 'not_required', 'declined'].includes(status(document)) && hasCamperSignedDocument(document, email)
}

export function isRenewalDocument(document: any) {
  return /renewal/i.test(`${document?.document_name || ''} ${document?.document_type || ''}`)
}

export function isInsuranceDocument(document: any) {
  return /insurance/i.test(`${document?.document_name || ''} ${document?.document_type || ''}`)
}

export function matchesCamperDocumentFilter(document: any, filter: CamperDocumentFilter, email: unknown) {
  if (filter === 'all') return true
  if (filter === 'action') return camperCanSignDocument(document, email)
  if (filter === 'waiting') return camperDocumentWaitsForAnotherSigner(document, email)
  if (filter === 'signed') return status(document) === 'signed'
  if (filter === 'renewals') return isRenewalDocument(document)
  if (filter === 'insurance') return isInsuranceDocument(document)
  if (filter === 'records') {
    return !isRenewalDocument(document) && !isInsuranceDocument(document) &&
      ['signed', 'not_required', 'declined'].includes(status(document))
  }
  return true
}

export function filterCamperDocuments(documents: any[], filter: CamperDocumentFilter, email: unknown) {
  return documents.filter((document) => matchesCamperDocumentFilter(document, filter, email))
}

