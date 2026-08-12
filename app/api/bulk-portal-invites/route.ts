import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { isOperationalCamper } from '../../../lib/camper-records'
import { checkRateLimit } from '../../../lib/rate-limit'
import {
  portalInviteEmailConfigured,
  sendPortalInviteEmail,
} from '../../../lib/portal-invite-email'
import { getSiteUrl } from '../../../lib/site-url'

type Recipient = {
  camperId: string
  email: string
  camperName: string
  lotNumber: string
}

function cleanEmail(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

function isRealEmail(email: string) {
  return /^\S+@\S+\.\S+$/.test(email) && !email.endsWith('@no-email.buroaks.local')
}

async function generateSetupUrl(context: any, email: string, origin: string) {
  let linkResult = await context.admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${origin}/set-password` },
  })

  if (linkResult.error) {
    linkResult = await context.admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/set-password` },
    })
  }

  const properties = linkResult.data?.properties
  const tokenHash = properties?.hashed_token
  const verificationType = properties?.verification_type

  if (linkResult.error || !tokenHash || !verificationType) {
    throw new Error(linkResult.error?.message || 'Unable to create setup link.')
  }

  return `${origin}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'bulk-camper-invites', 12, 60 * 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Bulk setup links were clicked too many times. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  try {
    const context = await getAuthenticatedContext(request)

    if (!context || String(context.camper.role).toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    if (!portalInviteEmailConfigured()) {
      return NextResponse.json(
        { error: 'Bulk email is not connected yet. Add SENDGRID_API_KEY in Vercel first.' },
        { status: 400 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const batchSize = Math.min(Math.max(Number(body.batchSize) || 50, 1), 50)
    const origin = getSiteUrl()

    const [{ data: campers, error: camperError }, { data: logs }] = await Promise.all([
      context.admin
        .from('campers')
        .select('id,lot_number,first_name,last_name,email,secondary_email,active,role')
        .eq('active', true)
        .order('lot_number', { ascending: true }),
      context.admin
        .from('portal_invite_log')
        .select('email,created_at,delivery_status')
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
    ])

    if (camperError) {
      return NextResponse.json({ error: camperError.message }, { status: 500 })
    }

    const { data: users } = await context.admin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    })

    const acceptedEmails = new Set<string>()
    for (const user of users?.users || []) {
      if (!user.email) continue
      const completedSetup = user.user_metadata?.portal_setup_complete === true
      const establishedUser = Boolean(user.email_confirmed_at || user.last_sign_in_at)
      if (completedSetup || establishedUser) acceptedEmails.add(cleanEmail(user.email))
    }

    const recentlySentEmails = new Set(
      (logs || [])
        .filter((log: any) => log.delivery_status === 'sent')
        .map((log: any) => cleanEmail(log.email))
    )

    const recipients: Recipient[] = []
    const seen = new Set<string>()

    for (const camper of (campers || []).filter(isOperationalCamper)) {
      const camperName = `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper'
      for (const email of [cleanEmail(camper.email), cleanEmail(camper.secondary_email)]) {
        if (!isRealEmail(email)) continue
        if (seen.has(email)) continue
        seen.add(email)
        if (acceptedEmails.has(email)) continue
        if (recentlySentEmails.has(email)) continue
        recipients.push({
          camperId: camper.id,
          email,
          camperName,
          lotNumber: String(camper.lot_number || ''),
        })
      }
    }

    const selected = recipients.slice(0, batchSize)
    const sent: Array<{ email: string; camperName: string; lotNumber: string }> = []
    const failed: Array<{ email: string; error: string }> = []

    for (const recipient of selected) {
      try {
        const setupUrl = await generateSetupUrl(context, recipient.email, origin)
        const emailResult = await sendPortalInviteEmail({
          to: recipient.email,
          camperName: recipient.camperName,
          setupUrl,
        })

        await context.admin.from('portal_invite_log').insert({
          camper_id: recipient.camperId,
          email: recipient.email,
          delivery_status: 'sent',
          delivery_provider: (emailResult as any)?.provider || 'email-service',
          sent_by: context.user.email,
        })

        sent.push({
          email: recipient.email,
          camperName: recipient.camperName,
          lotNumber: recipient.lotNumber,
        })
      } catch (error: any) {
        await context.admin.from('portal_invite_log').insert({
          camper_id: recipient.camperId,
          email: recipient.email,
          delivery_status: 'failed',
          delivery_provider: 'email-service',
          error_message: error?.message || 'Unknown email error',
          sent_by: context.user.email,
        })
        failed.push({ email: recipient.email, error: error?.message || 'Unable to send setup link.' })
      }
    }

    return NextResponse.json({
      success: true,
      sent,
      failed,
      remaining: Math.max(recipients.length - selected.length, 0),
      skippedAccepted: acceptedEmails.size,
      skippedRecentlySent: recentlySentEmails.size,
    })
  } catch (error) {
    console.error('Unable to bulk send portal setup links:', error)
    return NextResponse.json(
      { error: 'Unable to send bulk portal setup links.' },
      { status: 500 }
    )
  }
}
