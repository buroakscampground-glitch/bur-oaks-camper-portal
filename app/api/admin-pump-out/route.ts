import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { loadCampgroundBillingSettings } from '../../../lib/campground-settings'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { getSewerPumpOutFeeForLot, getSewerPumpOutGallonsForCharge } from '../../../lib/sewer-pump-fees'
import { allowedPumpOutServiceLot, pumpOutServiceLotsForAccount } from '../../../lib/multi-site-pump-outs'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const camperId = String(body.camperId || '').trim()
  const requestedServiceLot = String(body.serviceLot || '').trim()
  const notes = String(body.notes || '').trim().slice(0, 500)

  if (!camperId) {
    return NextResponse.json({ error: 'Choose a camper first.' }, { status: 400 })
  }

  const { data: targetCamper, error: camperError } = await context.admin
    .from('campers')
    .select('id,first_name,last_name,email,lot_number,role,active')
    .eq('id', camperId)
    .maybeSingle()

  if (camperError || !targetCamper || !isOperationalCamper(targetCamper)) {
    return NextResponse.json({ error: 'That camper site could not be found.' }, { status: 404 })
  }

  const serviceLots = pumpOutServiceLotsForAccount(targetCamper.email, targetCamper.lot_number)
  const serviceLot = allowedPumpOutServiceLot(
    targetCamper.email,
    targetCamper.lot_number,
    requestedServiceLot || targetCamper.lot_number
  )
  if (!serviceLot) {
    return NextResponse.json({ error: 'That service site is not connected to this camper account.' }, { status: 400 })
  }

  const billingSettings = await loadCampgroundBillingSettings(context.admin)
  const chargeAmount = getSewerPumpOutFeeForLot(serviceLot, billingSettings.sewerPumpOutFee)
  const gallonsUsed = getSewerPumpOutGallonsForCharge(chargeAmount)
  const camperName = `${targetCamper.first_name || ''} ${targetCamper.last_name || ''}`.trim() || 'Camper'
  const billingNote = serviceLot !== targetCamper.lot_number
    ? `Service site ${serviceLot}; bill to Lot ${targetCamper.lot_number}.`
    : ''
  const officeNotes = [
    billingNote,
    `Initiated by office admin ${context.user.email}.`,
    notes,
  ].filter(Boolean).join(' ').slice(0, 500)

  let requestResults: any = null
  let error: any = null
  if (serviceLots.length > 1) {
    const { data: existing, error: existingError } = await context.admin
      .from('sewer_pump_out_requests')
      .select('*')
      .eq('lot_number', serviceLot)
      .is('billed_at', null)
      .neq('status', 'cancelled')
      .order('requested_at', { ascending: false })
      .limit(1)

    if (existingError) {
      error = existingError
    } else if (existing?.length) {
      requestResults = [{ request_row: existing[0], duplicate: true }]
    } else {
      const { data: created, error: insertError } = await context.admin
        .from('sewer_pump_out_requests')
        .insert({
          camper_id: targetCamper.id,
          lot_number: serviceLot,
          camper_name: camperName,
          status: 'requested',
          charge_amount: chargeAmount,
          gallons_used: gallonsUsed,
          notes: officeNotes,
        })
        .select('*')
        .single()
      error = insertError
      requestResults = created ? [{ request_row: created, duplicate: false }] : null
    }
  } else {
    const result = await context.admin.rpc('request_sewer_pump_out_atomic', {
      p_camper_id: targetCamper.id,
      p_lot_number: serviceLot,
      p_camper_name: camperName,
      p_charge_amount: chargeAmount,
      p_notes: officeNotes,
    })
    requestResults = result.data
    error = result.error
  }

  if (error) {
    return NextResponse.json({ error: 'Unable to add the pump-out request.' }, { status: 500 })
  }

  const result = Array.isArray(requestResults) ? requestResults[0] : requestResults

  if (result?.duplicate) {
    return NextResponse.json({
      success: true,
      duplicate: true,
      message: `Lot ${serviceLot || '—'} already has an open pump-out request and was not charged twice.`,
    })
  }

  return NextResponse.json({
    success: true,
    duplicate: false,
    message: `Pump-out added for service site ${serviceLot || '—'}${serviceLot !== targetCamper.lot_number ? ` and billed to Lot ${targetCamper.lot_number}` : ''}. The $${chargeAmount.toFixed(2)} charge will be added to the next electric invoice.${targetCamper.active === false ? ' The camper remains archived.' : ''}`,
    request: result?.request_row,
    chargeAmount,
    gallonsUsed,
  })
}
