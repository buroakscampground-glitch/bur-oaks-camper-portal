import { continueSignedRenewalRentSchedule } from './renewal-rent-schedule-service'
import { effectiveRenewalStatus } from './renewal-document-status'

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
    .eq('status', 'Awaiting Response')
    .not('renewal_document_id', 'is', null)
  if (renewalError) throw renewalError

  const documentIds = Array.from(new Set((renewals || []).map((renewal: any) => renewal.renewal_document_id).filter(Boolean)))
  if (!documentIds.length) return { checked: 0, repaired: 0, errors: [] as string[] }

  const { data: documents, error: documentError } = await client
    .from('documents')
    .select('id,signature_status,signed_at,updated_at')
    .in('id', documentIds)
  if (documentError) throw documentError

  const documentsById = new Map((documents || []).map((document: any) => [document.id, document]))
  let repaired = 0
  const errors: string[] = []

  for (const renewal of renewals || []) {
    const document: any = documentsById.get(renewal.renewal_document_id)
    const nextStatus = effectiveRenewalStatus(renewal.status, document?.signature_status)
    if (nextStatus === renewal.status) continue

    try {
      const recordedAt = document?.signed_at || document?.updated_at || new Date().toISOString()
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
