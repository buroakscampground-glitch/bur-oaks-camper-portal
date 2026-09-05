import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = 'c32008dcf5004a6b9b176f11ef0050cd'

function authorized(request: Request) {
  return request.headers.get('x-one-time-key') === ONE_TIME_KEY
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Production database is not configured.' }, { status: 500 })

  const admin = createClient(url, key)
  try {
    const [{ data: primary, error: primaryError }, { data: secondary, error: secondaryError }] = await Promise.all([
      admin.from('campers').select('id,lot_number,first_name,last_name,second_profile_first_name,second_profile_last_name,active,role').ilike('first_name', 'Karen').ilike('last_name', 'Smith'),
      admin.from('campers').select('id,lot_number,first_name,last_name,second_profile_first_name,second_profile_last_name,active,role').ilike('second_profile_first_name', 'Karen').ilike('second_profile_last_name', 'Smith'),
    ])
    if (primaryError || secondaryError) throw primaryError || secondaryError

    const matches = [...(primary || []), ...(secondary || [])]
      .filter((row, index, all) => all.findIndex((candidate) => candidate.id === row.id) === index)
      .filter((row: any) => String(row.role || '').toLowerCase() !== 'admin')
    if (matches.length !== 1) {
      return NextResponse.json({ error: `Expected one Karen Smith camper record; found ${matches.length}.`, matches }, { status: 409 })
    }

    const camper = matches[0]
    const { data: invoices, error: invoiceError } = await admin
      .from('invoices')
      .select('id,invoice_number,invoice_type,total_due,due_date,status,created_at')
      .eq('camper_id', camper.id)
      .order('due_date', { ascending: true })
    if (invoiceError) throw invoiceError

    const excluded = new Set(['paid', 'canceled', 'cancelled', 'void', 'refunded'])
    const open = (invoices || []).filter((invoice: any) => !excluded.has(String(invoice.status || '').toLowerCase()) && Number(invoice.total_due || 0) > 0)
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
    const dueNow = open.filter((invoice: any) => !invoice.due_date || String(invoice.due_date) <= today)
    const upcoming = open.filter((invoice: any) => invoice.due_date && String(invoice.due_date) > today)
    const total = (rows: any[]) => Number(rows.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0).toFixed(2))

    return NextResponse.json({
      camper: {
        lotNumber: camper.lot_number,
        name: `${camper.first_name || ''} ${camper.last_name || ''}`.trim(),
        secondProfileName: `${camper.second_profile_first_name || ''} ${camper.second_profile_last_name || ''}`.trim(),
        active: camper.active,
      },
      asOf: today,
      dueNow: total(dueNow),
      upcoming: total(upcoming),
      totalOpen: total(open),
      openInvoices: open,
    })
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Unable to check Karen Smith balance.' }, { status: 500 })
  }
}
