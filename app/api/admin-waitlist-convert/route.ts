import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { getSiteUrl } from '../../../lib/site-url'
import { generatePortalSetupUrl } from '../../../lib/portal-setup-link'
import { portalInviteEmailConfigured, sendPortalInviteEmail } from '../../../lib/portal-invite-email'
import { isOperationalCamper } from '../../../lib/camper-records'
import {
  canConvertWaitlistStatus,
  cleanWaitlistConversionValue,
  NEW_CAMPER_ANNUAL_RENT,
  NEW_CAMPER_ASSOCIATION_FEE,
} from '../../../lib/waitlist-conversion'

export const runtime = 'nodejs'

function cleanEmail(value: unknown) {
  return cleanWaitlistConversionValue(value, 160).toLowerCase()
}

function siteKey(value: unknown) {
  return cleanWaitlistConversionValue(value, 40).toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const waitlistId = cleanWaitlistConversionValue(body.waitlistId, 80)
  const lotNumber = cleanWaitlistConversionValue(body.lotNumber, 40)
  const firstName = cleanWaitlistConversionValue(body.firstName, 80)
  const lastName = cleanWaitlistConversionValue(body.lastName, 80)
  const phone = cleanWaitlistConversionValue(body.phone, 40)
  const email = cleanEmail(body.email)
  const sendWelcome = body.sendWelcome === true

  if (!waitlistId || !lotNumber || !firstName || !lastName) {
    return NextResponse.json({ error: 'Choose a site and confirm the camper’s first and last name.' }, { status: 400 })
  }
  if (!email || !/^\S+@\S+\.\S+$/.test(email)) {
    return NextResponse.json({ error: 'Add a valid email so the camper can receive portal access.' }, { status: 400 })
  }

  const { data: waitlistEntry, error: waitlistError } = await context.admin
    .from('waitlist')
    .select('*')
    .eq('id', waitlistId)
    .maybeSingle()
  if (waitlistError) return NextResponse.json({ error: waitlistError.message }, { status: 500 })
  if (!waitlistEntry) return NextResponse.json({ error: 'That waitlist entry no longer exists.' }, { status: 404 })
  if (!canConvertWaitlistStatus(waitlistEntry.status)) {
    return NextResponse.json({ error: `This entry is already marked ${waitlistEntry.status || 'unavailable'} and cannot be converted.` }, { status: 409 })
  }

  const { data: duplicateCamper, error: duplicateError } = await context.admin
    .from('campers')
    .select('id,first_name,last_name,lot_number,active')
    .eq('email', email)
    .maybeSingle()
  if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 })
  if (duplicateCamper) {
    return NextResponse.json({
      error: `${duplicateCamper.first_name || firstName} ${duplicateCamper.last_name || lastName} already has a camper record${duplicateCamper.lot_number ? ` at Site ${duplicateCamper.lot_number}` : ''}.`,
      camperId: duplicateCamper.id,
    }, { status: 409 })
  }

  const [{ data: lotRows, error: lotError }, { data: activeCampers, error: camperError }] = await Promise.all([
    context.admin.from('lots').select('id,lot_number,camper_id,lot_rent_amount').eq('lot_number', lotNumber).limit(2),
    context.admin.from('campers').select('id,lot_number,active,role').eq('active', true),
  ])
  if (lotError || camperError) return NextResponse.json({ error: lotError?.message || camperError?.message }, { status: 500 })

  const occupied = (activeCampers || []).some((camper: any) =>
    isOperationalCamper(camper) && siteKey(camper.lot_number) === siteKey(lotNumber)
  )
  if (occupied) {
    return NextResponse.json({ error: `Site ${lotNumber} is already assigned to an active camper. Refresh the waitlist and choose another site.` }, { status: 409 })
  }

  const lot = lotRows?.[0] || null
  const officeNotes = [
    `Converted from the waitlist on ${new Date().toLocaleDateString('en-US', { timeZone: 'America/Chicago' })}.`,
    waitlistEntry.desired_site ? `Original site preference: ${waitlistEntry.desired_site}` : '',
    waitlistEntry.notes ? `Waitlist notes:\n${waitlistEntry.notes}` : '',
    `New camper terms: $${NEW_CAMPER_ANNUAL_RENT.toLocaleString('en-US')} annual rent in 2 payments; $${NEW_CAMPER_ASSOCIATION_FEE} association fee due at signing.`,
  ].filter(Boolean).join('\n\n')

  const { data: camper, error: insertError } = await context.admin
    .from('campers')
    .insert({
      lot_number: lotNumber,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || null,
      role: 'camper',
      active: true,
      sms_opt_in: false,
      event_reminders_opt_in: false,
      directory_opt_in: false,
      rent_payment_plan: 'semiannual',
      camper_since_date: new Date().toISOString().slice(0, 10),
      office_notes: officeNotes,
    })
    .select('id,first_name,last_name,email,lot_number')
    .single()
  if (insertError || !camper) return NextResponse.json({ error: insertError?.message || 'The camper record could not be created.' }, { status: 500 })

  let createdLotId = ''
  const priorLotCamperId = lot?.camper_id || null
  const priorLotRentAmount = lot?.lot_rent_amount ?? null
  const lotAssignment = lot
    ? await context.admin.from('lots').update({ camper_id: camper.id, lot_rent_amount: NEW_CAMPER_ANNUAL_RENT }).eq('id', lot.id)
    : await context.admin.from('lots').insert({ lot_number: lotNumber, camper_id: camper.id, lot_rent_amount: NEW_CAMPER_ANNUAL_RENT }).select('id').single()

  if (!lot && lotAssignment.data?.id) createdLotId = String(lotAssignment.data.id)
  if (lotAssignment.error) {
    await context.admin.from('campers').delete().eq('id', camper.id)
    return NextResponse.json({ error: `The camper was not created because Site ${lotNumber} could not be assigned.` }, { status: 500 })
  }

  const { error: convertedError } = await context.admin
    .from('waitlist')
    .update({ status: 'Converted', removed_at: null })
    .eq('id', waitlistId)
  if (convertedError) {
    if (createdLotId) await context.admin.from('lots').delete().eq('id', createdLotId)
    else if (lot) await context.admin.from('lots').update({ camper_id: priorLotCamperId, lot_rent_amount: priorLotRentAmount }).eq('id', lot.id)
    await context.admin.from('campers').delete().eq('id', camper.id)
    return NextResponse.json({ error: 'Nothing was converted because the waitlist record could not be updated.' }, { status: 500 })
  }

  let welcomeDelivery: 'not_requested' | 'sent' | 'manual' = 'not_requested'
  let setupUrl = ''
  let warning = ''

  if (sendWelcome) {
    try {
      setupUrl = await generatePortalSetupUrl(context.admin, email, getSiteUrl())
      if (!portalInviteEmailConfigured()) throw new Error('The welcome email sender is not configured.')
      const emailResult = await sendPortalInviteEmail({
        to: email,
        camperName: `${firstName} ${lastName}`,
        setupUrl,
        welcomeSite: lotNumber,
      })
      await context.admin.from('portal_invite_log').insert({
        camper_id: camper.id,
        email,
        delivery_status: 'sent',
        delivery_provider: (emailResult as any)?.provider || 'email-service',
        sent_by: context.user.email,
      })
      welcomeDelivery = 'sent'
      setupUrl = ''
    } catch (error) {
      welcomeDelivery = 'manual'
      warning = error instanceof Error
        ? `The camper was created, but the welcome email did not send: ${error.message}`
        : 'The camper was created, but the welcome email did not send.'
      await context.admin.from('portal_invite_log').insert({
        camper_id: camper.id,
        email,
        delivery_status: 'manual',
        delivery_provider: 'waitlist-conversion-fallback',
        sent_by: context.user.email,
      })
    }
  }

  return NextResponse.json({
    success: true,
    camperId: camper.id,
    lotNumber,
    camperName: `${firstName} ${lastName}`,
    welcomeDelivery,
    setupUrl: welcomeDelivery === 'manual' ? setupUrl : '',
    warning,
    annualRent: NEW_CAMPER_ANNUAL_RENT,
    associationFee: NEW_CAMPER_ASSOCIATION_FEE,
  })
}
