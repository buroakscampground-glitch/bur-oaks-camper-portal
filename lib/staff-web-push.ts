import webpush, { type PushSubscription } from 'web-push'
import { effectivePortalRole } from './staff-roles'

type StaffPushSubscription = PushSubscription & {
  createdAt?: string
}

type StaffPushOptions = {
  title: string
  body: string
  urlByRole: { admin: string; event_coordinator: string }
  tag: string
  roles?: Array<'admin' | 'event_coordinator'>
  camperIds?: string[]
  excludeCamperId?: string | null
  badgeCount?: number
}

function configured() {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY)
}

function savedSubscriptions(value: unknown): StaffPushSubscription[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is StaffPushSubscription => Boolean(
    item && typeof item === 'object' &&
    typeof (item as StaffPushSubscription).endpoint === 'string' &&
    typeof (item as StaffPushSubscription).keys?.p256dh === 'string' &&
    typeof (item as StaffPushSubscription).keys?.auth === 'string'
  )).slice(-5)
}

async function authUsers(admin: any) {
  const users: any[] = []
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const batch = data?.users || []
    users.push(...batch)
    if (batch.length < 200) break
  }
  return users
}

export function staffPushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY || ''
}

export async function sendStaffWebPush(admin: any, options: StaffPushOptions) {
  if (!configured()) return { sent: 0, skipped: true, reason: 'Staff Web Push is not configured.' }

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:buroakscampground@gmail.com',
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!
  )

  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,email,secondary_email,role,lot_number,active')
    .eq('active', true)
  if (camperError) throw camperError

  const roles = new Set(options.roles || ['admin', 'event_coordinator'])
  const camperIds = options.camperIds?.length ? new Set(options.camperIds.map(String)) : null
  const recipients = (campers || []).filter((camper: any) => {
    const role = effectivePortalRole(camper)
    return roles.has(role as 'admin' | 'event_coordinator') &&
      (!camperIds || camperIds.has(String(camper.id))) &&
      String(camper.id) !== String(options.excludeCamperId || '')
  })
  if (!recipients.length) return { sent: 0, skipped: true, reason: 'No staff recipient matched.' }

  const recipientByEmail = new Map<string, { camper: any; role: 'admin' | 'event_coordinator' }>()
  for (const camper of recipients) {
    const role = effectivePortalRole(camper) as 'admin' | 'event_coordinator'
    for (const email of [camper.email, camper.secondary_email]) {
      const normalized = String(email || '').trim().toLowerCase()
      if (normalized) recipientByEmail.set(normalized, { camper, role })
    }
  }

  let sent = 0
  const users = await authUsers(admin)
  for (const user of users) {
    const recipient = recipientByEmail.get(String(user.email || '').trim().toLowerCase())
    if (!recipient) continue
    const subscriptions = savedSubscriptions(user.user_metadata?.staff_push_subscriptions)
    if (!subscriptions.length) continue
    const expired = new Set<string>()
    const countResult = recipient.role === 'admin'
      ? await admin.from('admin_notifications').select('id', { count: 'exact', head: true }).is('read_at', null)
      : await admin.from('community_notifications').select('id', { count: 'exact', head: true }).eq('camper_id', recipient.camper.id).is('read_at', null)
    const badgeCount = Math.max(1, Math.round(Number(options.badgeCount || countResult.count || 1)))
    const payload = JSON.stringify({
      title: options.title,
      body: options.body,
      url: options.urlByRole[recipient.role],
      tag: options.tag,
      badgeCount,
    })

    for (const subscription of subscriptions) {
      try {
        await webpush.sendNotification(subscription, payload, { TTL: 60 * 60, urgency: 'normal' })
        sent += 1
      } catch (error: any) {
        if (error?.statusCode === 404 || error?.statusCode === 410) expired.add(subscription.endpoint)
        else console.error('Staff Web Push delivery failed:', error?.message || error)
      }
    }

    if (expired.size) {
      await admin.auth.admin.updateUserById(user.id, {
        user_metadata: {
          ...(user.user_metadata || {}),
          staff_push_subscriptions: subscriptions.filter((item) => !expired.has(item.endpoint)),
        },
      })
    }
  }

  return { sent, skipped: sent === 0 }
}
