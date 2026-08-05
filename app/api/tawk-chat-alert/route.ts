import { createHmac, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { formatSmsPhone, sendTwilioSms } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'

const propertyId = '6a71c26a2502921d483eba05'
const chatInboxUrl = `https://dashboard.tawk.to/#/inbox/${propertyId}/all`
const alertPhone = formatSmsPhone(
  process.env.TAWK_CHAT_ALERT_PHONE || '618-882-8063'
)

type TawkChatStart = {
  event?: string
  chatId?: string
  domain?: string
  message?: {
    text?: string
    type?: string
    sender?: { type?: string }
  }
  visitor?: {
    name?: string
    email?: string
  }
  property?: {
    id?: string
    name?: string
  }
}

function cleanText(value: unknown, maxLength: number) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength)
}

function signatureMatches(body: string, suppliedSignature: string, secret: string) {
  const expected = createHmac('sha1', secret).update(body).digest('hex')
  const supplied = suppliedSignature.trim().toLowerCase()

  if (!/^[a-f0-9]{40}$/.test(supplied) || supplied.length !== expected.length) {
    return false
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied))
}

export async function POST(request: Request) {
  const webhookSecret = process.env.TAWK_WEBHOOK_SECRET
  const suppliedSignature = request.headers.get('x-tawk-signature') || ''
  const eventId = cleanText(request.headers.get('x-hook-event-id'), 180)
  const contentLength = Number(request.headers.get('content-length') || 0)

  if (contentLength > 100_000) {
    return NextResponse.json({ error: 'Webhook payload is too large.' }, { status: 413 })
  }

  const rawBody = await request.text()

  if (!webhookSecret) {
    return NextResponse.json({ error: 'Live chat alerts are not configured.' }, { status: 503 })
  }

  if (!signatureMatches(rawBody, suppliedSignature, webhookSecret)) {
    return NextResponse.json({ error: 'Invalid webhook signature.' }, { status: 401 })
  }

  if (!eventId) {
    return NextResponse.json({ error: 'Missing webhook event ID.' }, { status: 400 })
  }

  let payload: TawkChatStart

  try {
    payload = JSON.parse(rawBody) as TawkChatStart
  } catch {
    return NextResponse.json({ error: 'Invalid webhook payload.' }, { status: 400 })
  }

  if (payload.event !== 'chat:start') {
    return NextResponse.json({ received: true, ignored: true })
  }

  if (payload.property?.id !== propertyId) {
    return NextResponse.json({ error: 'Unexpected tawk.to property.' }, { status: 403 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey || !alertPhone) {
    return NextResponse.json({ error: 'Chat text alerts are not fully configured.' }, { status: 503 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { error: insertError } = await admin.from('tawk_webhook_events').insert({
    event_id: eventId,
    event_type: payload.event,
    chat_id: cleanText(payload.chatId, 180) || null,
  })

  if (insertError?.code === '23505') {
    return NextResponse.json({ received: true, duplicate: true })
  }

  if (insertError) {
    console.error('Unable to reserve tawk.to webhook event:', insertError.code)
    return NextResponse.json({ error: 'Unable to process this chat alert.' }, { status: 503 })
  }

  const visitorName = cleanText(payload.visitor?.name, 80) || 'a website visitor'
  const firstMessage = cleanText(payload.message?.text, 160)
  const messageSummary = firstMessage
    ? `First message: "${firstMessage}"`
    : 'A new conversation is waiting.'
  const smsBody = [
    `Bur Oaks Live Chat: New chat from ${visitorName}.`,
    messageSummary,
    `Open the chat inbox to reply: ${chatInboxUrl}`,
    'Reply STOP to opt out.',
  ].join(' ')

  const smsResult = await sendTwilioSms({ to: alertPhone, body: smsBody })

  if (!smsResult.sent) {
    await admin.from('tawk_webhook_events').delete().eq('event_id', eventId)
    console.error('Unable to send tawk.to chat text alert:', smsResult.error)
    return NextResponse.json({ error: 'Unable to send the chat text alert.' }, { status: 502 })
  }

  const { error: updateError } = await admin
    .from('tawk_webhook_events')
    .update({
      sms_sent_at: new Date().toISOString(),
      provider_message_id: smsResult.providerMessageId,
    })
    .eq('event_id', eventId)

  if (updateError) {
    console.error('Unable to record tawk.to text delivery:', updateError.code)
  }

  return NextResponse.json({ received: true, smsSent: true })
}
