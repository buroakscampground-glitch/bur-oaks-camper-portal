import { escapeHtml } from './portal-invite-email'

type InvoiceEmailKind = 'new' | 'due_3_days' | 'due_1_day' | 'due_today' | 'past_due'

type SendInvoiceEmailOptions = {
  client: any
  invoiceId: string
  kind: InvoiceEmailKind
  automationKey: string
  reminderDate: string
  sentBy?: string | null
}

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
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function invoiceCamper(invoice: any) {
  if (Array.isArray(invoice?.campers)) return invoice.campers[0] || null
  return invoice?.campers || null
}

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function isRealEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email) && !email.endsWith('@no-email.buroaks.local')
}

function camperRecipients(camper: any) {
  const seen = new Set<string>()
  const emails = [cleanEmail(camper?.email), cleanEmail(camper?.secondary_email)]
    .filter(isRealEmail)
    .filter((email) => {
      if (seen.has(email)) return false
      seen.add(email)
      return true
    })

  return emails
}

function isResendTestSender(from: string) {
  return /<\s*onboarding@resend\.dev\s*>/i.test(from) || /(^|\s)onboarding@resend\.dev(\s|$)/i.test(from)
}

function emailCopy(invoice: any, kind: InvoiceEmailKind) {
  const invoiceNumber = invoice.invoice_number || 'new invoice'
  const total = money(invoice.total_due)
  const due = prettyDate(invoice.due_date)

  if (kind === 'new') {
    return {
      subject: `New Bur Oaks invoice ${invoiceNumber}`,
      heading: 'You have a new invoice.',
      intro: `A new invoice is ready in your Bur Oaks Camper Portal. It is due ${due}.`,
      statusLine: `Amount due: ${total}`,
      reminderType: 'New Invoice',
    }
  }

  if (kind === 'due_3_days') {
    return {
      subject: `Bur Oaks invoice due in 3 days`,
      heading: 'Your invoice is due in 3 days.',
      intro: `Just a friendly reminder that invoice ${invoiceNumber} is due ${due}.`,
      statusLine: `Amount due: ${total}`,
      reminderType: 'Invoice Due in 3 Days',
    }
  }

  if (kind === 'due_1_day') {
    return {
      subject: `Bur Oaks invoice due tomorrow`,
      heading: 'Your invoice is due tomorrow.',
      intro: `Invoice ${invoiceNumber} is due tomorrow, ${due}.`,
      statusLine: `Amount due: ${total}`,
      reminderType: 'Invoice Due Tomorrow',
    }
  }

  if (kind === 'due_today') {
    return {
      subject: `Bur Oaks invoice due today`,
      heading: 'Your invoice is due today.',
      intro: `Invoice ${invoiceNumber} is due today, ${due}.`,
      statusLine: `Amount due: ${total}`,
      reminderType: 'Invoice Due Today',
    }
  }

  return {
    subject: `Past due Bur Oaks invoice`,
    heading: 'This invoice is past due.',
    intro: `Invoice ${invoiceNumber} was due ${due}. Please review it in your camper portal or contact the office with questions.`,
    statusLine: `Past due amount: ${total}`,
    reminderType: 'Past Due Invoice',
  }
}

function itemRows(items: any[]) {
  if (!items.length) return ''

  return items
    .map((item) => {
      const description = item.description || 'Invoice charge'
      const details = [
        Number(item.quantity || 0) > 1 ? `Qty ${item.quantity}` : '',
        Number(item.unit_price || 0) > 0 ? `${money(item.unit_price)} each` : '',
      ]
        .filter(Boolean)
        .join(' · ')

      return `
        <tr>
          <td style="padding:11px 0;border-bottom:1px solid #ede7dc">
            <div style="color:#26382d;font-weight:700;font-size:14px">${escapeHtml(description)}</div>
            ${details ? `<div style="margin-top:3px;color:#728077;font-size:12px">${escapeHtml(details)}</div>` : ''}
          </td>
          <td style="padding:11px 0;border-bottom:1px solid #ede7dc;text-align:right;color:#26382d;font-weight:700">${escapeHtml(money(item.total))}</td>
        </tr>
      `
    })
    .join('')
}

export async function sendInvoiceEmail({
  client,
  invoiceId,
  kind,
  automationKey,
  reminderDate,
  sentBy = 'automation',
}: SendInvoiceEmailOptions) {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey) {
    return { status: 'skipped', reason: 'RESEND_API_KEY is not configured.' }
  }

  const { data: invoice, error: invoiceError } = await client
    .from('invoices')
    .select(`
      id,
      camper_id,
      invoice_number,
      invoice_type,
      total_due,
      due_date,
      status,
      campers (id, lot_number, first_name, last_name, email, secondary_email, active),
      invoice_items (description, quantity, unit_price, total)
    `)
    .eq('id', invoiceId)
    .single()

  if (invoiceError || !invoice) {
    return { status: 'failed', error: invoiceError?.message || 'Invoice was not found.' }
  }

  if (String(invoice.status || '').toLowerCase() === 'paid') {
    return { status: 'skipped', reason: 'Invoice is already paid.' }
  }

  const camper = invoiceCamper(invoice)
  if (!camper?.active) {
    return { status: 'skipped', reason: 'Camper is not active.' }
  }

  const recipients = camperRecipients(camper)
  if (recipients.length === 0) {
    return { status: 'skipped', reason: 'No camper email address is on file.' }
  }

  const { data: existing } = await client
    .from('text_reminders')
    .select('id,status')
    .eq('invoice_id', invoice.id)
    .eq('automation_key', automationKey)
    .eq('reminder_date', reminderDate)
    .maybeSingle()

  if (existing) {
    return { status: 'skipped', reason: 'This invoice email was already handled today.' }
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.buroakscampground.com'
  const actionUrl = `${siteUrl}/invoices/${invoice.id}`
  const camperName = `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'there'
  const copy = emailCopy(invoice, kind)
  const items = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : []
  const rows = itemRows(items)
  const from =
    process.env.INVOICE_EMAIL_FROM ||
    process.env.CAMPER_MESSAGE_FROM ||
    process.env.PORTAL_INVITE_FROM ||
    process.env.ADMIN_ALERT_FROM ||
    'Bur Oaks Campground <onboarding@resend.dev>'
  const replyTo =
    process.env.INVOICE_EMAIL_REPLY_TO ||
    process.env.CAMPER_MESSAGE_REPLY_TO ||
    process.env.ADMIN_ALERT_REPLY_TO ||
    process.env.PORTAL_INVITE_REPLY_TO ||
    'buroakscampground@gmail.com'

  if (isResendTestSender(from)) {
    return {
      status: 'skipped',
      reason: 'Invoice emails need a verified Resend sending domain. The current sender is the Resend test sender.',
    }
  }

  const text = [
    `Hi ${camperName},`,
    '',
    copy.heading,
    copy.intro,
    copy.statusLine,
    `Due date: ${prettyDate(invoice.due_date)}`,
    invoice.invoice_number ? `Invoice: ${invoice.invoice_number}` : '',
    camper.lot_number ? `Lot: ${camper.lot_number}` : '',
    '',
    items.length
      ? [
          'Invoice details:',
          ...items.map((item: any) => `- ${item.description || 'Charge'}: ${money(item.total)}`),
          '',
        ].join('\n')
      : '',
    `View and pay: ${actionUrl}`,
    '',
    'If you already paid or have questions, please contact the campground office.',
    'Bur Oaks Campground',
  ]
    .filter(Boolean)
    .join('\n')

  const html = `
    <div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:28px;color:#26382d">
      <div style="max-width:640px;margin:0 auto;background:#fff;border-radius:18px;overflow:hidden;border:1px solid #e2dccf">
        <div style="background:#214b31;color:#fff;padding:24px 28px">
          <div style="font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:#d8c18b;font-weight:700">Bur Oaks Campground</div>
          <h1 style="margin:8px 0 0;font-family:Georgia,serif;font-weight:500">${escapeHtml(copy.heading)}</h1>
        </div>
        <div style="padding:28px">
          <p style="font-size:16px;line-height:1.55;margin-top:0">Hi ${escapeHtml(camperName)},</p>
          <p style="font-size:16px;line-height:1.55">${escapeHtml(copy.intro)}</p>
          <div style="display:grid;gap:8px;margin:18px 0;padding:18px;border-radius:16px;background:#f4f7f1;border:1px solid #e3eadf">
            <div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#718078">Lot</span><strong>${escapeHtml(String(camper.lot_number || '—'))}</strong></div>
            <div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#718078">Invoice</span><strong>${escapeHtml(String(invoice.invoice_number || '—'))}</strong></div>
            <div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#718078">Due date</span><strong>${escapeHtml(prettyDate(invoice.due_date))}</strong></div>
            <div style="display:flex;justify-content:space-between;gap:12px"><span style="color:#718078">${escapeHtml(copy.statusLine.split(':')[0])}</span><strong>${escapeHtml(money(invoice.total_due))}</strong></div>
          </div>
          ${
            rows
              ? `<h2 style="margin:20px 0 6px;font-family:Georgia,serif;font-weight:500;color:#26382d">Invoice breakdown</h2><table style="width:100%;border-collapse:collapse;margin-bottom:18px">${rows}</table>`
              : ''
          }
          <a href="${actionUrl}" style="display:inline-block;margin-top:6px;background:#2f5b3b;color:#fff;text-decoration:none;padding:13px 17px;border-radius:12px;font-weight:700">View invoice</a>
          <p style="margin-top:18px;color:#69766d;font-size:13px;line-height:1.5">If the button does not work, copy and paste this link into your browser:<br><span style="word-break:break-all">${escapeHtml(actionUrl)}</span></p>
        </div>
      </div>
    </div>
  `

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: recipients,
      reply_to: replyTo,
      subject: copy.subject,
      html,
      text,
    }),
  })

  const result = await response.json().catch(() => ({}))
  const sent = response.ok

  const message = `${copy.heading} ${copy.intro} ${copy.statusLine} View and pay: ${actionUrl}`
  const logRow = {
    camper_id: camper.id,
    invoice_id: invoice.id,
    reminder_type: `${copy.reminderType} Email`,
    message,
    sent_at: new Date().toISOString(),
    status: sent ? 'sent' : 'failed',
    recipient_phone: null,
    recipient_email: recipients.join(', '),
    provider: 'resend',
    provider_message_id: sent ? result?.id || null : null,
    error_message: sent ? null : result?.message || result?.name || 'Invoice email could not be sent.',
    sent_by: sentBy,
    reminder_date: reminderDate,
    automation_key: automationKey,
  }

  const { error: logError } = await client.from('text_reminders').insert(logRow)

  if (logError?.code === '23505') {
    return { status: 'skipped', reason: 'This invoice email was already handled today.' }
  }

  if (logError) {
    return { status: 'failed', error: logError.message }
  }

  if (!sent) {
    console.error('Invoice email rejected by Resend:', {
      invoiceId,
      status: response.status,
      message: result?.message,
      name: result?.name,
    })
    return { status: 'failed', error: result?.message || 'Invoice email could not be sent.' }
  }

  return { status: 'sent', providerMessageId: result?.id, recipients: recipients.length }
}
