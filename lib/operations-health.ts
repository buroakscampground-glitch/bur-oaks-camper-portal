import { authorizedBillingLinks, normalizeBillingEmail, normalizeBillingLot } from './authorized-billing'
import { isOperationalCamper } from './camper-records'
import { todayInCentral } from './invoice-texting'

async function safeRows(query: any) {
  try {
    const result = await query
    return { rows: result.data || [], error: result.error?.message || '' }
  } catch (error: any) {
    return { rows: [], error: String(error?.message || error) }
  }
}

function money(rows: any[]) {
  return Number(rows.reduce((sum, row) => sum + Number(row.total_due || 0), 0).toFixed(2))
}

function isOpenStatus(status: unknown) {
  return !['paid', 'cancelled', 'canceled', 'void', 'refunded', 'completed', 'closed', 'resolved'].includes(String(status || '').toLowerCase())
}

function monthStart(today: string) {
  return `${today.slice(0, 7)}-01T00:00:00.000Z`
}

export async function loadOperationsSnapshot(client: any) {
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
    safeRows(client.from('campers').select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,email,secondary_email,phone,alternate_phone,second_profile_phone,sms_opt_in,role,active').order('lot_number')),
    safeRows(client.from('invoices').select('id,camper_id,invoice_number,invoice_type,total_due,due_date,status,paid_at,created_at,campers(first_name,last_name,lot_number)').order('created_at', { ascending: false }).limit(1000)),
    safeRows(client.from('documents').select('id,camper_id,document_name,document_type,signature_status,requires_two_signatures,signed_at,created_at,campers(first_name,last_name,lot_number)').order('created_at', { ascending: false }).limit(500)),
    safeRows(client.from('maintenance_tickets').select('id,camper_id,lot_number,title,status,priority,admin_approved,created_at,completed_at').order('created_at', { ascending: false }).limit(500)),
    safeRows(client.from('sewer_pump_out_requests').select('id,camper_id,lot_number,camper_name,status,billed_at,requested_at,completed_at').order('requested_at', { ascending: false }).limit(500)),
    safeRows(client.from('office_messages').select('id,camper_id,lot_number,sender_role,sender_name,body,read_by_admin_at,created_at').order('created_at', { ascending: false }).limit(300)),
    safeRows(client.from('text_reminders').select('id,camper_id,invoice_id,reminder_type,status,provider,recipient_phone,recipient_email,error_message,sent_at,campers(first_name,last_name,lot_number)').gte('sent_at', recentCutoff).order('sent_at', { ascending: false }).limit(500)),
    safeRows(client.from('portal_invite_log').select('id,camper_id,email,delivery_status,delivery_provider,error_message,created_at').gte('created_at', recentCutoff).order('created_at', { ascending: false }).limit(300)),
    safeRows(client.from('scheduled_reports').select('*').gte('report_date', today.slice(0, 7) + '-01').order('report_date', { ascending: false }).limit(100)),
    safeRows(client.from('admin_notifications').select('*').order('created_at', { ascending: false }).limit(300)),
    safeRows(client.from('site_care_notices').select('id,camper_id,lot_number,title,status,priority,due_date,created_at').order('created_at', { ascending: false }).limit(300)),
    safeRows(client.from('meter_reading_submissions').select('id,camper_id,lot_number,status,captured_at,invoice_id').gte('captured_at', currentMonthStart).neq('status', 'cancelled').order('captured_at', { ascending: false }).limit(300)),
  ])

  const campers = camperResult.rows.filter((camper: any) => camper.active !== false && isOperationalCamper(camper))
  const invoices = invoiceResult.rows
  const openInvoices = invoices.filter((invoice: any) => isOpenStatus(invoice.status))
  const pastDueInvoices = openInvoices.filter((invoice: any) => invoice.due_date && invoice.due_date < today)
  const unsignedDocuments = documentResult.rows.filter((document: any) => !['signed', 'not_required', 'declined'].includes(String(document.signature_status || '').toLowerCase()))
  const openMaintenance = maintenanceResult.rows.filter((ticket: any) => isOpenStatus(ticket.status))
  const pendingMaintenance = openMaintenance.filter((ticket: any) => ticket.admin_approved !== true)
  const openPumpOuts = pumpResult.rows.filter((request: any) => request.status === 'requested' && !request.billed_at)
  const unreadMessages = messageResult.rows.filter((message: any) => message.sender_role === 'camper' && !message.read_by_admin_at)
  const failedTexts = textResult.rows.filter((delivery: any) => String(delivery.status || '').toLowerCase() === 'failed')
  const failedInvites = inviteResult.rows.filter((delivery: any) => String(delivery.delivery_status || '').toLowerCase() === 'failed')
  const failedReports = reportResult.rows.filter((report: any) => ['failed', 'partial'].includes(String(report.status || '').toLowerCase()))
  const openSiteCare = siteCareResult.rows.filter((notice: any) => String(notice.status || '') !== 'Resolved')
  const missingContact = campers.filter((camper: any) => !camper.email || !camper.phone)
  const optedOut = campers.filter((camper: any) => camper.sms_opt_in !== true)
  const currentElectricInvoices = invoices.filter((invoice: any) =>
    String(invoice.invoice_type || '').toLowerCase().includes('electric') &&
    String(invoice.created_at || '') >= currentMonthStart
  )
  const completedSubmissionLots = new Set(submissionResult.rows
    .filter((row: any) => String(row.status || '').toLowerCase() === 'used')
    .map((row: any) => normalizeBillingLot(row.lot_number))
    .filter(Boolean))
  const invoicedElectricCamperIds = new Set(currentElectricInvoices.map((invoice: any) => String(invoice.camper_id)))
  const electricSitesLeft = campers.filter((camper: any) =>
    !completedSubmissionLots.has(normalizeBillingLot(camper.lot_number)) && !invoicedElectricCamperIds.has(String(camper.id))
  ).length

  const access = campers
    .filter((camper: any) => camper.secondary_email || camper.alternate_phone || camper.second_profile_phone)
    .map((camper: any) => ({
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
    const owner = campers.find((camper: any) => normalizeBillingLot(camper.lot_number) === normalizeBillingLot(link.ownerLot))
    const delegate = campers.find((camper: any) =>
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
    { key: 'communications', label: 'Failed communications', count: failedTexts.length + failedInvites.length, href: '/admin/texts', tone: failedTexts.length + failedInvites.length ? 'red' : 'green' },
    { key: 'printing', label: 'Print/report problems', count: failedReports.length, href: '/admin/system-health#delivery', tone: failedReports.length ? 'red' : 'green' },
    { key: 'documents', label: 'Documents awaiting signatures', count: unsignedDocuments.length, href: '/admin/documents', tone: unsignedDocuments.length ? 'gold' : 'green' },
    { key: 'billing', label: 'Past-due invoices', count: pastDueInvoices.length, href: '/admin/open-balance', tone: pastDueInvoices.length ? 'red' : 'green' },
    { key: 'maintenance', label: 'Maintenance awaiting approval', count: pendingMaintenance.length, href: '/admin/maintenance', tone: pendingMaintenance.length ? 'gold' : 'green' },
    { key: 'pump', label: 'Pump-outs waiting', count: openPumpOuts.length, href: '/admin/pump-outs', tone: openPumpOuts.length ? 'gold' : 'green' },
    { key: 'messages', label: 'Unread office messages', count: unreadMessages.length, href: '/admin/messages', tone: unreadMessages.length ? 'gold' : 'green' },
    { key: 'profiles', label: 'Profiles missing email or phone', count: missingContact.length, href: '/admin/campers', tone: missingContact.length ? 'gold' : 'green' },
  ]

  const failures = [
    ...failedTexts.map((item: any) => ({ id: item.id, channel: item.provider || 'text', lot: item.campers?.lot_number || '', recipient: item.recipient_phone || item.recipient_email || '', error: item.error_message || 'Delivery failed', date: item.sent_at })),
    ...failedInvites.map((item: any) => ({ id: item.id, channel: item.delivery_provider || 'portal email', lot: '', recipient: item.email || '', error: item.error_message || 'Invite failed', date: item.created_at })),
    ...failedReports.map((item: any) => ({ id: item.id, channel: 'printer/report', lot: '', recipient: item.report_key || '', error: item.error_message || item.status, date: item.completed_at || item.started_at })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date)))

  const deliveryHistory = [
    ...textResult.rows.map((item: any) => ({ id: `text-${item.id}`, channel: item.provider || item.reminder_type || 'text', status: item.status || 'sent', lot: item.campers?.lot_number || '', recipient: item.recipient_phone || item.recipient_email || '', detail: item.error_message || item.reminder_type || 'Notification sent', date: item.sent_at })),
    ...inviteResult.rows.map((item: any) => ({ id: `invite-${item.id}`, channel: item.delivery_provider || 'portal email', status: item.delivery_status || 'sent', lot: '', recipient: item.email || '', detail: item.error_message || 'Portal setup delivery', date: item.created_at })),
    ...reportResult.rows.map((item: any) => ({ id: `report-${item.id}`, channel: 'printer/report', status: item.status || 'completed', lot: '', recipient: item.report_key || '', detail: item.error_message || 'Scheduled report run', date: item.completed_at || item.started_at || item.report_date })),
  ].sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))).slice(0, 300)

  const recentActivity = [
    ...notificationResult.rows.slice(0, 60).map((item: any) => ({ id: `notification-${item.id}`, type: item.type, title: item.title, detail: item.message, lot: item.lot_number, date: item.created_at, href: '/admin/notifications' })),
    ...invoices.slice(0, 50).map((item: any) => ({ id: `invoice-${item.id}`, type: 'invoice', title: `${item.invoice_type || 'Invoice'} · ${item.invoice_number || ''}`, detail: `$${Number(item.total_due || 0).toFixed(2)} · ${item.status || 'open'}`, lot: item.campers?.lot_number, date: item.paid_at || item.created_at, href: `/admin/invoices/${item.id}` })),
    ...maintenanceResult.rows.slice(0, 40).map((item: any) => ({ id: `maintenance-${item.id}`, type: 'maintenance', title: item.title || 'Maintenance', detail: item.status || 'Open', lot: item.lot_number, date: item.completed_at || item.created_at, href: `/admin/maintenance/${item.id}` })),
  ].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 100)

  return {
    generatedAt: new Date().toISOString(),
    today,
    health,
    totals: {
      activeCampers: campers.length,
      openBalance: money(openInvoices),
      pastDueBalance: money(pastDueInvoices),
      paidRevenue: money(invoices.filter((invoice: any) => String(invoice.status).toLowerCase() === 'paid')),
      unreadMessages: unreadMessages.length,
      unsignedDocuments: unsignedDocuments.length,
      openMaintenance: openMaintenance.length,
      openPumpOuts: openPumpOuts.length,
      openSiteCare: openSiteCare.length,
      failedDeliveries: failures.length,
      optedOutCampers: optedOut.length,
      electricInvoiced: money(currentElectricInvoices),
      electricPaid: money(currentElectricInvoices.filter((invoice: any) => String(invoice.status).toLowerCase() === 'paid')),
      electricSitesLeft,
    },
    campers,
    invoices,
    documents: documentResult.rows,
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

export function searchOperations(snapshot: any, rawQuery: unknown) {
  const query = String(rawQuery || '').trim().toLowerCase()
  if (!query) return { campers: [], invoices: [], maintenance: [], documents: [], activity: [] }
  const includes = (...values: unknown[]) => values.some((value) => String(value || '').toLowerCase().includes(query))
  return {
    campers: snapshot.campers.filter((item: any) => includes(item.first_name, item.last_name, item.second_profile_first_name, item.second_profile_last_name, item.lot_number, item.email, item.secondary_email, item.phone, item.alternate_phone, item.second_profile_phone)).slice(0, 20),
    invoices: snapshot.invoices.filter((item: any) => includes(item.invoice_number, item.invoice_type, item.campers?.first_name, item.campers?.last_name, item.campers?.lot_number)).slice(0, 20),
    maintenance: snapshot.maintenance.filter((item: any) => includes(item.title, item.status, item.priority, item.lot_number)).slice(0, 20),
    documents: snapshot.documents.filter((item: any) => includes(item.document_name, item.document_type, item.signature_status, item.campers?.first_name, item.campers?.last_name, item.campers?.lot_number)).slice(0, 20),
    activity: snapshot.recentActivity.filter((item: any) => includes(item.title, item.detail, item.lot, item.type)).slice(0, 20),
  }
}
