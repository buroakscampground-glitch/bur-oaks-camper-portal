import { NextResponse } from 'next/server'
import { nextSaturdayDinner } from '../../../lib/saturday-dinners'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { isOperationalCamper } from '../../../lib/camper-records'
import { ownerTextAlertConfigured } from '../../../lib/owner-alert-sms'

export const runtime = 'nodejs'

type LaunchItem = {
  id: string
  label: string
  status: 'ready' | 'warning' | 'action'
  detail: string
  href?: string
}

function item({
  id,
  label,
  status,
  detail,
  href,
}: LaunchItem): LaunchItem {
  return { id, label, status, detail, href }
}

function isTruthyEnv(value?: string) {
  return Boolean(value && value.trim() && !value.includes('your_') && value !== 'changeme')
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const today = new Date().toISOString().slice(0, 10)

  const [
    campersResult,
    invoicesResult,
    maintenanceResult,
    documentsResult,
    notificationsResult,
    eventsResult,
    inviteLogResult,
    pumpOutResult,
  ] = await Promise.all([
    context.admin.from('campers').select('id,email,secondary_email,active,role,lot_number').eq('active', true),
    context.admin.from('invoices').select('id,total_due,status'),
    context.admin.from('maintenance_tickets').select('id,status,priority,admin_approved'),
    context.admin.from('documents').select('id,signature_status,document_type,camper_id'),
    context.admin.from('admin_notifications').select('id,type,read_at').is('read_at', null),
    context.admin.from('events').select('id,event_date,title').gte('event_date', today),
    context.admin.from('portal_invite_log').select('id,email,status,created_at'),
    context.admin.from('sewer_pump_out_requests').select('id,status,billed_at'),
  ])

  const campers = campersResult.data || []
  const invoices = invoicesResult.data || []
  const maintenance = maintenanceResult.data || []
  const documents = documentsResult.data || []
  const notifications = notificationsResult.data || []
  const events = eventsResult.data || []
  const inviteLogs = inviteLogResult.data || []
  const pumpOuts = pumpOutResult.data || []

  const activeCampers = campers.filter(isOperationalCamper)
  const campersMissingEmail = activeCampers.filter((camper) => !camper.email && !camper.secondary_email)
  const unpaidInvoices = invoices.filter((invoice) => invoice.status !== 'paid')
  const openBalance = unpaidInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0)
  const pendingMaintenance = maintenance.filter((ticket) => ticket.admin_approved !== true)
  const activeMaintenance = maintenance.filter((ticket) => ticket.status !== 'Completed')
  const emergencyMaintenance = maintenance.filter((ticket) => ticket.priority === 'Emergency' && ticket.status !== 'Completed')
  const unreadMaintenance = notifications.filter((notification) => notification.type === 'maintenance_request')
  const unreadPayments = notifications.filter((notification) => notification.type === 'payment_received')
  const unreadRsvps = notifications.filter((notification) => notification.type === 'event_rsvp')
  const unreadDinners = notifications.filter((notification) => notification.type === 'saturday_dinner')
  const unreadPumpOuts = notifications.filter((notification) => notification.type === 'sewer_pump_out')
  const openPumpOuts = pumpOuts.filter((request) => request.status !== 'cancelled' && !request.billed_at)
  const waitingPumpOuts = openPumpOuts.filter((request) => request.status !== 'completed')
  const pendingDocuments = documents.filter((document) => {
    const status = String(document.signature_status || '').toLowerCase()
    return status !== 'signed' && status !== 'not_required'
  })
  const insuranceCamperIds = new Set(
    documents
      .filter((document) => document.document_type === 'Golf Cart Insurance')
      .map((document) => String(document.camper_id))
  )
  const insuranceMissing = activeCampers.filter((camper) => !insuranceCamperIds.has(String(camper.id)))

  let acceptedPortalUsers = 0
  try {
    const { data } = await context.admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    acceptedPortalUsers = (data.users || []).filter((user) => {
      const completedSetup = user.user_metadata?.portal_setup_complete === true
      const establishedUser = Boolean(user.email_confirmed_at || user.last_sign_in_at)
      return completedSetup || establishedUser
    }).length
  } catch {
    acceptedPortalUsers = 0
  }

  const configItems: LaunchItem[] = [
    item({
      id: 'stripe',
      label: 'Stripe payments',
      status: isTruthyEnv(process.env.STRIPE_SECRET_KEY) && isTruthyEnv(process.env.STRIPE_WEBHOOK_SECRET) ? 'ready' : 'action',
      detail:
        isTruthyEnv(process.env.STRIPE_SECRET_KEY) && isTruthyEnv(process.env.STRIPE_WEBHOOK_SECRET)
          ? 'Stripe secret and webhook are configured.'
          : 'Add Stripe secret and webhook secret in Vercel before launch.',
      href: '/admin/invoices',
    }),
    item({
      id: 'resend',
      label: 'Email alerts',
      status: isTruthyEnv(process.env.RESEND_API_KEY) ? 'ready' : 'action',
      detail: isTruthyEnv(process.env.RESEND_API_KEY)
        ? 'Resend is connected for alerts and portal invitations.'
        : 'Add RESEND_API_KEY in Vercel to send alerts and invitations.',
      href: '/admin/email-test',
    }),
    item({
      id: 'admin-alerts',
      label: 'Admin alert inbox',
      status: notifications.length ? 'warning' : 'ready',
      detail: notifications.length ? `${notifications.length} unread alert${notifications.length === 1 ? '' : 's'} waiting.` : 'No unread admin alerts right now.',
      href: '/admin/notifications',
    }),
    item({
      id: 'owner-text-alerts',
      label: 'Owner text alerts',
      status: ownerTextAlertConfigured() ? 'ready' : 'warning',
      detail: ownerTextAlertConfigured()
        ? 'Owner text alerts are connected for important camper activity.'
        : 'Add OWNER_ALERT_PHONE in Vercel if you want important alerts texted directly to you.',
      href: '/admin/texts',
    }),
  ]

  const camperItems: LaunchItem[] = [
    item({
      id: 'camper-emails',
      label: 'Camper emails',
      status: campersMissingEmail.length ? 'action' : 'ready',
      detail: campersMissingEmail.length
        ? `${campersMissingEmail.length} active camper${campersMissingEmail.length === 1 ? '' : 's'} missing an email.`
        : 'Every active camper has at least one email on file.',
      href: '/admin/campers',
    }),
    item({
      id: 'portal-accounts',
      label: 'Portal access',
      status: acceptedPortalUsers >= Math.max(1, Math.floor(activeCampers.length * 0.75)) ? 'ready' : 'warning',
      detail: `${acceptedPortalUsers} portal account${acceptedPortalUsers === 1 ? '' : 's'} appear accepted. ${inviteLogs.length} invite email${inviteLogs.length === 1 ? '' : 's'} logged.`,
      href: '/admin/campers',
    }),
    item({
      id: 'insurance',
      label: 'Golf cart insurance optional',
      status: 'ready',
      detail: insuranceMissing.length
        ? `${insuranceMissing.length} active camper${insuranceMissing.length === 1 ? '' : 's'} have not uploaded optional insurance yet.`
        : 'Optional golf cart insurance files are on file.',
      href: '/admin/campers',
    }),
  ]

  const operationsItems: LaunchItem[] = [
    item({
      id: 'maintenance',
      label: 'Maintenance queue',
      status: pendingMaintenance.length || emergencyMaintenance.length ? 'action' : activeMaintenance.length ? 'warning' : 'ready',
      detail: `${pendingMaintenance.length} awaiting approval · ${activeMaintenance.length} active · ${emergencyMaintenance.length} emergency.`,
      href: '/admin/maintenance',
    }),
    item({
      id: 'billing',
      label: 'Open balances',
      status: openBalance > 0 ? 'warning' : 'ready',
      detail: openBalance > 0
        ? `$${openBalance.toFixed(2)} open across ${unpaidInvoices.length} invoice${unpaidInvoices.length === 1 ? '' : 's'}.`
        : 'No unpaid invoice balance found.',
      href: '/admin/open-balance',
    }),
    item({
      id: 'pump-outs',
      label: 'Sewer pump-outs',
      status: waitingPumpOuts.length ? 'action' : openPumpOuts.length ? 'warning' : 'ready',
      detail: waitingPumpOuts.length
        ? `${waitingPumpOuts.length} pump-out request${waitingPumpOuts.length === 1 ? '' : 's'} waiting for service.`
        : openPumpOuts.length
          ? `${openPumpOuts.length} completed pump-out charge${openPumpOuts.length === 1 ? '' : 's'} waiting to be billed.`
          : 'No sewer pump-out requests waiting.',
      href: '/admin/pump-outs',
    }),
    item({
      id: 'documents',
      label: 'Documents & signatures',
      status: pendingDocuments.length ? 'warning' : 'ready',
      detail: pendingDocuments.length
        ? `${pendingDocuments.length} document${pendingDocuments.length === 1 ? '' : 's'} still pending signature.`
        : 'No pending signatures right now.',
      href: '/admin/documents',
    }),
    item({
      id: 'events',
      label: 'Upcoming events',
      status: events.length ? 'ready' : 'warning',
      detail: events.length
        ? `${events.length} upcoming event${events.length === 1 ? '' : 's'} on the calendar.`
        : 'Add upcoming events so campers see what is next.',
      href: '/admin/events',
    }),
    item({
      id: 'dinners',
      label: 'Saturday dinners',
      status: nextSaturdayDinner() ? 'ready' : 'warning',
      detail: nextSaturdayDinner()
        ? `Next dinner: ${nextSaturdayDinner()?.month} ${nextSaturdayDinner()?.day} · ${nextSaturdayDinner()?.menu}.`
        : 'No upcoming Saturday dinner found.',
      href: '/admin/dinners',
    }),
  ]

  const allItems = [...configItems, ...camperItems, ...operationsItems]
  const counts = {
    ready: allItems.filter((check) => check.status === 'ready').length,
    warning: allItems.filter((check) => check.status === 'warning').length,
    action: allItems.filter((check) => check.status === 'action').length,
    total: allItems.length,
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    counts,
    alerts: {
      maintenance: unreadMaintenance.length,
      payments: unreadPayments.length,
      rsvps: unreadRsvps.length,
      dinners: unreadDinners.length,
      pumpOuts: unreadPumpOuts.length,
      total: notifications.length,
    },
    groups: [
      { id: 'config', title: 'Core connections', items: configItems },
      { id: 'campers', title: 'Camper readiness', items: camperItems },
      { id: 'operations', title: 'Operations readiness', items: operationsItems },
    ],
  })
}
