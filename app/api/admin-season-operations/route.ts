import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { seasonOperationManualTaskKeys, summarizeSeasonOperations, type SeasonPhase } from '../../../lib/season-operations'
import { reportOperationalFailure } from '../../../lib/operational-errors'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

function cleanText(value: unknown, maximum: number) { return typeof value === 'string' ? value.trim().slice(0, maximum) : '' }
function requestObject(value: unknown): Record<string, unknown> { return value && typeof value === 'object' ? value as Record<string, unknown> : {} }
async function adminContext(request: Request) { const context = await getAuthenticatedContext(request); return context && String(context.camper.role || '').toLowerCase() === 'admin' ? context : null }
function requestedSeason(request: Request) {
  const url = new URL(request.url)
  const currentYear = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric' }).format(new Date()))
  const year = Number(url.searchParams.get('year') || currentYear)
  const phase = url.searchParams.get('phase') === 'opening' ? 'opening' : 'closing'
  return { year: Number.isInteger(year) && year >= 2020 && year <= 2100 ? year : currentYear, phase: phase as SeasonPhase }
}

export async function GET(request: Request) {
  const context = await adminContext(request)
  if (!context) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  const { year, phase } = requestedSeason(request)
  try {
    const [campers, renewals, documents, invoices, gateCards, readings, maintenance, tasks, events] = await Promise.all([
      context.admin.from('campers').select('id,first_name,last_name,email,lot_number,role,active').eq('active', true),
      context.admin.from('season_renewals').select('id,camper_id,contract_start_date,contract_end_date,status,decision_recorded_at'),
      context.admin.from('documents').select('id,camper_id,document_name,document_type,signature_status,signed_at'),
      context.admin.from('invoices').select('id,camper_id,status,due_date,total_due,paid_at'),
      context.admin.from('gate_cards').select('id,camper_id,status,issue_date'),
      context.admin.from('electric_readings').select('id,camper_id,reading_date,current_reading'),
      context.admin.from('maintenance_tickets').select('id,camper_id,lot_number,status,title'),
      context.admin.from('season_operation_tasks').select('camper_id,season_year,phase,task_key,completed_at,completed_by,note,updated_at').eq('season_year', year).eq('phase', phase),
      context.admin.from('season_operation_events').select('id,camper_id,season_year,phase,task_key,action,note,actor,created_at').eq('season_year', year).eq('phase', phase).order('created_at', { ascending: false }).limit(1000),
    ])
    const results = [campers, renewals, documents, invoices, gateCards, readings, maintenance, tasks, events]
    const failure = results.find((result) => result.error)?.error
    if (failure) throw failure
    const summaries = (campers.data || []).filter(isOperationalCamper).map((camper) => summarizeSeasonOperations({
      camper, seasonYear: year, phase,
      renewal: (renewals.data || []).find((row) => row.camper_id === camper.id),
      documents: (documents.data || []).filter((row) => row.camper_id === camper.id),
      invoices: (invoices.data || []).filter((row) => row.camper_id === camper.id),
      gateCards: (gateCards.data || []).filter((row) => row.camper_id === camper.id),
      readings: (readings.data || []).filter((row) => row.camper_id === camper.id),
      maintenance: (maintenance.data || []).filter((row) => row.camper_id === camper.id || (row.lot_number && row.lot_number === camper.lot_number)),
      manualTasks: (tasks.data || []).filter((row) => row.camper_id === camper.id),
    })).sort((left, right) => Number(left.ready) - Number(right.ready) || left.percent - right.percent || left.lotNumber.localeCompare(right.lotNumber, undefined, { numeric: true }))
    return NextResponse.json({ generatedAt: new Date().toISOString(), year, phase, counts: { total: summaries.length, needingAction: summaries.filter((item) => !item.ready).length, ready: summaries.filter((item) => item.ready).length, checksRemaining: summaries.reduce((sum, item) => sum + item.total - item.completed, 0) }, campers: summaries, events: events.data || [] })
  } catch (error: unknown) {
    const requestId = reportOperationalFailure(request, { operation: 'admin-season-operations-load', actorRole: 'admin' }, error)
    return NextResponse.json({ error: 'Season operations could not be verified. No incomplete item is being shown as complete.', requestId }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const context = await adminContext(request)
  if (!context) return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  const body = requestObject(await request.json().catch(() => ({})))
  const camperId = cleanText(body.camperId, 80), phase = cleanText(body.phase, 10), taskKey = cleanText(body.taskKey, 80), note = cleanText(body.note, 1000)
  const year = Number(body.seasonYear), completed = body.completed === true
  if (!camperId || !Number.isInteger(year) || year < 2020 || year > 2100 || !['opening', 'closing'].includes(phase) || !seasonOperationManualTaskKeys.includes(taskKey as typeof seasonOperationManualTaskKeys[number]) || !taskKey.startsWith(`${phase}_`)) return NextResponse.json({ error: 'Choose a valid camper, season, phase, and task.' }, { status: 400 })
  if (!note) return NextResponse.json({ error: 'Add a short staff note describing what was verified or reopened.' }, { status: 400 })
  try {
    const { data, error } = await context.admin.rpc('set_season_operation_task_atomic', { p_camper_id: camperId, p_season_year: year, p_phase: phase, p_task_key: taskKey, p_completed: completed, p_note: note || null, p_actor: context.user.email || 'office' })
    if (error) throw error
    return NextResponse.json({ success: true, result: data })
  } catch (error: unknown) {
    const requestId = reportOperationalFailure(request, { operation: 'admin-season-operation-task', actorRole: 'admin', identifiers: { camperId, taskKey, year, phase } }, error)
    return NextResponse.json({ error: 'The season task could not be confirmed. Refresh before retrying.', requestId }, { status: 500 })
  }
}
