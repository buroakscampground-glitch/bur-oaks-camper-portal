import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { loadCampgroundBillingSettings } from '../../../lib/campground-settings'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { getSewerPumpOutFeeForLot, getSewerPumpOutGallonsForCharge } from '../../../lib/sewer-pump-fees'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const camperId = String(body.camperId || '').trim()
  const notes = String(body.notes || '').trim().slice(0, 500)

  if (!camperId) {
    return NextResponse.json({ error: 'Choose a camper first.' }, { status: 400 })
  }

  const { data: targetCamper, error: camperError } = await context.admin
    .from('campers')
    .select('id,first_name,last_name,lot_number,role,active')
    .eq('id', camperId)
    .eq('active', true)
    .maybeSingle()

  if (camperError || !targetCamper || !isOperationalCamper(targetCamper)) {
    return NextResponse.json({ error: 'That active camper site could not be found.' }, { status: 404 })
  }

  const billingSettings = await loadCampgroundBillingSettings(context.admin)
  const chargeAmount = getSewerPumpOutFeeForLot(targetCamper.lot_number, billingSettings.sewerPumpOutFee)
  const gallonsUsed = getSewerPumpOutGallonsForCharge(chargeAmount)
  const camperName = `${targetCamper.first_name || ''} ${targetCamper.last_name || ''}`.trim() || 'Camper'
  const officeNotes = notes ? `Office entry: ${notes}` : 'Added manually by the office.'

  const { data: requestResults, error } = await context.admin.rpc('request_sewer_pump_out_atomic', {
    p_camper_id: targetCamper.id,
    p_lot_number: targetCamper.lot_number,
    p_camper_name: camperName,
    p_charge_amount: chargeAmount,
    p_notes: officeNotes,
  })

  if (error) {
    return NextResponse.json({ error: 'Unable to add the pump-out request.' }, { status: 500 })
  }

  const result = Array.isArray(requestResults) ? requestResults[0] : requestResults

  if (result?.duplicate) {
    return NextResponse.json({
      success: true,
      duplicate: true,
      message: `Lot ${targetCamper.lot_number || '—'} already has an open pump-out request and was not charged twice.`,
    })
  }

  return NextResponse.json({
    success: true,
    duplicate: false,
    message: `Pump-out added for Lot ${targetCamper.lot_number || '—'}. The $${chargeAmount.toFixed(2)} charge will be added to the next electric invoice.`,
    request: result?.request_row,
    chargeAmount,
    gallonsUsed,
  })
}
