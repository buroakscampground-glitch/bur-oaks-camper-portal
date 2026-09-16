import { NextResponse } from 'next/server'
import { buildCamperStanding } from '../../../lib/camper-standing'
import { isOperationalCamper } from '../../../lib/camper-records'
import { todayInCentral } from '../../../lib/invoice-balance'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Your admin session could not be verified. Please refresh and try again.' }, { status: 401 })
  if (String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Only an administrator can view camper standing.' }, { status: 403 })
  }

  const camperResult = await context.admin
    .from('campers')
    .select('id,first_name,last_name,lot_number,role,active')
    .eq('active', true)
    .order('lot_number', { ascending: true })

  if (camperResult.error) return NextResponse.json({ error: camperResult.error.message }, { status: 500 })
  const campers = (camperResult.data || []).filter(isOperationalCamper)
  const camperIds = campers.map((camper) => camper.id)
  if (!camperIds.length) return NextResponse.json({ rows: [], generatedAt: new Date().toISOString() })

  const [invoiceResult, noticeResult, documentResult] = await Promise.all([
    context.admin.from('invoices').select('camper_id,due_date,paid_at,late_fee,status,total_due').in('camper_id', camperIds).limit(10000),
    context.admin.from('site_care_notices').select('camper_id,created_at,priority,status').in('camper_id', camperIds).limit(10000),
    context.admin.from('documents').select('camper_id,signature_status').in('camper_id', camperIds).limit(10000),
  ])

  const queryError = [invoiceResult, noticeResult, documentResult].find((result) => result.error)?.error
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 })

  const today = todayInCentral()
  const rows = campers.map((camper) => buildCamperStanding({
    camper,
    invoices: (invoiceResult.data || []).filter((invoice) => invoice.camper_id === camper.id),
    notices: (noticeResult.data || []).filter((notice) => notice.camper_id === camper.id),
    documents: (documentResult.data || []).filter((document) => document.camper_id === camper.id),
    today,
  }))

  return NextResponse.json({ rows, generatedAt: new Date().toISOString() })
}
