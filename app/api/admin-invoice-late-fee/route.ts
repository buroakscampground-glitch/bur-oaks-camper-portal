import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'

function money(value: unknown) {
  return Math.round(Number(value || 0) * 100) / 100
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const invoiceId = String(body.invoiceId || '').trim()
  const reason = String(body.reason || '').trim()
  if (!invoiceId || reason.length < 5) {
    return NextResponse.json({ error: 'Choose an invoice and enter a clear waiver reason.' }, { status: 400 })
  }
  const { data, error } = await context.admin.rpc('remove_invoice_late_fee_audited', {
    p_invoice_id: invoiceId, p_reason: reason.slice(0, 1000), p_actor_email: context.user.email || 'office',
  })
  if (error) return NextResponse.json({ error: ['42883', 'PGRST202'].includes(error.code || '') ? 'The protected waiver audit update is not installed yet.' : error.message }, { status: 400 })
  const removedFee = money(data?.removedFee)
  const totalDue = money(data?.totalDue)

  return NextResponse.json({
    success: true,
    removedFee,
    totalDue,
    message: `Late fee removed. The new invoice balance is $${totalDue.toFixed(2)}. The reason and before/after values were saved.`,
  })
}
