import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { todayInCentral } from '../../../lib/invoice-texting'

export const runtime = 'nodejs'

function isLateInvoice(invoice: Record<string, unknown>, today: string) {
  const dueDate = String(invoice.due_date || '').slice(0, 10)
  if (!dueDate) return false
  if (Number(invoice.late_fee || 0) > 0) return true

  const status = String(invoice.status || '').toLowerCase()
  const paidDate = String(invoice.paid_at || '').slice(0, 10)
  if (status === 'paid') return Boolean(paidDate && paidDate > dueDate)

  return !['cancelled', 'canceled', 'void', 'refunded'].includes(status) && dueDate < today
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Your admin session could not be verified. Please refresh and try again.' }, { status: 401 })
  if (String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Only an administrator can view complete site history.' }, { status: 403 })
  }

  const camperId = new URL(request.url).searchParams.get('camperId')?.trim() || ''
  if (!camperId) return NextResponse.json({ error: 'A camper is required.' }, { status: 400 })

  const [camperResult, invoiceResult, noticeResult, maintenanceResult, pumpResult, documentResult, messageResult, readingResult, renewalResult] = await Promise.all([
    context.admin
      .from('campers')
      .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,email,secondary_email,phone,alternate_phone,second_profile_phone,active,camper_since_date')
      .eq('id', camperId)
      .maybeSingle(),
    context.admin
      .from('invoices')
      .select('id,invoice_number,invoice_type,subtotal,total_due,late_fee,due_date,status,paid_at,payment_method,created_at,invoice_items(id,description,quantity,unit_price,total)')
      .eq('camper_id', camperId)
      .order('created_at', { ascending: false })
      .limit(1000),
    context.admin
      .from('site_care_notices')
      .select('id,title,message,priority,status,due_date,created_at,acknowledged_at,ready_for_review_at,resolved_at')
      .eq('camper_id', camperId)
      .order('created_at', { ascending: false })
      .limit(1000),
    context.admin.from('maintenance_tickets').select('id,title,description,status,priority,admin_approved,created_at,completed_at').eq('camper_id', camperId).order('created_at', { ascending: false }).limit(1000),
    context.admin.from('sewer_pump_out_requests').select('id,lot_number,status,charge_amount,notes,requested_at,completed_at,billed_at').eq('camper_id', camperId).order('requested_at', { ascending: false }).limit(1000),
    context.admin.from('documents').select('id,document_name,document_type,signature_status,signed_at,signed_name,second_signed_name,requires_two_signatures,signature_record_hash,created_at').eq('camper_id', camperId).order('created_at', { ascending: false }).limit(1000),
    context.admin.from('office_messages').select('id,sender_role,sender_name,body,read_by_admin_at,created_at').eq('camper_id', camperId).order('created_at', { ascending: false }).limit(1000),
    context.admin.from('electric_readings').select('id,reading_date,previous_reading,current_reading,kwh_used,rate_per_kwh,amount_due,invoice_id').eq('camper_id', camperId).order('reading_date', { ascending: false }).limit(1000),
    context.admin.from('season_renewals').select('id,status,contract_start_date,contract_end_date,renewal_sent_at,decision_recorded_at,renewal_document_id,notes,created_at,updated_at').eq('camper_id', camperId).maybeSingle(),
  ])

  if (camperResult.error || !camperResult.data) {
    return NextResponse.json({ error: camperResult.error?.message || 'The camper record could not be found.' }, { status: 404 })
  }
  const relatedError = [invoiceResult, noticeResult, maintenanceResult, pumpResult, documentResult, messageResult, readingResult, renewalResult].find((result) => result.error)?.error
  if (relatedError) {
    return NextResponse.json({ error: relatedError.message || 'Site history could not be loaded.' }, { status: 500 })
  }

  const today = todayInCentral()
  const invoices = (invoiceResult.data || []).map((invoice) => ({
    ...invoice,
    is_late: isLateInvoice(invoice, today),
  }))
  const paidInvoices = invoices.filter((invoice) => String(invoice.status || '').toLowerCase() === 'paid')
  const openInvoices = invoices.filter((invoice) => !['paid', 'cancelled', 'canceled', 'void', 'refunded'].includes(String(invoice.status || '').toLowerCase()))
  const notices = noticeResult.data || []
  const documents = documentResult.data || []
  const maintenance = maintenanceResult.data || []
  const pumpOuts = pumpResult.data || []
  const messages = messageResult.data || []
  const readings = readingResult.data || []
  const renewal = renewalResult.data || null
  const activity = [
    ...invoices.map((item) => ({ id: `invoice-${item.id}`, type: 'Invoice', title: item.invoice_number || item.invoice_type || 'Invoice', detail: `${item.status || 'Open'} · $${Number(item.total_due || 0).toFixed(2)}${item.is_late ? ' · late' : ''}`, date: item.paid_at || item.created_at })),
    ...notices.map((item) => ({ id: `care-${item.id}`, type: 'Site care', title: item.title || 'Site-care notice', detail: `${item.status || 'Open'}${item.priority ? ` · ${item.priority}` : ''}`, date: item.resolved_at || item.ready_for_review_at || item.created_at })),
    ...maintenance.map((item) => ({ id: `maintenance-${item.id}`, type: 'Maintenance', title: item.title || 'Work order', detail: `${item.status || 'Open'}${item.priority ? ` · ${item.priority}` : ''}`, date: item.completed_at || item.created_at })),
    ...pumpOuts.map((item) => ({ id: `pump-${item.id}`, type: 'Pump-out', title: `Pump-out request${item.lot_number ? ` · Lot ${item.lot_number}` : ''}`, detail: `${item.status || 'Requested'} · $${Number(item.charge_amount || 0).toFixed(2)}${item.billed_at ? ' · billed' : ''}`, date: item.completed_at || item.requested_at })),
    ...documents.map((item) => ({ id: `document-${item.id}`, source_id: item.id, type: 'Document', title: item.document_name || item.document_type || 'Document', detail: item.signature_status || 'Pending', date: item.signed_at || item.created_at })),
    ...messages.map((item) => ({ id: `message-${item.id}`, type: 'Message', title: item.sender_role === 'camper' ? 'Camper messaged office' : 'Office messaged camper', detail: String(item.body || '').slice(0, 140), date: item.created_at })),
    ...readings.map((item) => ({ id: `electric-${item.id}`, type: 'Electric', title: `${Number(item.current_reading || 0).toLocaleString()} meter reading`, detail: `${Number(item.kwh_used || 0).toLocaleString()} kWh · $${Number(item.amount_due || 0).toFixed(2)}${item.invoice_id ? ' · invoiced' : ''}`, date: item.reading_date })),
    ...(renewal ? [{ id: `renewal-${renewal.id}`, source_id: renewal.renewal_document_id, type: 'Renewal', title: `Renewal decision: ${renewal.status}`, detail: renewal.contract_end_date ? `Contract through ${renewal.contract_end_date}` : 'Contract date not entered', date: renewal.decision_recorded_at || renewal.renewal_sent_at || renewal.updated_at || renewal.created_at }] : []),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))

  return NextResponse.json({
    camper: camperResult.data,
    invoices,
    notices,
    documents,
    maintenance,
    pumpOuts,
    messages,
    readings,
    renewal,
    activity,
    summary: {
      totalInvoices: invoices.length,
      paidInvoices: paidInvoices.length,
      lateInvoices: invoices.filter((invoice) => invoice.is_late).length,
      openBalance: openInvoices.reduce((total, invoice) => total + Number(invoice.total_due || 0), 0),
      totalNotices: notices.length,
      activeNotices: notices.filter((notice) => notice.status !== 'Resolved').length,
      signedDocuments: documents.filter((document) => String(document.signature_status || '').toLowerCase() === 'signed').length,
      totalDocuments: documents.length,
      maintenanceItems: maintenance.length,
      pumpOuts: pumpOuts.length,
      messages: messages.length,
      electricReadings: readings.length,
      activityItems: activity.length,
    },
  })
}
