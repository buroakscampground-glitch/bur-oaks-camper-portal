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

    const [invoiceResult, siteCareResult] = await Promise.all([
      context.admin.from('invoices').select('id,status,due_date,total_due').in('camper_id', ownerIds),
      context.admin.from('site_care_notices').select('id,status').eq('camper_id', context.camper.id).neq('status', 'Resolved'),
    ])

    const error = invoiceResult.error || siteCareResult.error
    if (error) throw error

    const payments = (invoiceResult.data || []).filter((invoice) =>
      isInvoiceDueNow(invoice) || isInvoiceDueWithinDays(invoice, 30)
    ).length
    const siteCare = (siteCareResult.data || []).filter((notice) =>
      !['ready for review', 'resolved'].includes(String(notice.status || '').toLowerCase())
    ).length

    return NextResponse.json({
      count: payments + siteCare,
      breakdown: { payments, siteCare },
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load portal alerts.' }, { status: 500 })
  }
}
