import { NextResponse } from 'next/server'
import { loadAuthorizedBillingCampers } from '../../../lib/authorized-billing'
import { getAuthenticatedContext } from '../../../lib/server-auth'

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

    const { data, error } = await context.admin
      .from('documents')
      .select('*')
      .in('camper_id', ownerIds)

    if (error) throw error

    const documents = (data || []).map((document) => {
      const owner = ownerById.get(String(document.camper_id))
      const isDelegated = String(document.camper_id) !== String(context.camper.id)
      return {
        ...document,
        access_is_delegated: isDelegated,
        access_lot_number: owner?.lot_number || null,
        access_camper_name: `${owner?.first_name || ''} ${owner?.last_name || ''}`.trim() || 'Camper',
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
