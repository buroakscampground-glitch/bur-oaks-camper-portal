type NotificationInput = {
  type: 'maintenance_request' | 'payment_received' | 'event_rsvp'
  title: string
  message: string
  lot_number?: string | null
  camper_id?: string | null
  source_table?: string | null
  source_id?: string | null
}

export async function createAdminNotification(admin: any, input: NotificationInput) {
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

  return { created: true }
}
