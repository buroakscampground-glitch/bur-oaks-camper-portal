import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { todayInCentral } from '../../../lib/invoice-texting'
import { formatSmsPhone, sendTwilioSms } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'

function cleanId(value: unknown) {
  return String(value || '').trim().slice(0, 80)
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Your camper session could not be verified.' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const documentId = cleanId(body.documentId)
  if (!documentId || body.decision !== 'not-renew') {
    return NextResponse.json({ error: 'A valid renewal decision is required.' }, { status: 400 })
  }

  const { data: renewal, error: renewalError } = await context.admin
    .from('season_renewals')
    .select('*')
    .eq('camper_id', context.camper.id)
    .eq('renewal_document_id', documentId)
    .maybeSingle()

  if (renewalError || !renewal) {
    return NextResponse.json({ error: renewalError?.message || 'This document is not the active renewal for your site.' }, { status: 404 })
  }
  if (renewal.status === 'Campground Not Renewing') {
    return NextResponse.json({ error: 'The campground has already recorded a separate decision for this site. Please contact the office.' }, { status: 409 })
  }

  const { data: document } = await context.admin
    .from('documents')
    .select('id,signature_status')
    .eq('id', documentId)
    .eq('camper_id', context.camper.id)
    .maybeSingle()

  if (!document) return NextResponse.json({ error: 'The renewal document could not be found.' }, { status: 404 })
  if (document.signature_status === 'signed') {
    return NextResponse.json({ error: 'This renewal has already been signed. Please contact the office to change your decision.' }, { status: 409 })
  }

  const today = todayInCentral()
  const now = new Date().toISOString()
  const { data: updated, error: updateError } = await context.admin
    .from('season_renewals')
    .update({
      status: 'Camper Leaving',
      decision_recorded_at: today,
      auto_send_approved: false,
      auto_send_approved_at: null,
      automation_error: null,
      last_automation_at: now,
    })
    .eq('id', renewal.id)
    .neq('status', 'Campground Not Renewing')
    .select('*')
    .maybeSingle()

  if (updateError || !updated) {
    return NextResponse.json({ error: updateError?.message || 'Your non-renewal decision could not be recorded.' }, { status: 500 })
  }

  const { error: documentError } = await context.admin
    .from('documents')
    .update({ signature_status: 'declined' })
    .eq('id', documentId)
    .eq('camper_id', context.camper.id)

  if (documentError) {
    await context.admin.from('season_renewals').update({ automation_error: documentError.message }).eq('id', renewal.id)
    return NextResponse.json({ error: 'Your decision was recorded, but the document screen could not be updated. Refresh or contact the office.' }, { status: 500 })
  }

  const lot = context.camper.lot_number || renewal.lot_number || '—'
  const name = `${context.camper.first_name || ''} ${context.camper.last_name || ''}`.trim() || 'Camper'
  await context.admin.from('admin_notifications').insert({
    type: 'renewal_declined',
    title: `Lot ${lot} chose not to renew`,
    message: `${name} selected “I am not renewing” in the camper portal. This is a camper decision, not a campground non-renewal.`,
    lot_number: lot,
    camper_id: context.camper.id,
    source_table: 'season_renewals',
    source_id: renewal.id,
  })

  const alertPhone = formatSmsPhone(
    process.env.RENEWAL_REVIEW_ALERT_PHONE ||
    process.env.OWNER_ALERT_PHONE ||
    process.env.ADMIN_ALERT_PHONE ||
    '618-882-8063'
  )
  if (alertPhone) {
    await sendTwilioSms({
      to: alertPhone,
      body: `Bur Oaks: Lot ${lot} (${name}) chose not to renew through the camper portal. This was the camper's decision. https://www.buroakscampground.com/admin/renewals`,
    })
  }

  return NextResponse.json({ success: true, status: updated.status, decisionRecordedAt: today })
}
