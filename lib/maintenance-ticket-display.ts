export type MaintenanceTicketDisplay = {
  title?: string | null
  description?: string | null
  reported_by?: string | null
}

export function isConvertedSiteCareTicket(ticket: MaintenanceTicketDisplay) {
  return /site care notice [0-9a-f-]{20,}/i.test(String(ticket.description || ''))
    || /site care deadline/i.test(String(ticket.title || ''))
    || /site care enforcement/i.test(String(ticket.reported_by || ''))
}

export function maintenanceTaskForDisplay(ticket: MaintenanceTicketDisplay) {
  if (!isConvertedSiteCareTicket(ticket)) return String(ticket.description || '').trim() || 'No task entered.'
  const text = `${ticket.title || ''} ${ticket.description || ''}`.toLowerCase()
  if (text.includes('weed eat')) return 'Weed eat around the campsite.'
  if (text.includes('spray weed')) return 'Spray weeds around the campsite.'
  if (text.includes('pick up trash') || text.includes('trash pickup')) return 'Pick up loose trash around the campsite.'
  return String(ticket.title || '').replace(/^site care deadline\s*[—-]\s*/i, '').trim() || 'Complete the listed site-care task.'
}
