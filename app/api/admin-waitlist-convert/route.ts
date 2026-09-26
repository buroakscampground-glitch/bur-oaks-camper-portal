import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { getSiteUrl } from '../../../lib/site-url'
import { generatePortalSetupUrl } from '../../../lib/portal-setup-link'
import { portalInviteEmailConfigured, sendPortalInviteEmail } from '../../../lib/portal-invite-email'
import { isOperationalCamper } from '../../../lib/camper-records'
import {
  canConvertWaitlistStatus,
  cleanWaitlistConversionValue,
  newCamperContractEndDate,
  newCamperRentSchedule,
  nextTemporaryPortalSite,
  NEW_CAMPER_ANNUAL_RENT,
  NEW_CAMPER_ASSOCIATION_FEE,
  NEW_CAMPER_INSTALLMENT,
} from '../../../lib/waitlist-conversion'

export const runtime = 'nodejs'

function cleanEmail(value: unknown) {
  return cleanWaitlistConversionValue(value, 160).toLowerCase()
}

function siteKey(value: unknown) {
  return cleanWaitlistConversionValue(value, 40).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T12:00:00Z`))
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const waitlistId = cleanWaitlistConversionValue(body.waitlistId, 80)
  const requestedLotNumber = cleanWaitlistConversionValue(body.lotNumber, 40)
  const temporarySpot = body.temporarySpot === true
  const firstName = cleanWaitlistConversionValue(body.firstName, 80)
  const lastName = cleanWaitlistConversionValue(body.lastName, 80)
  const phone = cleanWaitlistConversionValue(body.phone, 40)
  const email = cleanEmail(body.email)
  const contractStartDate = cleanWaitlistConversionValue(body.contractStartDate, 10)
  const recordFirstPayment = body.recordFirstPayment === true
  const paymentMethod = cleanWaitlistConversionValue(body.paymentMethod, 100)
  const paymentReceivedOn = cleanWaitlistConversionValue(body.paymentReceivedOn, 10)
  const paymentReference = cleanWaitlistConversionValue(body.paymentReference, 300)
  const sendWelcome = body.sendWelcome === true
  const rentSchedule = newCamperRentSchedule(contractStartDate)
  const contractEndDate = newCamperContractEndDate(contractStartDate)

  if (!waitlistId || (!temporarySpot && !requestedLotNumber) || !firstName || !lastName) {
    return NextResponse.json({ error: 'Choose an open site or Temporary portal spot, then confirm the camper’s first and last name.' }, { status: 400 })
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'Add a valid email so the camper can receive portal access.' }, { status: 400 })
  }
  if (!validDate(contractStartDate) || rentSchedule.length !== 2 || !contractEndDate) {
    return NextResponse.json({ error: 'Choose the date the new 12-month contract starts.' }, { status: 400 })
  }
  if (recordFirstPayment && (!paymentMethod || !validDate(paymentReceivedOn))) {
    return NextResponse.json({ error: 'Choose how and when the first $875 payment was received.' }, { status: 400 })
  }

  const { data: waitlistEntry, error: waitlistError } = await context.admin.from('waitlist').select('*').eq('id', waitlistId).maybeSingle()
  if (waitlistError) return NextResponse.json({ error: waitlistError.message }, { status: 500 })
  if (!waitlistEntry) return NextResponse.json({ error: 'That waitlist entry no longer exists.' }, { status: 404 })
  if (!canConvertWaitlistStatus(waitlistEntry.status)) {
    return NextResponse.json({ error: `This entry is already marked ${waitlistEntry.status || 'unavailable'} and cannot be converted.` }, { status: 409 })
  }

  const { data: duplicateCamper, error: duplicateError } = await context.admin
    .from('campers').select('id,first_name,last_name,lot_number,active').eq('email', email).maybeSingle()
  if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 })
  if (duplicateCamper) {
    return NextResponse.json({
      error: `${duplicateCamper.first_name || firstName} ${duplicateCamper.last_name || lastName} already has a camper record${duplicateCamper.lot_number ? ` at Site ${duplicateCamper.lot_number}` : ''}.`,
      camperId: duplicateCamper.id,
    }, { status: 409 })
  }

  const [{ data: lotRows, error: lotError }, { data: activeCampers, error: camperError }] = await Promise.all([
    temporarySpot
      ? Promise.resolve({ data: [], error: null })
      : context.admin.from('lots').select('id,lot_number,camper_id,lot_rent_amount').eq('lot_number', requestedLotNumber).limit(2),
    context.admin.from('campers').select('id,lot_number,active,role').eq('active', true),
  ])
  if (lotError || camperError) return NextResponse.json({ error: lotError?.message || camperError?.message }, { status: 500 })

  const lotNumber = temporarySpot ? nextTemporaryPortalSite((activeCampers || []).map((camper: any) => camper.lot_number)) : requestedLotNumber
  const occupied = !temporarySpot && (activeCampers || []).some((camper: any) =>
    isOperationalCamper(camper) && siteKey(camper.lot_number) === siteKey(lotNumber)
  )
  if (occupied) {
    return NextResponse.json({ error: `Site ${lotNumber} is already assigned to an active camper. Refresh the waitlist and choose another site.` }, { status: 409 })
  }

  const lot = lotRows?.[0] || null
  const officeNotes = [
    `Converted from the waitlist on ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}.`,
    temporarySpot ? 'Temporary portal access only; permanent campsite is still pending and no physical site was claimed.' : '',
    waitlistEntry.desired_site ? `Original site preference: ${waitlistEntry.desired_site}` : '',
    waitlistEntry.notes ? `Waitlist notes:\n${waitlistEntry.notes}` : '',
    `New camper terms: $${NEW_CAMPER_ANNUAL_RENT.toLocaleString('en-US')} annual rent in 2 payments of $${NEW_CAMPER_INSTALLMENT.toLocaleString('en-US')}; $${NEW_CAMPER_ASSOCIATION_FEE} association fee due at signing. Contract ${contractStartDate} through ${contractEndDate}.`,
  ].filter(Boolean).join('\n\n')

  const { data: camper, error: insertError } = await context.admin.from('campers').insert({
    lot_number: lotNumber,
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phone || null,
    role: 'camper',
    active: true,
    sms_opt_in: false,
    event_reminders_opt_in: false,
    directory_opt_in: false,
    rent_payment_plan: 'semiannual',
    camper_since_date: contractStartDate,
    office_notes: officeNotes,
  }).select('id,first_name,last_name,email,lot_number').single()
  if (insertError || !camper) return NextResponse.json({ error: insertError?.message || 'The camper record could not be created.' }, { status: 500 })
  const admin = context.admin
  const createdCamper = camper

  let createdLotId = ''
  const priorLotCamperId = lot?.camper_id || null
  const priorLotRentAmount = lot?.lot_rent_amount ?? null
  let renewalId = ''
  let invoiceIds: string[] = []

  async function rollback() {
    if (invoiceIds.length) await admin.from('invoices').delete().in('id', invoiceIds)
    if (renewalId) await admin.from('season_renewals').delete().eq('id', renewalId)
    if (createdLotId) await admin.from('lots').delete().eq('id', createdLotId)
    else if (lot && !temporarySpot) await admin.from('lots').update({ camper_id: priorLotCamperId, lot_rent_amount: priorLotRentAmount }).eq('id', lot.id)
    await admin.from('campers').delete().eq('id', createdCamper.id)
    await admin.from('waitlist').update({ status: waitlistEntry.status, removed_at: waitlistEntry.removed_at || null }).eq('id', waitlistId)
  }

  if (!temporarySpot) {
    const lotAssignment = lot
      ? await context.admin.from('lots').update({ camper_id: camper.id, lot_rent_amount: NEW_CAMPER_ANNUAL_RENT }).eq('id', lot.id)
      : await context.admin.from('lots').insert({ lot_number: lotNumber, camper_id: camper.id, lot_rent_amount: NEW_CAMPER_ANNUAL_RENT }).select('id').single()
    if (!lot && lotAssignment.data?.id) createdLotId = String(lotAssignment.data.id)
    if (lotAssignment.error) {
      await rollback()
      return NextResponse.json({ error: `The camper was not created because Site ${lotNumber} could not be assigned.` }, { status: 500 })
    }
  }

  const { data: renewal, error: renewalError } = await context.admin.from('season_renewals').insert({
    camper_id: camper.id,
    lot_number: lotNumber,
    contract_start_date: contractStartDate,
    contract_end_date: contractEndDate,
    status: 'Not Started',
    notes: temporarySpot ? 'Temporary portal access; permanent campsite pending.' : null,
  }).select('id').single()
  if (renewalError || !renewal) {
    await rollback()
    return NextResponse.json({ error: 'Nothing was converted because the 12-month contract schedule could not be created.' }, { status: 500 })
  }
  renewalId = String(renewal.id)

  const invoiceStamp = `${camper.id.slice(0, 8)}-${Date.now().toString().slice(-6)}`
  const invoicePayloads = rentSchedule.map((payment) => ({
    camper_id: camper.id,
    invoice_number: `RENT-${siteKey(lotNumber) || 'NEW'}-${payment.installment}-${invoiceStamp}`,
    invoice_type: 'Lot Rent',
    subtotal: payment.amount,
    late_fee: 0,
    total_due: payment.amount,
    due_date: payment.dueDate,
    status: 'sent',
  }))
  const { data: invoices, error: invoiceError } = await context.admin.from('invoices').insert(invoicePayloads).select('id,due_date,total_due')
  if (invoiceError || !invoices || invoices.length !== 2) {
    await rollback()
    return NextResponse.json({ error: 'Nothing was converted because the two rent payments could not be scheduled.' }, { status: 500 })
  }
  invoiceIds = invoices.map((invoice: any) => String(invoice.id))
  const { error: itemError } = await context.admin.from('invoice_items').insert(invoices.map((invoice: any, index: number) => ({
    invoice_id: invoice.id,
    description: `Annual lot rent — payment ${index + 1} of 2`,
    quantity: 1,
    unit_price: NEW_CAMPER_INSTALLMENT,
    total: NEW_CAMPER_INSTALLMENT,
  })))
  if (itemError) {
    await rollback()
    return NextResponse.json({ error: 'Nothing was converted because the rent invoice details could not be created.' }, { status: 500 })
  }

  const { error: convertedError } = await context.admin.from('waitlist').update({ status: 'Converted', removed_at: null }).eq('id', waitlistId)
  if (convertedError) {
    await rollback()
    return NextResponse.json({ error: 'Nothing was converted because the waitlist record could not be updated.' }, { status: 500 })
  }

  let firstPaymentRecorded = false
  if (recordFirstPayment) {
    const firstInvoice = invoices.find((invoice: any) => invoice.due_date === rentSchedule[0].dueDate) || invoices[0]
    const { error: paymentError } = await context.admin.rpc('record_manual_payment_atomic', {
      p_operation_key: `waitlist-conversion:${waitlistId}:first-rent`,
      p_selected_invoice_id: firstInvoice.id,
      p_amount: NEW_CAMPER_INSTALLMENT,
      p_payment_method: paymentMethod,
      p_received_on: paymentReceivedOn,
      p_reference: paymentReference || null,
      p_recorded_by: context.user.email || 'office',
    })
    if (paymentError) {
      await rollback()
      return NextResponse.json({ error: `Nothing was converted because the first payment could not be recorded: ${paymentError.message}` }, { status: 500 })
    }
    firstPaymentRecorded = true
  }

  let welcomeDelivery: 'not_requested' | 'sent' | 'manual' = 'not_requested'
  let setupUrl = ''
  let warning = ''
  if (sendWelcome) {
    try {
      setupUrl = await generatePortalSetupUrl(context.admin, email, getSiteUrl())
      if (!portalInviteEmailConfigured()) throw new Error('The welcome email sender is not configured.')
      const emailResult = await sendPortalInviteEmail({ to: email, camperName: `${firstName} ${lastName}`, setupUrl, welcomeSite: lotNumber, temporaryWelcome: temporarySpot })
      await context.admin.from('portal_invite_log').insert({ camper_id: camper.id, email, delivery_status: 'sent', delivery_provider: (emailResult as any)?.provider || 'email-service', sent_by: context.user.email })
      welcomeDelivery = 'sent'
      setupUrl = ''
    } catch (error) {
      welcomeDelivery = 'manual'
      warning = error instanceof Error ? `The camper was created, but the welcome email did not send: ${error.message}` : 'The camper was created, but the welcome email did not send.'
      await context.admin.from('portal_invite_log').insert({ camper_id: camper.id, email, delivery_status: 'manual', delivery_provider: 'waitlist-conversion-fallback', sent_by: context.user.email })
    }
  }

  return NextResponse.json({
    success: true,
    camperId: camper.id,
    lotNumber,
    temporarySpot,
    camperName: `${firstName} ${lastName}`,
    welcomeDelivery,
    setupUrl: welcomeDelivery === 'manual' ? setupUrl : '',
    warning,
    annualRent: NEW_CAMPER_ANNUAL_RENT,
    installmentAmount: NEW_CAMPER_INSTALLMENT,
    rentSchedule,
    firstPaymentRecorded,
    associationFee: NEW_CAMPER_ASSOCIATION_FEE,
  })
}
