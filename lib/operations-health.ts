import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizedBillingLinks, normalizeBillingEmail, normalizeBillingLot } from './authorized-billing'
import { isOperationalCamper } from './camper-records'
import { todayInCentral } from './invoice-texting'
import { isPumpOutWaitingForService } from './pump-out-status'
import { oneRelationship } from './database-relations'

type RelatedCamper = { first_name?: string | null; last_name?: string | null; lot_number?: string | null }
type JoinedCamper = RelatedCamper | RelatedCamper[] | null

export type OperationsCamper = {
  id: string
  first_name?: string | null
  last_name?: string | null
  second_profile_first_name?: string | null
  second_profile_last_name?: string | null
  lot_number?: string | null
  email?: string | null
  secondary_email?: string | null
  phone?: string | null
  alternate_phone?: string | null
  second_profile_phone?: string | null
  sms_opt_in?: boolean | null
  role?: string | null
  active?: boolean | null
}

export type OperationsInvoice = {
  id: string
  camper_id?: string | null
  invoice_number?: string | null
  invoice_type?: string | null
  total_due?: number | string | null
  due_date?: string | null
  status?: string | null
  paid_at?: string | null
  created_at?: string | null
  campers?: JoinedCamper
}

export type OperationsDocument = {
  id: string
  camper_id?: string | null
  document_name?: string | null
  document_type?: string | null
  signature_status?: string | null
  requires_two_signatures?: boolean | null
  signed_at?: string | null
  uploaded_at?: string | null
  campers?: JoinedCamper
}

export type OperationsMaintenance = {
  id: string
  camper_id?: string | null
  lot_number?: string | null
  title?: string | null
  status?: string | null
  priority?: string | null
  admin_approved?: boolean | null
  created_at?: string | null
  completed_at?: string | null
}

type OperationsPumpOut = {
  id: string
  camper_id?: string | null
  lot_number?: string | null
  camper_name?: string | null
  status?: string | null
  billed_at?: string | null
  requested_at?: string | null
  completed_at?: string | null
}

type OperationsMessage = { id: string; camper_id?: string | null; lot_number?: string | null; sender_role?: string | null; sender_name?: string | null; body?: string | null; read_by_admin_at?: string | null; created_at?: string | null }
type TextDelivery = { id: string; camper_id?: string | null; invoice_id?: string | null; reminder_type?: string | null; status?: string | null; provider?: string | null; recipient_phone?: string | null; recipient_email?: string | null; error_message?: string | null; sent_at?: string | null; campers?: JoinedCamper }
type InviteDelivery = { id: string; camper_id?: string | null; email?: string | null; delivery_status?: string | null; delivery_provider?: string | null; error_message?: string | null; created_at?: string | null }
type ReportDelivery = { id: string; report_key?: string | null; report_date?: string | null; status?: string | null; error_message?: string | null; started_at?: string | null; completed_at?: string | null }
type OperationsNotification = { id: string; type?: string | null; title?: string | null; message?: string | null; lot_number?: string | null; created_at?: string | null }
type SiteCareNotice = { id: string; status?: string | null }
type MeterSubmission = { id: string; camper_id?: string | null; lot_number?: string | null; status?: string | null; captured_at?: string | null; invoice_id?: string | null }
type QueryError = { message?: string } | null
type QueryResult<T> = { data: T[] | null; error: QueryError }
type RowsResult<T> = { rows: T[]; error: string }

async function safeRows<T>(query: PromiseLike<QueryResult<T>>): Promise<RowsResult<T>> {
  try {
    const result = await query
    return { rows: result.data || [], error: result.error?.message || '' }
  } catch (error: unknown) {
    return { rows: [], error: error instanceof Error ? error.message : String(error) }
  }
}

function money(rows: Array<{ total_due?: unknown }>) {
  return Number(rows.reduce((sum, row) => sum + Number(row.total_due || 0), 0).toFixed(2))
}

function isOpenStatus(status: unknown) {
  return !['paid', 'cancelled', 'canceled', 'void', 'refunded', 'completed', 'closed', 'resolved'].includes(String(status || '').toLowerCase())
}

function monthStart(today: string) {
  return `${today.slice(0, 7)}-01T00:00:00.000Z`
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function oldestDate<T extends object>(rows: T[], ...fields: string[]) {
  return rows
    .flatMap((row) => fields.map((field) => String((row as Record<string, unknown>)[field] || '')).filter(Boolean))
    .sort()[0] || null
}

export async function loadOperationsSnapshot(client: SupabaseClient) {
  const today = todayInCentral()
  const thirtyDaysAgo = new Date(`${today}T12:00:00Z`)
  thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30)
  const recentCutoff = thirtyDaysAgo.toISOString()
  const currentMonthStart = monthStart(today)

  const [
    camperResult,
    invoiceResult,
    documentResult,
    maintenanceResult,
    pumpResult,
    messageResult,
    textResult,
    inviteResult,
    reportResult,
    notificationResult,
    siteCareResult,
    submissionResult,
  ] = await Promise.all([
    safeRows<OperationsCamper>(client.from('campers').select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,email,secondary_email,phone,alternate_phone,second_profile_phone,sms_opt_in,role,active').order('lot_number')),
    safeRows<OperationsInvoice>(client.from('invoices').select('id,camper_id,invoice_number,invoice_type,total_due,due_date,status,paid_at,created_at,campers(first_name,last_name,lot_number)').order('created_at', { ascending: false }).limit(1000)),
    safeRows<OperationsDocument>(client.from('documents').select('id,camper_id,document_name,document_type,signature_status,requires_two_signatures,signed_at,uploaded_at,campers(first_name,last_name,lot_number)').order('document_name', { ascending: true }).limit(500)),
    safeRows<OperationsMaintenance>(client.from('maintenance_tickets').select('id,camper_id,lot_number,title,status,priority,admin_approved,created_at,completed_at').order('created_at', { ascending: false }).limit(500)),
    safeRows<OperationsPumpOut>(client.from('sewer_pump_out_requests').select('id,camper_id,lot_number,camper_name,status,billed_at,requested_at,completed_at').order('requested_at', { ascending: false }).limit(500)),
    safeRows<OperationsMessage>(client.from('office_messages').select('id,camper_id,lot_number,sender_role,sender_name,body,read_by_admin_at,created_at').order('created_at', { ascending: false }).limit(300)),
    safeRows<TextDelivery>(client.from('text_reminders').select('id,camper_id,invoice_id,reminder_type,status,provider,recipient_phone,recipient_email,error_message,sent_at,campers(first_name,last_name,lot_number)').gte('sent_at', recentCutoff).order('sent_at', { ascending: false }).limit(500)),
    safeRows<InviteDelivery>(client.from('portal_invite_log').select('id,camper_id,email,delivery_status,delivery_provider,error_message,created_at').gte('created_at', recentCutoff).order('created_at', { ascending: false }).limit(300)),
    safeRows<ReportDelivery>(client.from('scheduled_reports').select('*').gte('report_date', today.slice(0, 7) + '-01').order('report_date', { ascending: false }).limit(100)),
    safeRows<OperationsNotification>(client.from('admin_notifications').select('*').order('created_at', { ascending: false }).limit(300)),
    safeRows<SiteCareNotice>(client.from('site_care_notices').select('id,camper_id,lot_number,title,status,priority,due_date,created_at').order('created_at', { ascending: false }).limit(300)),
    safeRows<MeterSubmission>(client.from('meter_reading_submissions').select('id,camper_id,lot_number,status,captured_at,invoice_id').gte('captured_at', currentMonthStart).neq('status', 'cancelled').order('captured_at', { ascending: false }).limit(300)),
  ])

  const campers = camperResult.rows.filter((camper) => camper.active !== false && isOperationalCamper(camper))
  const invoices = invoiceResult.rows.map((invoice) => ({ ...invoice, campers: oneRelationship(invoice.campers) }))
  const openInvoices = invoices.filter((invoice) => isOpenStatus(invoice.status))
  const pastDueInvoices = openInvoices.filter((invoice) => (
    String(invoice.status || '').toLowerCase() !== 'processing'
    && invoice.due_date
    && invoice.due_date < today
  ))
  const documents = documentResult.rows.map((document) => ({ ...document, campers: oneRelationship(document.campers) }))
  const unsignedDocuments = documents.filter((document) => !['signed', 'not_required', 'declined'].includes(String(document.signature_status || '').toLowerCase()))
  const openMaintenance = maintenanceResult.rows.filter((ticket) => isOpenStatus(ticket.status))
  const pendingMaintenance = openMaintenance.filter((ticket) => ticket.admin_approved !== true)
  const openPumpOuts = pumpResult.rows.filter(isPumpOutWaitingForService)
  const unreadMessages = messageResult.rows.filter((message) => message.sender_role === 'camper' && !message.read_by_admin_at)
  const failedTextAttempts = textResult.rows.filter((delivery) => String(delivery.status || '').toLowerCase() === 'failed')
  const failedInviteAttempts = inviteResult.rows.filter((delivery) => String(delivery.delivery_status || '').toLowerCase() === 'failed')
  const failedInvites = failedInviteAttempts.filter((failed) => !inviteResult.rows.some((delivery) => (
    String(delivery.delivery_status || '').toLowerCase() === 'sent'
    && normalizeBillingEmail(delivery.email) === normalizeBillingEmail(failed.email)
    && new Date(delivery.created_at || 0).getTime() > new Date(failed.created_at || 0).getTime()
  )))
  const failedReports = reportResult.rows.filter((report) => ['failed', 'partial'].includes(String(report.status || '').toLowerCase()))
  const openSiteCare = siteCareResult.rows.filter((notice) => String(notice.status || '') !== 'Resolved')
  const missingContact = campers.filter((camper) => !camper.email || !camper.phone)
  const optedOut = campers.filter((camper) => camper.sms_opt_in !== true)
  const currentElectricInvoices = invoices.filter((invoice) =>
    String(invoice.invoice_type || '').toLowerCase().includes('electric') &&
    String(invoice.created_at || '') >= currentMonthStart
  )
  const invoiceById = new Map(invoices.map((invoice) => [String(invoice.id), invoice]))
  const thirtyDaysAhead = shiftDate(today, 30)
  const failedTexts = failedTextAttempts.filter((failed) => {
    const recipient = String(failed.recipient_phone || failed.recipient_email || '')
    const failedAt = new Date(failed.sent_at || 0).getTime()
    const succeededLater = textResult.rows.some((delivery) => (
      String(delivery.status || '').toLowerCase() === 'sent'
      && String(delivery.reminder_type || '') === String(failed.reminder_type || '')
      && String(delivery.recipient_phone || delivery.recipient_email || '') === recipient
      && new Date(delivery.sent_at || 0).getTime() > failedAt
    ))
    if (succeededLater) return false

    const error = String(failed.error_message || '').toLowerCase()
    if (error.includes('unsubscribed recipient') || error.includes('recipient has opted out')) return false

    if (String(failed.reminder_type || '').toLowerCase().includes('document')) {
      const stillNeedsSignature = unsignedDocuments.some((document) => String(document.camper_id) === String(failed.camper_id))
      if (!stillNeedsSignature) return false
    }

    if (failed.invoice_id) {
      const invoice = invoiceById.get(String(failed.invoice_id))
      if (!invoice || !isOpenStatus(invoice.status) || (invoice.due_date && invoice.due_date > thirtyDaysAhead)) return false
    }

    return true
  })
  const completedSubmissionLots = new Set(submissionResult.rows
    .filter((row) => String(row.status || '').toLowerCase() === 'used')
    .map((row) => normalizeBillingLot(row.lot_number))
    .filter(Boolean))
  const invoicedElectricCamperIds = new Set(currentElectricInvoices.map((invoice) => String(invoice.camper_id)))
  const electricSitesLeft = campers.filter((camper) =>
    !completedSubmissionLots.has(normalizeBillingLot(camper.lot_number)) && !invoicedElectricCamperIds.has(String(camper.id))
  ).length

  const access = campers
    .filter((camper) => camper.secondary_email || camper.alternate_phone || camper.second_profile_phone)
    .map((camper) => ({
      camperId: camper.id,
      lotNumber: camper.lot_number,
      camperName: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
      secondaryName: `${camper.second_profile_first_name || ''} ${camper.second_profile_last_name || ''}`.trim(),
      primaryEmail: camper.email || '',
      secondaryEmail: camper.secondary_email || '',
      phones: [camper.phone, camper.alternate_phone, camper.second_profile_phone].filter(Boolean),
      kind: 'household',
    }))

  for (const link of authorizedBillingLinks) {
    const owner = campers.find((camper) => normalizeBillingLot(camper.lot_number) === normalizeBillingLot(link.ownerLot))
    const delegate = campers.find((camper) =>
      [camper.email, camper.secondary_email].some((email) => normalizeBillingEmail(email) === normalizeBillingEmail(link.delegateEmail))
    )
    access.push({
      camperId: owner?.id || '',
      lotNumber: link.ownerLot,
      camperName: owner ? `${owner.first_name || ''} ${owner.last_name || ''}`.trim() : 'Owner record not found',
      secondaryName: delegate ? `${delegate.first_name || ''} ${delegate.last_name || ''}`.trim() : 'Authorized bill payer',
      primaryEmail: owner?.email || '',
      secondaryEmail: link.delegateEmail,
      phones: [],
      kind: 'billing-delegate',
    })
  }

  const health = [
    { key: 'communications', label: 'Failed communications', count: failedTexts.length + failedInvites.length, href: '/admin/texts', tone: failedTexts.length + failedInvites.length ? 'red' : 'green', owner: 'Office', nextAction: 'Review failure and resend only if still needed', oldestOpenAt: oldestDate([...failedTexts, ...failedInvites], 'sent_at', 'created_at') },
    { key: 'printing', label: 'Print/report problems', count: failedReports.length, href: '/admin/system-health#delivery', tone: failedReports.length ? 'red' : 'green', owner: 'Office', nextAction: 'Open the failed report and correct its destination', oldestOpenAt: oldestDate(failedReports, 'completed_at', 'started_at', 'report_date') },
    { key: 'documents', label: 'Documents awaiting signatures', count: unsignedDocuments.length, href: '/admin/documents', tone: unsignedDocuments.length ? 'gold' : 'green', owner: 'Office', nextAction: 'Review signer status and follow up', oldestOpenAt: oldestDate(unsignedDocuments, 'uploaded_at') },
    { key: 'billing', label: 'Past-due invoices', count: pastDueInvoices.length, href: '/admin/open-balance', tone: pastDueInvoices.length ? 'red' : 'green', owner: 'Office', nextAction: 'Review balance and latest payment activity', oldestOpenAt: oldestDate(pastDueInvoices, 'due_date', 'created_at') },
    { key: 'maintenance', label: 'Maintenance awaiting approval', count: pendingMaintenance.length, href: '/admin/maintenance', tone: pendingMaintenance.length ? 'gold' : 'green', owner: 'Office', nextAction: 'Approve, assign, or close the request', oldestOpenAt: oldestDate(pendingMaintenance, 'created_at') },
    { key: 'pump', label: 'Pump-outs waiting', count: openPumpOuts.length, href: '/admin/pump-outs', tone: openPumpOuts.length ? 'gold' : 'green', owner: 'Maintenance', nextAction: 'Schedule or complete the oldest request', oldestOpenAt: oldestDate(openPumpOuts, 'requested_at') },
    { key: 'messages', label: 'Unread office messages', count: unreadMessages.length, href: '/admin/messages', tone: unreadMessages.length ? 'gold' : 'green', owner: 'Office', nextAction: 'Read and reply to the camper', oldestOpenAt: oldestDate(unreadMessages, 'created_at') },
    { key: 'profiles', label: 'Profiles missing email or phone', count: missingContact.length, href: '/admin/campers', tone: missingContact.length ? 'gold' : 'green', owner: 'Office', nextAction: 'Confirm and add the missing contact detail', oldestOpenAt: null },
  ]

  const failures = [
    ...failedTexts.map((item) => ({ id: item.id, channel: item.provider || 'text', lot: oneRelationship(item.campers)?.lot_number || '', recipient: item.recipient_phone || item.recipient_email || '', error: item.error_message || 'Delivery failed', date: item.sent_at })),
    ...failedInvites.map((item) => ({ id: item.id, channel: item.delivery_provider || 'portal email', lot: '', recipient: item.email || '', error: item.error_message || 'Invite failed', date: item.created_at })),
    ...failedReports.map((item) => ({ id: item.id, channel: 'printer/report', lot: '', recipient: item.report_key || '', error: item.error_message || item.status, date: item.completed_at || item.started_at })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)))

  const deliveryHistory = [
    ...textResult.rows.map((item) => ({ id: `text-${item.id}`, channel: item.provider || item.reminder_type || 'text', status: item.status || 'sent', lot: oneRelationship(item.campers)?.lot_number || '', recipient: item.recipient_phone || item.recipient_email || '', detail: item.error_message || item.reminder_type || 'Notification sent', date: item.sent_at })),
    ...inviteResult.rows.map((item) => ({ id: `invite-${item.id}`, channel: item.delivery_provider || 'portal email', status: item.delivery_status || 'sent', lot: '', recipient: item.email || '', detail: item.error_message || 'Portal setup delivery', date: item.created_at })),
    ...reportResult.rows.map((item) => ({ id: `report-${item.id}`, channel: 'printer/report', status: item.status || 'completed', lot: '', recipient: item.report_key || '', detail: item.error_message || 'Scheduled report run', date: item.completed_at || item.started_at || item.report_date })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 300)

  const recentActivity = [
    ...notificationResult.rows.slice(0, 60).map((item) => ({ id: `notification-${item.id}`, type: item.type, title: item.title, detail: item.message, lot: item.lot_number, date: item.created_at, href: '/admin/notifications' })),
    ...invoices.slice(0, 50).map((item) => ({ id: `invoice-${item.id}`, type: 'invoice', title: `${item.invoice_type || 'Invoice'} · ${item.invoice_number || ''}`, detail: `$${Number(item.total_due || 0).toFixed(2)} · ${item.status || 'open'}`, lot: item.campers?.lot_number, date: item.paid_at || item.created_at, href: `/admin/invoices/${item.id}` })),
    ...maintenanceResult.rows.slice(0, 40).map((item) => ({ id: `maintenance-${item.id}`, type: 'maintenance', title: item.title || 'Maintenance', detail: item.status || 'Open', lot: item.lot_number, date: item.completed_at || item.created_at, href: `/admin/maintenance/${item.id}` })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 100)

  return {
    generatedAt: new Date().toISOString(),
    today,
    health,
    totals: {
      activeCampers: campers.length,
      openBalance: money(openInvoices),
      pastDueBalance: money(pastDueInvoices),
      paidRevenue: money(invoices.filter((invoice) => String(invoice.status).toLowerCase() === 'paid')),
      unreadMessages: unreadMessages.length,
      unsignedDocuments: unsignedDocuments.length,
      openMaintenance: openMaintenance.length,
      openPumpOuts: openPumpOuts.length,
      openSiteCare: openSiteCare.length,
      failedDeliveries: failures.length,
      optedOutCampers: optedOut.length,
      electricInvoiced: money(currentElectricInvoices),
      electricPaid: money(currentElectricInvoices.filter((invoice) => String(invoice.status).toLowerCase() === 'paid')),
      electricSitesLeft,
    },
    campers,
    invoices,
    documents,
    maintenance: maintenanceResult.rows,
    pumpOuts: pumpResult.rows,
    messages: messageResult.rows,
    deliveries: textResult.rows,
    deliveryHistory,
    failures,
    access,
    recentActivity,
    errors: [camperResult, invoiceResult, documentResult, maintenanceResult, pumpResult, messageResult, textResult, inviteResult, reportResult, notificationResult, siteCareResult, submissionResult]
      .map((result) => result.error)
      .filter(Boolean),
  }
}

export type OperationsSnapshot = Awaited<ReturnType<typeof loadOperationsSnapshot>>

export function searchOperations(snapshot: OperationsSnapshot, rawQuery: unknown) {
  const query = String(rawQuery || '').trim().toLowerCase()
  if (!query) return { campers: [], invoices: [], maintenance: [], documents: [], activity: [] }
  const includes = (...values: unknown[]) => values.some((value) => String(value || '').toLowerCase().includes(query))
  return {
    campers: snapshot.campers.filter((item) => includes(item.first_name, item.last_name, item.second_profile_first_name, item.second_profile_last_name, item.lot_number, item.email, item.secondary_email, item.phone, item.alternate_phone, item.second_profile_phone)).slice(0, 20),
    invoices: snapshot.invoices.filter((item) => {
      const camper = oneRelationship(item.campers)
      return includes(item.invoice_number, item.invoice_type, camper?.first_name, camper?.last_name, camper?.lot_number)
    }).slice(0, 20),
    maintenance: snapshot.maintenance.filter((item) => includes(item.title, item.status, item.priority, item.lot_number)).slice(0, 20),
    documents: snapshot.documents.filter((item) => {
      const camper = oneRelationship(item.campers)
      return includes(item.document_name, item.document_type, item.signature_status, camper?.first_name, camper?.last_name, camper?.lot_number)
    }).slice(0, 20),
    activity: snapshot.recentActivity.filter((item) => includes(item.title, item.detail, item.lot, item.type)).slice(0, 20),
  }
}
