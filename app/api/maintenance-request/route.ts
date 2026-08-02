import { NextResponse } from 'next/server'
import { createAdminNotification } from '../../../lib/admin-notifications'
import { sendAdminAlertEmail } from '../../../lib/admin-alert-email'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { getSiteUrl } from '../../../lib/site-url'
import { checkRateLimit } from '../../../lib/rate-limit'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'maintenance-request', 10, 10 * 60_000)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many maintenance requests. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } })

  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const title = String(body.title || '').trim().slice(0, 120)
  const description = String(body.description || '').trim().slice(0, 5000)
  const requestedCategory = String(body.category || 'General').trim()
  const category = ['General', 'Electric', 'Water', 'Gate', 'Roads', 'Rec Hall', 'Bathroom', 'Tree / Grounds'].includes(requestedCategory) ? requestedCategory : 'General'
  const photoUrls = Array.isArray(body.photoUrls)
    ? body.photoUrls
        .filter((path: unknown) => typeof path === 'string' && path.startsWith(`${context.user.id}/`) && path.length <= 500)
        .slice(0, 6)
    : []

  if (!title || !description) {
    return NextResponse.json({ error: 'Please add a title and description.' }, { status: 400 })
  }

  const reporterName =
    `${context.camper.first_name || ''} ${context.camper.last_name || ''}`.trim() ||
    context.user.email ||
    'Camper'

  try {
    const { data: ticket, error } = await context.admin
      .from('maintenance_tickets')
      .insert({
        title,
        description,
        category,
        status: 'Open',
        camper_id: context.camper.id,
        reported_by: reporterName,
        lot_number: context.camper.lot_number || '',
        admin_approved: false,
        ...(photoUrls.length ? { photo_urls: photoUrls } : {}),
      })
      .select('*')
      .single()

    if (error || !ticket) {
      return NextResponse.json({ error: error?.message || 'Unable to submit maintenance request.' }, { status: 500 })
    }

    const origin = getSiteUrl()
    const alertTitle = `Maintenance request from Site ${ticket.lot_number || 'Unknown'}`
    const alertMessage = `${reporterName} submitted: ${ticket.title || 'Maintenance request'}`

    await createAdminNotification(context.admin, {
      type: 'maintenance_request',
      title: alertTitle,
      message: alertMessage,
      lot_number: ticket.lot_number,
      camper_id: context.camper.id,
      source_table: 'maintenance_tickets',
      source_id: String(ticket.id),
    }).catch((notificationError) => console.error('Admin notification failed:', notificationError))

    let emailStatus: 'sent' | 'skipped' | 'failed' = 'sent'
    let emailMessage = ''

    try {
      const emailResult = await sendAdminAlertEmail({
        subject: alertTitle,
        heading: alertTitle,
        message: alertMessage,
        details: [
          { label: 'Camper', value: reporterName },
          { label: 'Site', value: ticket.lot_number },
          { label: 'Category', value: ticket.category },
          { label: 'Status', value: 'Needs admin approval' },
          { label: 'Description', value: ticket.description },
          { label: 'Photos', value: photoUrls.length },
        ],
        actionUrl: `${origin}/admin/maintenance/${ticket.id}`,
        actionLabel: 'Review request',
      })

      if ((emailResult as any)?.skipped) {
        emailStatus = 'skipped'
        emailMessage = (emailResult as any)?.reason || 'Email alert is not configured.'
      } else {
        console.info('Maintenance request alert email sent:', {
          ticketId: ticket.id,
          resendId: (emailResult as any)?.id,
        })
      }
    } catch (emailError: any) {
      emailStatus = 'failed'
      emailMessage = emailError?.message || 'Admin alert email failed.'
      console.error('Maintenance alert email failed:', emailError)
    }

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      emailStatus,
      emailMessage,
    })
  } catch (error: any) {
    console.error('Maintenance request submit failed:', error)
    return NextResponse.json({ error: error?.message || 'Unable to submit maintenance request.' }, { status: 500 })
  }
}
