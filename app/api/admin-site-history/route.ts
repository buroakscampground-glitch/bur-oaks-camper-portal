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

  const [camperResult, invoiceResult, noticeResult] = await Promise.all([
    context.admin
      .from('campers')
      .select('id,first_name,last_name,lot_number,email,phone,active')
      .eq('id', camperId)
      .maybeSingle(),
    context.admin
      .from('invoices')
      .select('id,invoice_number,invoice_type,total_due,late_fee,due_date,status,paid_at,payment_method,created_at')
      .eq('camper_id', camperId)
      .order('created_at', { ascending: false })
      .limit(100),
    context.admin
      .from('site_care_notices')
      .select('id,title,message,priority,status,due_date,created_at,acknowledged_at,ready_for_review_at,resolved_at')
      .eq('camper_id', camperId)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  if (camperResult.error || !camperResult.data) {
    return NextResponse.json({ error: camperResult.error?.message || 'The camper record could not be found.' }, { status: 404 })
  }
  if (invoiceResult.error || noticeResult.error) {
    return NextResponse.json({ error: invoiceResult.error?.message || noticeResult.error?.message || 'Site history could not be loaded.' }, { status: 500 })
  }

  const today = todayInCentral()
  const invoices = (invoiceResult.data || []).map((invoice) => ({
    ...invoice,
    is_late: isLateInvoice(invoice, today),
  }))
  const paidInvoices = invoices.filter((invoice) => String(invoice.status || '').toLowerCase() === 'paid')
  const openInvoices = invoices.filter((invoice) => !['paid', 'cancelled', 'canceled', 'void', 'refunded'].includes(String(invoice.status || '').toLowerCase()))
  const notices = noticeResult.data || []

  return NextResponse.json({
    camper: camperResult.data,
    invoices,
    notices,
    summary: {
      totalInvoices: invoices.length,
      paidInvoices: paidInvoices.length,
      lateInvoices: invoices.filter((invoice) => invoice.is_late).length,
      openBalance: openInvoices.reduce((total, invoice) => total + Number(invoice.total_due || 0), 0),
      totalNotices: notices.length,
      activeNotices: notices.filter((notice) => notice.status !== 'Resolved').length,
    },
  })
}
