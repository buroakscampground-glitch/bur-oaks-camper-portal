import { NextResponse } from 'next/server'
import { loadAuthorizedBillingCampers } from '../../../lib/authorized-billing'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const accounts = await loadAuthorizedBillingCampers(context.admin, context.user.email)
    const accountIds = accounts.map((account: any) => account.id)
    const invoiceId = new URL(request.url).searchParams.get('invoiceId')

    if (!accountIds.length) {
      return invoiceId
        ? NextResponse.json({ error: 'This invoice is not available to your login.' }, { status: 404 })
        : NextResponse.json({ accounts: [] })
    }

    let invoiceQuery = context.admin
      .from('invoices')
      .select('*, invoice_items(*)')
      .in('camper_id', accountIds)
      .order('due_date', { ascending: false })

    if (invoiceId) invoiceQuery = invoiceQuery.eq('id', invoiceId)

    const { data: invoices, error } = await invoiceQuery
    if (error) throw error

    if (invoiceId) {
      const invoice = (invoices || [])[0]
      if (!invoice) {
        return NextResponse.json({ error: 'This invoice is not available to your login.' }, { status: 404 })
      }
      const account = accounts.find((item: any) => String(item.id) === String(invoice.camper_id))
      return NextResponse.json({ account, invoice })
    }

    return NextResponse.json({
      accounts: accounts.map((account: any) => ({
        ...account,
        invoices: (invoices || []).filter((invoice: any) => String(invoice.camper_id) === String(account.id)),
      })),
    })
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Unable to load authorized family billing.' },
      { status: 500 }
    )
  }
}

