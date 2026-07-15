import { NextResponse } from 'next/server'
import { createAdminNotification } from '../../../lib/admin-notifications'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

const allowedUnits = new Set(['each', 'bottle', 'box', 'case', 'roll', 'bag', 'gallon'])

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const role = String(context.camper.role || '').toLowerCase()
  if (role !== 'maintenance' && role !== 'admin') {
    return NextResponse.json({ error: 'Only maintenance staff can request supplies.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const itemName = String(body.itemName || '').trim().slice(0, 120)
  const quantity = Number(body.quantity)
  const requestedUnit = String(body.unit || 'each').trim().toLowerCase()
  const unit = allowedUnits.has(requestedUnit) ? requestedUnit : 'each'
  const urgency = body.urgency === 'Urgent' ? 'Urgent' : 'Normal'
  const notes = String(body.notes || '').trim().slice(0, 1000)

  if (!itemName) {
    return NextResponse.json({ error: 'Please enter the supply item.' }, { status: 400 })
  }

  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 999) {
    return NextResponse.json({ error: 'Enter a quantity between 1 and 999.' }, { status: 400 })
  }

  const reporterName =
    `${context.camper.first_name || ''} ${context.camper.last_name || ''}`.trim() ||
    context.user.email ||
    'Maintenance team'

  const { data: supplyRequest, error } = await context.admin
    .from('maintenance_supply_requests')
    .insert({
      item_name: itemName,
      quantity,
      unit,
      urgency,
      notes: notes || null,
      requested_by: reporterName,
      requested_by_camper_id: context.camper.id,
      status: 'Requested',
    })
    .select('*')
    .single()

  if (error || !supplyRequest) {
    return NextResponse.json(
      { error: error?.message || 'Unable to submit the supply request.' },
      { status: 500 }
    )
  }

  const quantityLabel = `${Number(supplyRequest.quantity)} ${supplyRequest.unit}`

  await createAdminNotification(context.admin, {
    type: 'maintenance_request',
    title: `${urgency === 'Urgent' ? 'Urgent s' : 'S'}upply request: ${itemName}`,
    message: `${reporterName} requested ${quantityLabel}${notes ? ` — ${notes}` : ''}`,
    lot_number: 'SUPPLIES',
    camper_id: context.camper.id,
    source_table: 'maintenance_supply_requests',
    source_id: String(supplyRequest.id),
  }).catch((notificationError) => console.error('Supply request notification failed:', notificationError))

  return NextResponse.json({ success: true, request: supplyRequest })
}
