import { formatSmsPhone, isTwilioConfigured, sendTwilioSms } from './twilio-sms'
import { portalSmsUrl } from './portal-sms-links'
import { billingDelegateEmailsForLot, normalizeBillingEmail } from './authorized-billing'
import { consentedCamperSmsPhones, phoneAutomationKey } from './camper-sms'
import { daysUntilDate, todayInCentral } from './invoice-reminder-schedule'
import type { InvoiceNoticeKind } from './invoice-reminder-schedule'
import { isNoBillingLot } from './billing-exemptions'

type InvoiceTextKind = InvoiceNoticeKind

type SendInvoiceTextOptions = {
  client: any
  invoiceId: string
  kind: InvoiceTextKind
  automationKey: string
  reminderDate: string
  sentBy?: string | null
}

export { daysUntilDate, todayInCentral }

function money(value: unknown) {
  return Number(value || 0).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  })
}

function prettyDate(value?: string | null) {
  if (!value) return 'soon'
  const date = new Date(`${value}T12:00:00`)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function invoiceCamper(invoice: any) {
  if (Array.isArray(invoice?.campers)) return invoice.campers[0] || null
  return invoice?.campers || null
}

function buildInvoiceSms(invoice: any, kind: InvoiceTextKind, camper: any) {
  const invoiceNumber = invoice.invoice_number || 'new invoice'
  const total = money(invoice.total_due)
  const due = prettyDate(invoice.due_date)
  const invoiceUrl = portalSmsUrl(`/invoices/${invoice.id}`)
  const site = camper?.lot_number ? ` for site ${camper.lot_number}` : ''

  if (kind === 'new') {
    return `Bur Oaks Campground: A new invoice #${invoiceNumber}${site} is ${total}, due ${due}.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
  }

  if (kind === 'upcoming') {
    return `Bur Oaks Campground: Upcoming bill — invoice #${invoiceNumber}${site} for ${total} is due ${due}.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
  }

  if (kind === 'due_3_days') {
    return `Bur Oaks Campground: Reminder — invoice #${invoiceNumber}${site} for ${total} is due in 3 days on ${due}.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
  }

  if (kind === 'due_1_day') {
    return `Bur Oaks Campground: Reminder — invoice #${invoiceNumber}${site} for ${total} is due tomorrow, ${due}.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
  }

  if (kind === 'due_today') {
    return `Bur Oaks Campground: Reminder — invoice #${invoiceNumber}${site} for ${total} is due today, ${due}.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
  }

  if (kind === 'late_fee') {
    return `Bur Oaks Campground: A late fee of ${money(invoice.late_fee)} was added to past-due invoice #${invoiceNumber}${site}. Updated balance: ${total}.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
  }

  return `Bur Oaks Campground: Past due reminder — invoice #${invoiceNumber}${site} for ${total} was due ${due}. Please pay or contact the office.\nClick here to view and pay: ${invoiceUrl}\nReply STOP to opt out.`
}

export async function sendInvoiceText({
  client,
  invoiceId,
  kind,
  automationKey,
  reminderDate,
  sentBy = 'automation',
}: SendInvoiceTextOptions) {
  if (!isTwilioConfigured()) {
    return { status: 'skipped', reason: 'Twilio is not connected yet.' }
  }

  const { data: invoice, error: invoiceError } = await client
    .from('invoices')
    .select(`
      id,
      camper_id,
      invoice_number,
      invoice_type,
      total_due,
      late_fee,
      due_date,
      status,
      campers (id, lot_number, first_name, last_name, phone, alternate_phone, second_profile_phone, sms_opt_in, active)
    `)
    .eq('id', invoiceId)
    .single()

  if (invoiceError || !invoice) {
    return { status: 'failed', error: invoiceError?.message || 'Invoice was not found.' }
  }

  const invoiceStatus = String(invoice.status || '').toLowerCase()
  if (invoiceStatus === 'paid' || invoiceStatus === 'processing') {
    return {
      status: 'skipped',
      reason: invoiceStatus === 'paid' ? 'Invoice is already paid.' : 'A payment is already processing.',
    }
  }

  const camper = invoiceCamper(invoice)
  if (!camper?.active) {
    return { status: 'skipped', reason: 'Camper is not active.' }
  }
  if (isNoBillingLot(camper.lot_number)) {
    return { status: 'skipped', reason: `Lot ${camper.lot_number} has billing disabled.` }
  }

  const recipients: Array<{ camperId: string; phone: string; automationKey: string }> = []
  const ownerPhones = await consentedCamperSmsPhones(client, camper)
  const primaryOwnerPhone = formatSmsPhone(camper.phone)
  for (const phone of ownerPhones) {
    recipients.push({
      camperId: camper.id,
      phone,
      automationKey: phone === primaryOwnerPhone ? automationKey : phoneAutomationKey(automationKey, phone),
    })
  }

  const delegateEmails = billingDelegateEmailsForLot(camper.lot_number)
  if (delegateEmails.length) {
    const { data: possibleDelegates, error: delegateError } = await client
      .from('campers')
      .select('id,email,secondary_email,phone,alternate_phone,second_profile_phone,sms_opt_in,active')
      .eq('active', true)

    if (delegateError) {
      return { status: 'failed', error: delegateError.message }
    }

    const allowedEmails = new Set(delegateEmails.map(normalizeBillingEmail))
    for (const delegate of possibleDelegates || []) {
      const matchedEmail = [delegate.email, delegate.secondary_email]
        .map(normalizeBillingEmail)
        .find((email) => allowedEmails.has(email))
      const delegatePhones = await consentedCamperSmsPhones(client, delegate)
      if (!matchedEmail || !delegatePhones.length) continue

      const safeEmailKey = matchedEmail.replace(/[^a-z0-9]+/g, '-').slice(0, 40)
      const primaryDelegatePhone = formatSmsPhone(delegate.phone)
      for (const phone of delegatePhones) {
        const delegateKey = `${automationKey}-family-${safeEmailKey}`
        recipients.push({
          camperId: delegate.id,
          phone,
          automationKey: phone === primaryDelegatePhone ? delegateKey : phoneAutomationKey(delegateKey, phone),
        })
      }
    }
  }

  const uniqueRecipients = Array.from(
    new Map(recipients.map((recipient) => [recipient.phone, recipient])).values()
  )
  if (!uniqueRecipients.length) {
    return { status: 'skipped', reason: 'No opted-in phone numbers are available for this invoice.' }
  }

  const message = buildInvoiceSms(invoice, kind, camper)
  const reminderType =
    kind === 'new'
      ? 'New Invoice'
      : kind === 'upcoming'
        ? 'Invoice Coming Due'
      : kind === 'due_3_days'
        ? 'Invoice Due in 3 Days'
        : kind === 'due_1_day'
          ? 'Invoice Due Tomorrow'
          : kind === 'due_today'
            ? 'Invoice Due Today'
            : kind === 'late_fee'
              ? 'Late Fee Added'
            : 'Past Due Invoice'

  let sentCount = 0
  let failedCount = 0
  let skippedCount = 0
  const providerMessageIds: string[] = []
  const errors: string[] = []

  for (const recipient of uniqueRecipients) {
    const reservationRow = {
      camper_id: recipient.camperId,
      invoice_id: invoice.id,
      reminder_type: reminderType,
      message,
      sent_at: new Date().toISOString(),
      status: 'sending',
      recipient_phone: recipient.phone,
      provider: 'twilio',
      provider_message_id: null,
      error_message: null,
      sent_by: sentBy,
      reminder_date: reminderDate,
      automation_key: recipient.automationKey,
    }

    // Reserve the unique automation key before contacting Twilio so concurrent
    // requests cannot both send the same message.
    const { data: reservation, error: logError } = await client
      .from('text_reminders')
      .insert(reservationRow)
      .select('id')
      .single()

    if (logError?.code === '23505') {
      skippedCount += 1
      continue
    }

    if (logError) {
      failedCount += 1
      errors.push(logError.message)
      continue
    }

    const result = await sendTwilioSms({ to: recipient.phone, body: message })
    const { error: updateError } = await client
      .from('text_reminders')
      .update({
        status: result.sent ? 'sent' : 'failed',
        provider_message_id: result.sent ? result.providerMessageId : null,
        error_message: result.sent ? null : result.error,
        sent_at: new Date().toISOString(),
      })
      .eq('id', reservation.id)

    if (updateError) {
      console.error('Unable to finalize invoice text reminder log:', updateError.code)
    }

    if (!result.sent) {
      failedCount += 1
      errors.push(result.error || 'Text message failed.')
      continue
    }

    sentCount += 1
    if (result.providerMessageId) providerMessageIds.push(result.providerMessageId)
  }

  if (sentCount) {
    return { status: 'sent', sentCount, failedCount, providerMessageIds }
  }

  if (failedCount) {
    return { status: 'failed', error: errors.join(' ') }
  }

  return {
    status: 'skipped',
    reason: skippedCount
      ? 'This invoice text was already handled today.'
      : 'No invoice texts were sent.',
  }
}
