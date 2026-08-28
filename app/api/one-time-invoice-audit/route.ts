import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

function authorized(request: Request) {
  const token = process.env.ONE_TIME_INVOICE_AUDIT_20260828
  return Boolean(token) && request.headers.get('authorization') === `Bearer ${token}`
}

function adminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return key ? createClient(supabaseUrl, key) : null
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const admin = adminClient()
  if (!admin) return NextResponse.json({ error: 'Admin connection unavailable' }, { status: 500 })

  const since = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const { data: invoices, error } = await admin
    .from('invoices')
    .select('id,camper_id,invoice_number,invoice_type,subtotal,late_fee,total_due,due_date,status,created_at,paid_at,campers(id,lot_number,first_name,last_name,active,role)')
    .gte('created_at', since)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const invoiceIds = (invoices || []).map((invoice: any) => invoice.id)
  const [itemsResult, remindersResult] = await Promise.all([
    invoiceIds.length
      ? admin.from('invoice_items').select('invoice_id,description,quantity,unit_price,total').in('invoice_id', invoiceIds)
      : Promise.resolve({ data: [], error: null }),
    invoiceIds.length
      ? admin
          .from('text_reminders')
          .select('invoice_id,automation_key,reminder_type,status,provider,sent_at,reminder_date,error_message')
          .in('invoice_id', invoiceIds)
          .order('sent_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])

  if (itemsResult.error || remindersResult.error) {
    return NextResponse.json({ error: itemsResult.error?.message || remindersResult.error?.message }, { status: 500 })
  }

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    since,
    invoices: invoices || [],
    items: itemsResult.data || [],
    reminders: remindersResult.data || [],
  })
}
