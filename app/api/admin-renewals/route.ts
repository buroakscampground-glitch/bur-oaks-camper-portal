import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { todayInCentral } from '../../../lib/invoice-texting'
import { sendNonRenewalLetter } from '../../../lib/nonrenewal-letter'
import { reconcileRenewalsWithDocuments } from '../../../lib/renewal-document-reconciliation'

export const runtime = 'nodejs'

const validStatuses = new Set([
  'Not Started',
  'Awaiting Response',
  'Renewing',
  'Camper Leaving',
  'Campground Not Renewing',
])

function cleanText(value: unknown, maxLength: number) {
  return String(value || '').trim().slice(0, maxLength)
}

function nextAnnualDate(monthValue: unknown, dayValue: unknown) {
  const month = Number(monthValue)
  const day = Number(dayValue)
  if (!Number.isInteger(month) || month < 1 || month > 12) return null
  if (!Number.isInteger(day) || day < 1 || day > 31) return null

  const today = todayInCentral()
  const year = Number(today.slice(0, 4))
  const thisYear = new Date(year, month - 1, day, 12)
  if (thisYear.getMonth() !== month - 1 || thisYear.getDate() !== day) return null

  const candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  return candidate >= today
    ? candidate
    : `${year + 1}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Your admin session could not be verified. Please refresh and try again.' }, { status: 401 })
  if (String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Only an administrator can update renewal decisions.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const action = cleanText(body.action, 40) || 'save'
  if (action === 'reconcile') {
    try {
      const reconciliation = await reconcileRenewalsWithDocuments(context.admin)
      return NextResponse.json({ success: true, reconciliation })
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || 'Renewal signatures could not be reconciled.' }, { status: 500 })
    }
  }

  const camperId = cleanText(body.camperId, 80)
  if (!camperId) return NextResponse.json({ error: 'A camper is required.' }, { status: 400 })

  const { data: camper } = await context.admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,second_profile_first_name,second_profile_last_name,email,secondary_email,active')
    .eq('id', camperId)
    .eq('active', true)
    .maybeSingle()

  if (!camper) return NextResponse.json({ error: 'The active camper record could not be found.' }, { status: 404 })

  const { data: existing } = await context.admin
    .from('season_renewals')
    .select('*')
    .eq('camper_id', camperId)
    .maybeSingle()

  const status = validStatuses.has(body.status) ? body.status : existing?.status || 'Not Started'
  const annualDate = body.annualMonth && body.annualDay
    ? nextAnnualDate(body.annualMonth, body.annualDay)
    : existing?.contract_end_date || null

  if (action === 'save' && !annualDate) {
    return NextResponse.json({ error: 'Choose the annual contract month and day.' }, { status: 400 })
  }

  if (action === 'send-nonrenewal') {
    if (!existing || existing.status !== 'Campground Not Renewing') {
      return NextResponse.json({ error: 'This site is not marked as a campground non-renewal.' }, { status: 400 })
    }
    if (!existing.contract_end_date) {
      return NextResponse.json({ error: 'Add the annual contract end date before sending this letter.' }, { status: 400 })
    }
    if (!existing.review_notified_at) {
      return NextResponse.json({ error: 'The letter is still held. It can be approved after the scheduled phone alert.' }, { status: 400 })
    }
    if (existing.renewal_sent_at) {
      return NextResponse.json({ success: true, renewal: existing, alreadySent: true })
    }

    const now = new Date().toISOString()
    const { data: reserved, error: reserveError } = await context.admin
      .from('season_renewals')
      .update({
        auto_send_approved: true,
        auto_send_approved_at: now,
        last_automation_at: now,
        automation_error: null,
      })
      .eq('id', existing.id)
      .eq('status', 'Campground Not Renewing')
      .eq('auto_send_approved', false)
      .is('renewal_sent_at', null)
      .select('*')
      .maybeSingle()

    if (reserveError || !reserved) {
      return NextResponse.json({ error: reserveError?.message || 'This letter is already being sent. Refresh before trying again.' }, { status: 409 })
    }

    let delivery
    try {
      delivery = await sendNonRenewalLetter(camper, existing.contract_end_date)
    } catch (error: any) {
      await context.admin.from('season_renewals').update({
        auto_send_approved: false,
        auto_send_approved_at: null,
        automation_error: String(error?.message || error).slice(0, 2000),
        last_automation_at: new Date().toISOString(),
      }).eq('id', existing.id)
      return NextResponse.json({ error: error?.message || 'The non-renewal letter could not be sent.' }, { status: 502 })
    }

    const { data: renewal, error: updateError } = await context.admin
      .from('season_renewals')
      .update({
        renewal_sent_at: todayInCentral(),
        last_automation_at: new Date().toISOString(),
        automation_error: null,
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (updateError || !renewal) {
      const message = `The letter was accepted by the email provider, but the renewal record could not be updated: ${updateError?.message || 'unknown database error'}`
      await context.admin.from('season_renewals').update({ automation_error: message }).eq('id', existing.id)
      return NextResponse.json({ error: message }, { status: 500 })
    }

    await context.admin
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('type', 'nonrenewal_letter_review')
      .eq('source_id', existing.id)
      .is('read_at', null)
    return NextResponse.json({ success: true, renewal, delivery })
  }

  const now = new Date().toISOString()
  const today = todayInCentral()
  const decisionStatus = action === 'approve'
    ? 'Not Started'
    : action === 'decline'
      ? 'Campground Not Renewing'
      : action === 'clear'
        ? 'Not Started'
      : action === 'mark-sent' && status === 'Not Started'
        ? 'Awaiting Response'
        : status
  const finalDate = annualDate || existing?.contract_end_date || null
  const changedToCampgroundDecision = decisionStatus === 'Campground Not Renewing' && existing?.status !== 'Campground Not Renewing'

  const payload: Record<string, unknown> = {
    camper_id: camper.id,
    lot_number: camper.lot_number || null,
    contract_start_date: finalDate ? `2000-${finalDate.slice(5)}` : existing?.contract_start_date || null,
    contract_end_date: finalDate,
    renewal_sent_at: action === 'mark-sent'
      ? today
      : action === 'decline' || changedToCampgroundDecision
        ? null
        : cleanText(body.renewalSentAt, 10) || existing?.renewal_sent_at || null,
    status: decisionStatus,
    notes: cleanText(body.notes, 3000) || null,
    auto_send_approved: action === 'approve'
      ? true
      : ['decline', 'clear'].includes(action) || changedToCampgroundDecision || decisionStatus === 'Camper Leaving'
        ? false
        : Boolean(existing?.auto_send_approved),
    auto_send_approved_at: action === 'approve'
      ? now
      : ['decline', 'clear'].includes(action) || changedToCampgroundDecision || decisionStatus === 'Camper Leaving'
        ? null
        : existing?.auto_send_approved_at || null,
    review_notified_at: ['approve', 'decline', 'clear'].includes(action) || changedToCampgroundDecision
      ? null
      : existing?.review_notified_at || null,
    decision_recorded_at: ['Renewing', 'Camper Leaving', 'Campground Not Renewing'].includes(decisionStatus)
      ? today
      : null,
    automation_error: action === 'approve' ? null : existing?.automation_error || null,
  }

  const { data: renewal, error } = await context.admin
    .from('season_renewals')
    .upsert(payload, { onConflict: 'camper_id' })
    .select('*')
    .single()

  if (error || !renewal) {
    return NextResponse.json({ error: error?.message || 'The renewal could not be saved.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, renewal })
}
