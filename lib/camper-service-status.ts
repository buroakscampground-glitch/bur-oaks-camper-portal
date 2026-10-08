import { isCompletedTicketStatus } from './maintenance-status.ts'

export type CamperServiceStatus = {
  label: string
  detail: string
  stage: 'submitted' | 'review' | 'scheduled' | 'working' | 'billing' | 'complete'
  complete: boolean
}

function normalized(value: unknown) {
  return String(value || '').trim().toLowerCase()
}

export function camperMaintenanceStatus(ticket: { status?: unknown; admin_approved?: boolean | null }): CamperServiceStatus {
  const status = normalized(ticket.status)
  if (isCompletedTicketStatus(status)) return {
    label: 'Completed', detail: 'The maintenance team marked this request complete.', stage: 'complete', complete: true,
  }
  if (!ticket.admin_approved) return {
    label: 'Submitted — office review', detail: 'The office received your request and will review it before work begins.', stage: 'review', complete: false,
  }
  if (['in progress', 'in-progress', 'working', 'started'].includes(status)) return {
    label: 'Work in progress', detail: 'The maintenance team is working on this request.', stage: 'working', complete: false,
  }
  if (['waiting parts', 'waiting for parts', 'parts ordered'].includes(status)) return {
    label: 'Waiting for parts', detail: 'The request is approved and paused until the needed parts arrive.', stage: 'working', complete: false,
  }
  if (['scheduled', 'assigned'].includes(status)) return {
    label: 'Scheduled', detail: 'The request is approved and assigned for service.', stage: 'scheduled', complete: false,
  }
  return {
    label: 'Approved — waiting to schedule', detail: 'The office approved this request; the maintenance team has not started it yet.', stage: 'scheduled', complete: false,
  }
}

export function camperPumpOutStatus(request: { status?: unknown; billed_at?: unknown }): CamperServiceStatus {
  const status = normalized(request.status)
  if (request.billed_at) return {
    label: 'Complete — moved to billing', detail: 'Service is complete and the charge has been added to campground billing.', stage: 'complete', complete: true,
  }
  if (status === 'completed' || status === 'complete') return {
    label: 'Service complete — billing next', detail: 'The pump-out is finished. The office will add the charge to billing.', stage: 'billing', complete: false,
  }
  if (['in progress', 'in-progress', 'working', 'started'].includes(status)) return {
    label: 'Service in progress', detail: 'The maintenance team is servicing your campsite.', stage: 'working', complete: false,
  }
  return {
    label: 'In office queue', detail: 'Your request is saved on the office pump-out list. No duplicate request is needed.', stage: 'submitted', complete: false,
  }
}

export function maintenanceProgress(ticket: { status?: unknown; admin_approved?: boolean | null }) {
  const current = camperMaintenanceStatus(ticket)
  const approved = ticket.admin_approved === true || current.complete
  const working = current.stage === 'working' || current.complete
  return [
    { label: 'Submitted', complete: true },
    { label: 'Office approved', complete: approved },
    { label: 'Work in progress', complete: working },
    { label: 'Completed', complete: current.complete },
  ]
}
