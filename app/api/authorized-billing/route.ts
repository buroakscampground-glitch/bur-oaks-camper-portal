import { NextResponse } from 'next/server'
import { loadAuthorizedBillingCampers } from '../../../lib/authorized-billing'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { isInvoiceClosed } from '../../../lib/invoice-balance'
import { loadCamperPaymentReceipt } from '../../../lib/camper-payment-receipt'
import { reportOperationalFailure, supportReferenceMessage } from '../../../lib/operational-errors'

export const runtime = 'nodejs'

type AuthorizedInvoiceRow = Record<string, unknown> & {
  camper_id?: unknown
  status?: string | null
  due_date?: string | null
  total_due?: number | string | null
  subtotal?: number | string | null
  late_fee?: number | string | null
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const accounts = await loadAuthorizedBillingCampers(context.admin, [
      context.user.email,
      context.camper.email,
      context.camper.secondary_email,
    ])
    const accountIds = accounts.map((account) => account.id)
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

    const invoiceRows = (invoices || []) as AuthorizedInvoiceRow[]
    if (invoiceId) {
      const invoice = invoiceRows[0]
      if (!invoice) {
        return NextResponse.json({ error: 'This invoice is not available to your login.' }, { status: 404 })
      }
      const account = accounts.find((item) => String(item.id) === String(invoice.camper_id))
      const receipt = await loadCamperPaymentReceipt(context.admin, String(invoice.camper_id), invoice)
      return NextResponse.json({ account, invoice, receipt }, { headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json({
      accounts: accounts.map((account) => ({
        ...account,
        invoices: invoiceRows.filter((invoice) =>
          String(invoice.camper_id) === String(account.id) && !isInvoiceClosed(invoice)
        ),
      })),
    })
  } catch (error: unknown) {
    const requestId = reportOperationalFailure(request, {
      operation: 'authorized-family-billing-load',
      actorRole: String(context.camper.role || 'camper'),
      identifiers: { camperId: context.camper.id },
    }, error)
    return NextResponse.json({
      error: supportReferenceMessage('Authorized family billing is temporarily unavailable. Please try again.', requestId),
      requestId,
    }, { status: 500 })
  }
}
