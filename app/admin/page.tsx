'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Archive,
  ArrowRight,
  BarChart3,
  BellRing,
  CakeSlice,
  CalendarDays,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  DoorOpen,
  FileText,
  FileSpreadsheet,
  Gauge,
  KeyRound,
  Landmark,
  LogOut,
  Map,
  Megaphone,
  MessageCircle,
  ReceiptText,
  Rocket,
  Search,
  ShieldCheck,
  Settings,
  Soup,
  SprayCan,
  ShoppingBasket,
  TentTree,
  UserRoundSearch,
  Users,
  UsersRound,
  WalletCards,
  Wrench,
  Zap,
} from 'lucide-react'
import AdminWeather, { AdminWeatherNow } from '../../components/AdminWeather'
import { isAnnouncementExpired } from '../../lib/announcement-expiration'
import { isOperationalCamper } from '../../lib/camper-records'
import { saturdayDinners2026 } from '../../lib/saturday-dinners'
import { supabase } from '../../lib/supabase'
import {
  groupInvoicesByDueMonth,
  invoiceRecordedTotal,
  isInvoiceClosed,
  isInvoiceDueAfterCurrentMonthWithinDays,
  isInvoiceDueThroughCurrentMonth,
  totalInvoiceBalance,
  type InvoiceMonthGroup,
} from '../../lib/invoice-balance'
import { isPumpOutWaitingForService } from '../../lib/pump-out-status'
import { requiresAdminAttention } from '../../lib/admin-notification-types'

type AdminStats = {
  campers: number
  archivedCampers: number
  balance: number
  events: number
  announcements: number
  rsvps: number
  electric: number
  electricSitesLeft: number
  waitlist: number
  unpaidInvoices: number
  amountDueInvoices: number
  totalRevenue: number
  paidInvoicesThisMonth: number
  activeCreditBalance: number
  activeCredits: number
  openMaintenance: number
  inProgressMaintenance: number
  emergencyMaintenance: number
  completedMaintenance: number
  pendingMaintenance: number
  activeSupplyRequests: number
  activeSiteCare: number
  maintenanceAlerts: number
  documentActions: number
  insuranceMissing: number
  pumpOuts: number
  siteServices: number
  messageAlerts: number
  totalUnreadAlerts: number
  pastDueInvoices: number
  pastDueAmount: number
  dueSoonInvoices: number
  almostDueAmount: number
  nextDinnerGoing: number
  nextDinnerMaybe: number
  nextDinnerGuests: number
  nextDinnerDishes: number
  nextEventRsvps: number
  needsContactInfo: number
  billingMonths: InvoiceMonthGroup<any>[]
}

type CockpitItem = {
  id: string
  href: string
  type: 'maintenance' | 'supply' | 'site-care' | 'message' | 'billing'
  label: string
  title: string
  detail: string
  status: string
  tone: 'red' | 'gold' | 'green' | 'blue' | 'orange'
  createdAt?: string
}

const emptyStats: AdminStats = {
  campers: 0,
  archivedCampers: 0,
  balance: 0,
  events: 0,
  announcements: 0,
  rsvps: 0,
  electric: 0,
  electricSitesLeft: 0,
  waitlist: 0,
  unpaidInvoices: 0,
  amountDueInvoices: 0,
  totalRevenue: 0,
  paidInvoicesThisMonth: 0,
  activeCreditBalance: 0,
  activeCredits: 0,
  openMaintenance: 0,
  inProgressMaintenance: 0,
  emergencyMaintenance: 0,
  completedMaintenance: 0,
  pendingMaintenance: 0,
  activeSupplyRequests: 0,
  activeSiteCare: 0,
  maintenanceAlerts: 0,
  documentActions: 0,
  insuranceMissing: 0,
  pumpOuts: 0,
  siteServices: 0,
  messageAlerts: 0,
  totalUnreadAlerts: 0,
  pastDueInvoices: 0,
  pastDueAmount: 0,
  dueSoonInvoices: 0,
  almostDueAmount: 0,
  nextDinnerGoing: 0,
  nextDinnerMaybe: 0,
  nextDinnerGuests: 0,
  nextDinnerDishes: 0,
  nextEventRsvps: 0,
  needsContactInfo: 0,
  billingMonths: [],
}

export default function AdminPage() {
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [stats, setStats] = useState<AdminStats>(emptyStats)
  const [cockpitItems, setCockpitItems] = useState<CockpitItem[]>([])
  const [toolSearch, setToolSearch] = useState('')
  const achReconciliationAttempted = useRef(false)

  useEffect(() => {
    checkAdmin()
  }, [])

  async function checkAdmin() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    const { data: camper } = await supabase
      .from('campers')
      .select('role')
      .or(`email.ilike.${user.email?.trim().toLowerCase()},secondary_email.ilike.${user.email?.trim().toLowerCase()}`)
      .single()

    if (!camper || camper.role?.toLowerCase() !== 'admin') {
      window.location.href = '/portal'
      return
    }

    await loadStats()
    setCheckingAuth(false)
  }

  async function loadStats() {
    const [
      campersResult,
      archivedResult,
      invoicesResult,
      eventsResult,
      announcementsResult,
      rsvpsResult,
      electricResult,
      maintenanceResult,
      waitlistResult,
      notificationResult,
      documentResult,
      pumpOutResult,
      siteServiceResult,
      creditResult,
      messageResult,
      dinnerResult,
      supplyRequestResult,
      siteCareResult,
    ] = await Promise.all([
      supabase.from('campers').select('id,email,secondary_email,phone,mailing_address_line1,mailing_city,mailing_state,mailing_zip,lot_number,role').eq('active', true),
      supabase.from('campers').select('id').eq('active', false),
      supabase.from('invoices').select('*'),
      supabase.from('events').select('id,event_date'),
      supabase.from('announcements').select('id,title,message,created_at').eq('is_active', true),
      supabase.from('event_rsvps').select('id,event_id'),
      supabase.from('electric_readings').select('id,invoice_id,reading_date'),
      supabase.from('maintenance_tickets').select('*'),
      supabase.from('waitlist').select('id'),
      supabase.from('admin_notifications').select('id,type').is('read_at', null),
      supabase.from('documents').select('id,document_type,signature_status,camper_id'),
      supabase.from('sewer_pump_out_requests').select('id,camper_name,lot_number,status,charge_amount,notes,requested_at,completed_at,billed_at').order('requested_at', { ascending: false }),
      supabase.from('site_service_charges').select('id,billed_at,cancelled_at'),
      supabase.from('account_credits').select('id,status,remaining_amount'),
      supabase.from('office_messages').select('id,camper_id,lot_number,sender_name,sender_email,body,created_at').eq('sender_role', 'camper').is('read_by_admin_at', null).order('created_at', { ascending: false }),
      supabase.from('saturday_dinner_signups').select('*'),
      supabase.from('maintenance_supply_requests').select('*').in('status', ['Requested', 'Ordered']).order('requested_at', { ascending: false }),
      supabase.from('site_care_notices').select('*').neq('status', 'Resolved').order('created_at', { ascending: false }),
    ])

    const invoices = invoicesResult.data || []
    const centralMonthParts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit' }).formatToParts(new Date())
    const centralPart = (type: Intl.DateTimeFormatPartTypes) => centralMonthParts.find((part) => part.type === type)?.value || ''
    const electricBillingMonth = `${centralPart('year')}-${centralPart('month')}`
    const currentPaidMonth = electricBillingMonth
    const paidThisMonth = invoices.filter((invoice) =>
      String(invoice.status || '').toLowerCase() === 'paid' &&
      String(invoice.paid_at || '').slice(0, 7) === currentPaidMonth
    )
    const maintenance = maintenanceResult.data || []
    const notifications = notificationResult.data || []
    const documents = documentResult.data || []
    const campers = (campersResult.data || []).filter(isOperationalCamper)
    const rsvps = rsvpsResult.data || []
    const dinnerSignups = dinnerResult.data || []
    const pumpOuts = pumpOutResult.data || []
    const unreadMessages = messageResult.data || []
    const activeSupplyRequests = supplyRequestResult.data || []
    const activeSiteCare = siteCareResult.data || []
    let electricSitesLeft = 0
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    if (token && !achReconciliationAttempted.current) {
      achReconciliationAttempted.current = true
      fetch('/api/admin-ach-reconciliation', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(async (response) => response.ok ? response.json() : null)
        .then((result) => {
          const reconciliation = result?.reconciliation
          if (Number(reconciliation?.paidInvoices || 0) + Number(reconciliation?.reopenedInvoices || 0) > 0) {
            window.setTimeout(loadStats, 750)
          }
        })
        .catch(() => null)
    }
    if (token) {
      const checklistResponse = await fetch(`/api/meter-readings?checklist=1&month=${encodeURIComponent(electricBillingMonth)}`, {
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => null)
      if (checklistResponse?.ok) {
        const checklist = await checklistResponse.json().catch(() => ({}))
        const counts = checklist.counts || {}
        electricSitesLeft = Number(counts.not_read || 0) + Number(counts.photo_ready || 0) + Number(counts.needs_retake || 0)
      }
    }
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayIso = today.toISOString().slice(0, 10)
    const nextDinner = saturdayDinners2026.find((dinner) => dinner.date >= todayIso && !dinner.closed) || saturdayDinners2026.find((dinner) => !dinner.closed)
    const nextDinnerSignups = dinnerSignups.filter((signup) => signup.dinner_date === nextDinner?.date)
    const nextDinnerGoing = nextDinnerSignups.filter((signup) => signup.attending_status === 'Going')
    const nextDinnerMaybe = nextDinnerSignups.filter((signup) => signup.attending_status === 'Maybe')
    const upcomingEventIds = new Set((eventsResult.data || [])
      .filter((event: any) => !event.event_date || event.event_date >= todayIso)
      .map((event: any) => String(event.id)))
    const openInvoices = invoices.filter((invoice) => ['open', 'sent', 'overdue', 'processing'].includes(String(invoice.status || '').toLowerCase()))
    const amountDueInvoices = openInvoices.filter((invoice) => isInvoiceDueThroughCurrentMonth(invoice))
    const pastDueInvoices = openInvoices.filter((invoice) => {
      if (!invoice.due_date) return false
      const dueDate = new Date(`${invoice.due_date}T12:00:00`)
      return !Number.isNaN(dueDate.getTime()) && dueDate < today
    })
    const dueSoonInvoices = openInvoices.filter((invoice) => isInvoiceDueAfterCurrentMonthWithinDays(invoice, 30))
    const billingMonths = groupInvoicesByDueMonth(
      invoices.filter((invoice) => !isInvoiceClosed(invoice))
    ).filter((month) => month.key !== 'undated' && (month.openCount > 0 || month.key === electricBillingMonth))
    const activeCredits = (creditResult.data || []).filter((credit) => credit.status === 'active' && Number(credit.remaining_amount || 0) > 0)
    const pumpOutsNeedingService = pumpOuts.filter(isPumpOutWaitingForService)
    const insuredCamperIds = new Set(
      documents
        .filter((document) => document.document_type === 'Golf Cart Insurance')
        .map((document) => String(document.camper_id))
    )

    const liveCockpitItems: CockpitItem[] = [
      ...activeSiteCare.map((notice: any): CockpitItem => ({
        id: `site-care-${notice.id}`,
        href: '/admin/site-care',
        type: 'site-care',
        label: notice.status === 'Ready for Review' ? 'SITE READY FOR REVIEW' : 'SITE CARE NOTICE',
        title: `Lot ${notice.lot_number || 'N/A'} · ${notice.title}`,
        detail: notice.message,
        status: notice.status,
        tone: notice.status === 'Ready for Review' ? 'green' : notice.priority === 'Important' ? 'red' : 'gold',
        createdAt: notice.updated_at || notice.created_at,
      })),
      ...activeSupplyRequests.map((request: any): CockpitItem => ({
        id: `supply-${request.id}`,
        href: '/admin/maintenance/supplies',
        type: 'supply',
        label: request.urgency === 'Urgent' ? 'URGENT SUPPLY REQUEST' : 'SUPPLY REQUEST',
        title: `${Number(request.quantity)} ${request.unit || 'each'} · ${request.item_name}`,
        detail: `${request.requested_by || 'Maintenance team'}${request.notes ? ` — ${request.notes}` : ''}`,
        status: request.status === 'Ordered' ? 'Already ordered' : 'Needs ordered',
        tone: request.urgency === 'Urgent' ? 'red' : 'orange',
        createdAt: request.requested_at,
      })),
      ...maintenance
        .filter((ticket) => ticket.status !== 'Completed')
        .map((ticket: any): CockpitItem => ({
          id: `maintenance-${ticket.id}`,
          href: `/admin/maintenance/${ticket.id}`,
          type: 'maintenance',
          label: ticket.admin_approved === true ? 'ACTIVE WORK ORDER' : 'AWAITING APPROVAL',
          title: `Lot ${ticket.lot_number || 'N/A'} · ${ticket.title || 'Maintenance request'}`,
          detail: ticket.description || `${ticket.priority || 'Normal'} priority maintenance item.`,
          status: ticket.admin_approved === true ? ticket.status || 'Open' : 'Needs admin approval',
          tone: ticket.priority === 'Emergency' ? 'red' : ticket.admin_approved === true ? 'blue' : 'orange',
          createdAt: ticket.created_at,
        })),
      ...unreadMessages.map((message: any): CockpitItem => ({
        id: `message-${message.id}`,
        href: `/admin/messages?camperId=${message.camper_id}`,
        type: 'message',
        label: 'OFFICE MESSAGE',
        title: `Lot ${message.lot_number || 'N/A'} · ${message.sender_name || message.sender_email || 'Camper'}`,
        detail: message.body || 'Camper sent a message to the office.',
        status: 'Needs reply',
        tone: 'gold',
        createdAt: message.created_at,
      })),
      ...pastDueInvoices.slice(0, 8).map((invoice: any): CockpitItem => ({
        id: `pastdue-${invoice.id}`,
        href: `/admin/invoices/${invoice.id}`,
        type: 'billing',
        label: 'PAST DUE',
        title: `Invoice ${invoice.invoice_number || invoice.id?.slice?.(0, 6) || ''}`,
        detail: `$${Number(invoice.total_due || 0).toFixed(2)} due ${invoice.due_date || 'now'}.`,
        status: 'Past due',
        tone: 'red',
        createdAt: invoice.due_date,
      })),
      ...dueSoonInvoices.slice(0, 6).map((invoice: any): CockpitItem => ({
        id: `duesoon-${invoice.id}`,
        href: `/admin/invoices/${invoice.id}`,
        type: 'billing',
        label: 'DUE SOON',
        title: `Invoice ${invoice.invoice_number || invoice.id?.slice?.(0, 6) || ''}`,
        detail: `$${Number(invoice.total_due || 0).toFixed(2)} due ${invoice.due_date || 'soon'}.`,
        status: 'Almost due',
        tone: 'gold',
        createdAt: invoice.due_date,
      })),
    ]
      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
      .slice(0, 9)

    setCockpitItems(liveCockpitItems)

    setStats({
      campers: campers.length,
      archivedCampers: archivedResult.data?.length || 0,
      balance: totalInvoiceBalance(amountDueInvoices),
      events: eventsResult.data?.length || 0,
      announcements: (announcementsResult.data || []).filter((item) => !isAnnouncementExpired(item)).length,
      rsvps: rsvpsResult.data?.length || 0,
      electric: electricResult.data?.length || 0,
      electricSitesLeft,
      waitlist: waitlistResult.data?.length || 0,
      unpaidInvoices: openInvoices.length,
      amountDueInvoices: amountDueInvoices.length,
      totalRevenue: paidThisMonth.reduce((sum, invoice) => sum + invoiceRecordedTotal(invoice), 0),
      paidInvoicesThisMonth: paidThisMonth.length,
      activeCreditBalance: activeCredits.reduce((sum, credit) => sum + Number(credit.remaining_amount || 0), 0),
      activeCredits: activeCredits.length,
      openMaintenance: maintenance.filter(
        (ticket) => ticket.status === 'Open' && ticket.admin_approved === true
      ).length,
      inProgressMaintenance: maintenance.filter(
        (ticket) => ticket.status === 'In Progress' && ticket.admin_approved === true
      ).length,
      emergencyMaintenance: maintenance.filter(
        (ticket) => ticket.priority === 'Emergency'
      ).length,
      completedMaintenance: maintenance.filter(
        (ticket) => ticket.status === 'Completed'
      ).length,
      pendingMaintenance: maintenance.filter((ticket) => ticket.admin_approved !== true).length,
      activeSupplyRequests: activeSupplyRequests.length,
      activeSiteCare: activeSiteCare.length,
      maintenanceAlerts: notifications.filter((notification) => notification.type === 'maintenance_request').length,
      messageAlerts: unreadMessages.length || notifications.filter((notification) => notification.type === 'direct_message').length,
      documentActions: documents.filter((document) => {
        const status = String(document.signature_status || '').toLowerCase()
        return status !== 'signed' && status !== 'not_required'
      }).length,
      insuranceMissing: campers.filter((camper) => !insuredCamperIds.has(String(camper.id))).length,
      pumpOuts: pumpOutsNeedingService.length,
      siteServices: (siteServiceResult.data || []).filter((charge) => !charge.cancelled_at && !charge.billed_at).length,
      totalUnreadAlerts: notifications.filter((notification) => notification.type !== 'event_rsvp' && requiresAdminAttention(notification.type)).length,
      pastDueInvoices: pastDueInvoices.length,
      pastDueAmount: pastDueInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0),
      dueSoonInvoices: dueSoonInvoices.length,
      almostDueAmount: dueSoonInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0),
      nextDinnerGoing: nextDinnerGoing.length,
      nextDinnerMaybe: nextDinnerMaybe.length,
      nextDinnerGuests: nextDinnerGoing.reduce((sum, signup) => sum + Number(signup.guest_count || 1), 0),
      nextDinnerDishes: nextDinnerSignups.filter((signup) => String(signup.bringing || '').trim()).length,
      nextEventRsvps: rsvps.filter((rsvp) => upcomingEventIds.has(String(rsvp.event_id))).length,
      needsContactInfo: campers.filter((camper) =>
        !camper.phone ||
        !camper.email ||
        !camper.mailing_address_line1 ||
        !camper.mailing_city ||
        !camper.mailing_state ||
        !camper.mailing_zip
      ).length,
      billingMonths,
    })
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (checkingAuth) {
    return (
      <main className="admin-command-page">
        <div className="admin-command-loading">
          <ShieldCheck size={36} />
          <p>Opening the command center…</p>
        </div>
      </main>
    )
  }

  const operationGroups = [
    {
      label: 'System oversight',
      items: [
        { href: '/admin/system-health', title: 'System health & search', detail: 'Failures, access, activity & backups', icon: ShieldCheck },
      ],
    },
    {
      label: 'Money & billing',
      items: [
        { href: '/admin/invoices', title: 'Invoices', detail: `${stats.unpaidInvoices} open`, icon: ReceiptText },
        { href: '/admin/open-balance', title: 'Amounts due', detail: `$${stats.balance.toFixed(2)} this month + carryover`, icon: CircleDollarSign },
        { href: '/admin/electric', title: 'Electric billing', detail: `${stats.electric} readings`, icon: Zap },
        { href: '/admin/reports', title: 'Reports', detail: 'Monthly & annual', icon: FileSpreadsheet },
        { href: '/admin/stripe-deposits', title: 'Stripe deposits', detail: 'Exact bank deposit breakdowns', icon: Landmark },
        { href: '/admin/income-projection', title: 'Income projection', detail: 'Strong & slim months', icon: BarChart3 },
        { href: '/admin/credits', title: 'Account credits', detail: `$${stats.activeCreditBalance.toFixed(2)} active`, icon: WalletCards },
      ],
    },
    {
      label: 'Campground operations',
      items: [
        { href: '/admin/maintenance', title: 'Maintenance', detail: `${stats.openMaintenance + stats.inProgressMaintenance} active`, icon: Wrench },
        { href: '/admin/maintenance/supplies', title: 'Supply requests', detail: `${stats.activeSupplyRequests} active`, icon: ShoppingBasket },
        { href: '/admin/pump-outs', title: 'Pump-outs', detail: `${stats.pumpOuts} active`, icon: Droplets },
        { href: '/admin/site-care', title: 'Site care', detail: `${stats.activeSiteCare} active`, icon: ClipboardCheck },
        { href: '/admin/site-services', title: 'Site services', detail: `${stats.siteServices} completed · waiting to bill`, icon: SprayCan },
      ],
    },
    {
      label: 'Campers & records',
      items: [
        { href: '/admin/campers', title: 'Camper accounts', detail: `${stats.campers} active`, icon: Users },
        { href: '/admin/site-availability', title: 'Site availability', detail: 'Open now & next 12 months', icon: DoorOpen },
        { href: '/admin/renewals', title: 'Renewal forecast', detail: 'Contracts & likely openings', icon: CalendarClock },
        { href: '/admin/directory', title: 'Directory', detail: 'Quick camper lookup', icon: UserRoundSearch },
        { href: '/admin/documents', title: 'Documents', detail: `${stats.documentActions} need action`, icon: FileText },
        { href: '/admin/gatecards', title: 'Gate cards', detail: 'Access control', icon: KeyRound },
        { href: '/admin/waitlist', title: 'Waitlist', detail: `${stats.waitlist} waiting`, icon: ClipboardList },
        { href: '/admin/archived-campers', title: 'Camper archive', detail: `${stats.archivedCampers} records`, icon: Archive },
      ],
    },
    {
      label: 'Communication & community',
      items: [
        { href: '/admin/community-feed', title: 'Community feed', detail: 'Posts, comments & owner controls', icon: UsersRound },
        { href: '/admin/messages', title: 'Office messages', detail: `${stats.messageAlerts} unread`, icon: MessageCircle },
        { href: '/admin/texts', title: 'Text alerts', detail: 'Send camper notices', icon: BellRing },
        { href: '/admin/announcements', title: 'Announcements', detail: `${stats.announcements} active`, icon: Megaphone },
        { href: '/admin/birthdays', title: 'Birthday office', detail: 'Today, missed & upcoming', icon: CakeSlice },
        { href: '/admin/events', title: 'Events', detail: `${stats.events} scheduled`, icon: CalendarDays },
        { href: '/admin/rsvps', title: 'Event RSVPs', detail: `${stats.rsvps} responses`, icon: UsersRound },
        { href: '/admin/dinners', title: 'Saturday dinners', detail: `${stats.nextDinnerGoing} going`, icon: Soup },
        { href: '/admin/notifications', title: 'Notifications', detail: `${stats.totalUnreadAlerts} unread`, icon: BellRing },
        { href: '/admin/settings', title: 'Settings', detail: 'Campground options', icon: Settings },
        { href: '/admin/launch', title: 'Launch checklist', detail: 'System readiness', icon: Rocket },
      ],
    },
  ]

  const toDoItems = [
    {
      href: '/admin/site-care',
      title: 'Site care notices',
      count: stats.activeSiteCare,
      detail: stats.activeSiteCare ? 'Open camper site items to review' : 'All site care items are clear',
      icon: ClipboardCheck,
      urgent: stats.activeSiteCare > 0,
    },
    {
      href: '/admin/maintenance/supplies',
      title: 'Supply requests',
      count: stats.activeSupplyRequests,
      detail: stats.activeSupplyRequests ? 'Maintenance needs items ordered' : 'Shopping list is clear',
      icon: ShoppingBasket,
      urgent: stats.activeSupplyRequests > 0,
    },
    {
      href: '/admin/maintenance',
      title: 'Maintenance approvals',
      count: stats.pendingMaintenance + stats.emergencyMaintenance,
      detail: `${stats.openMaintenance + stats.inProgressMaintenance} approved active · ${stats.emergencyMaintenance} emergency`,
      icon: Wrench,
      urgent: stats.emergencyMaintenance > 0 || stats.pendingMaintenance > 0,
    },
    {
      href: '/admin/open-balance?filter=past-due',
      title: 'Past due invoices',
      count: stats.pastDueInvoices,
      detail: stats.pastDueInvoices ? 'Needs follow-up now' : 'No past-due invoices',
      icon: ReceiptText,
      urgent: stats.pastDueInvoices > 0,
    },
    {
      href: '/admin/invoices?filter=upcoming-30',
      title: 'Later bills in next 30 days',
      count: stats.dueSoonInvoices,
      detail: stats.dueSoonInvoices ? `$${stats.almostDueAmount.toFixed(2)} coming due` : 'Nothing almost due',
      icon: CalendarDays,
      urgent: false,
    },
    {
      href: '/admin/documents',
      title: 'Documents to sign',
      count: stats.documentActions,
      detail: 'Leases, renewals, forms waiting',
      icon: FileText,
      urgent: stats.documentActions > 0,
    },
    {
      href: '/admin/messages',
      title: 'Unread office messages',
      count: stats.messageAlerts,
      detail: 'Camper messages needing reply',
      icon: MessageCircle,
      urgent: stats.messageAlerts > 0,
    },
    {
      href: '/admin/campers',
      title: 'Camper records to clean up',
      count: stats.needsContactInfo,
      detail: stats.insuranceMissing
        ? `${stats.insuranceMissing} optional golf cart insurance files not uploaded`
        : 'Optional golf cart insurance files are on file',
      icon: Users,
      urgent: false,
    },
  ]

  const activeAttentionItems = toDoItems.filter((item) => item.urgent && item.count > 0)
  const attentionTotal = activeAttentionItems.reduce((total, item) => total + item.count, 0)
  const attentionBreakdown = activeAttentionItems
    .slice(0, 3)
    .map((item) => `${item.count} ${item.title.replace(' notices', '').replace(' invoices', '').replace(' approvals', '').toLowerCase()}`)
    .join(' · ')
  const normalizedToolSearch = toolSearch.trim().toLowerCase()

  return (
    <main className="admin-command-page admin-desk-page">
      <div className="admin-command-shell admin-desk-shell">
        <header className="admin-desk-header">
          <div>
            <span className="admin-desk-eyebrow">Bur Oaks operations desk</span>
            <h1>Today at the campground</h1>
            <p>Important work first. Every admin tool is organized once below.</p>
          </div>
          <div className="admin-desk-header-actions">
            <div className="admin-desk-date-weather">
              <AdminWeatherNow />
              <span>
                <CalendarDays size={15} />
                {new Date().toLocaleDateString('en-US', {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </span>
            </div>
            <button type="button" onClick={handleLogout}>
              <LogOut size={17} /> Sign out
            </button>
          </div>
        </header>

        <a className="admin-community-home-link" href="/admin/community-feed">
          <span className="admin-community-home-icon"><UsersRound size={25} /></span>
          <span>
            <small>CAMPGROUND COMMUNITY</small>
            <strong>Open the camper conversation</strong>
            <em>View posts and comments · Post as the office · Manage or block members</em>
          </span>
          <b>Open Community <ArrowRight size={17} /></b>
        </a>

        <section className="admin-monthly-billing" aria-labelledby="monthly-billing-heading">
          <header>
            <div>
              <span>Billing made simple</span>
              <h2 id="monthly-billing-heading">Billing, month by month</h2>
              <p>Each month shows what is still due, what is already paid, and how much of the unpaid total is electric. Canceled and void invoices are not included.</p>
            </div>
            <a href="/admin/invoices">See every invoice <ArrowRight size={16} /></a>
          </header>
          <div className="admin-monthly-billing-grid">
            {stats.billingMonths.slice(0, 6).map((month) => (
              <article key={month.key}>
                <div className="admin-monthly-billing-title">
                  <h3>{month.label}</h3>
                  <span className={month.openCount ? 'unpaid' : 'complete'}>
                    {month.openCount ? `${month.openCount} still unpaid` : 'All paid'}
                  </span>
                </div>
                <div className="admin-monthly-payment-board">
                  <a className="unpaid" href={`/admin/invoices?month=${month.key}&filter=open`} aria-label={`See who has not paid for ${month.label}`}>
                    <span><CircleDollarSign size={20} /></span>
                    <div><small>Not paid yet</small><strong>${month.openTotal.toFixed(2)}</strong><em>{month.openCount} unpaid invoice{month.openCount === 1 ? '' : 's'}</em></div>
                    <b>See names <ArrowRight size={14} /></b>
                  </a>
                  <a className="paid" href={`/admin/invoices?month=${month.key}&filter=paid`} aria-label={`See who already paid for ${month.label}`}>
                    <span><CheckCircle2 size={20} /></span>
                    <div><small>Paid</small><strong>${month.paidTotal.toFixed(2)}</strong><em>{month.paidCount} paid invoice{month.paidCount === 1 ? '' : 's'}</em></div>
                    <b>See names <ArrowRight size={14} /></b>
                  </a>
                </div>
                <a className="admin-monthly-electric-row" href={`/admin/invoices?month=${month.key}&filter=open`}>
                  <span><Zap size={15} /> Electric still unpaid</span>
                  <strong>${month.electricOpenTotal.toFixed(2)}</strong>
                </a>
              </article>
            ))}
          </div>
        </section>

        <section className="admin-desk-summary admin-office-summary" aria-label="Office work overview">
          <div className={attentionTotal ? 'needs-attention' : ''}>
            <span>Needs attention</span>
            <strong>{attentionTotal}</strong>
            <small>{attentionBreakdown || 'Everything is caught up'}</small>
          </div>
          <a className="money-summary late" href="/admin/open-balance?filter=past-due" aria-label="Open the campers and invoices with late payments">
            <span>Late payments</span>
            <strong>${stats.pastDueAmount.toFixed(2)}</strong>
            <small>{stats.pastDueInvoices} past-due invoice{stats.pastDueInvoices === 1 ? '' : 's'} · Tap to see who</small>
          </a>
          <div>
            <span>Maintenance active</span>
            <strong>{stats.openMaintenance + stats.inProgressMaintenance}</strong>
            <small>{stats.pendingMaintenance} awaiting approval</small>
          </div>
          <a className="money-summary electric" href="/admin/electric" aria-label="Open electric meter billing work">
            <span>Electric billing work</span>
            <strong>{stats.electricSitesLeft}</strong>
            <small>site{stats.electricSitesLeft === 1 ? '' : 's'} left to finish this month</small>
          </a>
        </section>

        <div className="admin-desk-workspace">
          <section className="admin-desk-attention">
            <div className="admin-desk-section-heading">
              <div>
                <span>Priority work</span>
                <h2>Needs attention</h2>
              </div>
              <strong>{attentionTotal}</strong>
            </div>

            {activeAttentionItems.length ? (
              <div className="admin-desk-attention-list">
                {activeAttentionItems.map((item) => {
                  const Icon = item.icon
                  return (
                    <a href={item.href} key={item.title}>
                      <span className="admin-desk-row-icon"><Icon size={19} /></span>
                      <span className="admin-desk-row-copy">
                        <strong>{item.title}</strong>
                        <small>{item.detail}</small>
                      </span>
                      <em>{item.count}</em>
                      <ArrowRight size={17} />
                    </a>
                  )
                })}
              </div>
            ) : (
              <div className="admin-desk-all-clear">
                <ShieldCheck size={28} />
                <strong>Everything is caught up.</strong>
                <p>New requests and items requiring action will appear here.</p>
              </div>
            )}
          </section>

          <section className="admin-desk-directory">
            <div className="admin-desk-directory-head">
              <div>
                <span>Admin directory</span>
                <h2>Everything else, one click away</h2>
              </div>
              <label>
                <Search size={17} />
                <input
                  type="search"
                  value={toolSearch}
                  onChange={(event) => setToolSearch(event.target.value)}
                  placeholder="Find a tool"
                  aria-label="Find an admin tool"
                />
              </label>
            </div>

            <div className="admin-desk-groups">
              {operationGroups.map((group) => {
                const matchingItems = group.items.filter((item) =>
                  `${item.title} ${item.detail}`.toLowerCase().includes(normalizedToolSearch),
                )

                if (!matchingItems.length) return null

                return (
                  <section className="admin-desk-group" key={group.label}>
                    <h3>{group.label}</h3>
                    <div>
                      {matchingItems.map((item) => {
                        const Icon = item.icon
                        return (
                          <a href={item.href} key={item.href}>
                            <Icon size={18} />
                            <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                            <ArrowRight size={15} />
                          </a>
                        )
                      })}
                    </div>
                  </section>
                )
              })}
            </div>

            {normalizedToolSearch && !operationGroups.some((group) =>
              group.items.some((item) => `${item.title} ${item.detail}`.toLowerCase().includes(normalizedToolSearch)),
            ) && <p className="admin-desk-no-results">No admin tools match “{toolSearch}”.</p>}
          </section>
        </div>

        <details className="admin-desk-weather">
          <summary>
            <span><CalendarDays size={18} /> Weather and planning</span>
            <small>Open campground forecast</small>
            <ArrowRight size={18} />
          </summary>
          <AdminWeather />
        </details>

        <footer className="admin-command-footer">
          <span>Bur Oaks Campground</span>
          <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Admin Operations Center</span>
        </footer>
      </div>
    </main>
  )
}
