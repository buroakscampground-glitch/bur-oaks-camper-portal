import { NextResponse } from 'next/server'
import { createAdminNotification } from '../../../lib/admin-notifications'
import { sendAdminAlertEmail } from '../../../lib/admin-alert-email'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { loadCampgroundBillingSettings } from '../../../lib/campground-settings'
import { getSewerPumpOutFeeForLot, getSewerPumpOutGallonsForCharge, isHoldingTankPumpOutLot } from '../../../lib/sewer-pump-fees'
import { getSiteUrl } from '../../../lib/site-url'
import { checkRateLimit } from '../../../lib/rate-limit'
import { allowedPumpOutServiceLot, pumpOutServiceLotsForAccount } from '../../../lib/multi-site-pump-outs'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const serviceLots = pumpOutServiceLotsForAccount(context.user.email, context.camper.lot_number)
  let requestQuery = context.admin
    .from('sewer_pump_out_requests')
    .select('*')
    .order('requested_at', { ascending: false })
    .limit(10)
  requestQuery = serviceLots.length > 1
    ? requestQuery.in('lot_number', serviceLots)
    : requestQuery.eq('camper_id', context.camper.id)
  const { data, error } = await requestQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    requests: data || [],
    serviceLots,
    billingLot: context.camper.lot_number,
  })
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'sewer-pump-out', 5, 10 * 60_000)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many pump-out requests. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } })

  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const notes = String(body.notes || '').trim().slice(0, 500)
  const serviceLots = pumpOutServiceLotsForAccount(context.user.email, context.camper.lot_number)
  const requestedServiceLot = allowedPumpOutServiceLot(
    context.user.email,
    context.camper.lot_number,
    body.serviceLot || context.camper.lot_number
  )
  if (!requestedServiceLot) {
    return NextResponse.json({ error: 'That campsite is not connected to your pump-out account.' }, { status: 403 })
  }

  const camperName = `${context.camper.first_name || ''} ${context.camper.last_name || ''}`.trim() || 'Camper'
  const initiatedBy = `Initiated from camper portal by ${context.user.email}.`
  const billingSettings = await loadCampgroundBillingSettings(context.admin)
  const pumpCharge = getSewerPumpOutFeeForLot(requestedServiceLot, billingSettings.sewerPumpOutFee)
  const gallonsUsed = getSewerPumpOutGallonsForCharge(pumpCharge)
  const holdingTankNote = isHoldingTankPumpOutLot(requestedServiceLot)
    ? ' This is a holding-tank site, so the holding-tank pump-out rate applies.'
    : ''

  let requestResults: any = null
  let error: any = null
  if (serviceLots.length > 1) {
    const { data: existing, error: existingError } = await context.admin
      .from('sewer_pump_out_requests')
      .select('*')
      .eq('lot_number', requestedServiceLot)
      .is('billed_at', null)
      .neq('status', 'cancelled')
      .order('requested_at', { ascending: false })
      .limit(1)

    if (existingError) {
      error = existingError
    } else if (existing?.length) {
      requestResults = [{ request_row: existing[0], duplicate: true }]
    } else {
      const billingNote = `Service site ${requestedServiceLot}; bill to Lot ${context.camper.lot_number}.`
      const combinedNotes = [billingNote, initiatedBy, notes].filter(Boolean).join(' ').slice(0, 500)
      const { data: created, error: insertError } = await context.admin
        .from('sewer_pump_out_requests')
        .insert({
          camper_id: context.camper.id,
          lot_number: requestedServiceLot,
          camper_name: camperName,
          status: 'requested',
          charge_amount: pumpCharge,
          gallons_used: gallonsUsed,
          notes: combinedNotes,
        })
        .select('*')
        .single()
      error = insertError
      requestResults = created ? [{ request_row: created, duplicate: false }] : null
    }
  } else {
    const result = await context.admin.rpc('request_sewer_pump_out_atomic', {
      p_camper_id: context.camper.id,
      p_lot_number: requestedServiceLot,
      p_camper_name: camperName,
      p_charge_amount: pumpCharge,
      p_notes: [initiatedBy, notes].filter(Boolean).join(' ').slice(0, 500),
    })
    requestResults = result.data
    error = result.error
  }

  if (error) {
    return NextResponse.json(
      { error: ['42883', 'PGRST202'].includes(error.code || '') ? 'The pump-out security update is not installed yet.' : 'Unable to save the pump-out request.' },
      { status: 500 }
    )
  }

  const requestResult = Array.isArray(requestResults) ? requestResults[0] : requestResults
  const requestRow = requestResult?.request_row

  if (requestResult?.duplicate) {
    return NextResponse.json({
      success: true,
      duplicate: true,
      request: requestRow,
      emailStatus: 'skipped',
      emailMessage: `Lot ${requestedServiceLot} already has an open sewer pump-out request.`,
      serviceLot: requestedServiceLot,
      billingLot: context.camper.lot_number,
    })
  }

  if (!requestRow?.id) {
    return NextResponse.json({ error: 'Unable to verify the saved pump-out request.' }, { status: 500 })
  }

  const title = `Sewer pump-out requested: Site ${requestedServiceLot || 'Unknown'}`
  const billingDetail = requestedServiceLot !== context.camper.lot_number
    ? ` The charge will be billed to ${camperName} at Lot ${context.camper.lot_number}.`
    : ''
  const message = `${camperName} requested a sewer pump-out at Site ${requestedServiceLot}. This records ${gallonsUsed} gallons and a $${pumpCharge.toFixed(2)} charge is pending for the next electric bill.${billingDetail}${holdingTankNote}${notes ? ` Note: ${notes}` : ''}`
  const origin = getSiteUrl()

  await createAdminNotification(context.admin, {
    type: 'sewer_pump_out',
    title,
    message,
    lot_number: requestedServiceLot,
    camper_id: context.camper.id,
    source_table: 'sewer_pump_out_requests',
    source_id: String(requestRow.id),
  }).catch((notificationError) => console.error('Sewer pump notification failed:', notificationError))

  let emailStatus: 'sent' | 'skipped' | 'failed' = 'sent'
  let emailMessage = ''

  try {
    const result = await sendAdminAlertEmail({
      subject: title,
      heading: title,
      message,
      details: [
        { label: 'Service site', value: requestedServiceLot || 'Unknown' },
        { label: 'Billing site', value: context.camper.lot_number || 'Unknown' },
        { label: 'Camper', value: camperName },
        { label: 'Pending charge', value: `$${pumpCharge.toFixed(2)}` },
        { label: 'Gallons recorded', value: `${gallonsUsed} gallons` },
        { label: 'Rate type', value: isHoldingTankPumpOutLot(requestedServiceLot) ? 'Holding-tank site' : 'Standard site' },
        { label: 'Notes', value: notes || 'None' },
      ],
      actionUrl: `${origin}/admin/pump-outs`,
      actionLabel: 'Open pump-out queue',
    })

    if ((result as any)?.skipped) {
      emailStatus = 'skipped'
      emailMessage = (result as any)?.reason || 'Email alert is not configured.'
    }
  } catch (emailError: any) {
    emailStatus = 'failed'
    emailMessage = emailError?.message || 'Sewer pump-out alert email failed.'
  }

  return NextResponse.json({
    success: true,
    request: requestRow,
    emailStatus,
    emailMessage,
    serviceLot: requestedServiceLot,
    billingLot: context.camper.lot_number,
    chargeAmount: pumpCharge,
  })
}
