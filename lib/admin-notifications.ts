import { sendOwnerTextAlert } from './owner-alert-sms'
import { requiresAdminAttention } from './admin-notification-types'
import { sendStaffWebPush } from './staff-web-push'

type NotificationInput = {
  type: 'maintenance_request' | 'payment_received' | 'payment_problem' | 'event_rsvp' | 'saturday_dinner' | 'sewer_pump_out' | 'direct_message' | 'website_waitlist' | 'site_care'
  title: string
  message: string
  lot_number?: string | null
  camper_id?: string | null
  source_table?: string | null
  source_id?: string | null
}

export async function createAdminNotification(admin: any, input: NotificationInput) {
  const shouldStoreForAttention = requiresAdminAttention(input.type)

  if (shouldStoreForAttention) {
    const { error } = await admin.from('admin_notifications').insert({
      type: input.type,
      title: input.title,
      message: input.message,
      lot_number: input.lot_number || null,
      camper_id: input.camper_id || null,
      source_table: input.source_table || null,
      source_id: input.source_id || null,
    })

    if (error?.code === '42P01' || error?.code === 'PGRST205') {
      return { skipped: true, reason: 'admin_notifications table is not installed yet.' }
    }

    if (error) {
      throw error
    }
  }

  const textAlert = shouldStoreForAttention
    ? await sendOwnerTextAlert({
        type: input.type,
        title: input.title,
        message: input.message,
        lotNumber: input.lot_number,
        camperId: input.camper_id,
      }).catch((textError) => {
        console.error('Owner text alert failed:', textError)
        return { skipped: true, reason: textError?.message || 'Owner text alert failed.' }
      })
    : { skipped: true, reason: 'Routine activity is included in the daily office summary.' }

  const destination = input.type === 'direct_message'
    ? '/admin/messages'
    : input.type === 'maintenance_request'
      ? '/admin/maintenance'
      : input.type === 'site_care'
        ? '/admin/site-care'
        : input.type === 'website_waitlist'
          ? '/admin/waitlist'
          : '/admin/notifications'
  const pushAlert = shouldStoreForAttention
    ? await sendStaffWebPush(admin, {
        title: input.title,
        body: input.message.slice(0, 180),
        urlByRole: { admin: destination, event_coordinator: '/community' },
        tag: `admin-${input.type}`,
        roles: ['admin'],
      }).catch((pushError) => {
        console.error('Staff app alert failed:', pushError)
        return { sent: 0, skipped: true }
      })
    : { sent: 0, skipped: true, reason: 'Routine activity stays in its normal section.' }

  return {
    created: shouldStoreForAttention,
    informational: !shouldStoreForAttention,
    textAlert,
    pushAlert,
  }
}
