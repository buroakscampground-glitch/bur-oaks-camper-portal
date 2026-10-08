import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { financialOperationFailure } from '../../../lib/financial-operation-error'
import { reportOperationalFailure, supportReferenceMessage } from '../../../lib/operational-errors'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const invoiceId = String(body.invoiceId || '').trim()
  const reason = String(body.reason || '').trim()
  if (!invoiceId || reason.length < 5) return NextResponse.json({ error: 'Choose an invoice and enter a clear cancellation reason.' }, { status: 400 })
  const { data, error } = await context.admin.rpc('delete_invoice_with_audit_atomic', {
    p_invoice_id: invoiceId, p_reason: reason.slice(0, 1000), p_actor_email: context.user.email || 'office',
  })
  if (error) {
    const failure = financialOperationFailure(error, {
      migrationMessage: 'The protected invoice audit update is not installed yet.',
      fallbackMessage: 'The invoice could not be canceled.',
      allowedMessages: [
        'A cancellation reason is required.',
        'Invoice not found.',
        'This invoice has a Stripe payment processing and cannot be deleted.',
      ],
    })
    if (!failure.report) return NextResponse.json({ error: failure.message }, { status: failure.status })
    const requestId = reportOperationalFailure(request, {
      operation: 'invoice-cancel', actorRole: 'admin', identifiers: { invoiceId },
    }, error)
    return NextResponse.json(
      { error: supportReferenceMessage(failure.message, requestId), requestId },
      { status: failure.status },
    )
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
