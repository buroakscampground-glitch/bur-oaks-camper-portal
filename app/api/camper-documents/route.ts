import { NextResponse } from 'next/server'
import { loadAuthorizedBillingCampers } from '../../../lib/authorized-billing'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { renewalResponseDueDate } from '../../../lib/renewal-timeline'
import { renewalDocumentHasRequiredDetails } from '../../../lib/renewal-document-readiness'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const delegatedCampers = await loadAuthorizedBillingCampers(context.admin, context.user.email)
    const owners = [context.camper, ...delegatedCampers]
      .filter((owner, index, all) => all.findIndex((candidate) => String(candidate.id) === String(owner.id)) === index)
    const ownerIds = owners.map((owner) => owner.id)
    const ownerById = new Map(owners.map((owner) => [String(owner.id), owner]))

    const [{ data, error }, { data: renewals, error: renewalError }, { data: lots, error: lotError }] = await Promise.all([
      context.admin.from('documents').select('*').in('camper_id', ownerIds),
      context.admin
        .from('season_renewals')
        .select('id,camper_id,lot_number,contract_start_date,contract_end_date,renewal_document_id,status')
        .in('camper_id', ownerIds),
      context.admin
        .from('lots')
        .select('lot_number,lot_rent_amount')
        .in('lot_number', owners.map((owner) => String(owner.lot_number || '')).filter(Boolean)),
    ])

    if (error || renewalError || lotError) throw error || renewalError || lotError

    const renewalByDocumentId = new Map(
      (renewals || [])
        .filter((renewal) => renewal.renewal_document_id)
        .map((renewal) => [String(renewal.renewal_document_id), renewal])
    )
    const lotRentByNumber = new Map((lots || []).map((lot) => [String(lot.lot_number || ''), Number(lot.lot_rent_amount || 0)]))

    const documents = (data || []).map((document) => {
      const owner = ownerById.get(String(document.camper_id))
      const isDelegated = String(document.camper_id) !== String(context.camper.id)
      const renewal = renewalByDocumentId.get(String(document.id))
      const contractEndDate = String(renewal?.contract_end_date || '')
      return {
        ...document,
        access_is_delegated: isDelegated,
        access_lot_number: owner?.lot_number || null,
        access_camper_name: `${owner?.first_name || ''} ${owner?.last_name || ''}`.trim() || 'Camper',
        renewal_details: renewal ? {
          camper_name: `${owner?.first_name || ''} ${owner?.last_name || ''}`.trim() || 'Camper',
          lot_number: renewal.lot_number || owner?.lot_number || null,
          contract_start_date: renewal.contract_start_date || null,
          contract_end_date: renewal.contract_end_date || null,
          response_due_date: contractEndDate ? renewalResponseDueDate(contractEndDate) : null,
          annual_rent: lotRentByNumber.get(String(renewal.lot_number || owner?.lot_number || '')) || null,
          payment_plan: owner?.rent_payment_plan === 'quarterly' ? 'Four quarterly payments' : 'Two half payments',
          status: renewal.status || null,
          complete: renewalDocumentHasRequiredDetails({ ...renewal, lot_number: renewal.lot_number || owner?.lot_number }, owner),
        } : null,
      }
    })

    const signedInEmail = String(context.user.email || '').trim().toLowerCase()
    const secondaryEmail = String(context.camper.secondary_email || '').trim().toLowerCase()
    const suggestedSignerName = signedInEmail && signedInEmail === secondaryEmail
      ? `${context.camper.second_profile_first_name || ''} ${context.camper.second_profile_last_name || ''}`.trim()
      : `${context.camper.first_name || ''} ${context.camper.last_name || ''}`.trim()

    return NextResponse.json({ documents, suggestedSignerName })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load camper documents.' }, { status: 500 })
  }
}
