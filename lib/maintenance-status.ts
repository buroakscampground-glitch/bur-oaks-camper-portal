export const completedTicketStatuses = ['completed', 'complete', 'closed', 'resolved', 'done'] as const
export const completedTicketStatusFilter = completedTicketStatuses
  .map((status) => `status.ilike.${status}`)
  .join(',')

export function isCompletedTicketStatus(status: unknown) {
  return completedTicketStatuses.includes(
    String(status || '').trim().toLowerCase() as (typeof completedTicketStatuses)[number]
  )
}
