import { continueSignedRenewalRentSchedule } from './renewal-rent-schedule-service'
import { effectiveRenewalStatus } from './renewal-document-status'
import { hasSecureRenewalSignature } from './renewal-signature'

function centralDate(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export async function reconcileRenewalsWithDocuments(client: any) {
  const { data: renewals, error: renewalError } = await client
    .from('season_renewals')
    .select('id,camper_id,status,renewal_document_id')
    .in('status', ['Not Started', 'Awaiting Response'])
    .not('renewal_document_id', 'is', null)
  if (renewalError) throw renewalError

  const documentIds = Array.from(new Set((renewals || []).map((renewal: any) => renewal.renewal_document_id).filter(Boolean)))
  if (!documentIds.length) return { checked: 0, repaired: 0, errors: [] as string[] }

  const { data: documents, error: documentError } = await client
    .from('documents')
    .select('id,signature_status,signed_at,signed_name,second_signed_name,requires_two_signatures,signature_record_hash,second_signature_record_hash,uploaded_at')
    .in('id', documentIds)
  if (documentError) throw documentError

  const documentsById = new Map((documents || []).map((document: any) => [document.id, document]))
  let repaired = 0
  const errors: string[] = []

  for (const renewal of renewals || []) {
    const document: any = documentsById.get(renewal.renewal_document_id)
    const signatureStatus = document?.signature_status === 'signed' && !hasSecureRenewalSignature(document)
      ? 'pending'
      : document?.signature_status
    const nextStatus = effectiveRenewalStatus(renewal.status, signatureStatus)
    if (nextStatus === renewal.status) continue

    try {
      const recordedAt = document?.signed_at || document?.uploaded_at || new Date().toISOString()
      if (nextStatus === 'Renewing') {
        await continueSignedRenewalRentSchedule({
          client,
          camperId: renewal.camper_id,
          documentId: renewal.renewal_document_id,
          signedAt: recordedAt,
        })
      } else {
        const { error } = await client.from('season_renewals').update({
          status: nextStatus,
          decision_recorded_at: centralDate(recordedAt),
          auto_send_approved: false,
          auto_send_approved_at: null,
          last_automation_at: new Date().toISOString(),
          automation_error: null,
        }).eq('id', renewal.id)
        if (error) throw error
      }
      repaired += 1
    } catch (error: any) {
      errors.push(`${renewal.id}: ${String(error?.message || error)}`)
    }
  }

  return { checked: (renewals || []).length, repaired, errors }
}
