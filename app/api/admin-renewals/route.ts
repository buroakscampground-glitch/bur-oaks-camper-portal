import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { todayInCentral } from '../../../lib/invoice-texting'
import { sendNonRenewalLetter } from '../../../lib/nonrenewal-letter'
import { reconcileRenewalsWithDocuments } from '../../../lib/renewal-document-reconciliation'
import { hasSecureRenewalSignature } from '../../../lib/renewal-signature'
import { continueSignedRenewalRentSchedule } from '../../../lib/renewal-rent-schedule-service'
import { isDocumentDeliveryExcluded } from '../../../lib/document-delivery-exemptions'

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
    .select('id,lot_number,first_name,last_name,second_profile_first_name,second_profile_last_name,email,secondary_email,active,rent_payment_plan')
    .eq('id', camperId)
    .eq('active', true)
    .maybeSingle()

  if (!camper) return NextResponse.json({ error: 'The active camper record could not be found.' }, { status: 404 })

  const rentPaymentPlan = body.rentPaymentPlan === 'quarterly' || body.rentPaymentPlan === 'semiannual'
    ? body.rentPaymentPlan
    : camper.rent_payment_plan === 'quarterly' ? 'quarterly' : 'semiannual'
  if (camper.rent_payment_plan !== rentPaymentPlan) {
    const { error: planError } = await context.admin
      .from('campers')
      .update({ rent_payment_plan: rentPaymentPlan })
      .eq('id', camper.id)
    if (planError) {
      return NextResponse.json({ error: planError.message || 'The rent payment plan could not be saved.' }, { status: 500 })
    }
    camper.rent_payment_plan = rentPaymentPlan
  }

  const { data: existing } = await context.admin
    .from('season_renewals')
    .select('*')
    .eq('camper_id', camperId)
    .maybeSingle()

  if (action === 'confirm-signature-exempt') {
    if (!isDocumentDeliveryExcluded(camper)) {
      return NextResponse.json({ error: 'This camper is not configured as signature-exempt.' }, { status: 409 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'There is no renewal record for this camper.' }, { status: 409 })
    }

    const today = todayInCentral()
    const auditNote = `Signature-exempt renewal recorded by ${cleanText(context.camper.first_name, 80) || 'admin'} on ${today}; no document or rent invoices were created.`
    const existingNotes = cleanText(existing.notes, 2600)
    const notes = existingNotes.includes('Signature-exempt renewal recorded')
      ? existingNotes
      : [existingNotes, auditNote].filter(Boolean).join('\n')
    const { data: renewal, error: renewalError } = await context.admin
      .from('season_renewals')
      .update({
        status: 'Renewing',
        renewal_document_id: null,
        decision_recorded_at: today,
        auto_send_approved: false,
        auto_send_approved_at: null,
        automation_error: null,
        last_automation_at: new Date().toISOString(),
        notes,
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (renewalError || !renewal) {
      return NextResponse.json({ error: renewalError?.message || 'The signature-exempt renewal could not be saved.' }, { status: 500 })
    }
    return NextResponse.json({
      success: true,
      renewal,
      renewalRentSchedule: { status: 'no-billing-site', created: 0, skipped: 0 },
    })
  }

  if (action === 'repair-rent-schedule') {
    const annualRent = Number(body.annualRent)
    if (!Number.isFinite(annualRent) || annualRent <= 0) {
      return NextResponse.json({ error: 'Enter a valid annual lot-rent amount.' }, { status: 400 })
    }
    if (!existing?.renewal_document_id || existing.status !== 'Renewing') {
      return NextResponse.json({ error: 'A signed renewing record is required before repairing the rent schedule.' }, { status: 409 })
    }
    if (!existing.contract_end_date) {
      return NextResponse.json({ error: 'The annual renewal date must be saved before repairing the rent schedule.' }, { status: 409 })
    }

    const { data: signedDocument, error: signedDocumentError } = await context.admin
      .from('documents')
      .select('signature_status,signed_at,signed_name,second_signed_name,requires_two_signatures,signature_record_hash,second_signature_record_hash')
      .eq('id', existing.renewal_document_id)
      .eq('camper_id', camper.id)
      .maybeSingle()
    if (signedDocumentError || !signedDocument || !hasSecureRenewalSignature(signedDocument)) {
      return NextResponse.json({ error: signedDocumentError?.message || 'The signed renewal could not be verified.' }, { status: 409 })
    }

    const { data: lot, error: lotLookupError } = await context.admin
      .from('lots')
      .select('id')
      .eq('lot_number', camper.lot_number)
      .limit(1)
      .maybeSingle()
    if (lotLookupError) {
      return NextResponse.json({ error: lotLookupError.message || 'The lot record could not be loaded.' }, { status: 500 })
    }

    const lotWrite = lot?.id
      ? await context.admin.from('lots').update({ lot_rent_amount: annualRent }).eq('id', lot.id)
      : await context.admin.from('lots').insert({ lot_number: camper.lot_number, camper_id: camper.id, lot_rent_amount: annualRent })
    if (lotWrite.error) {
      return NextResponse.json({ error: lotWrite.error.message || 'The annual lot rent could not be saved.' }, { status: 500 })
    }

    try {
      const renewalRentSchedule = await continueSignedRenewalRentSchedule({
        client: context.admin,
        camperId: String(camper.id),
        documentId: String(existing.renewal_document_id),
        signedAt: signedDocument.signed_at || new Date().toISOString(),
      })
      if (renewalRentSchedule.status !== 'continued') {
        return NextResponse.json({ error: 'The rent schedule still needs review. No duplicate invoices were created.', renewalRentSchedule }, { status: 409 })
      }

      await context.admin
        .from('admin_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('type', 'renewal_rent_schedule')
        .eq('camper_id', camper.id)
        .ilike('title', '%needs a rent schedule%')
        .is('read_at', null)

      const { data: refreshedRenewal } = await context.admin
        .from('season_renewals')
        .select('*')
        .eq('id', existing.id)
        .single()

      return NextResponse.json({ success: true, renewal: refreshedRenewal || existing, renewalRentSchedule, annualRent })
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || 'The rent schedule could not be repaired.' }, { status: 500 })
    }
  }

  if (action === 'signed-previous-system') {
    if (body.confirmed !== true) {
      return NextResponse.json({ error: 'Confirm that the camper signed this renewal in the previous system.' }, { status: 400 })
    }
    if (!existing) {
      return NextResponse.json({ error: 'There is no renewal record for this camper.' }, { status: 409 })
    }
    if (existing.status === 'Campground Not Renewing' || existing.status === 'Camper Leaving') {
      return NextResponse.json({ error: 'This renewal has a conflicting non-renewal decision. Clear that decision before recording an older signature.' }, { status: 409 })
    }

    const requestedDocumentId = cleanText(body.documentId, 80)
    const documentId = requestedDocumentId || existing.renewal_document_id
    if (!documentId) {
      return NextResponse.json({ error: 'Choose the signed renewal already saved on this camper account.' }, { status: 409 })
    }

    const { data: linkedDocument, error: documentLoadError } = await context.admin
      .from('documents')
      .select('id,document_name,document_type,signature_status,signed_at,signed_name,second_signed_name,requires_two_signatures,signature_record_hash,second_signature_record_hash')
      .eq('id', documentId)
      .eq('camper_id', camper.id)
      .maybeSingle()

    if (documentLoadError || !linkedDocument) {
      return NextResponse.json({ error: documentLoadError?.message || 'The linked portal renewal could not be found.' }, { status: 404 })
    }
    const now = new Date().toISOString()
    const today = todayInCentral()
    if (hasSecureRenewalSignature(linkedDocument)) {
      const cycleYear = String(existing.contract_end_date || '').slice(0, 4)
      const documentLabel = `${linkedDocument.document_name || ''} ${linkedDocument.document_type || ''}`
      if (!/renewal/i.test(documentLabel) || (cycleYear && !documentLabel.includes(cycleYear))) {
        return NextResponse.json({ error: 'The saved signature does not match this renewal cycle.' }, { status: 409 })
      }

      const auditNote = `Existing signed renewal linked by ${cleanText(context.camper.first_name, 80) || 'admin'} on ${today}; no new renewal or rent invoices were created.`
      const existingNotes = cleanText(existing.notes, 2600)
      const notes = existingNotes.includes('Existing signed renewal linked')
        ? existingNotes
        : [existingNotes, auditNote].filter(Boolean).join('\n')
      const { data: renewal, error: renewalUpdateError } = await context.admin
        .from('season_renewals')
        .update({
          status: 'Renewing',
          renewal_document_id: linkedDocument.id,
          decision_recorded_at: String(linkedDocument.signed_at || '').slice(0, 10) || today,
          auto_send_approved: false,
          auto_send_approved_at: null,
          automation_error: null,
          last_automation_at: now,
          notes,
        })
        .eq('id', existing.id)
        .select('*')
        .single()

      if (renewalUpdateError || !renewal) {
        return NextResponse.json({ error: renewalUpdateError?.message || 'The signed renewal could not be linked.' }, { status: 500 })
      }
      return NextResponse.json({
        success: true,
        renewal,
        documentStatus: 'signed',
        renewalRentSchedule: { status: 'preserved-existing', created: 0, skipped: 0 },
      })
    }

    const auditNote = `Signed in previous system; duplicate unsigned portal renewal closed by ${cleanText(context.camper.first_name, 80) || 'admin'} on ${today}.`
    const existingNotes = cleanText(existing.notes, 2600)
    const notes = existingNotes.includes('Signed in previous system')
      ? existingNotes
      : [existingNotes, auditNote].filter(Boolean).join('\n')

    // "not_required" is the established closed/reference state for documents.
    // It removes the duplicate from signing prompts and reminder jobs without
    // deleting the file or pretending that it received a portal signature.
    const { error: documentCloseError } = await context.admin
      .from('documents')
      .update({ signature_status: 'not_required' })
      .eq('id', linkedDocument.id)
      .eq('camper_id', camper.id)

    if (documentCloseError) {
      return NextResponse.json({ error: documentCloseError.message || 'The duplicate portal renewal could not be closed.' }, { status: 500 })
    }

    const { data: renewal, error: renewalUpdateError } = await context.admin
      .from('season_renewals')
      .update({
        status: 'Renewing',
        decision_recorded_at: today,
        auto_send_approved: false,
        auto_send_approved_at: null,
        automation_error: null,
        last_automation_at: now,
        notes,
      })
      .eq('id', existing.id)
      .select('*')
      .single()

    if (renewalUpdateError || !renewal) {
      await context.admin
        .from('documents')
        .update({ signature_status: linkedDocument.signature_status })
        .eq('id', linkedDocument.id)
        .eq('camper_id', camper.id)
      return NextResponse.json({ error: renewalUpdateError?.message || 'The previous-system signature could not be recorded.' }, { status: 500 })
    }

    let renewalRentSchedule: Awaited<ReturnType<typeof continueSignedRenewalRentSchedule>>
    try {
      renewalRentSchedule = await continueSignedRenewalRentSchedule({
        client: context.admin,
        camperId: String(camper.id),
        documentId: String(linkedDocument.id),
        signedAt: now,
      })
    } catch (scheduleError: any) {
      const scheduleMessage = `Previous-system renewal recorded, but the lot-rent schedule could not be continued automatically: ${String(scheduleError?.message || scheduleError).slice(0, 1600)}`
      await context.admin.from('season_renewals').update({
        automation_error: scheduleMessage,
        last_automation_at: new Date().toISOString(),
      }).eq('id', existing.id)
      await context.admin.from('admin_notifications').insert({
        type: 'renewal_rent_schedule_error',
        title: 'Renewal rent schedule needs office review',
        message: scheduleMessage,
        lot_number: camper.lot_number || null,
        camper_id: camper.id,
        source_table: 'season_renewals',
        source_id: existing.id,
      })
      renewalRentSchedule = { status: 'failed', created: 0, skipped: 0 }
    }

    const { data: refreshedRenewal } = await context.admin
      .from('season_renewals')
      .select('*')
      .eq('id', existing.id)
      .single()

    return NextResponse.json({
      success: true,
      renewal: refreshedRenewal || renewal,
      documentStatus: 'not_required',
      renewalRentSchedule,
    })
  }

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

  // Historical records that were already marked Renewing stay untouched, but
  // no new record can enter that status without a secure camper signature.
  if (decisionStatus === 'Renewing' && existing?.status !== 'Renewing') {
    if (!existing?.renewal_document_id) {
      return NextResponse.json({ error: 'Camper Renewing is automatic only after the assigned renewal is signed. This record has no linked renewal document.' }, { status: 409 })
    }
    const { data: signedDocument, error: signedDocumentError } = await context.admin
      .from('documents')
      .select('signature_status,signed_at,signed_name,second_signed_name,requires_two_signatures,signature_record_hash,second_signature_record_hash')
      .eq('id', existing.renewal_document_id)
      .eq('camper_id', camper.id)
      .maybeSingle()
    if (signedDocumentError || !hasSecureRenewalSignature(signedDocument)) {
      return NextResponse.json({ error: 'This camper cannot be marked renewing until they type their legal name, accept electronic-signature consent, and complete every required signature.' }, { status: 409 })
    }
  }

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
