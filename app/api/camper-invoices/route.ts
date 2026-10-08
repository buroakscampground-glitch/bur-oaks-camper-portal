import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { isInvoiceClosed } from '../../../lib/invoice-balance'
import { loadCamperPaymentReceipt } from '../../../lib/camper-payment-receipt'
import { reportOperationalFailure, supportReferenceMessage } from '../../../lib/operational-errors'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type CreditBalanceRow = {
  remaining_amount?: number | string | null
  applies_to?: string | null
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Camper access is required.' }, { status: 401 })

  try {
    const invoiceId = new URL(request.url).searchParams.get('invoiceId')
    let query = context.admin
      .from('invoices')
      .select('*, invoice_items(*)')
      .eq('camper_id', context.camper.id)
      .order('due_date', { ascending: false })

    if (invoiceId) query = query.eq('id', invoiceId)

    const [{ data: invoices, error: invoiceError }, { data: credits, error: creditError }] = await Promise.all([
      query,
      context.admin
        .from('account_credits')
        .select('remaining_amount,status,applies_to')
        .eq('camper_id', context.camper.id)
        .eq('status', 'active')
        .gt('remaining_amount', 0),
    ])

    if (invoiceError) throw invoiceError
    if (creditError && !['42P01', 'PGRST205'].includes(creditError.code || '')) throw creditError

    const creditRows = (credits || []) as CreditBalanceRow[]
    const accountCredit = creditRows.reduce(
      (sum, credit) => sum + Number(credit.remaining_amount || 0),
      0,
    )
    const accountCreditDetails = {
      lotRent: creditRows.filter((credit) => credit.applies_to === 'lot_rent').reduce((sum, credit) => sum + Number(credit.remaining_amount || 0), 0),
      general: creditRows.filter((credit) => credit.applies_to !== 'lot_rent').reduce((sum, credit) => sum + Number(credit.remaining_amount || 0), 0),
    }

    if (invoiceId) {
      const invoice = (invoices || [])[0] || null
      if (!invoice) return NextResponse.json({ error: 'This invoice is not available for your camper account.' }, { status: 404 })
      const receipt = await loadCamperPaymentReceipt(context.admin, String(context.camper.id), invoice)
      return NextResponse.json({ camper: context.camper, invoice, receipt, accountCredit, accountCreditDetails }, { headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json({
      camper: context.camper,
      invoices: (invoices || []).filter((invoice) => !isInvoiceClosed(invoice)),
      accountCredit,
      accountCreditDetails,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    const requestId = reportOperationalFailure(request, {
      operation: 'camper-invoices-load',
      actorRole: String(context.camper.role || 'camper'),
      identifiers: { camperId: context.camper.id },
    }, error)
    return NextResponse.json({
      error: supportReferenceMessage('Your billing details are temporarily unavailable. Please try again.', requestId),
      requestId,
    }, { status: 500 })
  }
}
