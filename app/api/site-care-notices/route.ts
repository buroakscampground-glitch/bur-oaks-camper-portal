import { NextResponse } from 'next/server'
import { checkRateLimit } from '../../../lib/rate-limit'
import { isOperationalCamper } from '../../../lib/camper-records'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { sendTwilioSms } from '../../../lib/twilio-sms'
import { camperTextWithLink } from '../../../lib/portal-sms-links'
import { consentedCamperSmsPhones } from '../../../lib/camper-sms'
import { createAdminNotification } from '../../../lib/admin-notifications'
import { loadCampgroundBillingSettings } from '../../../lib/campground-settings'
import { siteCareEnforcementFor, siteCareSourceMarker, storedSiteCareTemplateKey } from '../../../lib/site-care-enforcement'

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
  let message = cleanText(body.message, 1200)
  const requestedTemplateKey = cleanText(body.templateKey, 80)
  const autoEnforce = body.autoEnforce === true
  let templateKey: string | null = requestedTemplateKey || null
  const priority = body.priority === 'Important' ? 'Important' : 'Standard'
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(String(body.dueDate || '')) ? body.dueDate : null

  if (!camperId || !title || !message) {
    return NextResponse.json({ error: 'Choose a camper and add the notice details.' }, { status: 400 })
  }

  if (autoEnforce && !dueDate) {
    return NextResponse.json({ error: 'Choose the automatic work-order date first.' }, { status: 400 })
  }

  if (autoEnforce) {
    const billingSettings = await loadCampgroundBillingSettings(context.admin)
    const enforcement = siteCareEnforcementFor(requestedTemplateKey, billingSettings)
    if (!enforcement) {
      return NextResponse.json({ error: 'This item does not have a safe automatic site-service charge.' }, { status: 400 })
    }
    templateKey = storedSiteCareTemplateKey(requestedTemplateKey, true, enforcement.chargeAmount)
    message = cleanText(`${message} If this is not acknowledged or marked ready for office review by the automatic date, Bur Oaks will create an approved grounds work order and add the ${enforcement.serviceLabel.toLowerCase()} charge of $${enforcement.chargeAmount.toFixed(2)} to your next electric bill.`, 1200)
  }

  const { data: targetCamper, error: camperError } = await context.admin
    .from('campers')
    .select('id,first_name,last_name,lot_number,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
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

  const phones = await consentedCamperSmsPhones(context.admin, targetCamper)
  if (!phones.length) {
    return NextResponse.json({
      success: true,
      notice,
      smsStatus: 'skipped',
      smsMessage: 'Portal notice sent. This camper does not have a valid mobile number saved.',
    })
  }

  const textMessage = 'Your site has a new item that needs attention. Please sign in to your camper portal to review it.'
  const smsBody = camperTextWithLink({ message: textMessage, path: '/portal#site-care', compact: true })
  const smsResults = []
  for (const phone of phones) {
    const smsResult = await sendTwilioSms({
      to: phone,
      body: smsBody,
      client: context.admin,
      camperId: targetCamper.id,
    })
    smsResults.push(smsResult)

    await context.admin.from('text_reminders').insert({
      camper_id: targetCamper.id,
      invoice_id: null,
      reminder_type: 'Site Care Notice',
      message: smsBody,
      sent_at: new Date().toISOString(),
      status: smsResult.sent ? 'sent' : 'failed',
      recipient_phone: phone,
      provider: 'twilio',
      provider_message_id: smsResult.sent ? smsResult.providerMessageId : null,
      error_message: smsResult.sent ? null : smsResult.error,
      sent_by: context.user.email || 'Bur Oaks Admin',
    })
  }

  const sentCount = smsResults.filter((result) => result.sent).length
  const failedResults = smsResults.filter((result) => !result.sent)

  return NextResponse.json({
    success: true,
    notice,
    smsStatus: failedResults.length === 0 ? 'sent' : sentCount > 0 ? 'partial' : 'failed',
    smsMessage: failedResults.length === 0
      ? `Portal notice and text alert sent to ${sentCount} saved phone number${sentCount === 1 ? '' : 's'}.`
      : `Portal notice sent. ${sentCount} text${sentCount === 1 ? '' : 's'} sent and ${failedResults.length} failed.`,
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

  let converted: Record<string, unknown> | null = null

  if (adminUser && action === 'convert_and_charge') {
    if (!['Acknowledged', 'Ready for Review'].includes(String(existing.status))) {
      return NextResponse.json({ error: 'Only an acknowledged or review-requested item can be manually converted.' }, { status: 400 })
    }

    const billingSettings = await loadCampgroundBillingSettings(context.admin)
    const enforcement = siteCareEnforcementFor(existing.template_key, billingSettings)
    if (!enforcement) {
      return NextResponse.json({ error: 'This notice does not have an approved automatic grounds charge.' }, { status: 400 })
    }

    const { data: targetCamper, error: targetError } = await context.admin
      .from('campers')
      .select('id,first_name,last_name,lot_number')
      .eq('id', existing.camper_id)
      .maybeSingle()
    if (targetError || !targetCamper) {
      return NextResponse.json({ error: targetError?.message || 'The camper account could not be found.' }, { status: 404 })
    }

    const marker = siteCareSourceMarker(String(existing.id))
    const chargeNotes = `Automatic deadline charge · ${marker}`
    const camperName = `${targetCamper.first_name || ''} ${targetCamper.last_name || ''}`.trim() || 'Camper'
    const lotNumber = String(existing.lot_number || targetCamper.lot_number || '').trim().replace(/^lot\s+/i, '')
    const ticketDescription = `${enforcement.maintenanceTask} ${marker}`

    const [{ data: existingCharge, error: existingChargeError }, { data: existingTicket, error: existingTicketError }] = await Promise.all([
      context.admin.from('site_service_charges').select('id').eq('notes', chargeNotes).limit(1).maybeSingle(),
      context.admin.from('maintenance_tickets').select('id').ilike('description', `%${marker}%`).limit(1).maybeSingle(),
    ])
    if (existingChargeError || existingTicketError) {
      return NextResponse.json({ error: existingChargeError?.message || existingTicketError?.message }, { status: 500 })
    }

    let chargeId = existingCharge?.id || ''
    if (!chargeId) {
      const { data: charge, error: chargeError } = await context.admin.from('site_service_charges').insert({
        camper_id: targetCamper.id,
        lot_number: lotNumber || null,
        camper_name: camperName,
        service_type: enforcement.serviceType,
        service_label: enforcement.serviceLabel,
        charge_amount: enforcement.chargeAmount,
        notes: chargeNotes,
        performed_at: now,
        created_by: context.user.email || 'Bur Oaks Admin',
      }).select('id').single()
      if (chargeError || !charge) {
        return NextResponse.json({ error: chargeError?.message || 'The site-service charge could not be created.' }, { status: 500 })
      }
      chargeId = charge.id
    }

    let ticketId = existingTicket?.id || ''
    if (!ticketId) {
      const { data: ticket, error: ticketError } = await context.admin.from('maintenance_tickets').insert({
        camper_id: targetCamper.id,
        title: enforcement.maintenanceTitle,
        description: ticketDescription,
        category: 'Grounds',
        priority: existing.priority === 'Important' ? 'High' : 'Normal',
        assigned_to: 'Open',
        lot_number: lotNumber,
        reported_by: context.user.email || 'Bur Oaks Admin',
        status: 'Open',
        work_order: true,
        admin_approved: true,
        approved_at: now,
        approved_by: context.user.email || 'Bur Oaks Admin',
      }).select('id').single()
      if (ticketError || !ticket) {
        return NextResponse.json({ error: ticketError?.message || 'The maintenance work order could not be created.', chargeId }, { status: 500 })
      }
      ticketId = ticket.id
    }

    converted = { chargeId, ticketId, chargeAmount: enforcement.chargeAmount, serviceLabel: enforcement.serviceLabel }
    updates = { status: 'Resolved', resolved_at: now, resolved_by: context.user.email || 'Bur Oaks Admin' }
  } else if (adminUser && action === 'resolve') {
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

  if (adminUser && ['resolve', 'convert_and_charge'].includes(action)) {
    const { error: clearAlertError } = await context.admin
      .from('admin_notifications')
      .update({ read_at: now })
      .eq('type', 'site_care')
      .eq('source_table', 'site_care_notices')
      .eq('source_id', String(notice.id))
      .is('read_at', null)

    if (clearAlertError && !['42P01', 'PGRST205'].includes(clearAlertError.code || '')) {
      console.error('Unable to clear resolved site care alert:', clearAlertError)
    }
  }

  let adminAlert: any = null
  if (!adminUser && action === 'ready_for_review') {
    const camperName = `${context.camper.first_name || ''} ${context.camper.last_name || ''}`.trim() || 'Camper'
    const lotNumber = cleanText(notice.lot_number || context.camper.lot_number, 40) || null
    adminAlert = await createAdminNotification(context.admin, {
      type: 'site_care',
      title: `Site care ready for review: ${notice.title}`,
      message: `${camperName} marked “${notice.title}” as taken care of. Inspect Lot ${lotNumber || '—'} and mark the notice resolved after approval.`,
      lot_number: lotNumber,
      camper_id: String(notice.camper_id),
      source_table: 'site_care_notices',
      source_id: String(notice.id),
    }).catch((alertError) => {
      console.error('Site care owner alert failed:', alertError)
      return { created: false, error: alertError?.message || 'Unable to create the office alert.' }
    })
  }

  return NextResponse.json({ success: true, notice, adminAlert, converted })
}
