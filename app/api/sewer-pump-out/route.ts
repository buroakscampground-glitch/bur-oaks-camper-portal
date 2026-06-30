import { NextResponse } from 'next/server'
import { createAdminNotification } from '../../../lib/admin-notifications'
import { sendAdminAlertEmail } from '../../../lib/admin-alert-email'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { loadCampgroundBillingSettings } from '../../../lib/campground-settings'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data, error } = await context.admin
    .from('sewer_pump_out_requests')
    .select('*')
    .eq('camper_id', context.camper.id)
    .order('requested_at', { ascending: false })
    .limit(10)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, requests: data || [] })
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const notes = String(body.notes || '').trim().slice(0, 500)
  const camperName = `${context.camper.first_name || ''} ${context.camper.last_name || ''}`.trim() || 'Camper'
  const billingSettings = await loadCampgroundBillingSettings(context.admin)
  const pumpCharge = billingSettings.sewerPumpOutFee

  const { data: requestRow, error } = await context.admin
    .from('sewer_pump_out_requests')
    .insert({
      camper_id: context.camper.id,
      lot_number: context.camper.lot_number,
      camper_name: camperName,
      status: 'requested',
      charge_amount: pumpCharge,
      notes,
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const title = `Sewer pump-out requested: Site ${context.camper.lot_number || 'Unknown'}`
  const message = `${camperName} requested a sewer pump-out. A $${pumpCharge.toFixed(2)} charge is pending for the next electric bill.${notes ? ` Note: ${notes}` : ''}`
  const origin = new URL(request.url).origin

  await createAdminNotification(context.admin, {
    type: 'sewer_pump_out',
    title,
    message,
    lot_number: context.camper.lot_number,
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
        { label: 'Site', value: context.camper.lot_number || 'Unknown' },
        { label: 'Camper', value: camperName },
        { label: 'Pending charge', value: `$${pumpCharge.toFixed(2)}` },
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

  return NextResponse.json({ success: true, request: requestRow, emailStatus, emailMessage })
}
