import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { onboardingManualTaskKeys, summarizeCamperOnboarding } from '../../../lib/camper-onboarding'
import { reportOperationalFailure } from '../../../lib/operational-errors'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

function requestObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {}
}

function cleanText(value: unknown, maximum: number) {
  return typeof value === 'string' ? value.trim().slice(0, maximum) : ''
}

async function adminContext(request: Request) {
  const context = await getAuthenticatedContext(request)
  return context && String(context.camper.role || '').toLowerCase() === 'admin' ? context : null
}

export async function GET(request: Request) {
  const context = await adminContext(request)
  if (!context) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })

  try {
    const [camperResult, renewalResult, documentResult, invoiceResult, gateResult, inviteResult, taskResult, eventResult, waitlistResult, authResult] = await Promise.all([
      context.admin.from('campers').select('id,first_name,last_name,email,lot_number,role,active,camper_since_date,created_at').eq('active', true),
      context.admin.from('season_renewals').select('id,camper_id,contract_start_date,contract_end_date,renewal_document_id,status'),
      context.admin.from('documents').select('id,camper_id,document_name,document_type,signature_status,signed_at'),
      context.admin.from('invoices').select('id,camper_id,invoice_type,status,due_date,total_due,paid_at'),
      context.admin.from('gate_cards').select('id,camper_id,status,issue_date'),
      context.admin.from('portal_invite_log').select('id,camper_id,email,delivery_status,created_at'),
      context.admin.from('camper_onboarding_tasks').select('camper_id,task_key,completed_at,completed_by,note,updated_at'),
      context.admin.from('camper_onboarding_events').select('id,camper_id,task_key,action,note,actor,created_at').order('created_at', { ascending: false }).limit(1000),
      context.admin.from('waitlist').select('converted_camper_id').not('converted_camper_id', 'is', null),
      context.admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
    ])
    const failures = [camperResult, renewalResult, documentResult, invoiceResult, gateResult, inviteResult, taskResult, eventResult, waitlistResult]
      .map((result) => result.error).filter(Boolean)
    if (failures.length || authResult.error) throw failures[0] || authResult.error

    const campers = (camperResult.data || []).filter(isOperationalCamper)
    const authEmails = new Set((authResult.data.users || []).map((user) => String(user.email || '').trim().toLowerCase()).filter(Boolean))
    const convertedIds = new Set((waitlistResult.data || []).map((row) => String(row.converted_camper_id || '')).filter(Boolean))
    const summaries = campers.map((camper) => summarizeCamperOnboarding({
      camper,
      renewal: (renewalResult.data || []).find((row) => row.camper_id === camper.id),
      documents: (documentResult.data || []).filter((row) => row.camper_id === camper.id),
      invoices: (invoiceResult.data || []).filter((row) => row.camper_id === camper.id),
      gateCards: (gateResult.data || []).filter((row) => row.camper_id === camper.id),
      invites: (inviteResult.data || []).filter((row) => row.camper_id === camper.id || String(row.email || '').trim().toLowerCase() === String(camper.email || '').trim().toLowerCase()),
      manualTasks: (taskResult.data || []).filter((row) => row.camper_id === camper.id),
      authEmails,
      convertedFromWaitlist: convertedIds.has(String(camper.id)),
    })).sort((left, right) => Number(left.ready) - Number(right.ready) || left.percent - right.percent || left.lotNumber.localeCompare(right.lotNumber, undefined, { numeric: true }))

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      counts: {
        current: summaries.filter((summary) => summary.currentOnboarding).length,
        needingAction: summaries.filter((summary) => summary.currentOnboarding && !summary.ready).length,
        ready: summaries.filter((summary) => summary.currentOnboarding && summary.ready).length,
        allActive: summaries.length,
      },
      campers: summaries,
      events: eventResult.data || [],
    })
  } catch (error: unknown) {
    const requestId = reportOperationalFailure(request, { operation: 'admin-onboarding-load', actorRole: 'admin' }, error)
    return NextResponse.json({ error: 'The onboarding checklist could not be verified. No incomplete item is being shown as complete.', requestId }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const context = await adminContext(request)
  if (!context) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  const body = requestObject(await request.json().catch(() => ({})))
  const camperId = cleanText(body.camperId, 80)
  const taskKey = cleanText(body.taskKey, 80)
  const note = cleanText(body.note, 1000)
  const completed = body.completed === true
  if (!camperId || !onboardingManualTaskKeys.includes(taskKey as typeof onboardingManualTaskKeys[number])) {
    return NextResponse.json({ error: 'Choose a camper and a valid manual onboarding task.' }, { status: 400 })
  }

  try {
    const { data, error } = await context.admin.rpc('set_camper_onboarding_task_atomic', {
      p_camper_id: camperId,
      p_task_key: taskKey,
      p_completed: completed,
      p_note: note || null,
      p_actor: context.user.email || 'office',
    })
    if (error) throw error
    return NextResponse.json({ success: true, result: data })
  } catch (error: unknown) {
    const requestId = reportOperationalFailure(request, { operation: 'admin-onboarding-task', actorRole: 'admin', identifiers: { camperId, taskKey } }, error)
    return NextResponse.json({ error: 'The onboarding change could not be confirmed. Refresh the checklist before retrying.', requestId }, { status: 500 })
  }
}
