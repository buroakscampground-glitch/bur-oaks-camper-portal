import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifyFinalInvoiceToken } from '../../../lib/final-invoice-token'
import {
  calculateAchProcessingFee,
  calculateCardProcessingFee,
  loadPaymentFeeSettings,
} from '../../../lib/payment-fees'

export const runtime = 'nodejs'

function invoiceCamper(invoice: any) {
  return Array.isArray(invoice?.campers) ? invoice.campers[0] : invoice?.campers
}

export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token') || ''
  const payload = verifyFinalInvoiceToken(token)
  if (!payload) {
    return NextResponse.json({ closed: true, message: 'This final-invoice link is invalid or has expired.' }, { status: 410 })
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Final billing is not configured.' }, { status: 500 })
  }

  const admin = createClient(supabaseUrl, serviceRoleKey)
  const { data: invoice, error } = await admin
    .from('invoices')
    .select(`
      id, camper_id, invoice_number, invoice_type, subtotal, late_fee, total_due, due_date, status, created_at,
      campers (id, first_name, last_name, lot_number, active),
      invoice_items (id, description, quantity, unit_price, total)
    `)
    .eq('id', payload.invoiceId)
    .single()

  const camper = invoiceCamper(invoice)
  if (error || !invoice || String(invoice.camper_id) !== payload.camperId || String(camper?.id) !== payload.camperId) {
    return NextResponse.json({ closed: true, message: 'This final-invoice link is no longer available.' }, { status: 410 })
  }

  if (camper.active !== false) {
    return NextResponse.json({ closed: true, message: 'This final-billing link is closed.' }, { status: 410 })
  }

  if (String(invoice.status || '').toLowerCase() === 'paid') {
    return NextResponse.json({ closed: true, paid: true, message: 'This payment link is closed because the final invoice has been paid.' }, { status: 410 })
  }

  const feeSettings = await loadPaymentFeeSettings(admin)
  const totalDue = Number(invoice.total_due || 0)
  const items = Array.isArray(invoice.invoice_items) ? invoice.invoice_items : []

  return NextResponse.json({
    success: true,
    invoice: {
      id: invoice.id,
      invoice_number: invoice.invoice_number,
      invoice_type: invoice.invoice_type,
      subtotal: Number(invoice.subtotal || 0),
      late_fee: Number(invoice.late_fee || 0),
      total_due: totalDue,
      due_date: invoice.due_date,
      status: invoice.status,
      created_at: invoice.created_at,
      invoice_items: items.map((item) => ({
        id: item.id,
        description: item.description,
        quantity: Number(item.quantity || 0),
        unit_price: Number(item.unit_price || 0),
        total: Number(item.total || 0),
      })),
    },
    camper: {
      first_name: camper.first_name,
      last_name: camper.last_name,
      lot_number: camper.lot_number,
    },
    payment: {
      canPay: String(invoice.status || '').toLowerCase() !== 'processing',
      cardFee: calculateCardProcessingFee(totalDue, feeSettings),
      cardFeeLabel: feeSettings.label,
      achFee: calculateAchProcessingFee(totalDue),
    },
  })
}
