import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  anniversaryYears,
  birthdayIsToday,
  centralDate,
  sendCamperCelebration,
  type CelebrationProfile,
} from '../../../../lib/camper-celebrations'

export const dynamic = 'force-dynamic'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return key ? createClient(supabaseUrl, key) : null
}

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET
  return Boolean(secret && request.headers.get('authorization') === `Bearer ${secret}`)
}

function profileName(camper: any, profile: CelebrationProfile) {
  if (profile === 'secondary') {
    return `${camper.second_profile_first_name || ''} ${camper.second_profile_last_name || ''}`.trim()
  }
  return `${camper.first_name || ''} ${camper.last_name || ''}`.trim()
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Supabase service key is not configured.' }, { status: 500 })

  const today = centralDate()
  const [{ data: campers, error: camperError }, { data: blockedRenewals, error: renewalError }] = await Promise.all([
    admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,email,secondary_email,phone,alternate_phone,second_profile_first_name,second_profile_last_name,second_profile_phone,birthday,second_profile_birthday,camper_since_date,sms_opt_in,celebration_messages_opt_in,active,role')
      .eq('active', true)
      .eq('celebration_messages_opt_in', true),
    admin
      .from('season_renewals')
      .select('camper_id,status')
      .in('status', ['Camper Leaving', 'Campground Not Renewing']),
  ])

  if (camperError || renewalError) {
    return NextResponse.json({ error: camperError?.message || renewalError?.message }, { status: 500 })
  }

  const blockedCamperIds = new Set((blockedRenewals || []).map((record) => String(record.camper_id)))
  const summary = {
    today: today.iso,
    checked: campers?.length || 0,
    blocked: 0,
    events: 0,
    emailSent: 0,
    smsSent: 0,
    failed: 0,
    results: [] as Array<Record<string, unknown>>,
  }

  for (const camper of campers || []) {
    if (['admin', 'maintenance'].includes(String(camper.role || '').toLowerCase())) continue
    if (blockedCamperIds.has(String(camper.id))) {
      summary.blocked += 1
      continue
    }

    const events: Array<{ type: 'birthday' | 'anniversary'; profile: CelebrationProfile; name: string; years?: number }> = []
    if (birthdayIsToday(camper.birthday, today) && String(camper.first_name || '').trim()) {
      events.push({ type: 'birthday', profile: 'primary', name: profileName(camper, 'primary') })
    }
    if (birthdayIsToday(camper.second_profile_birthday, today) && String(camper.second_profile_first_name || '').trim()) {
      events.push({ type: 'birthday', profile: 'secondary', name: profileName(camper, 'secondary') })
    }
    const years = anniversaryYears(camper.camper_since_date, today)
    if (years >= 1) {
      events.push({ type: 'anniversary', profile: 'household', name: profileName(camper, 'primary'), years })
    }

    for (const event of events) {
      const delivery = await sendCamperCelebration({ client: admin, camper, event, today })
      summary.events += 1
      if (delivery.email === 'sent') summary.emailSent += 1
      if (delivery.sms === 'sent') summary.smsSent += 1
      if (delivery.email === 'failed' || delivery.sms === 'failed') summary.failed += 1
      summary.results.push({
        camperId: camper.id,
        lot: camper.lot_number || null,
        type: event.type,
        profile: event.profile,
        years: event.years || null,
        email: delivery.email,
        sms: delivery.sms,
        errors: delivery.errors,
      })
    }
  }

  return NextResponse.json({ success: true, ...summary })
}
