import { NextResponse } from 'next/server'
import { birthdayOccurrence, birthdayWindowLabel } from '../../../lib/admin-birthdays'
import { centralDate, sendCamperCelebration, type CelebrationProfile } from '../../../lib/camper-celebrations'
import { isOperationalCamper } from '../../../lib/camper-records'
import { checkRateLimit } from '../../../lib/rate-limit'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

type BirthdayProfile = Exclude<CelebrationProfile, 'household'>

function isAdmin(context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>>) {
  return String(context.camper.role || '').trim().toLowerCase() === 'admin'
}

function profileName(camper: any, profile: BirthdayProfile) {
  if (profile === 'secondary') {
    return `${camper.second_profile_first_name || ''} ${camper.second_profile_last_name || ''}`.trim()
  }
  return `${camper.first_name || ''} ${camper.last_name || ''}`.trim()
}

function deliveryKey(camperId: unknown, profile: unknown, year: unknown) {
  return `${camperId}:${profile}:${year}`
}

async function loadBirthdayOffice(context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>>) {
  const today = centralDate()
  const [{ data: campers, error: camperError }, { data: blockedRenewals, error: renewalError }] = await Promise.all([
    context.admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,second_profile_first_name,second_profile_last_name,birthday,second_profile_birthday,birthday_celebration_opt_in,celebration_messages_opt_in,email,secondary_email,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
      .eq('active', true),
    context.admin
      .from('season_renewals')
      .select('camper_id,status')
      .in('status', ['Camper Leaving', 'Campground Not Renewing']),
  ])

  if (camperError || renewalError) throw camperError || renewalError

  const blockedIds = new Set((blockedRenewals || []).map((row: any) => String(row.camper_id)))
  const birthdays = (campers || [])
    .filter((camper: any) => isOperationalCamper(camper) && !blockedIds.has(String(camper.id)))
    .flatMap((camper: any) => ([
      { profile: 'primary' as const, birthday: camper.birthday },
      { profile: 'secondary' as const, birthday: camper.second_profile_birthday },
    ]).flatMap(({ profile, birthday }) => {
      const occurrence = birthdayOccurrence(birthday, today)
      const name = profileName(camper, profile)
      if (!occurrence || !name) return []

      return [{
        camperId: String(camper.id),
        profile,
        name,
        lotNumber: camper.lot_number ? String(camper.lot_number) : null,
        birthdayDate: occurrence.iso,
        eventYear: occurrence.year,
        day: occurrence.day,
        month: occurrence.month,
        offsetDays: occurrence.offsetDays,
        window: occurrence.window,
        timingLabel: birthdayWindowLabel(occurrence.offsetDays),
        boardOptIn: Boolean(camper.birthday_celebration_opt_in),
        greetingOptIn: Boolean(camper.celebration_messages_opt_in),
      }]
    }))

  const camperIds = Array.from(new Set(birthdays.map((birthday: any) => birthday.camperId)))
  const eventYears = Array.from(new Set(birthdays.map((birthday: any) => birthday.eventYear)))
  let deliveries: any[] = []

  if (camperIds.length && eventYears.length) {
    const { data, error } = await context.admin
      .from('camper_celebration_deliveries')
      .select('camper_id,recipient_profile,celebration_year,channel,status,error_message,sent_at')
      .eq('celebration_type', 'birthday')
      .in('camper_id', camperIds)
      .in('celebration_year', eventYears)

    if (error && !/camper_celebration_deliveries|schema cache|relation/i.test(error.message)) throw error
    deliveries = data || []
  }

  const deliveryMap = new Map<string, any[]>()
  deliveries.forEach((delivery: any) => {
    const key = deliveryKey(delivery.camper_id, delivery.recipient_profile, delivery.celebration_year)
    deliveryMap.set(key, [...(deliveryMap.get(key) || []), delivery])
  })

  const enriched = birthdays.map((birthday: any) => {
    const birthdayDeliveries = deliveryMap.get(deliveryKey(birthday.camperId, birthday.profile, birthday.eventYear)) || []
    const sentChannels = birthdayDeliveries.filter((delivery) => delivery.status === 'sent').map((delivery) => delivery.channel)
    const failedChannels = birthdayDeliveries.filter((delivery) => delivery.status === 'failed').map((delivery) => delivery.channel)
    const portalPosted = sentChannels.includes('portal')
    return {
      ...birthday,
      sentChannels,
      failedChannels,
      lastSentAt: birthdayDeliveries
        .map((delivery) => delivery.sent_at)
        .filter(Boolean)
        .sort()
        .at(-1) || null,
      celebrated: sentChannels.length > 0,
      portalPosted,
      needsGreeting: birthday.offsetDays <= 0 && !portalPosted,
      canSend: birthday.offsetDays <= 0,
    }
  }).sort((a: any, b: any) => a.offsetDays - b.offsetDays || a.name.localeCompare(b.name))

  return {
    today: today.iso,
    birthdays: enriched,
    counts: {
      missed: enriched.filter((birthday: any) => birthday.window === 'missed').length,
      today: enriched.filter((birthday: any) => birthday.window === 'today').length,
      upcoming: enriched.filter((birthday: any) => birthday.window === 'upcoming').length,
      needsGreeting: enriched.filter((birthday: any) => birthday.needsGreeting).length,
    },
  }
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || !isAdmin(context)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  try {
    return NextResponse.json({ success: true, ...(await loadBirthdayOffice(context)) })
  } catch (error) {
    console.error('Admin birthday office load failed:', error)
    return NextResponse.json({ error: 'Unable to load the birthday office.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'admin-birthday-greeting', 20, 10 * 60_000)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many greeting requests. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } })

  const context = await getAuthenticatedContext(request)
  if (!context || !isAdmin(context)) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const camperId = String(body.camperId || '')
  const profile = String(body.profile || '') as BirthdayProfile
  if (!camperId || !['primary', 'secondary'].includes(profile)) {
    return NextResponse.json({ error: 'Choose a camper birthday first.' }, { status: 400 })
  }

  try {
    const { data: camper, error } = await context.admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,second_profile_first_name,second_profile_last_name,birthday,second_profile_birthday,celebration_messages_opt_in,email,secondary_email,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
      .eq('id', camperId)
      .eq('active', true)
      .maybeSingle()

    if (error) throw error
    if (!camper || !isOperationalCamper(camper)) return NextResponse.json({ error: 'Camper not found.' }, { status: 404 })
    const today = centralDate()
    const birthdayValue = profile === 'secondary' ? camper.second_profile_birthday : camper.birthday
    const occurrence = birthdayOccurrence(birthdayValue, today, { pastDays: 30, futureDays: 0 })
    const name = profileName(camper, profile)
    if (!occurrence || !name) {
      return NextResponse.json({ error: 'This birthday is not today or within the last 30 days.' }, { status: 400 })
    }

    const delivery = await sendCamperCelebration({
      client: context.admin,
      camper,
      event: { type: 'birthday', profile, name },
      today: { ...today, year: occurrence.year },
    })

    return NextResponse.json({
      success: true,
      delivery,
      office: await loadBirthdayOffice(context),
    })
  } catch (error) {
    console.error('Admin birthday greeting failed:', error)
    return NextResponse.json({ error: 'Unable to send the birthday greeting.' }, { status: 500 })
  }
}
