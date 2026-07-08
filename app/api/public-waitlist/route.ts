import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkRateLimit } from '../../../lib/rate-limit'
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
    const desiredSite = clean(body.desiredSite, 180)
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
      notes,
      'Submitted from public website availability form.',
    ].filter(Boolean).join('\n\n')

    const { error } = await admin.from('waitlist').insert({
      first_name: firstName,
      last_name: lastName,
      phone,
      email,
      desired_site: desiredSite,
      notes: visitorNotes,
      status: 'Waiting',
    })

    if (error) {
      console.error('Public waitlist insert failed:', error)
      return NextResponse.json(
        { error: 'We could not send your request. Please call the campground.' },
        { status: 500 }
      )
    }

    const fullName = `${firstName} ${lastName}`.trim()

    sendAdminAlertEmail({
      subject: `New website waitlist request: ${fullName}`,
      heading: 'New website waitlist request',
      message: `${fullName} filled out the seasonal site interest form on the Bur Oaks website.`,
      details: [
        { label: 'Name', value: fullName },
        { label: 'Phone', value: phone },
        { label: 'Email', value: email },
        { label: 'Desired site / camper info', value: desiredSite },
        { label: 'Notes', value: notes },
      ],
      actionUrl: `${getSiteUrl()}/admin/waitlist`,
      actionLabel: 'Open waitlist',
    }).catch((error) => {
      console.error('Public waitlist admin email failed:', error)
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Public waitlist form failed:', error)
    return NextResponse.json(
      { error: 'We could not send your request. Please call the campground.' },
      { status: 500 }
    )
  }
}
