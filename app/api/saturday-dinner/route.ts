import { NextResponse } from 'next/server'
import { createAdminNotification } from '../../../lib/admin-notifications'
import { sendAdminAlertEmail } from '../../../lib/admin-alert-email'
import { saturdayDinners2026 } from '../../../lib/saturday-dinners'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { getSiteUrl } from '../../../lib/site-url'

export const runtime = 'nodejs'

const allowedStatuses = ['Going', 'Maybe', 'Not Going']

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const { data, error } = await context.admin
    .from('saturday_dinner_signups')
    .select('*')
    .eq('camper_id', context.camper.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: publicData, error: publicError } = await context.admin
    .from('saturday_dinner_signups')
    .select('id,dinner_date,lot_number,camper_name,attending_status,bringing,guest_count,updated_at')
    .order('dinner_date', { ascending: true })
    .order('updated_at', { ascending: false })

  if (publicError) {
    return NextResponse.json({ error: publicError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    signups: data || [],
    publicSignups: (publicData || []).map((signup: any) => ({
      id: signup.id,
      dinner_date: signup.dinner_date,
      lot_number: signup.lot_number,
      camper_name: signup.camper_name,
      attending_status: signup.attending_status,
      bringing: signup.bringing,
      guest_count: signup.guest_count,
      updated_at: signup.updated_at,
    })),
  })
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const dinnerDate = String(body.dinnerDate || '')
  const status = String(body.status || 'Going')
  const bringing = String(body.bringing || '').trim()
  const guestCount = Math.max(1, Math.min(99, Math.round(Number(body.guestCount || 1))))
  const dinner = saturdayDinners2026.find((item) => item.date === dinnerDate)

  if (!dinner || dinner.closed) {
    return NextResponse.json({ error: 'Dinner date is not available.' }, { status: 400 })
  }

  if (!allowedStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid dinner response.' }, { status: 400 })
  }

  const camperName = `${context.camper.first_name || ''} ${context.camper.last_name || ''}`.trim() || 'Camper'

  const { data: signup, error } = await context.admin
    .from('saturday_dinner_signups')
    .upsert({
      dinner_date: dinnerDate,
      camper_id: context.camper.id,
      lot_number: context.camper.lot_number,
      camper_name: camperName,
      attending_status: status,
      bringing,
      guest_count: guestCount,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'dinner_date,camper_id',
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const title = `Saturday dinner: Site ${context.camper.lot_number || 'Unknown'} ${status}`
  const message = `${camperName} marked ${status} for ${dinner.month} ${dinner.day} ${dinner.menu}${bringing ? ` and is bringing ${bringing}` : ''}.`
  const origin = getSiteUrl()

  await createAdminNotification(context.admin, {
    type: 'saturday_dinner',
    title,
    message,
    lot_number: context.camper.lot_number,
    camper_id: context.camper.id,
    source_table: 'saturday_dinner_signups',
    source_id: signup?.id ? String(signup.id) : dinnerDate,
  }).catch((notificationError) => console.error('Dinner notification failed:', notificationError))

  let emailStatus: 'sent' | 'skipped' | 'failed' = 'sent'
  let emailMessage = ''

  try {
    const result = await sendAdminAlertEmail({
      subject: title,
      heading: title,
      message,
      details: [
        { label: 'Dinner', value: `${dinner.month} ${dinner.day} — ${dinner.menu}` },
        { label: 'Time', value: '6:00 PM' },
        { label: 'Camper', value: camperName },
        { label: 'Site', value: context.camper.lot_number },
        { label: 'Response', value: status },
        { label: 'Guests', value: guestCount },
        { label: 'Bringing', value: bringing || 'Nothing listed' },
      ],
      actionUrl: `${origin}/admin/dinners`,
      actionLabel: 'Open dinner signups',
    })

    if ((result as any)?.skipped) {
      emailStatus = 'skipped'
      emailMessage = (result as any)?.reason || 'Email alert is not configured.'
    }
  } catch (emailError: any) {
    emailStatus = 'failed'
    emailMessage = emailError?.message || 'Dinner alert email failed.'
  }

  return NextResponse.json({ success: true, signup, emailStatus, emailMessage })
}
