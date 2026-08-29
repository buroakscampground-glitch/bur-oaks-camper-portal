import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://mzywctpxnpejglnspyqi.supabase.co'

export async function GET(request: Request) {
  const token = process.env.ONE_TIME_INVOICE_RECHECK_20260828
  if (!token || request.headers.get('authorization') !== `Bearer ${token}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceRoleKey) return NextResponse.json({ error: 'Admin connection unavailable' }, { status: 500 })
  const admin = createClient(supabaseUrl, serviceRoleKey)

  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,lot_number,first_name,last_name')
    .in('lot_number', ['3', '5', '52'])

  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })
  const camperIds = (campers || []).map((camper: any) => camper.id)
  const { data: invoices, error: invoiceError } = camperIds.length
    ? await admin
        .from('invoices')
        .select('id,camper_id,invoice_number,invoice_type,subtotal,late_fee,total_due,due_date,status,created_at')
        .in('camper_id', camperIds)
        .gte('created_at', '2026-08-28T00:00:00Z')
        .order('created_at', { ascending: true })
    : { data: [], error: null }

  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })
  const invoiceIds = (invoices || []).map((invoice: any) => invoice.id)
  const { data: reminders, error: reminderError } = invoiceIds.length
    ? await admin
        .from('text_reminders')
        .select('invoice_id,automation_key,status,provider,sent_at,error_message')
        .in('invoice_id', invoiceIds)
        .order('sent_at', { ascending: true })
    : { data: [], error: null }

  if (reminderError) return NextResponse.json({ error: reminderError.message }, { status: 500 })
  return NextResponse.json({ generatedAt: new Date().toISOString(), campers, invoices, reminders })
}
