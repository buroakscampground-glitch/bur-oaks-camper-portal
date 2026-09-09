import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'

function money(value: unknown) {
  return Math.round(Number(value || 0) * 100) / 100
}

export async function POST(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  const invoiceId = String(body.invoiceId || '').trim()
  if (!invoiceId) {
    return NextResponse.json({ error: 'Choose an invoice.' }, { status: 400 })
  }

  const { data: invoice, error: invoiceError } = await context.admin
    .from('invoices')
    .select('id,camper_id,invoice_number,status,total_due,late_fee')
    .eq('id', invoiceId)
    .maybeSingle()

  if (invoiceError) return NextResponse.json({ error: invoiceError.message }, { status: 500 })
  if (!invoice) return NextResponse.json({ error: 'Invoice not found.' }, { status: 404 })

  const status = String(invoice.status || '').toLowerCase()
  if (['paid', 'processing', 'cancelled', 'canceled', 'void', 'refunded'].includes(status)) {
    return NextResponse.json({ error: 'Late fees can only be removed from an open invoice.' }, { status: 409 })
  }

  const removedFee = money(invoice.late_fee)
  if (removedFee <= 0) {
    return NextResponse.json({ error: 'This invoice does not have a late fee.' }, { status: 409 })
  }

  const newTotal = Math.max(0, money(money(invoice.total_due) - removedFee))
  const waiverMessage = `Late fee of $${removedFee.toFixed(2)} removed from invoice #${invoice.invoice_number || invoice.id} by office arrangement.`
  const { data: waiver, error: waiverError } = await context.admin
    .from('text_reminders')
    .insert({
      camper_id: invoice.camper_id,
      invoice_id: invoice.id,
      reminder_type: 'Late Fee Waived',
      message: waiverMessage,
      status: 'saved',
      provider: 'office',
      sent_by: context.user.email || 'Bur Oaks Office',
      automation_key: 'invoice-late-fee-waived',
    })
    .select('id')
    .single()

  if (waiverError) return NextResponse.json({ error: waiverError.message }, { status: 500 })

  const { data: updatedInvoice, error: updateError } = await context.admin
    .from('invoices')
    .update({ late_fee: 0, total_due: newTotal })
    .eq('id', invoice.id)
    .eq('late_fee', invoice.late_fee)
    .select('id,total_due,late_fee')
    .maybeSingle()

  if (updateError || !updatedInvoice) {
    await context.admin.from('text_reminders').delete().eq('id', waiver.id)
    return NextResponse.json(
      { error: updateError?.message || 'The invoice changed before the late fee could be removed. Refresh and try again.' },
      { status: updateError ? 500 : 409 }
    )
  }

  return NextResponse.json({
    success: true,
    removedFee,
    totalDue: money(updatedInvoice.total_due),
    message: `Late fee removed. The new invoice balance is $${money(updatedInvoice.total_due).toFixed(2)}.`,
  })
}
