import { NextResponse } from 'next/server'
import { invoiceEmailProviderStatus, sendInvoiceEmailTest } from '../../../lib/invoice-emailing'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

function maskEmail(value: string) {
  const [name, domain] = value.split('@')
  if (!domain) return value
  return `${name.slice(0, 2)}***@${domain}`
}

function maskSender(value: string) {
  return value.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, (email) => maskEmail(email))
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const status = invoiceEmailProviderStatus()

  return NextResponse.json({
    success: status.configured,
    provider: status.provider,
    configured: status.configured,
    reason: status.reason,
    from: status.from ? maskSender(status.from) : '',
    replyTo: status.replyTo ? maskEmail(status.replyTo) : '',
  })
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const to = String(body.to || context.user.email || 'buroakscampground@gmail.com').trim()
  const result = await sendInvoiceEmailTest(to, new URL(request.url).origin)
  const providerStatus = (result as any).providerStatus || invoiceEmailProviderStatus()

  return NextResponse.json({
    success: result.status === 'sent',
    status: result.status,
    message:
      result.status === 'sent'
        ? `Invoice email test sent to ${maskEmail(to)}.`
        : (result as any).error || (result as any).reason || 'Invoice email test did not send.',
    provider: (result as any).provider || providerStatus.provider,
    providerMessageId: (result as any).providerMessageId || null,
    configured: {
      provider: providerStatus.provider,
      ready: providerStatus.configured,
      from: providerStatus.from ? maskSender(providerStatus.from) : '',
      replyTo: providerStatus.replyTo ? maskEmail(providerStatus.replyTo) : '',
      reason: providerStatus.reason || '',
    },
  }, { status: result.status === 'failed' ? 500 : 200 })
}

