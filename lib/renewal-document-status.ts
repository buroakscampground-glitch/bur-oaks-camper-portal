export type RenewalDocumentStatus = string | null | undefined

export function effectiveRenewalStatus(renewalStatus: string, documentStatus: RenewalDocumentStatus) {
  if (!['Not Started', 'Awaiting Response'].includes(renewalStatus)) return renewalStatus
  const signatureStatus = String(documentStatus || '').toLowerCase()
  if (signatureStatus === 'signed') return 'Renewing'
  if (signatureStatus === 'declined') return 'Camper Leaving'
  return renewalStatus
}
