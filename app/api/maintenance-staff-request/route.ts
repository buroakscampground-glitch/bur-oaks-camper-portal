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

  const role = String(context.camper.role || '').toLowerCase()
  if (role !== 'maintenance' && role !== 'admin') {
    return NextResponse.json({ error: 'Only maintenance staff can submit staff work requests.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const title = String(body.title || '').trim()
  const description = String(body.description || '').trim()
  const priority = String(body.priority || 'Normal').trim() || 'Normal'

  if (!title || !description) {
    return NextResponse.json({ error: 'Please enter a title and description.' }, { status: 400 })
  }

  const reporterName =
    `${context.camper.first_name || ''} ${context.camper.last_name || ''}`.trim() ||
    context.user.email ||
    'Maintenance team'

  try {
    const { data: ticket, error } = await context.admin
      .from('maintenance_tickets')
      .insert({
        title,
        description,
        category: 'Maintenance Staff',
        status: 'Open',
        priority,
        assigned_to: 'Open',
        reported_by: reporterName,
        lot_number: 'STAFF',
        camper_id: context.camper.id,
        work_order: true,
        admin_approved: false,
      })
      .select('*')
      .single()

    if (error || !ticket) {
      return NextResponse.json(
        { error: error?.message || 'Unable to submit staff work request.' },
        { status: 500 }
      )
    }

    const origin = new URL(request.url).origin
    const alertTitle = `Maintenance staff request: ${ticket.title || 'Work request'}`
    const alertMessage = `${reporterName} submitted a work request for admin approval.`

    await createAdminNotification(context.admin, {
      type: 'maintenance_request',
      title: alertTitle,
      message: alertMessage,
      lot_number: ticket.lot_number,
      camper_id: context.camper.id,
      source_table: 'maintenance_tickets',
      source_id: String(ticket.id),
    }).catch((notificationError) => console.error('Maintenance staff notification failed:', notificationError))

    let emailStatus: 'sent' | 'skipped' | 'failed' = 'sent'
    let emailMessage = ''

    try {
      const emailResult = await sendAdminAlertEmail({
        subject: alertTitle,
        heading: alertTitle,
        message: alertMessage,
        details: [
          { label: 'Submitted by', value: reporterName },
          { label: 'Priority', value: ticket.priority },
          { label: 'Status', value: 'Needs admin approval' },
          { label: 'Description', value: ticket.description },
        ],
        actionUrl: `${origin}/admin/maintenance/${ticket.id}`,
        actionLabel: 'Review work request',
      })

      if ((emailResult as any)?.skipped) {
        emailStatus = 'skipped'
        emailMessage = (emailResult as any)?.reason || 'Email alert is not configured.'
      }
    } catch (emailError: any) {
      emailStatus = 'failed'
      emailMessage = emailError?.message || 'Admin alert email failed.'
      console.error('Maintenance staff alert email failed:', emailError)
    }

    return NextResponse.json({
      success: true,
      ticketId: ticket.id,
      emailStatus,
      emailMessage,
    })
  } catch (error: any) {
    console.error('Maintenance staff request failed:', error)
    return NextResponse.json({ error: error?.message || 'Unable to submit staff work request.' }, { status: 500 })
  }
}
