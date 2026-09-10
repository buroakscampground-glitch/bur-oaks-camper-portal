import { NextResponse } from 'next/server'
import { authorizedDelegateProfilesForLot } from '../../../lib/authorized-billing'
import { camperSmsPhones } from '../../../lib/camper-sms'
import { isInvoiceOutstanding } from '../../../lib/invoice-balance'
import { daysUntilDate, todayInCentral } from '../../../lib/invoice-reminder-schedule'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { filterOptedInPhones } from '../../../lib/sms-recipient-filter'

export const runtime = 'nodejs'
export const maxDuration = 60

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function camperForInvoice(invoice: any) {
  return Array.isArray(invoice?.campers) ? invoice.campers[0] : invoice?.campers
}

function expectedReminder(invoice: any, today: string) {
  const daysUntil = daysUntilDate(String(invoice.due_date), today)
  if (daysUntil > 30) return null
  if (daysUntil > 3) return 'Invoice Coming Due'
  if (daysUntil > 1) return 'Invoice Due in 3 Days'
  if (daysUntil === 1) return 'Invoice Due Tomorrow'
  if (daysUntil === 0) return 'Invoice Due Today'
  if (Number(invoice.late_fee || 0) > 0) return 'Late Fee Added'
  if (Math.abs(daysUntil) >= 5) return 'Final Late Fee Warning'
  return 'Past Due Invoice'
}

function maskPhone(value: unknown) {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : 'Saved phone'
}

function classifyProviderStatus(databaseStatus: unknown, providerStatus: unknown, hasProviderId: boolean) {
  const saved = String(databaseStatus || '').toLowerCase()
  const provider = String(providerStatus || '').toLowerCase()
  if (saved === 'failed' || ['failed', 'undelivered', 'canceled'].includes(provider)) return 'failed'
  if (provider === 'delivered') return 'delivered'
  if (['accepted', 'queued', 'sending', 'scheduled'].includes(provider)) return 'pending'
  if (provider === 'sent') return 'carrier_sent'
  if (saved === 'sent' && !hasProviderId) return 'unverified'
  if (saved === 'sent') return 'unverified'
  return 'missing'
}

async function loadTwilioStatuses(messageIds: string[]) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  const statuses = new Map<string, { status: string; error: string }>()
  if (!accountSid || !authToken) return statuses

  const authorization = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`
  const uniqueIds = Array.from(new Set(messageIds.filter(Boolean)))
  for (let index = 0; index < uniqueIds.length; index += 15) {
    const batch = uniqueIds.slice(index, index + 15)
    const results = await Promise.all(batch.map(async (messageId) => {
      try {
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages/${encodeURIComponent(messageId)}.json`, {
          headers: { Authorization: authorization },
          cache: 'no-store',
        })
        const result = await response.json().catch(() => ({}))
        return [messageId, {
          status: response.ok ? String(result.status || '') : '',
          error: response.ok ? String(result.error_message || '') : String(result.message || `Twilio status check failed (${response.status}).`),
        }] as const
      } catch (error: any) {
        return [messageId, { status: '', error: error?.message || 'Twilio status check failed.' }] as const
      }
    }))
    results.forEach(([messageId, result]) => statuses.set(messageId, result))
  }
  return statuses
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  }

  const today = todayInCentral()
  const thirtyDaysAhead = shiftDate(today, 30)
  const [invoiceResult, camperResult, consentResult] = await Promise.all([
    context.admin
      .from('invoices')
      .select('id,invoice_number,invoice_type,total_due,due_date,status,late_fee,campers(id,lot_number,first_name,last_name,email,secondary_email,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role)')
      .not('due_date', 'is', null)
      .lte('due_date', thirtyDaysAhead)
      .gt('total_due', 0),
    context.admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,email,secondary_email,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
      .eq('active', true),
    context.admin.from('sms_phone_consents').select('camper_id,phone_number,opted_in'),
  ])

  const firstError = invoiceResult.error || camperResult.error
  if (firstError) return NextResponse.json({ error: firstError.message }, { status: 500 })
  const consentTableUnavailable = ['42P01', 'PGRST205'].includes(String(consentResult.error?.code || ''))
  if (consentResult.error && !consentTableUnavailable) {
    return NextResponse.json({ error: consentResult.error.message }, { status: 500 })
  }

  const invoices = (invoiceResult.data || []).filter((invoice: any) =>
    String(invoice.invoice_type || '').toLowerCase().includes('electric')
    && String(invoice.status || '').toLowerCase() !== 'processing'
    && isInvoiceOutstanding(invoice)
    && camperForInvoice(invoice)?.active !== false
  )
  const invoiceIds = invoices.map((invoice: any) => invoice.id)
  const reminderResult = invoiceIds.length
    ? await context.admin
      .from('text_reminders')
      .select('id,invoice_id,reminder_type,status,recipient_phone,provider_message_id,error_message,sent_at')
      .in('invoice_id', invoiceIds)
      .not('recipient_phone', 'is', null)
      .order('sent_at', { ascending: false })
    : { data: [], error: null }

  if (reminderResult.error) return NextResponse.json({ error: reminderResult.error.message }, { status: 500 })

  const campers = camperResult.data || []
  const consentsByCamper = new Map<string, any[]>()
  for (const consent of consentResult.data || []) {
    const key = String(consent.camper_id)
    consentsByCamper.set(key, [...(consentsByCamper.get(key) || []), consent])
  }

  const draftRecords: any[] = []
  for (const invoice of invoices) {
    const owner = camperForInvoice(invoice)
    if (!owner?.active) continue
    const reminderType = expectedReminder(invoice, today)
    if (!reminderType) continue
    const profiles = [owner, ...authorizedDelegateProfilesForLot(owner.lot_number, campers)]
      .filter((profile, index, all) => profile && all.findIndex((candidate) => String(candidate.id) === String(profile.id)) === index)
    const recipients = Array.from(new Set(profiles.flatMap((profile: any) => {
      if (!profile.sms_opt_in) return []
      const phones = camperSmsPhones(profile)
      return consentTableUnavailable ? phones : filterOptedInPhones(phones, consentsByCamper.get(String(profile.id)) || [])
    })))

    if (!recipients.length) {
      draftRecords.push({
        invoiceId: invoice.id,
        lot: owner.lot_number || '',
        camper: `${owner.first_name || ''} ${owner.last_name || ''}`.trim(),
        invoiceNumber: invoice.invoice_number || '',
        amount: Number(invoice.total_due || 0),
        dueDate: invoice.due_date,
        reminderType,
        phone: 'No opted-in phone',
        status: 'no_recipient',
        providerStatus: '',
        sentAt: null,
        error: 'No opted-in phone is available for this invoice.',
      })
      continue
    }

    for (const phone of recipients) {
      const log = (reminderResult.data || []).find((item: any) =>
        String(item.invoice_id) === String(invoice.id)
        && String(item.reminder_type) === reminderType
        && String(item.recipient_phone) === String(phone)
      )
      draftRecords.push({
        invoiceId: invoice.id,
        lot: owner.lot_number || '',
        camper: `${owner.first_name || ''} ${owner.last_name || ''}`.trim(),
        invoiceNumber: invoice.invoice_number || '',
        amount: Number(invoice.total_due || 0),
        dueDate: invoice.due_date,
        reminderType,
        phone: maskPhone(phone),
        databaseStatus: log?.status || '',
        providerMessageId: log?.provider_message_id || '',
        sentAt: log?.sent_at || null,
        error: log?.error_message || '',
      })
    }
  }

  const providerStatuses = await loadTwilioStatuses(draftRecords.map((record) => record.providerMessageId))
  const records = draftRecords.map((record) => {
    if (record.status === 'no_recipient') return record
    const provider = providerStatuses.get(record.providerMessageId)
    const status = classifyProviderStatus(record.databaseStatus, provider?.status, Boolean(record.providerMessageId))
    return {
      invoiceId: record.invoiceId,
      lot: record.lot,
      camper: record.camper,
      invoiceNumber: record.invoiceNumber,
      amount: record.amount,
      dueDate: record.dueDate,
      reminderType: record.reminderType,
      phone: record.phone,
      status,
      providerStatus: provider?.status || '',
      sentAt: record.sentAt,
      error: record.error || provider?.error || (status === 'missing' ? 'This reminder stage has no text record.' : ''),
    }
  })

  const count = (status: string) => records.filter((record) => record.status === status).length
  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    today,
    invoices: invoices.length,
    amountDue: Number(invoices.reduce((sum: number, invoice: any) => sum + Number(invoice.total_due || 0), 0).toFixed(2)),
    recipients: records.length,
    delivered: count('delivered'),
    carrierSent: count('carrier_sent'),
    pending: count('pending'),
    failed: count('failed'),
    missing: count('missing'),
    unverified: count('unverified'),
    noRecipient: count('no_recipient'),
    records,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
