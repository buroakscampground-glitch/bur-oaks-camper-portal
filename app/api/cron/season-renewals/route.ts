import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { todayInCentral } from '../../../../lib/invoice-texting'
import { formatSmsPhone, sendTwilioSms } from '../../../../lib/twilio-sms'
import { isSystemPortalAccount } from '../../../../lib/camper-records'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return key ? createClient(supabaseUrl, key) : null
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

function shiftMonths(value: string, amount: number) {
  const [year, month, day] = value.split('-').map(Number)
  const target = new Date(year, month - 1 + amount, 1, 12)
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0, 12).getDate()
  target.setDate(Math.min(day, last))
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
}

function addYear(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const last = new Date(year + 1, month, 0, 12).getDate()
  return `${year + 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
}

function shiftDays(value: string, amount: number) {
  const [year, month, day] = value.split('-').map(Number)
  const target = new Date(year, month - 1, day + amount, 12)
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })

  const today = todayInCentral()

  // After a camper renews and the anniversary passes, prepare their next yearly cycle.
  const { data: completedCycles } = await admin
    .from('season_renewals')
    .select('id,lot_number,contract_end_date,status')
    .eq('status', 'Renewing')
    .lt('contract_end_date', today)

  for (const cycle of completedCycles || []) {
    if (isSystemPortalAccount(cycle)) continue
    if (!cycle.contract_end_date) continue
    await admin.from('season_renewals').update({
      contract_start_date: cycle.contract_end_date,
      contract_end_date: addYear(cycle.contract_end_date),
      renewal_sent_at: null,
      status: 'Not Started',
      decision_recorded_at: null,
      renewal_document_id: null,
      auto_send_approved: false,
      auto_send_approved_at: null,
      review_notified_at: null,
      last_automation_at: null,
      automation_error: null,
    }).eq('id', cycle.id)
  }

  const [{ data: records, error: recordError }, { data: templates, error: templateError }] = await Promise.all([
    admin.from('season_renewals').select('id,camper_id,lot_number,contract_end_date,renewal_sent_at,status,auto_send_approved,review_notified_at').is('renewal_sent_at', null).eq('status', 'Not Started'),
    admin.from('document_templates').select('*').order('created_at', { ascending: false }),
  ])

  if (recordError || templateError) return NextResponse.json({ error: recordError?.message || templateError?.message }, { status: 500 })

  // Give the office a two-week review window. A renewal can never auto-send
  // unless the office explicitly approves it on the Renewal Forecast page.
  const operationalRecords = (records || []).filter((record) => !isSystemPortalAccount(record))
  const reviewQueue = operationalRecords.filter((record) => {
    if (!record.contract_end_date || record.review_notified_at || record.auto_send_approved) return false
    return shiftDays(shiftMonths(record.contract_end_date, -4), -14) <= today
  })

  if (reviewQueue.length) {
    const lots = reviewQueue.map((record) => record.lot_number || 'unknown').join(', ')
    const now = new Date().toISOString()
    await admin.from('admin_notifications').insert(reviewQueue.map((record) => ({
      type: 'renewal_review',
      title: `Review Lot ${record.lot_number || '—'} before renewal`,
      message: `Choose Yes, send automatically or No, do not renew before ${shiftMonths(record.contract_end_date, -4)}. The renewal is held until you approve it.`,
      lot_number: record.lot_number || null,
      camper_id: record.camper_id,
      source_table: 'season_renewals',
      source_id: record.id,
    })))

    const alertPhone = formatSmsPhone(
      process.env.RENEWAL_REVIEW_ALERT_PHONE ||
      process.env.OWNER_ALERT_PHONE ||
      process.env.ADMIN_ALERT_PHONE ||
      '618-882-8063'
    )
    if (alertPhone) {
      await sendTwilioSms({
        to: alertPhone,
        body: `Bur Oaks: Renewal review needed for Lot${reviewQueue.length === 1 ? '' : 's'} ${lots}. Please choose Yes or No in Admin > Renewals before the scheduled send date. https://www.buroakscampground.com/admin/renewals`,
      })
    }
    await admin.from('season_renewals').update({ review_notified_at: now }).in('id', reviewQueue.map((record) => record.id))
  }

  const due = operationalRecords.filter((record) => record.auto_send_approved && record.contract_end_date && shiftMonths(record.contract_end_date, -4) <= today)
  const renewalTemplate = (templates || []).find((template) => /renewal/i.test(`${template.document_name || ''} ${template.document_type || ''}`))
  const results: any[] = []

  for (const record of due) {
    if (!renewalTemplate) {
      const message = 'No renewal form was found in the admin document library.'
      await admin.from('season_renewals').update({ automation_error: message, last_automation_at: new Date().toISOString() }).eq('id', record.id)
      results.push({ renewalId: record.id, status: 'failed', error: message })
      continue
    }

    const { data: camper, error: camperError } = await admin
      .from('campers')
      .select('id,first_name,last_name,lot_number,phone,sms_opt_in,active')
      .eq('id', record.camper_id)
      .eq('active', true)
      .maybeSingle()

    if (camperError || !camper) {
      const message = 'The active camper record could not be found.'
      await admin.from('season_renewals').update({ automation_error: message, last_automation_at: new Date().toISOString() }).eq('id', record.id)
      results.push({ renewalId: record.id, status: 'failed', error: message })
      continue
    }

    const originalName = String(renewalTemplate.storage_path).split('/').pop() || 'seasonal-renewal.pdf'
    const cleanName = originalName.replace(/^[0-9a-f-]{36}-/i, '')
    const destinationPath = `${camper.id}/${crypto.randomUUID()}-${cleanName}`
    const { error: copyError } = await admin.storage.from('camper-documents').copy(renewalTemplate.storage_path, destinationPath)

    if (copyError) {
      await admin.from('season_renewals').update({ automation_error: copyError.message, last_automation_at: new Date().toISOString() }).eq('id', record.id)
      results.push({ renewalId: record.id, status: 'failed', error: copyError.message })
      continue
    }

    const cycleYear = String(record.contract_end_date).slice(0, 4)
    const { data: document, error: documentError } = await admin.from('documents').insert({
      camper_id: camper.id,
      document_name: `${cycleYear} ${renewalTemplate.document_name}`,
      document_type: renewalTemplate.document_type || 'Seasonal Renewal',
      file_url: destinationPath,
      signature_status: 'pending',
    }).select('id').single()

    if (documentError || !document) {
      await admin.storage.from('camper-documents').remove([destinationPath])
      const message = documentError?.message || 'Unable to assign renewal document.'
      await admin.from('season_renewals').update({ automation_error: message, last_automation_at: new Date().toISOString() }).eq('id', record.id)
      results.push({ renewalId: record.id, status: 'failed', error: message })
      continue
    }

    let smsStatus = 'skipped'
    const phone = camper.sms_opt_in ? formatSmsPhone(camper.phone) : ''
    if (phone) {
      const text = `Bur Oaks Campground: Your seasonal renewal form is ready. Please review it and let the office know your decision by ${shiftMonths(record.contract_end_date, -3)}.\nClick here to review and sign: https://www.buroakscampground.com/documents\nReply STOP to opt out.`
      const sms = await sendTwilioSms({ to: phone, body: text })
      smsStatus = sms.sent ? 'sent' : 'failed'
      await admin.from('text_reminders').insert({
        camper_id: camper.id,
        invoice_id: null,
        reminder_type: 'Season Renewal',
        message: text,
        sent_at: new Date().toISOString(),
        status: smsStatus,
        recipient_phone: phone,
        provider: 'twilio',
        provider_message_id: sms.sent ? sms.providerMessageId : null,
        error_message: sms.sent ? null : sms.error,
        sent_by: 'season-renewal-cron',
      })
    }

    await admin.from('season_renewals').update({
      renewal_sent_at: today,
      status: 'Awaiting Response',
      renewal_document_id: document.id,
      last_automation_at: new Date().toISOString(),
      automation_error: null,
    }).eq('id', record.id)

    results.push({ renewalId: record.id, lot: camper.lot_number, status: 'sent', smsStatus })
  }

  return NextResponse.json({ success: true, today, checked: records?.length || 0, reviewNotifications: reviewQueue.length, due: due.length, results })
}
