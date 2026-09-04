import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
        .select('remaining_amount,status')
        .eq('camper_id', context.camper.id)
        .eq('status', 'active')
        .gt('remaining_amount', 0),
    ])

    if (invoiceError) throw invoiceError
    if (creditError && !['42P01', 'PGRST205'].includes(creditError.code || '')) throw creditError

    const accountCredit = (credits || []).reduce(
      (sum: number, credit: any) => sum + Number(credit.remaining_amount || 0),
      0,
    )

    if (invoiceId) {
      const invoice = (invoices || [])[0] || null
      if (!invoice) return NextResponse.json({ error: 'This invoice is not available for your camper account.' }, { status: 404 })
      return NextResponse.json({ camper: context.camper, invoice, accountCredit }, { headers: { 'Cache-Control': 'no-store' } })
    }

    return NextResponse.json({
      camper: context.camper,
      invoices: invoices || [],
      accountCredit,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to load camper invoices.' }, { status: 500 })
  }
}
