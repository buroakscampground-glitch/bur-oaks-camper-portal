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
    .select('id,first_name,last_name,lot_number,email,secondary_email,active,role')
    .or('first_name.ilike.%greg%,last_name.ilike.%scott%')
    .order('lot_number')

  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })

  const matching = (campers || []).filter((camper: any) => {
    const name = `${camper.first_name || ''} ${camper.last_name || ''}`.toLowerCase()
    return name.includes('greg') && name.includes('scott')
  })
  const ids = matching.map((camper: any) => camper.id)
  const { data: invoices, error: invoiceError } = ids.length
    ? await admin
        .from('invoices')
        .select('id,invoice_number,invoice_type,description,amount,total_amount,amount_paid,status,due_date,camper_id,created_at,invoice_items(*)')
        .in('camper_id', ids)
        .order('created_at', { ascending: false })
    : { data: [], error: null }

  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })

  return NextResponse.json({ campers: matching, invoices }, { headers: { 'Cache-Control': 'no-store' } })
}
