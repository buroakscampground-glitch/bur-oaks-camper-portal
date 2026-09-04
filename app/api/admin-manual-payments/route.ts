import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const invoiceId = String(body.invoiceId || '').trim()
  const amount = Number(body.amount)
  const method = String(body.method || '').trim()
  const receivedOn = String(body.receivedOn || '').trim()
  const reference = String(body.reference || '').trim()
  const operationKey = String(body.operationKey || '').trim()

  if (!invoiceId || !Number.isFinite(amount) || amount <= 0 || amount > 1_000_000) {
    return NextResponse.json({ error: 'Enter a valid payment amount.' }, { status: 400 })
  }
  if (!method || !/^\d{4}-\d{2}-\d{2}$/.test(receivedOn) || !operationKey) {
    return NextResponse.json({ error: 'Payment method, received date, and operation key are required.' }, { status: 400 })
  }

  const { data, error } = await context.admin.rpc('record_manual_payment_atomic', {
    p_operation_key: operationKey,
    p_selected_invoice_id: invoiceId,
    p_amount: Number(amount.toFixed(2)),
    p_payment_method: method.slice(0, 100),
    p_received_on: receivedOn,
    p_reference: reference.slice(0, 300) || null,
    p_recorded_by: context.user.email || 'office',
  })

  if (error) {
    const migrationMissing = ['42883', 'PGRST202'].includes(error.code || '')
    return NextResponse.json(
      { error: migrationMissing ? 'The manual-payment allocation update is not installed yet.' : error.message },
      { status: migrationMissing ? 503 : 400 },
    )
  }

  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
