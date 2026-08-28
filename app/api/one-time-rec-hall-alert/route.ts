import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { consentedCamperSmsPhones } from '../../../lib/camper-sms'
import { isOperationalCamper } from '../../../lib/camper-records'
import { portalInviteEmailConfigured, sendPortalInviteEmail } from '../../../lib/portal-invite-email'
import { camperTextWithLink } from '../../../lib/portal-sms-links'
import { getSiteUrl } from '../../../lib/site-url'
import { isTwilioConfigured, sendTwilioSms } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'
export const maxDuration = 300

const ONE_TIME_KEY = '5eb87ac566fa2099e47e11bb7ada6803c43552839bdeb698'
const TEXT_MARKER = 'Rec Hall schedule · 2026-08-28'
const INVITE_MARKER = 'one-time-jeff-frost-2026-08-28'
const MESSAGE = 'The Rec Hall will be closed Friday. There will be no Saturday breakfast this week, but we will be open for dinner Saturday evening. Thank you!'

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function normalizeLot(value: unknown) {
  return String(value || '').trim().toUpperCase()
}

async function generateSetupUrl(admin: any, email: string) {
  const redirectTo = `${getSiteUrl()}/set-password`
  let result = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo } })
  if (result.error) result = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
  const tokenHash = result.data?.properties?.hashed_token
  const verificationType = result.data?.properties?.verification_type
  if (result.error || !tokenHash || !verificationType) throw new Error(result.error?.message || 'Unable to create setup link.')
  return `${getSiteUrl()}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey || !isTwilioConfigured() || !portalInviteEmailConfigured()) {
    return NextResponse.json({ error: 'A production service is not configured.' }, { status: 500 })
  }

  const admin = createClient(url, serviceKey)
  const { data: existingTexts } = await admin
    .from('text_reminders')
    .select('id')
    .eq('reminder_type', TEXT_MARKER)
    .eq('status', 'sent')
    .limit(1)

  let sentCount = 0
  let failedCount = 0
  let optedInSiteCount = 0
  const sentPhones = new Set<string>()

  if (!(existingTexts || []).length) {
    const { data: campers, error } = await admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
      .eq('active', true)
      .eq('sms_opt_in', true)
      .order('lot_number', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const targets: Array<{ camper: any; phones: string[] }> = []
    const optedInSites = new Set<string>()
    for (const camper of (campers || []).filter(isOperationalCamper)) {
      const phones = await consentedCamperSmsPhones(admin, camper)
      if (!phones.length) continue
      targets.push({ camper, phones })
      optedInSites.add(normalizeLot(camper.lot_number))
    }
    optedInSiteCount = optedInSites.size

    const finalMessage = camperTextWithLink({ message: MESSAGE, path: '/portal' })
    for (const { camper, phones } of targets) {
      for (const phone of phones) {
        if (sentPhones.has(phone)) continue
        sentPhones.add(phone)
        const result = await sendTwilioSms({ to: phone, body: finalMessage })
        await admin.from('text_reminders').insert({
          camper_id: camper.id,
          invoice_id: null,
          reminder_type: TEXT_MARKER,
          message: finalMessage,
          sent_at: new Date().toISOString(),
          status: result.sent ? 'sent' : 'failed',
          recipient_phone: phone,
          provider: 'twilio',
          provider_message_id: result.sent ? result.providerMessageId : null,
          error_message: result.sent ? null : result.error,
          sent_by: 'authorized remote admin action',
        })
        if (result.sent) sentCount += 1
        else failedCount += 1
      }
    }
  } else {
    const { data: optedCampers } = await admin
      .from('campers')
      .select('id,lot_number,phone,alternate_phone,second_profile_phone,sms_opt_in,active,role')
      .eq('active', true)
      .eq('sms_opt_in', true)
    const optedInSites = new Set<string>()
    for (const camper of (optedCampers || []).filter(isOperationalCamper)) {
      if ((await consentedCamperSmsPhones(admin, camper)).length) optedInSites.add(normalizeLot(camper.lot_number))
    }
    optedInSiteCount = optedInSites.size
  }

  const { data: existingInvite } = await admin
    .from('portal_invite_log')
    .select('id,email')
    .eq('sent_by', INVITE_MARKER)
    .eq('delivery_status', 'sent')
    .limit(1)

  let jeffInviteSent = Boolean(existingInvite?.length)
  let jeffEmail = cleanEmail(existingInvite?.[0]?.email)
  if (!jeffInviteSent) {
    const { data: matches, error } = await admin
      .from('campers')
      .select('id,lot_number,first_name,last_name,email,active')
      .eq('active', true)
      .ilike('first_name', 'Jeff')
      .ilike('last_name', 'Frost')
      .limit(5)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const jeff = (matches || []).find((camper: any) => normalizeLot(camper.lot_number) === '51') || matches?.[0]
    jeffEmail = cleanEmail(jeff?.email)
    if (!jeff?.id || !/^\S+@\S+\.\S+$/.test(jeffEmail)) {
      return NextResponse.json({ error: 'Jeff Frost does not have a valid active email address.' }, { status: 400 })
    }
    try {
      const setupUrl = await generateSetupUrl(admin, jeffEmail)
      await sendPortalInviteEmail({
        to: jeffEmail,
        camperName: `${jeff.first_name || ''} ${jeff.last_name || ''}`.trim() || 'Jeff',
        setupUrl,
      })
      await admin.from('portal_invite_log').insert({
        camper_id: jeff.id,
        email: jeffEmail,
        delivery_status: 'sent',
        delivery_provider: process.env.SENDGRID_API_KEY ? 'sendgrid' : 'resend',
        sent_by: INVITE_MARKER,
      })
      jeffInviteSent = true
    } catch (error: any) {
      return NextResponse.json({ error: error?.message || 'Unable to send Jeff Frost’s setup email.' }, { status: 500 })
    }
  }

  return NextResponse.json({
    success: true,
    announcementAlreadySent: Boolean(existingTexts?.length),
    optedInSiteCount,
    sentCount,
    failedCount,
    jeffInviteSent,
    jeffEmail,
  })
}
