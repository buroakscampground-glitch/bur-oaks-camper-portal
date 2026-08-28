import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getSiteUrl } from '../../../lib/site-url'

export const runtime = 'nodejs'

const ONE_TIME_KEY = '3ba8a24196084aa72ce9d93d7e5f204645c020accef98a16'
const EMAIL = 'peggybartz@sbcglobal.net'
const MARKER = 'one-time-peggy-password-reset-2026-08-28'

function parseSender(value: string) {
  const trimmed = value.trim()
  const match = trimmed.match(/^(.*?)<([^>]+)>$/)
  return match
    ? { name: match[1].trim().replace(/^"|"$/g, '') || undefined, email: match[2].trim() }
    : { email: trimmed }
}

async function sendResetEmail(resetUrl: string) {
  const from = String(process.env.SENDGRID_FROM || process.env.PORTAL_INVITE_FROM || '').trim()
  const replyTo = String(process.env.SENDGRID_REPLY_TO || 'buroakscampground@gmail.com').trim()
  const subject = 'Reset your Bur Oaks Camper Portal password'
  const text = [
    'Hi Peggy,',
    '',
    'Here is your fresh Bur Oaks Camper Portal password-reset link:',
    resetUrl,
    '',
    'Please use the newest link and create a password with at least 10 characters. This secure link is private and should not be forwarded. If it expires, contact the campground office for another link.',
    '',
    'Bur Oaks Campground',
  ].join('\n')
  const html = `<div style="font-family:Arial,sans-serif;background:#f5f1e8;padding:28px;color:#26382d"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e2dccf;border-radius:18px;overflow:hidden"><div style="padding:24px 28px;background:#214b31;color:#fff"><small style="color:#d8c18b;letter-spacing:.14em;font-weight:700">BUR OAKS CAMPGROUND</small><h1 style="font-family:Georgia,serif;font-weight:500">Reset your portal password</h1></div><div style="padding:28px"><p>Hi Peggy,</p><p>Use the button below to create a new password for your Bur Oaks Camper Portal.</p><a href="${resetUrl}" style="display:inline-block;margin:12px 0;padding:14px 18px;border-radius:12px;background:#2f5b3b;color:#fff;text-decoration:none;font-weight:700">Create My New Password</a><p style="font-size:13px;color:#69766d">Please use the newest link and create a password with at least 10 characters. This secure link is private and should not be forwarded. If it expires, contact the campground office for another link.</p></div></div></div>`

  if (process.env.SENDGRID_API_KEY && from) {
    const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: EMAIL }], subject }],
        from: parseSender(from),
        reply_to: { email: parseSender(replyTo).email },
        content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
      }),
    })
    if (!response.ok) throw new Error((await response.text().catch(() => '')) || `SendGrid error ${response.status}`)
    return 'sendgrid'
  }

  if (process.env.RESEND_API_KEY && from) {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: EMAIL, reply_to: replyTo, subject, text, html }),
    })
    const result = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(result?.message || 'Resend rejected the email.')
    return 'resend'
  }

  throw new Error('The campground email provider is not configured.')
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceKey) return NextResponse.json({ error: 'Production database is not configured.' }, { status: 500 })
  const admin = createClient(url, serviceKey)

  const { data: alreadySent } = await admin
    .from('portal_invite_log')
    .select('id')
    .eq('sent_by', MARKER)
    .eq('delivery_status', 'sent')
    .limit(1)
  if (alreadySent?.length) return NextResponse.json({ success: true, alreadySent: true, email: EMAIL })

  const [{ data: primary }, { data: secondary }] = await Promise.all([
    admin.from('campers').select('id,active').ilike('email', EMAIL),
    admin.from('campers').select('id,active').ilike('secondary_email', EMAIL),
  ])
  const camper = [...(primary || []), ...(secondary || [])].find((row) => row.active !== false)
  if (!camper) return NextResponse.json({ error: 'No active Peggy Bartz camper record was found.' }, { status: 404 })

  const result = await admin.auth.admin.generateLink({
    type: 'recovery',
    email: EMAIL,
    options: { redirectTo: `${getSiteUrl()}/set-password` },
  })
  const tokenHash = result.data?.properties?.hashed_token
  const verificationType = result.data?.properties?.verification_type
  if (result.error || !tokenHash || !verificationType) {
    return NextResponse.json({ error: result.error?.message || 'Unable to create the reset link.' }, { status: 500 })
  }

  const resetUrl = `${getSiteUrl()}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`
  try {
    const provider = await sendResetEmail(resetUrl)
    await admin.from('portal_invite_log').insert({
      camper_id: camper.id,
      email: EMAIL,
      delivery_status: 'sent',
      delivery_provider: provider,
      sent_by: MARKER,
    })
    return NextResponse.json({ success: true, alreadySent: false, email: EMAIL, provider })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to send the reset email.' }, { status: 500 })
  }
}
