import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { todayInCentral } from '../../../lib/invoice-balance'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  const action = String(body.action || '')
  const reason = String(body.reason || '').trim()
  if (reason.length < 5) return NextResponse.json({ error: 'Enter a clear credit reason.' }, { status: 400 })

  if (action === 'void') {
    const { data, error } = await context.admin.rpc('void_account_credit_audited', {
      p_credit_id: String(body.creditId || ''), p_reason: reason.slice(0, 1000), p_actor_email: context.user.email || 'office',
    })
    if (error) return NextResponse.json({ error: ['42883', 'PGRST202'].includes(error.code || '') ? 'The protected credit audit update is not installed yet.' : error.message }, { status: 400 })
    return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
  }

  const camperId = String(body.camperId || '').trim()
  const amount = Number(body.amount)
  if (action !== 'create' || !camperId || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: 'Choose a camper and enter a valid credit amount.' }, { status: 400 })
  const { data: credit, error } = await context.admin.rpc('create_account_credit_audited', {
    p_camper_id: camperId, p_amount: Number(amount.toFixed(2)), p_reason: reason.slice(0, 1000),
    p_notes: String(body.notes || '').trim().slice(0, 2000) || null, p_actor_email: context.user.email || 'office',
  })
  if (error) return NextResponse.json({ error: ['42883', 'PGRST202'].includes(error.code || '') ? 'The protected credit audit update is not installed yet.' : error.message }, { status: 400 })

  const dueResult = await context.admin.from('invoices').select('id,total_due').eq('camper_id', camperId)
    .in('status', ['open', 'sent', 'overdue']).lte('due_date', todayInCentral()).gt('total_due', 0).order('due_date', { ascending: true })
  let appliedNow = 0
  let applicationError = dueResult.error?.message || ''
  if (!dueResult.error) for (const invoice of dueResult.data || []) {
    const application = await context.admin.rpc('apply_account_credits_to_invoice_atomic', {
      p_camper_id: camperId, p_invoice_id: invoice.id, p_invoice_total: invoice.total_due, p_applied_by: context.user.email || 'office-credit-entry',
    })
    if (application.error) { applicationError = application.error.message; break }
    appliedNow += Number(application.data?.appliedTotal || 0)
  }
  return NextResponse.json({ success: true, credit, appliedNow, applicationError: applicationError || null }, { headers: { 'Cache-Control': 'no-store' } })
}
