import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const auditKey = 'melissa-balance-4d91c6a7'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== auditKey) return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })
  const admin = createClient(url, key)
  const camperResult = await admin.from('campers').select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,active').or('first_name.ilike.%mel%,last_name.ilike.%has%,second_profile_first_name.ilike.%mel%,second_profile_last_name.ilike.%has%')
  if (camperResult.error) return NextResponse.json({ error: camperResult.error.message }, { status: 500 })
  const campers = (camperResult.data || []).filter((camper) => {
    const name = `${camper.first_name || ''} ${camper.last_name || ''} ${camper.second_profile_first_name || ''} ${camper.second_profile_last_name || ''}`.toLowerCase()
    return name.includes('mel') && name.includes('has')
  })
  const ids = campers.map((camper) => camper.id)
  if (!ids.length) return NextResponse.json({ campers: [], openInvoices: [], pumpOuts: [], balance: 0 })
  const [invoiceResult, pumpResult] = await Promise.all([
    admin.from('invoices').select('id,camper_id,invoice_number,invoice_type,total_due,status,due_date,late_fee,paid_at,created_at').in('camper_id', ids).order('created_at', { ascending: false }),
    admin.from('sewer_pump_out_requests').select('id,camper_id,status,charge_amount,billed_at,requested_at').in('camper_id', ids).order('requested_at', { ascending: false }),
  ])
  if (invoiceResult.error || pumpResult.error) return NextResponse.json({ error: invoiceResult.error?.message || pumpResult.error?.message }, { status: 500 })
  const openInvoices = (invoiceResult.data || []).filter((invoice) => !['paid', 'cancelled'].includes(String(invoice.status || '').toLowerCase()))
  const pumpOuts = (pumpResult.data || []).filter((pump) => pump.status !== 'cancelled' && !pump.billed_at)
  return NextResponse.json({
    campers,
    openInvoices,
    pumpOuts,
    balance: openInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0),
    unbilledPumpTotal: pumpOuts.reduce((sum, pump) => sum + Number(pump.charge_amount || 0), 0),
  })
}
