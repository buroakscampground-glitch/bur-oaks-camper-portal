import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { sendInvoiceEmail } from '../../../lib/invoice-emailing'
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

  const today = todayInCentral()
  const [textResult, emailResult] = await Promise.all([
    sendInvoiceText({
      client: context.admin,
      invoiceId,
      kind: 'new',
      automationKey: 'invoice-new',
      reminderDate: today,
      sentBy: context.user.email || 'office',
    }),
    sendInvoiceEmail({
      client: context.admin,
      invoiceId,
      kind: 'new',
      automationKey: 'invoice-new-email',
      reminderDate: today,
      sentBy: context.user.email || 'office',
    }),
  ])

  const hasFailure = textResult.status === 'failed' || emailResult.status === 'failed'

  return NextResponse.json({
    success: !hasFailure,
    result: {
      text: textResult,
      email: emailResult,
    },
  })
}
