import { NextResponse } from 'next/server'
import { createAdminNotification } from '../../../lib/admin-notifications'
import { sendAdminAlertEmail } from '../../../lib/admin-alert-email'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const origin = new URL(request.url).origin
  const body = await request.json().catch(() => ({}))

  try {
    if (body.type === 'maintenance_request' && body.ticketId) {
      const { data: ticket, error } = await context.admin
        .from('maintenance_tickets')
        .select('*')
        .eq('id', body.ticketId)
        .single()

      if (error || !ticket) {
        return NextResponse.json({ error: 'Maintenance ticket not found' }, { status: 404 })
      }

      if (String(ticket.lot_number || '') !== String(context.camper.lot_number || '')) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      }

      const title = `Maintenance request from Site ${ticket.lot_number || 'Unknown'}`
      const message = `${ticket.reported_by || 'A camper'} submitted: ${ticket.title || 'Maintenance request'}`

      await createAdminNotification(context.admin, {
        type: 'maintenance_request',
        title,
        message,
        lot_number: ticket.lot_number,
        camper_id: context.camper.id,
        source_table: 'maintenance_tickets',
        source_id: String(ticket.id),
      }).catch((error) => console.error('Admin notification failed:', error))

      await sendAdminAlertEmail({
        subject: title,
        heading: title,
        message,
        details: [
          { label: 'Site', value: ticket.lot_number },
          { label: 'Category', value: ticket.category },
          { label: 'Status', value: 'Needs admin approval' },
          { label: 'Description', value: ticket.description },
        ],
        actionUrl: `${origin}/admin/maintenance/${ticket.id}`,
        actionLabel: 'Review request',
      }).catch((error) => console.error('Admin alert email failed:', error))

      return NextResponse.json({ success: true })
    }

    if (body.type === 'event_rsvp' && body.eventId && body.response) {
      const { data: event, error } = await context.admin
        .from('events')
        .select('*')
        .eq('id', body.eventId)
        .single()

      if (error || !event) {
        return NextResponse.json({ error: 'Event not found' }, { status: 404 })
      }

      const camperName = `${context.camper.first_name || ''} ${context.camper.last_name || ''}`.trim() || 'A camper'
      const title = `Site ${context.camper.lot_number || 'Unknown'} RSVP: ${body.response}`
      const message = `${camperName} confirmed "${body.response}" for ${event.title || 'an event'}.`

      await createAdminNotification(context.admin, {
        type: 'event_rsvp',
        title,
        message,
        lot_number: context.camper.lot_number,
        camper_id: context.camper.id,
        source_table: 'event_rsvps',
        source_id: String(body.eventId),
      }).catch((error) => console.error('Admin notification failed:', error))

      await sendAdminAlertEmail({
        subject: title,
        heading: title,
        message,
        details: [
          { label: 'Camper', value: camperName },
          { label: 'Site', value: context.camper.lot_number },
          { label: 'Event', value: event.title },
          { label: 'Date', value: event.event_date },
        ],
        actionUrl: `${origin}/admin/rsvps`,
        actionLabel: 'View RSVPs',
      }).catch((error) => console.error('Admin alert email failed:', error))

      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Unsupported alert type' }, { status: 400 })
  } catch (error) {
    console.error('Admin alert failed:', error)
    return NextResponse.json({ error: 'Unable to create admin alert' }, { status: 500 })
  }
}
