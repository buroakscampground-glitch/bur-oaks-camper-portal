import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { sendInvoiceText, todayInCentral } from '../../../lib/invoice-texting'

async function requireAdmin(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return null
  }

  return context
}

export async function POST(request: Request) {
  const context = await requireAdmin(request)
  if (!context) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const invoiceId = String(body.invoiceId || '')

  if (!invoiceId) {
    return NextResponse.json({ error: 'Missing invoice id.' }, { status: 400 })
  }

  const result = await sendInvoiceText({
    client: context.admin,
    invoiceId,
    kind: 'new',
    automationKey: 'invoice-new',
    reminderDate: todayInCentral(),
    sentBy: context.user.email || 'office',
  })

  return NextResponse.json({ success: result.status !== 'failed', result })
}
