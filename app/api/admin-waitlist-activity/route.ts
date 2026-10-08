import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { reportOperationalFailure } from '../../../lib/operational-errors'

export const runtime = 'nodejs'

const activityTypes = new Set([
  'note', 'call', 'email', 'tour_scheduled', 'tour_completed',
  'follow_up', 'offer_made', 'status_changed',
])
const statuses = new Set(['Waiting', 'Contacted', 'Accepted', 'Declined', 'Removed'])

function requestObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function text(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

function validDate(value: string) {
  return !value || /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function validTimestamp(value: string) {
  return !value || !Number.isNaN(Date.parse(value))
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  }

  const body = requestObject(await request.json().catch(() => ({})))
  const waitlistId = text(body.waitlistId, 80)
  const activityType = text(body.activityType, 40)
  const detail = text(body.detail, 2000)
  const occurredAt = text(body.occurredAt, 40)
  const followUpOn = text(body.followUpOn, 10)
  const newStatus = text(body.newStatus, 30)

  if (!waitlistId || !activityTypes.has(activityType)) {
    return NextResponse.json({ error: 'Choose a prospect and a valid activity.' }, { status: 400 })
  }
  if (!validTimestamp(occurredAt) || !validDate(followUpOn)) {
    return NextResponse.json({ error: 'Choose valid activity and follow-up dates.' }, { status: 400 })
  }
  if (newStatus && !statuses.has(newStatus)) {
    return NextResponse.json({ error: 'Choose a valid prospect status.' }, { status: 400 })
  }

  try {
    const { data, error } = await context.admin.rpc('record_waitlist_activity_atomic', {
      p_waitlist_id: waitlistId,
      p_activity_type: activityType,
      p_detail: detail || null,
      p_occurred_at: occurredAt || new Date().toISOString(),
      p_follow_up_on: followUpOn || null,
      p_new_status: newStatus || null,
      p_recorded_by: context.user.email || 'office',
      p_converted_camper_id: null,
    })
    if (error) throw error
    return NextResponse.json({ success: true, result: data })
  } catch (error: unknown) {
    const requestId = reportOperationalFailure(request, {
      operation: 'waitlist-activity-save', actorRole: 'admin', identifiers: { waitlistId },
    }, error)
    return NextResponse.json({ error: 'The prospect activity could not be saved. Verify the timeline before retrying.', requestId }, { status: 500 })
  }
}
