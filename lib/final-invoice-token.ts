import { createHmac, timingSafeEqual } from 'crypto'

export type FinalInvoiceTokenPayload = {
  version: 1
  invoiceId: string
  camperId: string
  expiresAt: number
}

const defaultLifetimeSeconds = 180 * 24 * 60 * 60

function signingSecret(override?: string) {
  const secret = override || process.env.FINAL_INVOICE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  if (!secret) throw new Error('Final invoice payment links are not configured.')
  return secret
}

function signatureFor(encodedPayload: string, secret: string) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url')
}

export function createFinalInvoiceToken(
  invoiceId: string,
  camperId: string,
  options: { now?: number; lifetimeSeconds?: number; secret?: string } = {}
) {
  const now = options.now ?? Date.now()
  const payload: FinalInvoiceTokenPayload = {
    version: 1,
    invoiceId,
    camperId,
    expiresAt: Math.floor(now / 1000) + (options.lifetimeSeconds ?? defaultLifetimeSeconds),
  }
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encodedPayload}.${signatureFor(encodedPayload, signingSecret(options.secret))}`
}

export function verifyFinalInvoiceToken(
  token: string,
  options: { now?: number; secret?: string } = {}
): FinalInvoiceTokenPayload | null {
  try {
    const [encodedPayload, receivedSignature, extra] = String(token || '').split('.')
    if (!encodedPayload || !receivedSignature || extra) return null

    const expectedSignature = signatureFor(encodedPayload, signingSecret(options.secret))
    const received = Buffer.from(receivedSignature)
    const expected = Buffer.from(expectedSignature)
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as FinalInvoiceTokenPayload
    const nowSeconds = Math.floor((options.now ?? Date.now()) / 1000)
    if (
      payload.version !== 1 ||
      !payload.invoiceId ||
      !payload.camperId ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= nowSeconds
    ) return null

    return payload
  } catch {
    return null
  }
}
