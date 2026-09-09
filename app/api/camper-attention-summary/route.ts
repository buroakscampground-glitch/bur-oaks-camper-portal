import { NextResponse } from 'next/server'
import { loadAuthorizedBillingCampers } from '../../../lib/authorized-billing'
import { isInvoiceDueNow, isInvoiceDueWithinDays } from '../../../lib/invoice-balance'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const delegatedCampers = await loadAuthorizedBillingCampers(context.admin, context.user.email)
    const ownerIds = [context.camper, ...delegatedCampers]
      .filter((owner, index, all) => all.findIndex((candidate) => String(candidate.id) === String(owner.id)) === index)
      .map((owner) => owner.id)

    const [invoiceResult, documentResult, siteCareResult, messageResult] = await Promise.all([
      context.admin.from('invoices').select('id,status,due_date,total_due').in('camper_id', ownerIds),
      context.admin.from('documents').select('id,signature_status').in('camper_id', ownerIds),
      context.admin.from('site_care_notices').select('id').eq('camper_id', context.camper.id).neq('status', 'Resolved'),
      context.admin
        .from('office_messages')
        .select('id')
        .eq('camper_id', context.camper.id)
        .eq('sender_role', 'admin')
        .is('camper_archived_at', null)
        .is('read_by_camper_at', null),
    ])

    const error = invoiceResult.error || documentResult.error || siteCareResult.error || messageResult.error
    if (error) throw error

    const payments = (invoiceResult.data || []).filter((invoice) =>
      isInvoiceDueNow(invoice) || isInvoiceDueWithinDays(invoice, 30)
    ).length
    const documents = (documentResult.data || []).filter((document) =>
      !['signed', 'not_required', 'declined'].includes(String(document.signature_status || '').toLowerCase())
    ).length
    const siteCare = (siteCareResult.data || []).length
    const officeMessages = (messageResult.data || []).length

    return NextResponse.json({
      count: payments + documents + siteCare + officeMessages,
      breakdown: { payments, documents, siteCare, officeMessages },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load portal alerts.' }, { status: 500 })
  }
}
