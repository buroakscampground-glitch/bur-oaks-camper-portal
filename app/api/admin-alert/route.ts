import { NextResponse } from 'next/server'
import { createAdminNotification } from '../../../lib/admin-notifications'
import { sendAdminAlertEmail } from '../../../lib/admin-alert-email'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { getSiteUrl } from '../../../lib/site-url'
import { checkRateLimit } from '../../../lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'admin-alert', 20, 10 * 60_000)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many alert requests. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } })

  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const origin = getSiteUrl()
  const body = await request.json().catch(() => ({}))
  const role = String(context.camper.role || '').toLowerCase()
  const canAlertAnyTicket = role === 'admin' || role === 'maintenance'

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

      if (!canAlertAnyTicket && String(ticket.lot_number || '') !== String(context.camper.lot_number || '')) {
        return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
      }

      const title = `Maintenance request from Site ${ticket.lot_number || 'Unknown'}`
      const reporter =
        ticket.reported_by ||
        (role === 'maintenance' ? 'Maintenance team' : 'A camper')
      const message = `${reporter} submitted: ${ticket.title || 'Maintenance request'}`

      await createAdminNotification(context.admin, {
        type: 'maintenance_request',
        title,
        message,
        lot_number: ticket.lot_number,
        camper_id: ticket.camper_id || context.camper.id,
        source_table: 'maintenance_tickets',
        source_id: String(ticket.id),
      }).catch((error) => console.error('Admin notification failed:', error))

      let emailStatus: 'sent' | 'skipped' | 'failed' = 'sent'
      let emailMessage = ''

      try {
        const emailResult = await sendAdminAlertEmail({
          subject: title,
          heading: title,
          message,
          details: [
            { label: 'Site', value: ticket.lot_number },
            { label: 'Reported by', value: reporter },
            { label: 'Category', value: ticket.category },
            { label: 'Status', value: 'Needs admin approval' },
            { label: 'Description', value: ticket.description },
            { label: 'Photos', value: Array.isArray(ticket.photo_urls) ? ticket.photo_urls.length : null },
          ],
          actionUrl: `${origin}/admin/maintenance/${ticket.id}`,
          actionLabel: 'Review request',
        })

        if ((emailResult as any)?.skipped) {
          emailStatus = 'skipped'
          emailMessage = (emailResult as any)?.reason || 'Email alert is not configured.'
        }
      } catch (error: any) {
        emailStatus = 'failed'
        emailMessage = error?.message || 'Admin alert email failed.'
        console.error('Admin alert email failed:', error)
      }

      return NextResponse.json({ success: true, emailStatus, emailMessage })
    }

    if (body.type === 'event_rsvp' && body.eventId && body.response) {
      return NextResponse.json({ success: true, informational: true })
    }

    return NextResponse.json({ error: 'Unsupported alert type' }, { status: 400 })
  } catch (error) {
    console.error('Admin alert failed:', error)
    return NextResponse.json({ error: 'Unable to create admin alert' }, { status: 500 })
  }
}
