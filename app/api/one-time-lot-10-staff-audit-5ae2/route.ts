import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mzywctpxnpejglnspyqi.supabase.co'
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) return NextResponse.json({ error: 'Service access unavailable.' }, { status: 500 })

  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,first_name,last_name,lot_number,role,active,rent_payment_plan')
    .eq('lot_number', '10')

  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })
  const camperIds = (campers || []).map((camper) => camper.id)
  const [{ data: renewals, error: renewalError }, { data: invoices, error: invoiceError }] = await Promise.all([
    camperIds.length
      ? admin.from('season_renewals').select('*').in('camper_id', camperIds)
      : Promise.resolve({ data: [], error: null }),
    camperIds.length
      ? admin.from('invoices').select('id,camper_id,invoice_number,invoice_type,total_due,due_date,status,created_at').in('camper_id', camperIds).ilike('invoice_type', '%rent%').order('due_date', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ])

  if (renewalError || invoiceError) return NextResponse.json({ error: renewalError?.message || invoiceError?.message }, { status: 500 })
  return NextResponse.json({ campers, renewals, rentInvoices: invoices }, { headers: { 'Cache-Control': 'no-store' } })
}
