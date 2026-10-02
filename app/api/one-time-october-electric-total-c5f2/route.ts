import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const auditToken = 'october_electric_total_814e82695899404e'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-token') !== auditToken) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  const admin = createClient(url, key, { auth: { persistSession: false } })
  const { data: invoices, error } = await admin
    .from('invoices')
    .select('id,invoice_number,invoice_type,status,due_date,camper_id,invoice_items(description,quantity,unit_price,total)')
    .ilike('invoice_type', '%electric%')
    .gte('due_date', '2026-10-01')
    .lte('due_date', '2026-10-31')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const activeInvoices = (invoices || []).filter((invoice: any) =>
    !['void', 'cancelled', 'canceled'].includes(String(invoice.status || '').toLowerCase())
  )
  const electricLines = activeInvoices.flatMap((invoice: any) =>
    (invoice.invoice_items || [])
      .filter((item: any) => /electric|\bkwh\b|meter/i.test(String(item.description || '')))
      .map((item: any) => ({
        invoiceId: invoice.id,
        camperId: invoice.camper_id,
        status: invoice.status,
        description: item.description,
        total: Number(item.total ?? (Number(item.quantity || 0) * Number(item.unit_price || 0))),
      }))
  )

  const total = (rows: any[]) => Number(rows.reduce((sum, row) => sum + Number(row.total || 0), 0).toFixed(2))
  return NextResponse.json({
    period: 'October 2026',
    invoiceCount: activeInvoices.length,
    siteCount: new Set(activeInvoices.map((invoice: any) => String(invoice.camper_id))).size,
    electricOnlyTotal: total(electricLines),
    paidElectricTotal: total(electricLines.filter((line: any) => String(line.status || '').toLowerCase() === 'paid')),
    openElectricTotal: total(electricLines.filter((line: any) => String(line.status || '').toLowerCase() !== 'paid')),
    electricLineCount: electricLines.length,
  }, { headers: { 'Cache-Control': 'no-store' } })
}
