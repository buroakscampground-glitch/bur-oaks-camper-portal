import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'

export const runtime = 'nodejs'

type BirthdayProfile = 'primary' | 'secondary'

function chicagoDateParts() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date())

  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0)

  return {
    year: value('year'),
    month: value('month'),
    day: value('day'),
  }
}

function parseBirthday(value: unknown) {
  const match = String(value || '').match(/^\d{4}-(\d{2})-(\d{2})$/)
  if (!match) return null

  return {
    month: Number(match[1]),
    day: Number(match[2]),
  }
}

function displayName(firstName: unknown, lastName: unknown) {
  const first = String(firstName || '').trim()
  const lastInitial = String(lastName || '').trim().charAt(0).toUpperCase()

  return `${first || 'Camper'}${lastInitial ? ` ${lastInitial}.` : ''}`
}

function wishKey(camperId: string, profile: BirthdayProfile) {
  return `${camperId}:${profile}`
}

async function getBirthdayBoard(
  context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>>
) {
  const today = chicagoDateParts()
  const monthName = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    month: 'long',
  }).format(new Date())

  const { data: campers, error: camperError } = await context.admin
    .from('campers')
    .select('id,lot_number,first_name,last_name,second_profile_first_name,second_profile_last_name,birthday,second_profile_birthday,birthday_celebration_opt_in,role')
    .eq('active', true)
    .eq('birthday_celebration_opt_in', true)

  if (camperError) {
    if (/birthday|schema cache|column/i.test(camperError.message)) {
      return { setupRequired: true, monthName, birthdays: [] }
    }
    throw camperError
  }

  const birthdays = (campers || []).filter(isOperationalCamper).flatMap((camper: any) => {
    const profiles: Array<{
      profile: BirthdayProfile
      firstName: unknown
      lastName: unknown
      birthday: unknown
    }> = [
      {
        profile: 'primary',
        firstName: camper.first_name,
        lastName: camper.last_name,
        birthday: camper.birthday,
      },
      {
        profile: 'secondary',
        firstName: camper.second_profile_first_name,
        lastName: camper.second_profile_last_name,
        birthday: camper.second_profile_birthday,
      },
    ]

    return profiles.flatMap((profile) => {
      const date = parseBirthday(profile.birthday)
      if (!date || date.month !== today.month || !String(profile.firstName || '').trim()) return []

      return [{
        recipientCamperId: String(camper.id),
        profile: profile.profile,
        name: displayName(profile.firstName, profile.lastName),
        lotNumber: camper.lot_number ? String(camper.lot_number) : null,
        day: date.day,
        isToday: date.day === today.day,
        isMine: String(camper.id) === String(context.camper.id),
      }]
    })
  }).sort((a: any, b: any) => a.day - b.day || a.name.localeCompare(b.name))

  if (!birthdays.length) {
    return { setupRequired: false, monthName, birthdays: [] }
  }

  const recipientIds = Array.from(new Set(birthdays.map((birthday: any) => birthday.recipientCamperId)))
  const { data: wishes, error: wishesError } = await context.admin
    .from('birthday_wishes')
    .select('sender_camper_id,recipient_camper_id,recipient_profile')
    .eq('celebration_year', today.year)
    .in('recipient_camper_id', recipientIds)

  if (wishesError && !/birthday_wishes|schema cache|relation/i.test(wishesError.message)) {
    throw wishesError
  }

  const safeWishes = wishes || []
  const counts = new Map<string, number>()
  const sentByMe = new Set<string>()

  safeWishes.forEach((wish: any) => {
    const key = wishKey(String(wish.recipient_camper_id), wish.recipient_profile)
    counts.set(key, (counts.get(key) || 0) + 1)
    if (String(wish.sender_camper_id) === String(context.camper.id)) sentByMe.add(key)
  })

  return {
    setupRequired: Boolean(wishesError),
    monthName,
    birthdays: birthdays.map((birthday: any) => {
      const key = wishKey(birthday.recipientCamperId, birthday.profile)
      return {
        ...birthday,
        wishCount: counts.get(key) || 0,
        sentByMe: sentByMe.has(key),
      }
    }),
  }
}

async function getOfficeGreetings(
  context: NonNullable<Awaited<ReturnType<typeof getAuthenticatedContext>>>
) {
  const cutoff = new Date(Date.now() - 8 * 24 * 60 * 60_000).toISOString()
  const { data, error } = await context.admin
    .from('camper_celebration_deliveries')
    .select('id,recipient_profile,message,sent_at,celebration_year')
    .eq('camper_id', context.camper.id)
    .eq('celebration_type', 'birthday')
    .eq('channel', 'portal')
    .eq('status', 'sent')
    .gte('sent_at', cutoff)
    .order('sent_at', { ascending: false })

  if (error) {
    if (/camper_celebration_deliveries|schema cache|relation|channel/i.test(error.message)) return []
    throw error
  }

  return (data || []).map((greeting: any) => ({
    id: String(greeting.id),
    profile: greeting.recipient_profile,
    message: String(greeting.message || ''),
    sentAt: greeting.sent_at,
    celebrationYear: greeting.celebration_year,
  }))
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  try {
    const [board, officeGreetings] = await Promise.all([
      getBirthdayBoard(context),
      getOfficeGreetings(context),
    ])
    return NextResponse.json({ success: true, ...board, officeGreetings })
  } catch (error) {
    console.error('Birthday board load failed:', error)
    return NextResponse.json({ error: 'Unable to load campground birthdays.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'birthday-wishes', 20, 10 * 60_000)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many birthday requests. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } })

  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const recipientCamperId = String(body.recipientCamperId || '')
  const profile = String(body.profile || '') as BirthdayProfile
  const today = chicagoDateParts()

  if (!recipientCamperId || !['primary', 'secondary'].includes(profile)) {
    return NextResponse.json({ error: 'Choose a birthday camper first.' }, { status: 400 })
  }

  if (recipientCamperId === String(context.camper.id)) {
    return NextResponse.json({ error: 'Your neighbors will handle the birthday wishes for your profile.' }, { status: 400 })
  }

  try {
    const birthdayColumn = profile === 'secondary' ? 'second_profile_birthday' : 'birthday'
    const { data: recipient, error: recipientError } = await context.admin
      .from('campers')
      .select('id,active,birthday_celebration_opt_in,birthday,second_profile_birthday,lot_number,role')
      .eq('id', recipientCamperId)
      .eq('active', true)
      .eq('birthday_celebration_opt_in', true)
      .maybeSingle()

    if (recipientError) throw recipientError

    const birthday = parseBirthday(recipient?.[birthdayColumn])
    if (!recipient || !isOperationalCamper(recipient) || !birthday || birthday.month !== today.month) {
      return NextResponse.json({ error: 'That camper is not on this month’s birthday board.' }, { status: 400 })
    }

    const { error: wishError } = await context.admin
      .from('birthday_wishes')
      .insert({
        sender_camper_id: context.camper.id,
        recipient_camper_id: recipientCamperId,
        recipient_profile: profile,
        celebration_year: today.year,
      })

    if (wishError && wishError.code !== '23505') throw wishError

    return NextResponse.json({
      success: true,
      alreadySent: wishError?.code === '23505',
      board: await getBirthdayBoard(context),
    })
  } catch (error) {
    console.error('Birthday wish failed:', error)
    return NextResponse.json({ error: 'Unable to send the birthday wish right now.' }, { status: 500 })
  }
}
