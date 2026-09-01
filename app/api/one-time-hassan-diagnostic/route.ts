import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyFinalInvoiceToken } from '../../../lib/final-invoice-token'

export const runtime = 'nodejs'

const oneTimeKey = 'hassan_diag_7f52bd38c3'
const invoiceId = '5e33404e-24ab-423c-aad6-ec7907105978'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== oneTimeKey) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Production data is not configured.' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const [invoiceResult, textResult] = await Promise.all([
    admin
      .from('invoices')
      .select(`
        id, camper_id, invoice_number, total_due, status,
        campers (id, first_name, last_name, lot_number, active),
        invoice_items (id, description, quantity, unit_price, total, created_at)
      `)
      .eq('id', invoiceId)
      .single(),
    admin
      .from('text_reminders')
      .select('message,status,sent_at,error_message')
      .eq('invoice_id', invoiceId)
      .eq('reminder_type', 'Final Invoice Payment Link')
      .order('sent_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const paymentUrl = String(textResult.data?.message || '').match(/https?:\/\/[^\s]+/)?.[0] || ''
  const token = paymentUrl.split('/final-invoice/')[1] || ''
  const payload = verifyFinalInvoiceToken(token)

  return NextResponse.json({
    invoiceQueryError: invoiceResult.error?.message || null,
    invoice: invoiceResult.data ? {
      id: invoiceResult.data.id,
      camperId: invoiceResult.data.camper_id,
      status: invoiceResult.data.status,
      totalDue: invoiceResult.data.total_due,
      camper: invoiceResult.data.campers,
      itemCount: Array.isArray(invoiceResult.data.invoice_items) ? invoiceResult.data.invoice_items.length : null,
    } : null,
    latestText: textResult.data ? {
      status: textResult.data.status,
      sentAt: textResult.data.sent_at,
      error: textResult.data.error_message,
      host: paymentUrl ? new URL(paymentUrl).host : null,
      tokenValid: Boolean(payload),
      tokenInvoiceMatches: payload?.invoiceId === invoiceId,
      tokenCamperId: payload?.camperId || null,
    } : null,
    textQueryError: textResult.error?.message || null,
  })
}
