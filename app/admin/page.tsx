'use client'

import { useEffect, useState } from 'react'
import {
  Archive,
  ArrowRight,
  BellRing,
  CalendarDays,
  CircleDollarSign,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  FileText,
  FileSpreadsheet,
  Gauge,
  KeyRound,
  LogOut,
  Map,
  Megaphone,
  MessageCircle,
  ReceiptText,
  Rocket,
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
import AdminWeather from '../../components/AdminWeather'
import { saturdayDinners2026 } from '../../lib/saturday-dinners'
import { supabase } from '../../lib/supabase'

type AdminStats = {
  campers: number
  archivedCampers: number
  balance: number
  events: number
  announcements: number
  rsvps: number
  electric: number
  waitlist: number
  unpaidInvoices: number
  totalRevenue: number
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
  paymentAlerts: number
  rsvpAlerts: number
  documentActions: number
  insuranceMissing: number
  pumpOuts: number
  pumpOutAlerts: number
  siteServices: number
  messageAlerts: number
  totalUnreadAlerts: number
  pastDueInvoices: number
  dueSoonInvoices: number
  almostDueAmount: number
  pendingDinnerResponses: number
  nextDinnerGoing: number
  nextDinnerMaybe: number
  nextDinnerGuests: number
  nextDinnerDishes: number
  nextEventRsvps: number
  needsContactInfo: number
}

type CockpitItem = {
  id: string
  href: string
  type: 'pump' | 'maintenance' | 'supply' | 'site-care' | 'message' | 'billing'
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
  waitlist: 0,
  unpaidInvoices: 0,
  totalRevenue: 0,
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
  paymentAlerts: 0,
  rsvpAlerts: 0,
  documentActions: 0,
  insuranceMissing: 0,
  pumpOuts: 0,
  pumpOutAlerts: 0,
  siteServices: 0,
  messageAlerts: 0,
  totalUnreadAlerts: 0,
  pastDueInvoices: 0,
  dueSoonInvoices: 0,
  almostDueAmount: 0,
  pendingDinnerResponses: 0,
  nextDinnerGoing: 0,
  nextDinnerMaybe: 0,
  nextDinnerGuests: 0,
  nextDinnerDishes: 0,
  nextEventRsvps: 0,
  needsContactInfo: 0,
}

export default function AdminPage() {
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [stats, setStats] = useState<AdminStats>(emptyStats)
  const [cockpitItems, setCockpitItems] = useState<CockpitItem[]>([])

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
      supabase.from('campers').select('id,email,secondary_email,phone,mailing_address_line1,mailing_city,mailing_state,mailing_zip').eq('active', true),
      supabase.from('campers').select('id').eq('active', false),
      supabase.from('invoices').select('*'),
      supabase.from('events').select('id,event_date'),
      supabase.from('announcements').select('id').eq('is_active', true),
      supabase.from('event_rsvps').select('id,event_id'),
      supabase.from('electric_readings').select('id'),
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
    const maintenance = maintenanceResult.data || []
    const notifications = notificationResult.data || []
    const documents = documentResult.data || []
    const campers = campersResult.data || []
    const rsvps = rsvpsResult.data || []
    const dinnerSignups = dinnerResult.data || []
    const pumpOuts = pumpOutResult.data || []
    const unreadMessages = messageResult.data || []
    const activeSupplyRequests = supplyRequestResult.data || []
    const activeSiteCare = siteCareResult.data || []
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const dueSoonCutoff = new Date(today)
    dueSoonCutoff.setDate(today.getDate() + 7)
    const todayIso = today.toISOString().slice(0, 10)
    const nextDinner = saturdayDinners2026.find((dinner) => dinner.date >= todayIso && !dinner.closed) || saturdayDinners2026.find((dinner) => !dinner.closed)
    const nextDinnerSignups = dinnerSignups.filter((signup) => signup.dinner_date === nextDinner?.date)
    const nextDinnerGoing = nextDinnerSignups.filter((signup) => signup.attending_status === 'Going')
    const nextDinnerMaybe = nextDinnerSignups.filter((signup) => signup.attending_status === 'Maybe')
    const upcomingEventIds = new Set((eventsResult.data || [])
      .filter((event: any) => !event.event_date || event.event_date >= todayIso)
      .map((event: any) => String(event.id)))
    const openInvoices = invoices.filter((invoice) => invoice.status !== 'paid')
    const pastDueInvoices = openInvoices.filter((invoice) => {
      if (!invoice.due_date) return false
      const dueDate = new Date(`${invoice.due_date}T12:00:00`)
      return !Number.isNaN(dueDate.getTime()) && dueDate < today
    })
    const dueSoonInvoices = openInvoices.filter((invoice) => {
      if (!invoice.due_date) return false
      const dueDate = new Date(`${invoice.due_date}T12:00:00`)
      return !Number.isNaN(dueDate.getTime()) && dueDate >= today && dueDate <= dueSoonCutoff
    })
    const activeCredits = (creditResult.data || []).filter((credit) => credit.status === 'active' && Number(credit.remaining_amount || 0) > 0)
    const activePumpOuts = pumpOuts.filter((request) => request.status !== 'cancelled' && !request.billed_at)
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
      ...activePumpOuts.map((request: any): CockpitItem => ({
        id: `pump-${request.id}`,
        href: '/admin/pump-outs',
        type: 'pump',
        label: request.status === 'completed' ? 'PUMPED / NOT BILLED' : 'PUMP-OUT REQUEST',
        title: `Lot ${request.lot_number || 'N/A'} · ${request.camper_name || 'Camper'}`,
        detail: request.status === 'completed'
          ? `$${Number(request.charge_amount || 10).toFixed(2)} waiting for electric bill.`
          : request.notes || 'Camper requested a sewer pump-out from the portal.',
        status: request.status === 'completed' ? 'Completed, not billed' : 'Needs pumped',
        tone: request.status === 'completed' ? 'green' : 'red',
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
      campers: campersResult.data?.length || 0,
      archivedCampers: archivedResult.data?.length || 0,
      balance: invoices
        .filter((invoice) => invoice.status !== 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0),
      events: eventsResult.data?.length || 0,
      announcements: announcementsResult.data?.length || 0,
      rsvps: rsvpsResult.data?.length || 0,
      electric: electricResult.data?.length || 0,
      waitlist: waitlistResult.data?.length || 0,
      unpaidInvoices: invoices.filter((invoice) => invoice.status !== 'paid').length,
      totalRevenue: invoices
        .filter((invoice) => invoice.status === 'paid')
        .reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0),
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
      paymentAlerts: notifications.filter((notification) => notification.type === 'payment_received').length,
      rsvpAlerts: notifications.filter((notification) => notification.type === 'event_rsvp').length,
      pumpOutAlerts: notifications.filter((notification) => notification.type === 'sewer_pump_out').length,
      messageAlerts: unreadMessages.length || notifications.filter((notification) => notification.type === 'direct_message').length,
      documentActions: documents.filter((document) => {
        const status = String(document.signature_status || '').toLowerCase()
        return status !== 'signed' && status !== 'not_required'
      }).length,
      insuranceMissing: campers.filter((camper) => !insuredCamperIds.has(String(camper.id))).length,
      pumpOuts: activePumpOuts.length,
      siteServices: (siteServiceResult.data || []).filter((charge) => !charge.cancelled_at && !charge.billed_at).length,
      totalUnreadAlerts: notifications.length,
      pastDueInvoices: pastDueInvoices.length,
      dueSoonInvoices: dueSoonInvoices.length,
      almostDueAmount: dueSoonInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0),
      pendingDinnerResponses: nextDinner ? Math.max(0, campers.length - nextDinnerSignups.length) : 0,
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
    })
  }

  async function markAlertsSeen(type: string) {
    await supabase
      .from('admin_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('type', type)
      .is('read_at', null)

    loadStats()
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

  const dailyOperations = [
    {
      href: '/admin/campers',
      title: 'Campers',
      description: 'Add, edit, archive, and manage camper accounts.',
      detail: `${stats.campers} active`,
      icon: Users,
      tone: 'green',
    },
    {
      href: '/admin/invoices',
      title: 'Invoices & Billing',
      description: 'Create invoices, review balances, and track payments.',
      detail: `${stats.unpaidInvoices} unpaid`,
      alertCount: stats.paymentAlerts,
      alertLabel: 'new payment alert',
      alertType: 'payment_received',
      icon: ReceiptText,
      tone: 'gold',
    },
    {
      href: '/admin/reports',
      title: 'Monthly Reports',
      description: 'See detailed money received by month, camper, payment method, and charge type.',
      detail: 'Bookkeeping view',
      icon: FileSpreadsheet,
      tone: 'blue',
    },
    {
      href: '/admin/credits',
      title: 'Account Credits',
      description: 'Add overpayment credits and future billing adjustments.',
      detail: `$${stats.activeCreditBalance.toFixed(2)} active`,
      icon: WalletCards,
      tone: 'green',
    },
    {
      href: '/admin/electric',
      title: 'Electric',
      description: 'Enter readings and create usage-based invoices.',
      detail: `${stats.electric} readings`,
      icon: Zap,
      tone: 'blue',
    },
    {
      href: '/admin/pump-outs',
      title: 'Sewer Pump-Outs',
      description: 'See who needs pumped and what will be added to electric bills.',
      detail: `${stats.pumpOuts} active`,
      alertCount: stats.pumpOutAlerts,
      alertLabel: 'pump-out alert',
      alertType: 'sewer_pump_out',
      icon: Droplets,
      tone: 'red',
    },
    {
      href: '/admin/site-services',
      title: 'Site Services',
      description: 'Add weed eating, weed spraying, and pressure washing charges.',
      detail: `${stats.siteServices} unbilled`,
      icon: SprayCan,
      tone: 'gold',
    },
    {
      href: '/admin/site-care',
      title: 'Site Care',
      description: 'Send quick appearance and upkeep notices to camper portals.',
      detail: `${stats.activeSiteCare} active`,
      icon: ClipboardCheck,
      tone: stats.activeSiteCare > 0 ? 'gold' : 'green',
    },
    {
      href: '/admin/maintenance',
      title: 'Maintenance',
      description: 'Manage repairs, assignments, and work orders.',
      detail: `${stats.openMaintenance + stats.inProgressMaintenance} active · ${stats.pendingMaintenance} pending`,
      alertCount: stats.maintenanceAlerts,
      alertLabel: 'maintenance alert',
      alertType: 'maintenance_request',
      icon: Wrench,
      tone: stats.emergencyMaintenance > 0 ? 'red' : 'orange',
    },
    {
      href: '/admin/maintenance/supplies',
      title: 'Supply Requests',
      description: 'See what maintenance needs and keep the shopping list moving.',
      detail: `${stats.activeSupplyRequests} active`,
      icon: ShoppingBasket,
      tone: stats.activeSupplyRequests > 0 ? 'red' : 'green',
    },
    {
      href: '/admin/map',
      title: 'Lots & Sites',
      description: 'View occupied, vacant, and maintenance lots.',
      detail: 'Visual campground map',
      icon: Map,
      tone: 'plum',
    },
    {
      href: '/admin/waitlist',
      title: 'Waitlist',
      description: 'Track prospects and convert them into campers.',
      detail: `${stats.waitlist} waiting`,
      icon: ClipboardList,
      tone: 'slate',
    },
  ]

  const communityTools = [
    { href: '/admin/events', title: 'Events', detail: `${stats.events} events`, icon: CalendarDays },
    { href: '/admin/dinners', title: 'Saturday Dinners', detail: 'Menu & potluck', icon: Soup },
    { href: '/admin/rsvps', title: 'RSVPs', detail: `${stats.rsvps} responses`, alertCount: stats.rsvpAlerts, alertLabel: 'new RSVP alert', alertType: 'event_rsvp', icon: UsersRound },
    { href: '/admin/announcements', title: 'Announcements', detail: `${stats.announcements} active`, icon: Megaphone },
    { href: '/admin/messages', title: 'Messages', detail: `${stats.messageAlerts} unread`, alertCount: stats.messageAlerts, alertLabel: 'new message', icon: MessageCircle },
    { href: '/admin/notifications', title: 'Notifications', detail: `${stats.totalUnreadAlerts} unread`, alertCount: stats.totalUnreadAlerts, alertLabel: 'new notification', icon: BellRing },
    { href: '/admin/texts', title: 'Text Alerts', detail: 'Camper notices', icon: BellRing },
    { href: '/admin/settings', title: 'Settings', detail: 'Payment fees', icon: Settings },
    { href: '/admin/documents', title: 'Documents', detail: `${stats.documentActions} need signatures`, icon: FileText },
    { href: '/admin/launch', title: 'Launch Checklist', detail: 'Go-live readiness', icon: Rocket },
    { href: '/admin/gatecards', title: 'Gate Cards', detail: 'Access control', icon: KeyRound },
    { href: '/admin/directory', title: 'Directory', detail: 'Camper lookup', icon: UserRoundSearch },
    { href: '/admin/archived-campers', title: 'Archive', detail: `${stats.archivedCampers} records`, icon: Archive },
  ]

  const toDoTotal =
    stats.totalUnreadAlerts +
    stats.pendingMaintenance +
    stats.activeSupplyRequests +
    stats.activeSiteCare +
    stats.pastDueInvoices +
    stats.dueSoonInvoices +
    stats.pumpOuts +
    stats.siteServices +
    stats.documentActions +
    stats.messageAlerts +
    stats.pendingDinnerResponses +
    stats.needsContactInfo

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
      count: stats.pendingMaintenance,
      detail: `${stats.openMaintenance + stats.inProgressMaintenance} approved active · ${stats.emergencyMaintenance} emergency`,
      icon: Wrench,
      urgent: stats.emergencyMaintenance > 0 || stats.pendingMaintenance > 0,
    },
    {
      href: '/admin/open-balance',
      title: 'Past due invoices',
      count: stats.pastDueInvoices,
      detail: stats.pastDueInvoices ? 'Needs follow-up now' : 'No past-due invoices',
      icon: ReceiptText,
      urgent: stats.pastDueInvoices > 0,
    },
    {
      href: '/admin/open-balance',
      title: 'Due in next 7 days',
      count: stats.dueSoonInvoices,
      detail: stats.dueSoonInvoices ? `$${stats.almostDueAmount.toFixed(2)} coming due` : 'Nothing almost due',
      icon: CalendarDays,
      urgent: stats.dueSoonInvoices > 0,
    },
    {
      href: '/admin/pump-outs',
      title: 'Pump-outs to handle',
      count: stats.pumpOuts,
      detail: 'Requested or not yet billed',
      icon: Droplets,
      urgent: stats.pumpOuts > 0,
    },
    {
      href: '/admin/site-services',
      title: 'Site services to bill',
      count: stats.siteServices,
      detail: 'Weed, spray, pressure wash, misc',
      icon: SprayCan,
      urgent: stats.siteServices > 0,
    },
    {
      href: '/admin/dinners',
      title: 'Saturday dinner',
      count: stats.nextDinnerGoing,
      detail: `${stats.nextDinnerGuests} plates · ${stats.nextDinnerDishes} bringing food · ${stats.pendingDinnerResponses} no response`,
      icon: Soup,
      urgent: stats.pendingDinnerResponses > 0,
    },
    {
      href: '/admin/rsvps',
      title: 'Event RSVPs',
      count: stats.nextEventRsvps,
      detail: stats.rsvpAlerts ? `${stats.rsvpAlerts} new RSVP alerts` : 'Upcoming event responses',
      icon: UsersRound,
      urgent: stats.rsvpAlerts > 0,
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
      urgent: stats.needsContactInfo > 0,
    },
  ]

  return (
    <main className="admin-command-page">
      <div className="admin-command-shell">
        <section className="admin-command-hero">
          <nav className="admin-command-topbar">
            <a href="/admin" className="admin-command-brand">
              <img src="/bur-oaks-logo.png" alt="Bur Oaks Campground" />
              <span>
                <strong>Bur Oaks</strong>
                <small>Operations Center</small>
              </span>
            </a>

            <div className="admin-command-actions">
              <span className="admin-command-date">
                <CalendarDays size={16} />
                <span>
                  <small>Today</small>
                  <strong>
                    {new Date().toLocaleDateString('en-US', {
                      weekday: 'long',
                      month: 'long',
                      day: 'numeric',
                    })}
                  </strong>
                </span>
              </span>
              <span className="admin-live-status">
                <i /> Systems online
              </span>
              <button type="button" onClick={handleLogout}>
                <LogOut size={17} /> Sign out
              </button>
            </div>
          </nav>

          <div className="admin-command-intro">
            <div className="admin-command-eyebrow">
              <TentTree size={16} /> Campground operations
            </div>
            <h1>Good work starts with a clear view.</h1>
            <p>
              Your command center for campers, billing, maintenance, and the
              day-to-day details that keep Bur Oaks running beautifully.
            </p>
            <div className="admin-command-hero-actions">
              <a href="/admin/launch"><Rocket size={18} /> Open launch checklist</a>
              <a href="/admin/notifications">Review alerts</a>
            </div>
          </div>
        </section>

        <section className="admin-kpi-grid" aria-label="Campground overview">
          <a href="/admin/invoices" className="admin-kpi-card">
            <span className="admin-kpi-icon green"><CircleDollarSign size={23} /></span>
            <span><small>Revenue collected</small><strong>${stats.totalRevenue.toFixed(2)}</strong><em>Paid invoices</em></span>
          </a>
          <a href="/admin/open-balance" className="admin-kpi-card">
            <span className="admin-kpi-icon gold"><ReceiptText size={23} /></span>
            <span><small>Open balance</small><strong>${stats.balance.toFixed(2)}</strong><em>{stats.unpaidInvoices} unpaid invoices</em></span>
          </a>
          <a href="/admin/campers" className="admin-kpi-card">
            <span className="admin-kpi-icon blue"><Users size={23} /></span>
            <span><small>Active campers</small><strong>{stats.campers}</strong><em>Current accounts</em></span>
          </a>
          <a href="/admin/maintenance" className="admin-kpi-card">
            <span className="admin-kpi-icon orange"><Wrench size={23} /></span>
            <span><small>Approved maintenance</small><strong>{stats.openMaintenance + stats.inProgressMaintenance}</strong><em>{stats.pendingMaintenance} awaiting approval</em></span>
          </a>
        </section>

        <section className="admin-command-panel admin-today-panel admin-todo-panel">
          <div className="admin-command-heading">
            <div><span>COMMAND COCKPIT</span><h2>Everything that needs your attention</h2></div>
            <a href="/admin/notifications">Open notifications <ArrowRight size={16} /></a>
          </div>
          {toDoTotal ? (
            <div className="admin-cockpit attention">
              <div className="admin-cockpit-radar">
                <span className="admin-cockpit-sweep" />
                <div>
                  <small>Operations telemetry</small>
                  <strong>{toDoTotal}</strong>
                  <em>active signals</em>
                </div>
              </div>

              <div className="admin-cockpit-readout">
                <small>Today’s command status</small>
                <h3>Action needed, but it is under control.</h3>
                <p>Pump-outs, maintenance, unread office messages, billing pressure, dinner activity, and camper cleanup are rolled into this one board.</p>
                <div>
                  <a href="/admin/pump-outs"><Droplets size={16} /> Pump-outs</a>
                  <a href="/admin/maintenance"><Wrench size={16} /> Maintenance</a>
                  <a href="/admin/messages"><MessageCircle size={16} /> Messages</a>
                  <a href="/admin/open-balance"><ReceiptText size={16} /> Billing</a>
                </div>
              </div>

              <div className="admin-cockpit-gauges">
                {toDoItems.slice(0, 8).map((item) => {
                  const Icon = item.icon
                  return (
                    <a href={item.href} className={item.urgent ? 'hot' : ''} key={item.title}>
                      <Icon size={18} />
                      <span>
                        <small>{item.title}</small>
                        <strong>{item.count || 'OK'}</strong>
                      </span>
                    </a>
                  )
                })}
              </div>
            </div>
          ) : (
            <div className="admin-command-clear">
              <ShieldCheck size={23} />
              <span><strong>All quiet at Bur Oaks.</strong><small>No urgent work is waiting right now.</small></span>
            </div>
          )}

          <div className="admin-cockpit-live">
            <div className="admin-cockpit-live-head">
              <span><Gauge size={18} /> Live request queue</span>
              <small>{cockpitItems.length ? `${cockpitItems.length} newest signals` : 'Nothing waiting'}</small>
            </div>
            {cockpitItems.length ? (
              <div className="admin-cockpit-stream">
                {cockpitItems.map((item) => {
                  const Icon =
                    item.type === 'pump' ? Droplets :
                    item.type === 'supply' ? ShoppingBasket :
                    item.type === 'site-care' ? ClipboardCheck :
                    item.type === 'maintenance' ? Wrench :
                    item.type === 'message' ? MessageCircle :
                    ReceiptText

                  return (
                    <a href={item.href} className={`admin-cockpit-signal ${item.tone}`} key={item.id}>
                      <span><Icon size={19} /></span>
                      <div>
                        <small>{item.label}</small>
                        <strong>{item.title}</strong>
                        <p>{item.detail}</p>
                      </div>
                      <em>{item.status}</em>
                    </a>
                  )
                })}
              </div>
            ) : (
              <div className="admin-cockpit-empty">
                <ShieldCheck size={24} />
                <strong>No open requests in the cockpit.</strong>
                <p>New site care notices, supply requests, pump-outs, maintenance tickets, unread messages, and billing pressure will appear here automatically.</p>
              </div>
            )}
          </div>
        </section>

        <details className="admin-dashboard-drawer admin-tools-drawer">
          <summary>
            <span><Gauge size={18} /> All admin shortcuts</span>
            <small>{dailyOperations.length} tools — tap to open the full shortcut screen</small>
            <ArrowRight size={18} />
          </summary>
          <div className="admin-tools-drawer-content">
            <div className="admin-operation-grid">
              {dailyOperations.map((item) => {
                const Icon = item.icon
                const alertCount = item.alertCount || 0
                return (
                  <a href={item.href} className="admin-operation-card" key={item.href}>
                    {alertCount > 0 && (
                      <span className="admin-attention-badge" aria-label={`${alertCount} ${item.alertLabel}${alertCount === 1 ? '' : 's'}`}>
                        {alertCount}
                      </span>
                    )}
                    <span className={`admin-operation-icon ${item.tone}`}><Icon size={24} /></span>
                    <span className="admin-operation-copy"><strong>{item.title}</strong><small>{item.description}</small><em>{item.detail}</em></span>
                    <ArrowRight size={19} />
                  </a>
                )
              })}
            </div>
          </div>
        </details>

        <details className="admin-dashboard-drawer">
          <summary>
            <span><CalendarDays size={18} /> Weather and planning</span>
            <small>Open the full campground forecast</small>
            <ArrowRight size={18} />
          </summary>
          <AdminWeather />
        </details>

        <section className="admin-command-panel admin-community-panel">
          <div className="admin-command-heading">
            <div><span>COMMUNITY & RECORDS</span><h2>Stay connected and organized</h2></div>
          </div>

          <div className="admin-community-grid">
            {communityTools.map((item) => {
              const Icon = item.icon
              const alertCount = item.alertCount || 0
              return (
                <a href={item.href} className="admin-community-card" key={item.href}>
                  {alertCount > 0 && (
                    <span className="admin-attention-badge small" aria-label={`${alertCount} ${item.alertLabel}${alertCount === 1 ? '' : 's'}`}>
                      {alertCount}
                    </span>
                  )}
                  <Icon size={21} />
                  <span><strong>{item.title}</strong><small>{item.detail}</small></span>
                  <ArrowRight size={17} />
                </a>
              )
            })}
          </div>
        </section>

        {(stats.maintenanceAlerts > 0 || stats.paymentAlerts > 0 || stats.rsvpAlerts > 0) && (
          <section className="admin-command-panel admin-alert-review-panel">
            <div className="admin-command-heading">
              <div><span>ATTENTION</span><h2>New activity waiting for review</h2></div>
              <p>Clear a dot after you have handled that group.</p>
            </div>
            <div className="admin-alert-review-grid">
              {stats.maintenanceAlerts > 0 && (
                <button type="button" onClick={() => markAlertsSeen('maintenance_request')}>
                  <Wrench size={18} /> Mark maintenance seen <strong>{stats.maintenanceAlerts}</strong>
                </button>
              )}
              {stats.paymentAlerts > 0 && (
                <button type="button" onClick={() => markAlertsSeen('payment_received')}>
                  <ReceiptText size={18} /> Mark payments seen <strong>{stats.paymentAlerts}</strong>
                </button>
              )}
              {stats.rsvpAlerts > 0 && (
                <button type="button" onClick={() => markAlertsSeen('event_rsvp')}>
                  <UsersRound size={18} /> Mark RSVPs seen <strong>{stats.rsvpAlerts}</strong>
                </button>
              )}
            </div>
          </section>
        )}

        <footer className="admin-command-footer">
          <span>Bur Oaks Campground</span>
          <span><a href="/privacy">Privacy</a> · <a href="/terms">Terms</a> · Admin Operations Center</span>
        </footer>
      </div>
    </main>
  )
}
