import { NextResponse } from 'next/server'
import { checkRateLimit } from '../../../lib/rate-limit'
import { isOperationalCamper } from '../../../lib/camper-records'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { formatSmsPhone, sendTwilioSms } from '../../../lib/twilio-sms'
import { camperTextWithLink } from '../../../lib/portal-sms-links'

export const runtime = 'nodejs'

const statuses = ['Open', 'Acknowledged', 'Ready for Review', 'Resolved'] as const

function cleanText(value: unknown, maxLength: number) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function isAdmin(role: unknown) {
  return String(role || '').toLowerCase() === 'admin'
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'site-care-create', 40, 10 * 60_000)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many site care updates. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } })

  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  if (!isAdmin(context.camper.role)) {
    return NextResponse.json({ error: 'Only an admin can send a site care notice.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const camperId = cleanText(body.camperId, 80)
  const title = cleanText(body.title, 160)
  const message = cleanText(body.message, 1200)
  const templateKey = cleanText(body.templateKey, 80) || null
  const priority = body.priority === 'Important' ? 'Important' : 'Standard'
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate || '')) ? body.dueDate : null

  if (!camperId || !title || !message) {
    return NextResponse.json({ error: 'Choose a camper and add the notice details.' }, { status: 400 })
  }

  const { data: targetCamper, error: camperError } = await context.admin
    .from('campers')
    .select('id,first_name,last_name,lot_number,phone,sms_opt_in,active,role')
    .eq('id', camperId)
    .eq('active', true)
    .maybeSingle()

  if (camperError || !targetCamper || !isOperationalCamper(targetCamper)) {
    return NextResponse.json({ error: 'That active camper could not be found.' }, { status: 404 })
  }

  const { data: notice, error } = await context.admin
    .from('site_care_notices')
    .insert({
      camper_id: targetCamper.id,
      lot_number: cleanText(targetCamper.lot_number, 40) || null,
      template_key: templateKey,
      title,
      message,
      priority,
      due_date: dueDate,
      status: 'Open',
      created_by: context.user.email || 'Bur Oaks Admin',
    })
    .select('*')
    .single()

  if (error || !notice) {
    return NextResponse.json({ error: error?.message || 'Unable to send this site care notice.' }, { status: 500 })
  }

  if (!targetCamper.sms_opt_in) {
    return NextResponse.json({
      success: true,
      notice,
      smsStatus: 'skipped',
      smsMessage: 'Portal notice sent. This camper has not opted in to text alerts.',
    })
  }

  const phone = formatSmsPhone(targetCamper.phone)
  if (!phone) {
    return NextResponse.json({
      success: true,
      notice,
      smsStatus: 'skipped',
      smsMessage: 'Portal notice sent. This camper does not have a valid mobile number saved.',
    })
  }

  const textMessage = 'Your site has a new item that needs attention. Please sign in to your camper portal to review it.'
  const smsResult = await sendTwilioSms({
    to: phone,
    body: camperTextWithLink({ message: textMessage, path: '/portal#site-care' }),
  })

  await context.admin.from('text_reminders').insert({
    camper_id: targetCamper.id,
    invoice_id: null,
    reminder_type: 'Site Care Notice',
    message: textMessage,
    sent_at: new Date().toISOString(),
    status: smsResult.sent ? 'sent' : 'failed',
    recipient_phone: phone,
    provider: 'twilio',
    provider_message_id: smsResult.sent ? smsResult.providerMessageId : null,
    error_message: smsResult.sent ? null : smsResult.error,
    sent_by: context.user.email || 'Bur Oaks Admin',
  })

  return NextResponse.json({
    success: true,
    notice,
    smsStatus: smsResult.sent ? 'sent' : 'failed',
    smsMessage: smsResult.sent
      ? 'Portal notice and text alert sent.'
      : `Portal notice sent, but the text alert failed: ${smsResult.error}`,
  })
}

export async function PATCH(request: Request) {
  const rateLimit = await checkRateLimit(request, 'site-care-update', 50, 10 * 60_000)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many site care updates. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } })

  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const id = cleanText(body.id, 80)
  const action = cleanText(body.action, 40)
  if (!id) return NextResponse.json({ error: 'Notice ID is required.' }, { status: 400 })

  const { data: existing, error: findError } = await context.admin
    .from('site_care_notices')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (findError || !existing) return NextResponse.json({ error: 'Site care notice not found.' }, { status: 404 })

  const adminUser = isAdmin(context.camper.role)
  if (!adminUser && String(existing.camper_id) !== String(context.camper.id)) {
    return NextResponse.json({ error: 'You cannot update this notice.' }, { status: 403 })
  }

  const now = new Date().toISOString()
  let updates: Record<string, string | null> = {}

  if (adminUser && action === 'resolve') {
    updates = { status: 'Resolved', resolved_at: now, resolved_by: context.user.email || 'Bur Oaks Admin' }
  } else if (adminUser && action === 'reopen') {
    updates = { status: 'Open', resolved_at: null, resolved_by: null, ready_for_review_at: null }
  } else if (!adminUser && action === 'acknowledge' && existing.status === 'Open') {
    updates = { status: 'Acknowledged', acknowledged_at: now }
  } else if (!adminUser && action === 'ready_for_review' && ['Open', 'Acknowledged'].includes(existing.status)) {
    updates = {
      status: 'Ready for Review',
      acknowledged_at: existing.acknowledged_at || now,
      ready_for_review_at: now,
    }
  } else {
    return NextResponse.json({ error: 'That status change is not available.' }, { status: 400 })
  }

  const { data: notice, error } = await context.admin
    .from('site_care_notices')
    .update(updates)
    .eq('id', id)
    .select('*')
    .single()

  if (error || !notice || !statuses.includes(notice.status)) {
    return NextResponse.json({ error: error?.message || 'Unable to update this notice.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, notice })
}
