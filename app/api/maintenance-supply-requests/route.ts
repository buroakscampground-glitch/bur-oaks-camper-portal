import { NextResponse } from 'next/server'
import { sendAdminAlertEmail } from '../../../lib/admin-alert-email'
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
  const alertTitle = `${urgency === 'Urgent' ? 'Urgent s' : 'S'}upply request: ${itemName}`
  const alertMessage = `${reporterName} requested ${quantityLabel}${notes ? ` — ${notes}` : ''}`

  await createAdminNotification(context.admin, {
    type: 'maintenance_request',
    title: alertTitle,
    message: alertMessage,
    lot_number: 'SUPPLIES',
    camper_id: context.camper.id,
    source_table: 'maintenance_supply_requests',
    source_id: String(supplyRequest.id),
  }).catch((notificationError) => console.error('Supply request notification failed:', notificationError))

  let emailStatus: 'sent' | 'skipped' | 'failed' = 'sent'
  let emailMessage = ''

  try {
    const origin = new URL(request.url).origin
    const emailResult = await sendAdminAlertEmail({
      subject: alertTitle,
      heading: alertTitle,
      message: alertMessage,
      details: [
        { label: 'Requested by', value: reporterName },
        { label: 'Item', value: itemName },
        { label: 'Quantity', value: quantityLabel },
        { label: 'Urgency', value: urgency },
        { label: 'Notes', value: notes || 'No extra notes' },
      ],
      actionUrl: `${origin}/admin/maintenance/supplies`,
      actionLabel: 'Open supply requests',
    })

    if ((emailResult as any)?.skipped) {
      emailStatus = 'skipped'
      emailMessage = (emailResult as any)?.reason || 'Admin email alerts are not configured.'
    }
  } catch (emailError: any) {
    emailStatus = 'failed'
    emailMessage = emailError?.message || 'Admin alert email failed.'
    console.error('Supply request email alert failed:', emailError)
  }

  return NextResponse.json({
    success: true,
    request: supplyRequest,
    emailStatus,
    emailMessage,
  })
}
