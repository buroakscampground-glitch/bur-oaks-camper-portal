import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { normalizeBillingEmail, normalizeBillingLot } from '../../../lib/authorized-billing'
import { camperSmsPhones } from '../../../lib/camper-sms'
import { reconcileRenewalsWithDocuments } from '../../../lib/renewal-document-reconciliation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const oneTimeKey = 'full-audit-5f4c91e7b308'

type QueryResult = { rows: any[]; error: string }

async function allRows(admin: any, table: string): Promise<QueryResult> {
  const rows: any[] = []
  for (let start = 0; start < 5000; start += 1000) {
    const result = await admin.from(table).select('*').range(start, start + 999)
    if (result.error) return { rows, error: result.error.message }
    rows.push(...(result.data || []))
    if ((result.data || []).length < 1000) break
  }
  return { rows, error: '' }
}

function openStatus(value: unknown) {
  return !['paid', 'void', 'cancelled', 'canceled', 'refunded', 'closed', 'resolved'].includes(String(value || '').toLowerCase())
}

function cents(value: unknown) {
  return Math.round(Number(value || 0) * 100)
}

function label(camper: any) {
  return `${camper?.lot_number || '?'} · ${camper?.first_name || ''} ${camper?.last_name || ''}`.trim()
}

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })
  const admin = createClient(url, key)

  const tables = [
    'campers', 'lots', 'invoices', 'invoice_items', 'documents', 'season_renewals',
    'sewer_pump_out_requests', 'maintenance_tickets', 'site_care_notices',
    'text_reminders', 'portal_invite_log', 'scheduled_reports', 'sms_phone_consents',
    'meter_reading_submissions', 'electric_readings', 'manual_payments',
    'manual_payment_allocations', 'account_credits', 'admin_notifications',
  ]
  const results = Object.fromEntries(await Promise.all(tables.map(async (table) => [table, await allRows(admin, table)]))) as Record<string, QueryResult>
  const queryErrors = Object.entries(results).filter(([, result]) => result.error).map(([table, result]) => ({ table, error: result.error }))
  const rows = (table: string) => results[table]?.rows || []
  const campers = rows('campers')
  const active = campers.filter((camper) => camper.active !== false && isOperationalCamper(camper))
  const camperById = new Map(campers.map((camper) => [String(camper.id), camper]))
  const invoices = rows('invoices')
  const invoiceById = new Map(invoices.map((invoice) => [String(invoice.id), invoice]))
  const itemsByInvoice = new Map<string, any[]>()
  for (const item of rows('invoice_items')) {
    const id = String(item.invoice_id)
    itemsByInvoice.set(id, [...(itemsByInvoice.get(id) || []), item])
  }

  const duplicateLots = [...new Set(active.map((camper) => normalizeBillingLot(camper.lot_number)).filter(Boolean))]
    .map((lot) => ({ lot, campers: active.filter((camper) => normalizeBillingLot(camper.lot_number) === lot).map(label) }))
    .filter((entry) => entry.campers.length > 1)
  const emailOwners = new Map<string, any[]>()
  for (const camper of active) for (const raw of [camper.email, camper.secondary_email]) {
    const email = normalizeBillingEmail(raw)
    if (email) emailOwners.set(email, [...(emailOwners.get(email) || []), camper])
  }
  const duplicateEmails = [...emailOwners.entries()].filter(([, owners]) => new Set(owners.map((item) => item.id)).size > 1)
    .map(([email, owners]) => ({ email, campers: [...new Set(owners.map(label))] }))

  const invoiceMath = invoices.flatMap((invoice) => {
    const items = itemsByInvoice.get(String(invoice.id)) || []
    if (!items.length) return []
    const itemTotal = items.reduce((sum, item) => sum + cents(item.total), 0)
    const expected = itemTotal + cents(invoice.late_fee)
    return Math.abs(expected - cents(invoice.total_due)) > 1
      ? [{ invoice: invoice.invoice_number, camper: label(camperById.get(String(invoice.camper_id))), status: invoice.status, itemTotal: itemTotal / 100, lateFee: Number(invoice.late_fee || 0), totalDue: Number(invoice.total_due || 0) }]
      : []
  })
  const duplicateInvoiceNumbers = [...new Set(invoices.map((invoice) => String(invoice.invoice_number || '')).filter(Boolean))]
    .map((number) => ({ number, ids: invoices.filter((invoice) => String(invoice.invoice_number) === number).map((invoice) => invoice.id) }))
    .filter((entry) => entry.ids.length > 1)
  const staleProcessing = invoices.filter((invoice) => String(invoice.status).toLowerCase() === 'processing' && Date.now() - new Date(invoice.updated_at || invoice.created_at || 0).getTime() > 7 * 86400000)
    .map((invoice) => ({ invoice: invoice.invoice_number, camper: label(camperById.get(String(invoice.camper_id))), reference: invoice.payment_reference }))
  const paidMissingEvidence = invoices.filter((invoice) => String(invoice.status).toLowerCase() === 'paid' && (!invoice.paid_at || !invoice.payment_method))
    .map((invoice) => ({ invoice: invoice.invoice_number, camper: label(camperById.get(String(invoice.camper_id))), paidAt: invoice.paid_at, method: invoice.payment_method }))
  const invalidOpenAmounts = invoices.filter((invoice) => openStatus(invoice.status) && Number(invoice.total_due || 0) <= 0)
    .map((invoice) => ({ invoice: invoice.invoice_number, camper: label(camperById.get(String(invoice.camper_id))), status: invoice.status, total: invoice.total_due }))

  const pumps = rows('sewer_pump_out_requests')
  const pumpProblems = pumps.flatMap((pump) => {
    const problems: string[] = []
    if (pump.billed_at && !pump.billed_invoice_id) problems.push('billed date without invoice')
    if (pump.billed_invoice_id && !invoiceById.has(String(pump.billed_invoice_id))) problems.push('billing invoice missing')
    if (String(pump.status).toLowerCase() === 'cancelled' && pump.billed_at) problems.push('cancelled but billed')
    if (String(pump.status).toLowerCase() === 'completed' && !pump.completed_at) problems.push('completed without completion time')
    const camper = camperById.get(String(pump.camper_id))
    if (camper && normalizeBillingLot(camper.lot_number) !== normalizeBillingLot(pump.lot_number) && !['TEMP1', '18'].includes(normalizeBillingLot(pump.lot_number))) problems.push('service lot differs from camper lot')
    return problems.length ? [{ id: pump.id, lot: pump.lot_number, camper: label(camper), problems }] : []
  })

  const maintenanceProblems = rows('maintenance_tickets').flatMap((ticket) => {
    const problems: string[] = []
    const completed = ['completed', 'complete'].includes(String(ticket.status || '').toLowerCase())
    if (completed && !ticket.completed_at) problems.push('completed without completion time')
    if (ticket.work_order_printed_at && ticket.admin_approved !== true) problems.push('printed without admin approval')
    return problems.length ? [{ id: ticket.id, lot: ticket.lot_number, title: ticket.title, problems }] : []
  })

  const documents = rows('documents')
  const documentProblems = documents.flatMap((document) => {
    const problems: string[] = []
    if (String(document.signature_status).toLowerCase() === 'signed') {
      if (!document.signed_at || !String(document.signed_name || '').trim() || !String(document.signature_record_hash || '').trim()) problems.push('signed status missing secure first-signature evidence')
      if (document.requires_two_signatures && (!String(document.second_signed_name || '').trim() || !String(document.second_signature_record_hash || '').trim())) problems.push('two-signature document missing secure second signature')
    }
    return problems.length ? [{ id: document.id, camper: label(camperById.get(String(document.camper_id))), name: document.document_name, problems }] : []
  })
  const renewals = rows('season_renewals')
  const renewalProblems = renewals.flatMap((renewal) => {
    const document = documents.find((item) => String(item.id) === String(renewal.renewal_document_id))
    const problems: string[] = []
    if (renewal.renewal_document_id && !document) problems.push('linked renewal document missing')
    if (document && String(document.signature_status).toLowerCase() === 'signed' && String(renewal.status) !== 'Renewing') problems.push('signed document but renewal status not Renewing')
    if (!renewal.contract_end_date) problems.push('missing contract end date')
    return problems.length ? [{
      renewalId: renewal.id,
      documentId: renewal.renewal_document_id,
      camper: label(camperById.get(String(renewal.camper_id))),
      status: renewal.status,
      contractEnd: renewal.contract_end_date,
      document: document ? { name: document.document_name, status: document.signature_status, signedAt: document.signed_at } : null,
      problems,
    }] : []
  })

  const consentRows = rows('sms_phone_consents')
  const consentProblems = active.filter((camper) => camper.sms_opt_in === true).flatMap((camper) => {
    const phoneValues = [camper.phone, camper.alternate_phone, camper.second_profile_phone].map((value) => String(value || '').replace(/\D/g, '')).filter((value) => value.length === 10 || (value.length === 11 && value.startsWith('1')))
    const consents = consentRows.filter((item) => String(item.camper_id) === String(camper.id))
    const missing = phoneValues.filter((phone) => !consents.some((item) => String(item.phone_number || '').replace(/\D/g, '').endsWith(phone.slice(-10))))
    return missing.length ? [{ camper: label(camper), missingConsentRecords: missing.length }] : []
  })

  let authUsers: any[] = []
  let authError = ''
  try {
    const auth = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    authUsers = auth.data.users || []
    authError = auth.error?.message || ''
  } catch (error: any) { authError = String(error?.message || error) }
  const authProblems = authUsers.flatMap((user) => {
    const email = normalizeBillingEmail(user.email)
    const matches = campers.filter((camper) => camper.active !== false && [camper.email, camper.secondary_email].some((value) => normalizeBillingEmail(value) === email))
    const archivedMatches = campers.filter((camper) => camper.active === false && [camper.email, camper.secondary_email].some((value) => normalizeBillingEmail(value) === email))
    if (matches.length === 1) return []
    return [{ email, activeMatches: matches.map(label), archivedMatches: archivedMatches.map(label) }]
  })

  const recentCutoff = Date.now() - 45 * 86400000
  const failedTexts = rows('text_reminders').filter((item) => String(item.status).toLowerCase() === 'failed' && new Date(item.sent_at || item.created_at || 0).getTime() >= recentCutoff)
  const failedInvites = rows('portal_invite_log').filter((item) => String(item.delivery_status).toLowerCase() === 'failed' && new Date(item.created_at || 0).getTime() >= recentCutoff)
  const failedReports = rows('scheduled_reports').filter((item) => ['failed', 'partial'].includes(String(item.status).toLowerCase()) && new Date(item.report_date || 0).getTime() >= recentCutoff)
  const meterProblems = rows('meter_reading_submissions').flatMap((submission) => {
    const problems: string[] = []
    if (String(submission.status) === 'used' && !submission.invoice_id) problems.push('marked used without invoice')
    if (submission.invoice_id && !invoiceById.has(String(submission.invoice_id))) problems.push('invoice missing')
    if (submission.invoice_id && !rows('electric_readings').some((reading) => String(reading.invoice_id) === String(submission.invoice_id))) problems.push('invoice has no electric reading')
    return problems.length ? [{ id: submission.id, lot: submission.lot_number, status: submission.status, problems }] : []
  })
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const overdueSiteCare = rows('site_care_notices')
    .filter((notice) => String(notice.status) === 'Open' && String(notice.template_key || '').startsWith('auto:') && notice.due_date && String(notice.due_date) <= today)
    .map((notice) => ({ id: notice.id, camper: label(camperById.get(String(notice.camper_id))), title: notice.title, dueDate: notice.due_date, template: notice.template_key }))
  const renewalScheduleNotifications = rows('admin_notifications')
    .filter((notification) => String(notification.type) === 'renewal_rent_schedule')
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
    .slice(0, 12)
    .map((notification) => ({
      at: notification.created_at,
      lot: notification.lot_number,
      title: notification.title,
      message: notification.message,
      camper: label(camperById.get(String(notification.camper_id))),
    }))
  const deliveryRows = rows('text_reminders')
  const laterTextSuccess = (failed: any) => deliveryRows.some((item) => (
    String(item.status).toLowerCase() === 'sent'
    && String(item.reminder_type) === String(failed.reminder_type)
    && String(item.recipient_phone || item.recipient_email || '') === String(failed.recipient_phone || failed.recipient_email || '')
    && new Date(item.sent_at || item.created_at || 0).getTime() > new Date(failed.sent_at || failed.created_at || 0).getTime()
  ))
  const inviteRows = rows('portal_invite_log')
  const laterInviteSuccess = (failed: any) => inviteRows.some((item) => (
    String(item.delivery_status).toLowerCase() === 'sent'
    && normalizeBillingEmail(item.email) === normalizeBillingEmail(failed.email)
    && new Date(item.created_at || 0).getTime() > new Date(failed.created_at || 0).getTime()
  ))

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    counts: Object.fromEntries(tables.map((table) => [table, rows(table).length])),
    operational: {
      activeSites: active.length,
      lotRegistryRows: rows('lots').length,
      activeSitesMissingLotRegistry: active.filter((camper) => !rows('lots').some((lot) => normalizeBillingLot(lot.lot_number) === normalizeBillingLot(camper.lot_number))).map(label),
      authUsers: authUsers.length,
      openInvoices: invoices.filter((invoice) => openStatus(invoice.status)).length,
      openBalance: invoices.filter((invoice) => openStatus(invoice.status)).reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0),
      renewalScheduleNotifications,
    },
    queryErrors: [...queryErrors, ...(authError ? [{ table: 'auth.users', error: authError }] : [])],
    issues: { duplicateLots, duplicateEmails, authProblems, invoiceMath, duplicateInvoiceNumbers, staleProcessing, paidMissingEvidence, invalidOpenAmounts, pumpProblems, maintenanceProblems, documentProblems, renewalProblems, consentProblems, meterProblems, overdueSiteCare },
    delivery: {
      failedTexts: failedTexts.map((item) => ({ id: item.id, recipient: item.recipient_phone || item.recipient_email, type: item.reminder_type, error: item.error_message, at: item.sent_at, laterSuccess: laterTextSuccess(item) })),
      failedInvites: failedInvites.map((item) => ({ id: item.id, email: item.email, error: item.error_message, at: item.created_at, laterSuccess: laterInviteSuccess(item) })),
      failedReports: failedReports.map((item) => ({ key: item.report_key, date: item.report_date, status: item.status, office: item.office_email_status, printer: item.printer_email_status, error: item.error_message })),
    },
  }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })
  const admin = createClient(url, key)
  const body = await request.json().catch(() => ({}))

  if (body.action === 'sync-missing-phone-consents') {
    const [{ data: campers, error }, { data: allConsents, error: consentError }] = await Promise.all([
      admin.from('campers').select('id,phone,alternate_phone,second_profile_phone,sms_opt_in,active').eq('active', true).eq('sms_opt_in', true),
      admin.from('sms_phone_consents').select('camper_id,phone_number,opted_in'),
    ])
    if (error || consentError) return NextResponse.json({ error: error?.message || consentError?.message }, { status: 500 })
    const globallyStopped = new Set((allConsents || []).filter((row: any) => row.opted_in === false).map((row: any) => row.phone_number))
    const inserts: any[] = []
    for (const camper of campers || []) {
      const phones = camperSmsPhones(camper)
      if (!phones.length) continue
      const saved = new Set((allConsents || []).filter((row: any) => String(row.camper_id) === String(camper.id)).map((row: any) => row.phone_number))
      for (const phone of phones) if (!saved.has(phone)) inserts.push({
        camper_id: camper.id,
        phone_number: phone,
        opted_in: !globallyStopped.has(phone),
        opted_in_at: globallyStopped.has(phone) ? null : new Date().toISOString(),
        opted_out_at: globallyStopped.has(phone) ? new Date().toISOString() : null,
        source: 'full-system-audit-repair',
        updated_at: new Date().toISOString(),
      })
    }
    if (inserts.length) {
      const inserted = await admin.from('sms_phone_consents').insert(inserts)
      if (inserted.error) return NextResponse.json({ error: inserted.error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, inserted: inserts.length })
  }

  if (body.action === 'revoke-melissa-hasson-auth') {
    const targetEmail = 'theriversvedge@yahoo.com'
    const { data: campers, error: camperError } = await admin.from('campers').select('id,active,email,secondary_email,first_name,last_name,lot_number')
    if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })
    const matching = (campers || []).filter((camper) => [camper.email, camper.secondary_email].some((value) => normalizeBillingEmail(value) === targetEmail))
    if (matching.some((camper) => camper.active !== false) || !matching.some((camper) => camper.active === false)) {
      return NextResponse.json({ error: 'The archived-only Melissa Hasson identity could not be verified.' }, { status: 409 })
    }
    const auth = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    if (auth.error) return NextResponse.json({ error: auth.error.message }, { status: 500 })
    const users = (auth.data.users || []).filter((user) => normalizeBillingEmail(user.email) === targetEmail)
    for (const user of users) {
      const deleted = await admin.auth.admin.deleteUser(user.id)
      if (deleted.error) return NextResponse.json({ error: deleted.error.message }, { status: 500 })
    }
    return NextResponse.json({ success: true, deletedUsers: users.length, archivedRecordsPreserved: matching.length })
  }

  if (body.action === 'reconcile-secure-renewals') {
    const reconciliation = await reconcileRenewalsWithDocuments(admin)
    return NextResponse.json({ success: reconciliation.errors.length === 0, reconciliation }, { status: reconciliation.errors.length ? 500 : 200 })
  }

  return NextResponse.json({ error: 'Unknown audit repair.' }, { status: 400 })
}
