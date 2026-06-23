export async function markAdminAlertsSeen(
  supabase: any,
  type: 'maintenance_request' | 'payment_received' | 'event_rsvp',
  sourceId?: string | null
) {
  let query = supabase
    .from('admin_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('type', type)
    .is('read_at', null)

  if (sourceId) {
    query = query.eq('source_id', sourceId)
  }

  const { error } = await query

  if (error?.code === '42P01' || error?.code === 'PGRST205') {
    return
  }

  if (error) {
    console.error('Unable to mark admin alerts seen:', error)
  }
}
