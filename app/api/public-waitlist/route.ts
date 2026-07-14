import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '../../../lib/rate-limit'
import { createAdminNotification } from '../../../lib/admin-notifications'
import { sendAdminAlertEmail } from '../../../lib/admin-alert-email'
import { getSiteUrl } from '../../../lib/site-url'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

function clean(value: unknown, maxLength = 500) {
  return typeof value === 'string'
    ? value.trim().slice(0, maxLength)
    : ''
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, 'public-waitlist', 8, 10 * 60_000)

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a few minutes and try again.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  try {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!serviceRoleKey) {
      return NextResponse.json(
        { error: 'The waitlist form is not connected yet. Please call the campground.' },
        { status: 500 }
      )
    }

    const body = await request.json()
    const firstName = clean(body.firstName, 80)
    const lastName = clean(body.lastName, 80)
    const phone = clean(body.phone, 40)
    const email = clean(body.email, 120).toLowerCase()
    const camperType = clean(body.camperType, 80)
    const camperLength = clean(body.camperLength, 60)
    const timeline = clean(body.timeline, 80)
    const desiredSite = clean(body.desiredSite, 180)
    const tourRequested = body.tourRequested === true
    const preferredTourDate = clean(body.preferredTourDate, 20)
    const preferredTourTime = clean(body.preferredTourTime, 40)
    const notes = clean(body.notes, 900)

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: 'Please add your first and last name.' },
        { status: 400 }
      )
    }

    if (!phone && !email) {
      return NextResponse.json(
        { error: 'Please add a phone number or email so we can reach you.' },
        { status: 400 }
      )
    }

    if (email && !/^\S+@\S+\.\S+$/.test(email)) {
      return NextResponse.json(
        { error: 'Please enter a valid email address.' },
        { status: 400 }
      )
    }

    const admin = createClient(supabaseUrl, serviceRoleKey)
    const visitorNotes = [
      camperType ? `Camper type: ${camperType}` : '',
      camperLength ? `Camper length: ${camperLength}` : '',
      timeline ? `Timeline: ${timeline}` : '',
      desiredSite ? `Preferred site feel: ${desiredSite}` : '',
      notes,
      tourRequested
        ? `Campground tour requested. Preferred date: ${preferredTourDate || 'No date selected'}. Preferred time: ${preferredTourTime || 'Flexible'}.`
        : '',
      'Submitted from public website availability form.',
    ].filter(Boolean).join('\n\n')

    const { data: waitlistEntry, error } = await admin
      .from('waitlist')
      .insert({
        first_name: firstName,
        last_name: lastName,
        phone,
        email,
        desired_site: desiredSite,
        notes: visitorNotes,
        status: 'Waiting',
      })
      .select('id')
      .single()

    if (error) {
      console.error('Public waitlist insert failed:', error)
      return NextResponse.json(
        { error: 'We could not send your request. Please call the campground.' },
        { status: 500 }
      )
    }

    const fullName = `${firstName} ${lastName}`.trim()
    const alertTitle = `New website waitlist request: ${fullName}`
    const alertMessage = `${fullName} filled out the seasonal site interest form on the Bur Oaks website.`

    await createAdminNotification(admin, {
      type: 'website_waitlist',
      title: alertTitle,
      message: alertMessage,
      lot_number: desiredSite || null,
      source_table: 'waitlist',
      source_id: waitlistEntry?.id ? String(waitlistEntry.id) : null,
    }).catch((notificationError) => console.error('Public waitlist admin notification failed:', notificationError))

    let emailStatus: 'sent' | 'skipped' | 'failed' = 'sent'
    let emailMessage = ''

    try {
      const emailResult = await sendAdminAlertEmail({
        subject: alertTitle,
        heading: 'New website waitlist request',
        message: alertMessage,
        details: [
          { label: 'Name', value: fullName },
          { label: 'Phone', value: phone },
          { label: 'Email', value: email },
          { label: 'Camper type', value: camperType },
          { label: 'Camper length', value: camperLength },
          { label: 'Timeline', value: timeline },
          { label: 'Preferred site feel', value: desiredSite },
          { label: 'Tour requested', value: tourRequested ? 'Yes' : 'No' },
          { label: 'Preferred tour date', value: tourRequested ? preferredTourDate : '' },
          { label: 'Preferred tour time', value: tourRequested ? preferredTourTime : '' },
          { label: 'Notes', value: notes },
        ],
        actionUrl: `${getSiteUrl()}/admin/waitlist`,
        actionLabel: 'Open waitlist',
      })

      if ((emailResult as any)?.skipped) {
        emailStatus = 'skipped'
        emailMessage = (emailResult as any).reason || 'Admin email alert is not configured.'
      }
    } catch (emailError: any) {
      emailStatus = 'failed'
      emailMessage = emailError?.message || 'Admin waitlist email failed.'
      console.error('Public waitlist admin email failed:', emailError)
    }

    return NextResponse.json({ success: true, emailStatus, emailMessage })
  } catch (error) {
    console.error('Public waitlist form failed:', error)
    return NextResponse.json(
      { error: 'We could not send your request. Please call the campground.' },
      { status: 500 }
    )
  }
}
