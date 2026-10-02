import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const auditToken = 'gregg_electric_total_81127a42d05c4a64'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-token') !== auditToken) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { data: campers, error: camperError } = await admin
    .from('campers')
    .select('id,first_name,last_name,lot_number,active,role')
    .or('first_name.ilike.%greg%,last_name.ilike.%scott%')
  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })

  const matching = (campers || []).filter((camper: any) => {
    const name = `${camper.first_name || ''} ${camper.last_name || ''}`.toLowerCase()
    return name.includes('greg') && name.includes('scott')
  })
  const ids = matching.map((camper: any) => camper.id)
  const { data: invoices, error: invoiceError } = ids.length
    ? await admin
        .from('invoices')
        .select('id,invoice_number,invoice_type,subtotal,total_due,late_fee,status,due_date,paid_at,camper_id,invoice_items(description,quantity,unit_price,total)')
        .in('camper_id', ids)
        .ilike('invoice_type', '%electric%')
        .order('due_date', { ascending: true })
    : { data: [], error: null }
  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })

  const rows = (invoices || []).map((invoice: any) => ({
    invoiceNumber: invoice.invoice_number,
    type: invoice.invoice_type,
    electricCharge: Number(invoice.subtotal || 0),
    lateFee: Number(invoice.late_fee || 0),
    totalDue: Number(invoice.total_due || 0),
    status: invoice.status,
    dueDate: invoice.due_date,
    paidAt: invoice.paid_at,
    items: (invoice.invoice_items || []).map((item: any) => ({
      description: item.description,
      quantity: Number(item.quantity || 0),
      unitPrice: Number(item.unit_price || 0),
      total: Number(item.total || 0),
    })),
  }))

  return NextResponse.json({
    campers: matching.map((camper: any) => ({
      name: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
      lot: camper.lot_number,
    })),
    count: rows.length,
    electricInvoiceSubtotal: Number(rows.reduce((sum, row) => sum + row.electricCharge, 0).toFixed(2)),
    electricLateFees: Number(rows.reduce((sum, row) => sum + row.lateFee, 0).toFixed(2)),
    electricInvoiceTotal: Number(rows.reduce((sum, row) => sum + row.totalDue, 0).toFixed(2)),
    openElectricTotal: Number(rows
      .filter((row) => !['paid', 'void', 'cancelled', 'canceled', 'credited'].includes(String(row.status || '').toLowerCase()))
      .reduce((sum, row) => sum + row.totalDue, 0).toFixed(2)),
    invoices: rows,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
