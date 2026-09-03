import { camperSmsPhones, consentedCamperSmsPhones } from './camper-sms'
import { escapeHtml } from './portal-invite-email'
import { getSiteUrl } from './site-url'
import { isTwilioConfigured, sendTwilioSms } from './twilio-sms'
import { todayInCentral } from './invoice-reminder-schedule'
import { DOCUMENT_SIGNATURE_SMS_ALERT, documentReminderCentralDay, documentReminderIsDue } from './document-reminder-schedule'
import { authorizedContactEmails, loadAuthorizedContactProfiles } from './authorized-billing'
import { singleSegmentSms } from './sms-segments'

const REMINDER_TYPE = 'Document Signature Reminder'

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function uniqueEmails(values: unknown[]) {
  return Array.from(new Set(
    values
      .map(cleanEmail)
      .filter((email) => /^\S+@\S+\.\S+$/.test(email) && !email.endsWith('@no-email.buroaks.local'))
  ))
}

function parseSender(value: string) {
  const match = value.trim().match(/^(.*?)<([^>]+)>$/)
  return match
    ? { name: match[1].trim().replace(/^"|"$/g, '') || undefined, email: match[2].trim() }
    : { email: value.trim() }
}

function emailProvider() {
  const from = String(
    process.env.DOCUMENT_REMINDER_EMAIL_FROM ||
    process.env.SENDGRID_FROM ||
    process.env.PORTAL_INVITE_FROM ||
    process.env.CAMPER_MESSAGE_FROM ||
    ''
  ).trim()
  const replyTo = String(
    process.env.DOCUMENT_REMINDER_EMAIL_REPLY_TO ||
    process.env.SENDGRID_REPLY_TO ||
    process.env.PORTAL_INVITE_REPLY_TO ||
    'buroakscampground@gmail.com'
  ).trim()

  if (process.env.SENDGRID_API_KEY) return { provider: 'sendgrid' as const, configured: Boolean(from), from, replyTo }
  if (process.env.RESEND_API_KEY) {
    return { provider: 'resend' as const, configured: Boolean(from) && !/onboarding@resend\.dev/i.test(from), from, replyTo }
  }
  return { provider: null, configured: false, from, replyTo }
}

function documentCopy(document: any, camper: any, isFollowUp: boolean) {
  const name = String(document.document_name || 'campground document').trim()
  const firstName = String(camper.first_name || '').trim() || 'there'
  const site = camper.lot_number ? ` for Lot ${camper.lot_number}` : ''
  const url = `${getSiteUrl()}/documents`
  const subject = isFollowUp
    ? `Reminder: Please sign ${name}`
    : `Signature required: ${name}`
  const heading = isFollowUp ? 'Your signature is still needed.' : 'A new document is ready to sign.'
  const text = [
    `Hi ${firstName},`,
    '',
    `${heading} ${name}${site} is in your Bur Oaks Camper Portal.`,
    'Please log in, review it, and sign it as soon as possible.',
    '',
    `Review and sign: ${url}`,
    '',
    'If you have questions, contact the campground office.',
    'Bur Oaks Campground',
  ].join('\n')
  const sms = singleSegmentSms({
    message: `${DOCUMENT_SIGNATURE_SMS_ALERT} - ${name}${site}.`,
    url,
    action: 'Sign',
  })
  const html = `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:30px;color:#26382d">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:20px;overflow:hidden;border:1px solid #e2dccf">
        <div style="background:#214b31;color:#fff;padding:26px 30px">
          <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#ead7a6;font-weight:800">Bur Oaks Campground</div>
          <h1 style="margin:9px 0 0;font-family:Georgia,serif;font-weight:500">${escapeHtml(heading)}</h1>
        </div>
        <div style="padding:30px">
          <p>Hi ${escapeHtml(firstName)},</p>
          <p style="font-size:16px;line-height:1.6"><strong>${escapeHtml(name)}</strong>${escapeHtml(site)} is in your camper portal and needs your signature.</p>
          <p style="font-size:16px;line-height:1.6">Please log in, review it, and sign it as soon as possible.</p>
          <a href="${escapeHtml(url)}" style="display:inline-block;margin:10px 0;padding:14px 19px;border-radius:12px;background:#315f3d;color:#fff;text-decoration:none;font-weight:800">Review and Sign Now</a>
          <p style="margin-top:20px;color:#69766d;font-size:13px;line-height:1.5">If the button does not work, copy and paste this link:<br>${escapeHtml(url)}</p>
        </div>
      </div>
    </div>
  `
  return { subject, text, sms, html }
}

async function documentSmsPhones(client: any, profiles: any[]) {
  const recipients: string[] = []
  for (const profile of profiles) {
    recipients.push(...await consentedCamperSmsPhones(client, profile))
  }

  return Array.from(new Set(recipients))
}

async function sendEmail(to: string[], copy: ReturnType<typeof documentCopy>) {
  const status = emailProvider()
  if (!status.configured || !status.provider) return { sent: false, provider: status.provider, error: 'Email is not configured.' }

  if (status.provider === 'sendgrid') {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: to.map((email) => ({ email })), subject: copy.subject }],
        from: parseSender(status.from),
        reply_to: { email: parseSender(status.replyTo).email },
        content: [{ type: 'text/plain', value: copy.text }, { type: 'text/html', value: copy.html }],
      }),
    })
    if (!response.ok) return { sent: false, provider: status.provider, error: await response.text().catch(() => `SendGrid error ${response.status}`) }
    return { sent: true, provider: status.provider, providerMessageId: response.headers.get('x-message-id') || null }
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: status.from, to, reply_to: status.replyTo, subject: copy.subject, text: copy.text, html: copy.html }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) return { sent: false, provider: status.provider, error: result?.message || 'Resend rejected the email.' }
  return { sent: true, provider: status.provider, providerMessageId: result?.id || null }
}

async function logDelivery(client: any, values: Record<string, unknown>) {
  const { error } = await client.from('text_reminders').insert({
    invoice_id: null,
    reminder_type: REMINDER_TYPE,
    sent_at: new Date().toISOString(),
    sent_by: 'document-signature-reminder',
    ...values,
  })
  return error?.message || ''
}

export async function sendDocumentSignatureReminder({ client, document, camper, today = todayInCentral() }: {
  client: any
  document: any
  camper: any
  today?: string
}) {
  const { data: prior, error: priorError } = await client
    .from('text_reminders')
    .select('reminder_type,status,sent_at,recipient_phone,recipient_email,provider,automation_key')
    .eq('camper_id', camper.id)
    .eq('status', 'sent')
    .order('sent_at', { ascending: false })
    .limit(300)
  if (priorError) return { email: 'failed', sms: 'failed', emailSent: 0, smsSent: 0, errors: [priorError.message] }

  let contactProfiles: any[]
  try {
    contactProfiles = await loadAuthorizedContactProfiles(client, camper)
  } catch (error: any) {
    return { email: 'failed', sms: 'failed', emailSent: 0, smsSent: 0, errors: [error?.message || 'Authorized document contacts could not be loaded.'] }
  }

  const emails = uniqueEmails(authorizedContactEmails(contactProfiles))
  const emailKey = `document-reminder-${document.id}-email`
  const lastEmail = (prior || []).find((row: any) => row.automation_key === emailKey)
  const copy = documentCopy(document, camper, Boolean(lastEmail))
  const summary = { email: 'skipped', sms: 'skipped', emailSent: 0, smsSent: 0, errors: [] as string[] }

  if (emails.length && documentReminderIsDue(lastEmail?.sent_at, today)) {
    const existingToday = (prior || []).some((row: any) => row.automation_key === emailKey && documentReminderCentralDay(row.sent_at) === today)
    if (!existingToday) {
      const result = await sendEmail(emails, copy)
      const logError = await logDelivery(client, {
        camper_id: camper.id,
        message: copy.text,
        status: result.sent ? 'sent' : 'failed',
        recipient_phone: null,
        recipient_email: emails.join(', '),
        provider: result.provider,
        provider_message_id: result.sent ? result.providerMessageId || null : null,
        error_message: result.sent ? null : result.error,
        reminder_date: today,
        automation_key: emailKey,
      })
      summary.email = result.sent && !logError ? 'sent' : 'failed'
      summary.emailSent = summary.email === 'sent' ? 1 : 0
      if (!result.sent || logError) summary.errors.push(result.error || logError || 'Document email failed.')
    }
  }

  const phones = isTwilioConfigured()
    ? await documentSmsPhones(client, contactProfiles)
    : []
  if (phones.length) {
    let sent = 0
    let failed = 0
    for (const phone of phones) {
      const phoneDigits = phone.replace(/\D/g, '')
      const smsKey = `document-reminder-${document.id}-sms-${phoneDigits}`
      const lastSms = (prior || []).find((row: any) => (
        row.recipient_phone === phone &&
        (row.automation_key === smsKey || String(row.reminder_type || '').toLowerCase() === 'season renewal')
      ))
      if (!documentReminderIsDue(lastSms?.sent_at, today)) continue
      const existingToday = (prior || []).some((row: any) => row.automation_key === smsKey && documentReminderCentralDay(row.sent_at) === today)
      if (existingToday) continue

      const smsCopy = documentCopy(document, camper, Boolean(lastSms))
      const phoneProfile = contactProfiles.find((profile) => camperSmsPhones(profile).includes(phone))
      const result = await sendTwilioSms({
        to: phone,
        body: smsCopy.sms,
        client,
        camperId: phoneProfile?.id,
      })
      const logError = await logDelivery(client, {
        camper_id: camper.id,
        message: smsCopy.sms,
        status: result.sent ? 'sent' : 'failed',
        recipient_phone: phone,
        recipient_email: null,
        provider: 'twilio',
        provider_message_id: result.sent ? result.providerMessageId : null,
        error_message: result.sent ? null : result.error,
        reminder_date: today,
        automation_key: smsKey,
      })
      if (result.sent && !logError) sent += 1
      else {
        failed += 1
        summary.errors.push(result.sent ? logError : result.error)
      }
    }
    summary.smsSent = sent
    summary.sms = failed ? 'failed' : sent ? 'sent' : 'skipped'
  }

  return summary
}

export async function runPendingDocumentSignatureReminders(client: any, documentIds?: string[]) {
  let documentQuery = client
    .from('documents')
    .select('id,camper_id,document_name,document_type,signature_status')
    .in('signature_status', ['pending', 'pending_second_signature'])
  if (documentIds?.length) documentQuery = documentQuery.in('id', documentIds)

  const { data: documents, error: documentError } = await documentQuery
  if (documentError) throw new Error(documentError.message)

  const camperIds = Array.from(new Set((documents || []).map((document: any) => document.camper_id).filter(Boolean)))
  const { data: campers, error: camperError } = camperIds.length
    ? await client
        .from('campers')
        .select('id,first_name,last_name,lot_number,email,secondary_email,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
        .in('id', camperIds)
        .eq('active', true)
    : { data: [], error: null }
  if (camperError) throw new Error(camperError.message)

  const camperById = new Map<string, any>((campers || []).map((camper: any) => [String(camper.id), camper]))
  const results = []
  for (const document of documents || []) {
    const camper = camperById.get(String(document.camper_id))
    if (!camper || ['admin', 'maintenance'].includes(String(camper.role || '').toLowerCase())) continue
    const delivery = await sendDocumentSignatureReminder({ client, document, camper })
    results.push({ documentId: document.id, lotNumber: camper.lot_number, ...delivery })
  }

  return {
    checked: results.length,
    emailSent: results.reduce((sum, result) => sum + result.emailSent, 0),
    smsSent: results.reduce((sum, result) => sum + result.smsSent, 0),
    failed: results.filter((result) => result.email === 'failed' || result.sms === 'failed').length,
    results,
  }
}
