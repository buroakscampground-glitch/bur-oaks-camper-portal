import { NextResponse } from 'next/server'
import { createAdminNotification } from '../../../lib/admin-notifications'
import { sendAdminAlertEmail } from '../../../lib/admin-alert-email'
import { sendCamperMessageEmail } from '../../../lib/camper-message-email'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { getSiteUrl } from '../../../lib/site-url'
import { checkRateLimit } from '../../../lib/rate-limit'
import { isOperationalCamper } from '../../../lib/camper-records'
import { camperTextWithLink } from '../../../lib/portal-sms-links'
import { formatSmsPhone, isTwilioConfigured, sendTwilioSms } from '../../../lib/twilio-sms'

export const runtime = 'nodejs'

function camperName(camper: any) {
  return `${camper?.first_name || ''} ${camper?.last_name || ''}`.trim() || 'Camper'
}

function camperEmails(camper: any) {
  return [camper?.email, camper?.secondary_email]
    .map((email) => String(email || '').trim())
    .filter(Boolean)
    .filter((email, index, all) => all.findIndex((item) => item.toLowerCase() === email.toLowerCase()) === index)
}

async function sendCamperMessageText(admin: any, camper: any, sentBy: string) {
  if (!camper.sms_opt_in) {
    return { status: 'skipped' as const, reason: 'Camper has not opted into text alerts.' }
  }

  if (!isTwilioConfigured()) {
    return { status: 'skipped' as const, reason: 'Twilio is not connected.' }
  }

  const phone = formatSmsPhone(camper.phone)
  if (!phone) {
    return { status: 'skipped' as const, reason: 'Camper does not have a valid mobile number.' }
  }

  const message = camperTextWithLink({
    message: 'You have a new private message from the Bur Oaks office.',
    path: '/messages',
    linkLabel: 'Click here to read and reply',
  })
  const result = await sendTwilioSms({ to: phone, body: message })

  await admin.from('text_reminders').insert({
    camper_id: camper.id,
    invoice_id: null,
    reminder_type: 'Office Message',
    message,
    sent_at: new Date().toISOString(),
    status: result.sent ? 'sent' : 'failed',
    recipient_phone: phone,
    provider: 'twilio',
    provider_message_id: result.sent ? result.providerMessageId : null,
    error_message: result.sent ? null : result.error,
    sent_by: sentBy,
  })

  return result.sent
    ? { status: 'sent' as const, providerMessageId: result.providerMessageId }
    : { status: 'failed' as const, reason: result.error }
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const role = String(context.camper.role || '').toLowerCase()
  const isAdmin = role === 'admin'
  const mode = url.searchParams.get('mode')

  if (isAdmin && mode === 'conversations') {
    const [campersResult, messagesResult] = await Promise.all([
      context.admin
        .from('campers')
        .select('id,first_name,last_name,lot_number,email,secondary_email,active,role')
        .eq('active', true)
        .order('lot_number', { ascending: true }),
      context.admin
        .from('office_messages')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500),
    ])

    if (campersResult.error) return NextResponse.json({ error: campersResult.error.message }, { status: 500 })
    if (messagesResult.error) return NextResponse.json({ error: messagesResult.error.message }, { status: 500 })

    const messages = messagesResult.data || []
    const conversations = (campersResult.data || [])
      .filter(isOperationalCamper)
      .map((camper: any) => {
      const thread = messages.filter((message: any) => String(message.camper_id) === String(camper.id))
      const lastMessage = thread[0] || null
      const unreadCount = thread.filter((message: any) => message.sender_role === 'camper' && !message.read_by_admin_at).length

      return {
        camper,
        lastMessage,
        unreadCount,
        messageCount: thread.length,
      }
    })
      .sort((left: any, right: any) => {
        const unreadDifference = Number(right.unreadCount || 0) - Number(left.unreadCount || 0)
        if (unreadDifference !== 0) return unreadDifference

        const leftTime = left.lastMessage?.created_at ? new Date(left.lastMessage.created_at).getTime() : 0
        const rightTime = right.lastMessage?.created_at ? new Date(right.lastMessage.created_at).getTime() : 0
        if (rightTime !== leftTime) return rightTime - leftTime

        return String(left.camper?.lot_number || '').localeCompare(
          String(right.camper?.lot_number || ''),
          undefined,
          { numeric: true, sensitivity: 'base' }
        )
      })

    return NextResponse.json({ success: true, conversations })
  }

  const camperId = isAdmin
    ? url.searchParams.get('camperId')
    : context.camper.id

  if (!camperId) {
    return NextResponse.json({ error: 'Choose a camper conversation first.' }, { status: 400 })
  }

  let messageQuery = context.admin
    .from('office_messages')
    .select('*')
    .eq('camper_id', camperId)
    .order('created_at', { ascending: true })

  if (!isAdmin) {
    messageQuery = messageQuery.is('camper_archived_at', null)
  }

  const { data: messages, error } = await messageQuery

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (isAdmin) {
    await context.admin
      .from('office_messages')
      .update({ read_by_admin_at: new Date().toISOString() })
      .eq('camper_id', camperId)
      .eq('sender_role', 'camper')
      .is('read_by_admin_at', null)

    await context.admin
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('type', 'direct_message')
      .eq('camper_id', camperId)
      .is('read_at', null)
  } else {
    await context.admin
      .from('office_messages')
      .update({ read_by_camper_at: new Date().toISOString() })
      .eq('camper_id', context.camper.id)
      .eq('sender_role', 'admin')
      .is('read_by_camper_at', null)
  }

  return NextResponse.json({ success: true, messages: messages || [] })
}

export async function DELETE(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const role = String(context.camper.role || '').toLowerCase()
  const isAdmin = role === 'admin'

  if (isAdmin) {
    return NextResponse.json({ error: 'Admins keep the office message history.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const messageIds = Array.isArray(body.messageIds)
    ? body.messageIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
    : []
  const archiveAll = body.archiveAll === true

  if (!archiveAll && messageIds.length === 0) {
    return NextResponse.json({ error: 'Choose at least one message to clear.' }, { status: 400 })
  }

  let query = context.admin
    .from('office_messages')
    .update({
      camper_archived_at: new Date().toISOString(),
      read_by_camper_at: new Date().toISOString(),
    })
    .eq('camper_id', context.camper.id)
    .is('camper_archived_at', null)

  if (!archiveAll) {
    query = query.in('id', Array.from(new Set(messageIds)).slice(0, 100))
  }

  const { error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'office-messages', 30, 10 * 60_000)
  if (!rateLimit.allowed) return NextResponse.json({ error: 'Too many messages. Please wait and try again.' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } })

  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const text = String(body.message || '').trim().slice(0, 2000)
  const role = String(context.camper.role || '').toLowerCase()
  const isAdmin = role === 'admin'

  if (!text) {
    return NextResponse.json({ error: 'Type a message first.' }, { status: 400 })
  }

  const requestedCamperIds = Array.isArray(body.camperIds)
    ? body.camperIds.map((id: unknown) => String(id || '').trim()).filter(Boolean)
    : []
  const sendToAll = body.sendToAll === true
  const targetCamperId = isAdmin ? String(body.camperId || '') : String(context.camper.id)

  if (isAdmin && (sendToAll || requestedCamperIds.length > 0)) {
    let query = context.admin
      .from('campers')
      .select('id,first_name,last_name,lot_number,email,secondary_email,phone,sms_opt_in,active,role')
      .eq('active', true)
      .order('lot_number', { ascending: true })

    if (!sendToAll) {
      const uniqueIds = Array.from(new Set(requestedCamperIds)).slice(0, 300)
      if (uniqueIds.length === 0) {
        return NextResponse.json({ error: 'Choose at least one camper.' }, { status: 400 })
      }
      query = query.in('id', uniqueIds)
    }

    const { data: targetCampers, error: campersError } = await query

    if (campersError) {
      return NextResponse.json({ error: campersError.message }, { status: 500 })
    }

    const campers = (targetCampers || [])
      .filter(isOperationalCamper)
      .slice(0, 300)

    if (campers.length === 0) {
      return NextResponse.json({ error: 'No active campers were found for this message.' }, { status: 400 })
    }

    const sentAt = new Date().toISOString()
    const rows = campers.map((camper: any) => ({
      camper_id: camper.id,
      lot_number: camper.lot_number || null,
      sender_role: 'admin',
      sender_name: 'Bur Oaks Office',
      sender_email: context.user.email,
      body: text,
      read_by_admin_at: sentAt,
      read_by_camper_at: null,
    }))

    const { data: messageRows, error } = await context.admin
      .from('office_messages')
      .insert(rows)
      .select('*')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const origin = getSiteUrl()
    let emailSentCount = 0
    let emailSkippedCount = 0
    let emailFailedCount = 0
    let smsSentCount = 0
    let smsSkippedCount = 0
    let smsFailedCount = 0
    const failedEmails: Array<{ lotNumber: string; email: string; error: string }> = []

    for (const camper of campers) {
      const emails = camperEmails(camper)

      try {
        const result = await sendCamperMessageEmail({
          to: emails,
          camperName: camperName(camper),
          lotNumber: camper.lot_number,
          message: text,
          actionUrl: `${origin}/messages`,
        })

        if ((result as any)?.skipped) {
          emailSkippedCount += emails.length || 1
        } else {
          emailSentCount += emails.length || 1
        }
      } catch (emailError: any) {
        emailFailedCount += emails.length || 1
        failedEmails.push({
          lotNumber: String(camper.lot_number || 'Unknown'),
          email: emails.join(', ') || 'No email',
          error: emailError?.message || 'Camper email alert failed.',
        })
      }

      const smsResult = await sendCamperMessageText(
        context.admin,
        camper,
        context.user.email || 'Bur Oaks Admin'
      )
      if (smsResult.status === 'sent') smsSentCount += 1
      if (smsResult.status === 'skipped') smsSkippedCount += 1
      if (smsResult.status === 'failed') smsFailedCount += 1
    }

    return NextResponse.json({
      success: true,
      messages: messageRows || [],
      sentCount: campers.length,
      emailSentCount,
      emailSkippedCount,
      emailFailedCount,
      smsSentCount,
      smsSkippedCount,
      smsFailedCount,
      failedEmails,
    })
  }

  if (!targetCamperId) {
    return NextResponse.json({ error: 'Choose a camper first.' }, { status: 400 })
  }

  const { data: targetCamper, error: camperError } = await context.admin
    .from('campers')
    .select('id,first_name,last_name,lot_number,email,secondary_email,phone,sms_opt_in,active')
    .eq('id', targetCamperId)
    .maybeSingle()

  if (camperError || !targetCamper || targetCamper.active === false) {
    return NextResponse.json({ error: camperError?.message || 'Camper record was not found.' }, { status: 404 })
  }

  const senderRole = isAdmin ? 'admin' : 'camper'
  const senderName = isAdmin ? 'Bur Oaks Office' : camperName(context.camper)

  const { data: messageRow, error } = await context.admin
    .from('office_messages')
    .insert({
      camper_id: targetCamper.id,
      lot_number: targetCamper.lot_number || context.camper.lot_number || null,
      sender_role: senderRole,
      sender_name: senderName,
      sender_email: context.user.email,
      body: text,
      read_by_admin_at: isAdmin ? new Date().toISOString() : null,
      read_by_camper_at: isAdmin ? null : new Date().toISOString(),
    })
    .select('*')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const origin = getSiteUrl()
  let emailStatus: 'sent' | 'skipped' | 'failed' = 'sent'
  let emailMessage = ''
  let smsStatus: 'sent' | 'skipped' | 'failed' = 'skipped'
  let smsMessage = ''

  if (isAdmin) {
    try {
      const result = await sendCamperMessageEmail({
        to: camperEmails(targetCamper),
        camperName: camperName(targetCamper),
        lotNumber: targetCamper.lot_number,
        message: text,
        actionUrl: `${origin}/messages`,
      })

      if ((result as any)?.skipped) {
        emailStatus = 'skipped'
        emailMessage = (result as any)?.reason || 'Camper email alert was skipped.'
      }
    } catch (emailError: any) {
      emailStatus = 'failed'
      emailMessage = emailError?.message || 'Camper email alert failed.'
    }

    const smsResult = await sendCamperMessageText(
      context.admin,
      targetCamper,
      context.user.email || 'Bur Oaks Admin'
    )
    smsStatus = smsResult.status
    smsMessage = 'reason' in smsResult ? smsResult.reason || '' : ''
  } else {
    const title = `New camper message: Lot ${targetCamper.lot_number || 'Unknown'}`
    const message = `${camperName(context.camper)} sent the office a message.`

    await createAdminNotification(context.admin, {
      type: 'direct_message',
      title,
      message,
      lot_number: targetCamper.lot_number,
      camper_id: targetCamper.id,
      source_table: 'office_messages',
      source_id: String(messageRow.id),
    }).catch((notificationError) => console.error('Message notification failed:', notificationError))

    try {
      const result = await sendAdminAlertEmail({
        subject: title,
        heading: title,
        message: text,
        details: [
          { label: 'Camper', value: camperName(context.camper) },
          { label: 'Site', value: targetCamper.lot_number || 'Unknown' },
          { label: 'Email', value: context.user.email },
        ],
        actionUrl: `${origin}/admin/messages?camperId=${targetCamper.id}`,
        actionLabel: 'Open message inbox',
      })

      if ((result as any)?.skipped) {
        emailStatus = 'skipped'
        emailMessage = (result as any)?.reason || 'Admin email alert was skipped.'
      }
    } catch (emailError: any) {
      emailStatus = 'failed'
      emailMessage = emailError?.message || 'Admin email alert failed.'
    }
  }

  return NextResponse.json({ success: true, message: messageRow, emailStatus, emailMessage, smsStatus, smsMessage })
}
