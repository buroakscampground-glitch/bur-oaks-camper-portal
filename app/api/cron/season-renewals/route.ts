import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { withCronFailureAlert } from '../../../../lib/cron-failure-alert'
import { todayInCentral } from '../../../../lib/invoice-texting'
import { formatSmsPhone, sendTwilioSms } from '../../../../lib/twilio-sms'
import { consentedCamperSmsPhones } from '../../../../lib/camper-sms'
import { isOperationalCamper, isSystemPortalAccount } from '../../../../lib/camper-records'
import { runPendingDocumentSignatureReminders } from '../../../../lib/document-reminders'
import { singleSegmentSms } from '../../../../lib/sms-segments'
import { reconcileRenewalsWithDocuments } from '../../../../lib/renewal-document-reconciliation'
import { isDocumentDeliveryExcluded } from '../../../../lib/document-delivery-exemptions'
import { renewalOfficeReviewDate, renewalResponseDueDate, renewalSendDate } from '../../../../lib/renewal-timeline'
import { createPersonalizedRenewalPdf, renewalTermDates } from '../../../../lib/personalized-renewal-pdf'

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

function addYear(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const last = new Date(year + 1, month, 0, 12).getDate()
  return `${year + 1}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
}

async function runCron(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })

  const today = todayInCentral()

  // Keep the forecast aligned with the signed-document tracker, including
  // renewals completed before the instant signing automation was introduced.
  const reconciliation = await reconcileRenewalsWithDocuments(admin)

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

  const [
    { data: records, error: recordError },
    { data: nonRenewals, error: nonRenewalError },
  ] = await Promise.all([
    admin.from('season_renewals').select('id,camper_id,lot_number,contract_end_date,renewal_sent_at,status,auto_send_approved,review_notified_at,annual_rent,rent_payment_plan').is('renewal_sent_at', null).eq('status', 'Not Started'),
    admin.from('season_renewals').select('id,camper_id,lot_number,contract_end_date,renewal_sent_at,status,auto_send_approved,review_notified_at').is('renewal_sent_at', null).eq('status', 'Campground Not Renewing'),
  ])

  if (recordError || nonRenewalError) {
    return NextResponse.json({ error: recordError?.message || nonRenewalError?.message }, { status: 500 })
  }

  const renewalCamperIds = Array.from(new Set(
    [...(records || []), ...(nonRenewals || [])]
      .map((record) => String(record.camper_id || ''))
      .filter(Boolean),
  ))
  const { data: renewalCampers, error: renewalCamperError } = renewalCamperIds.length
    ? await admin.from('campers').select('id,lot_number,role,active').in('id', renewalCamperIds)
    : { data: [], error: null }

  if (renewalCamperError) {
    return NextResponse.json({ error: renewalCamperError.message }, { status: 500 })
  }

  const operationalCamperIds = new Set(
    (renewalCampers || [])
      .filter((camper) => camper.active !== false && isOperationalCamper(camper))
      .map((camper) => String(camper.id)),
  )

  // Give the office a two-week review window. A renewal can never auto-send
  // unless the office explicitly approves it on the Renewal Forecast page.
  const operationalRecords = (records || []).filter((record) =>
    !isSystemPortalAccount(record) && operationalCamperIds.has(String(record.camper_id || ''))
  )
  const reviewQueue = operationalRecords.filter((record) => {
    if (!record.contract_end_date || record.review_notified_at || record.auto_send_approved) return false
    return renewalOfficeReviewDate(record.contract_end_date) <= today
  })

  if (reviewQueue.length) {
    const lots = reviewQueue.map((record) => record.lot_number || 'unknown').join(', ')
    const now = new Date().toISOString()
    await admin.from('admin_notifications').insert(reviewQueue.map((record) => ({
      type: 'renewal_review',
      title: `Review Lot ${record.lot_number || '—'} before renewal`,
      message: `Choose Yes, send automatically or No, do not renew before ${renewalSendDate(record.contract_end_date)}. The renewal is held until you approve it.`,
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

  // A campground non-renewal is never sent automatically. On the same date
  // the normal renewal would have gone out, alert the owner and hold the
  // professional letter until an administrator reviews and sends it.
  const nonRenewalReviewQueue = (nonRenewals || [])
    .filter((record) => !isSystemPortalAccount(record) && operationalCamperIds.has(String(record.camper_id || '')))
    .filter((record) => record.contract_end_date && !record.review_notified_at && renewalSendDate(record.contract_end_date) <= today)

  if (nonRenewalReviewQueue.length) {
    const lots = nonRenewalReviewQueue.map((record) => record.lot_number || 'unknown').join(', ')
    const now = new Date().toISOString()
    await admin.from('admin_notifications').insert(nonRenewalReviewQueue.map((record) => ({
      type: 'nonrenewal_letter_review',
      title: `Non-renewal letter ready for Lot ${record.lot_number || '—'}`,
      message: `The campground non-renewal letter is ready for review. It is held and has not been sent to the camper. Review and approve it in Admin > Renewals.`,
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
        body: `Bur Oaks: Non-renewal letter${nonRenewalReviewQueue.length === 1 ? '' : 's'} ready for Lot${nonRenewalReviewQueue.length === 1 ? '' : 's'} ${lots}. Nothing has been sent to the camper. Review and approve before sending: https://www.buroakscampground.com/admin/renewals`,
      })
    }
    await admin.from('season_renewals').update({ review_notified_at: now }).in('id', nonRenewalReviewQueue.map((record) => record.id))
  }

  const due = operationalRecords.filter((record) => record.auto_send_approved && record.contract_end_date && renewalSendDate(record.contract_end_date) <= today)
  const results: any[] = []

  for (const record of due) {
    const annualRent = Number(record.annual_rent || 0)
    const paymentPlan = record.rent_payment_plan === 'quarterly' ? 'quarterly' : record.rent_payment_plan === 'semiannual' ? 'semiannual' : null
    if (annualRent <= 0 || !paymentPlan) {
      const message = 'The renewal is held because its site-specific annual rent or payment plan has not been verified.'
      await admin.from('season_renewals').update({ automation_error: message, last_automation_at: new Date().toISOString() }).eq('id', record.id)
      results.push({ renewalId: record.id, status: 'failed', error: message })
      continue
    }

    const { data: camper, error: camperError } = await admin
      .from('campers')
      .select('id,first_name,last_name,lot_number,phone,alternate_phone,second_profile_phone,sms_opt_in,active')
      .eq('id', record.camper_id)
      .eq('active', true)
      .maybeSingle()

    if (camperError || !camper) {
      const message = 'The active camper record could not be found.'
      await admin.from('season_renewals').update({ automation_error: message, last_automation_at: new Date().toISOString() }).eq('id', record.id)
      results.push({ renewalId: record.id, status: 'failed', error: message })
      continue
    }

    if (isDocumentDeliveryExcluded(camper)) {
      await admin.from('season_renewals').update({
        auto_send_approved: false,
        last_automation_at: new Date().toISOString(),
        automation_error: null,
      }).eq('id', record.id)
      results.push({ renewalId: record.id, lot: camper.lot_number, status: 'document-delivery-excluded' })
      continue
    }

    const camperName = `${camper.first_name || ''} ${camper.last_name || ''}`.trim()
    const termDates = renewalTermDates(record.contract_end_date)
    const pdfBytes = await createPersonalizedRenewalPdf({
      camperName,
      lotNumber: String(record.lot_number || camper.lot_number || ''),
      currentAgreementEnd: record.contract_end_date,
      renewalStart: termDates.renewalStart,
      renewalEnd: termDates.renewalEnd,
      annualRent,
      paymentPlan,
    })
    const cycleYear = String(termDates.renewalStart).slice(0, 4)
    const destinationPath = `${camper.id}/${crypto.randomUUID()}-${cycleYear}-Lot-${record.lot_number}-Personalized-Renewal.pdf`
    const { error: copyError } = await admin.storage.from('camper-documents').upload(destinationPath, pdfBytes, { contentType: 'application/pdf', upsert: false })

    if (copyError) {
      await admin.from('season_renewals').update({ automation_error: copyError.message, last_automation_at: new Date().toISOString() }).eq('id', record.id)
      results.push({ renewalId: record.id, status: 'failed', error: copyError.message })
      continue
    }

    const { data: document, error: documentError } = await admin.from('documents').insert({
      camper_id: camper.id,
      document_name: `${cycleYear} Lot ${record.lot_number} Personalized Renewal - ${annualRent.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}`,
      document_type: 'Seasonal Renewal',
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
    const phones = await consentedCamperSmsPhones(admin, camper)
    if (phones.length) {
      const text = singleSegmentSms({
        message: `RENEWAL READY - Lot ${camper.lot_number}. Please sign by ${renewalResponseDueDate(record.contract_end_date)}.`,
        url: 'https://www.buroakscampground.com/documents',
        action: 'Sign',
      })
      const smsResults = []
      for (const phone of phones) {
        const sms = await sendTwilioSms({ to: phone, body: text, client: admin, camperId: camper.id })
        smsResults.push(sms)
        await admin.from('text_reminders').insert({
          camper_id: camper.id,
          invoice_id: null,
          reminder_type: 'Season Renewal',
          message: text,
          sent_at: new Date().toISOString(),
          status: sms.sent ? 'sent' : 'failed',
          recipient_phone: phone,
          provider: 'twilio',
          provider_message_id: sms.sent ? sms.providerMessageId : null,
          error_message: sms.sent ? null : sms.error,
          sent_by: 'season-renewal-cron',
        })
      }
      smsStatus = smsResults.every((result) => result.sent)
        ? 'sent'
        : smsResults.some((result) => result.sent)
          ? 'partial'
          : 'failed'
    }

    const documentNotices = await runPendingDocumentSignatureReminders(admin, [String(document.id)])

    await admin.from('season_renewals').update({
      renewal_sent_at: today,
      status: 'Awaiting Response',
      renewal_document_id: document.id,
      last_automation_at: new Date().toISOString(),
      automation_error: null,
    }).eq('id', record.id)

    results.push({ renewalId: record.id, lot: camper.lot_number, status: 'sent', smsStatus, documentNotices })
  }

  return NextResponse.json({
    reconciliation,
    success: true,
    today,
    checked: (records?.length || 0) + (nonRenewals?.length || 0),
    reviewNotifications: reviewQueue.length,
    nonRenewalReviewNotifications: nonRenewalReviewQueue.length,
    due: due.length,
    results,
  })
}

export const GET = withCronFailureAlert('season-renewals', runCron)
