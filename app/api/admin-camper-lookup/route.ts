import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { invoiceRecordedTotal, isInvoiceOutstanding } from '../../../lib/invoice-balance'
import { reportOperationalFailure, supportReferenceMessage } from '../../../lib/operational-errors'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'

function unique(values: unknown[]) {
  return [...new Set(values.map((value) => String(value || '').trim()).filter(Boolean))]
}

function paymentDate(row: Record<string, unknown>) {
  return String(row.received_on || row.paid_at || row.created_at || '')
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context) return NextResponse.json({ error: 'Your admin session could not be verified.' }, { status: 401 })
  if (String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
  }

  try {
    const [camperResult, invoiceResult, paymentResult, creditResult] = await Promise.all([
      context.admin
        .from('campers')
        .select('id,lot_number,first_name,last_name,second_profile_first_name,second_profile_last_name,email,secondary_email,phone,alternate_phone,second_profile_phone,active,role')
        .order('lot_number'),
      context.admin
        .from('invoices')
        .select('id,camper_id,invoice_number,invoice_type,total_due,subtotal,late_fee,due_date,status,paid_at,payment_method,payment_reference,created_at')
        .order('created_at', { ascending: false })
        .limit(1000),
      context.admin
        .from('manual_payments')
        .select('id,camper_id,amount,payment_method,payment_reference,received_on,created_at')
        .order('created_at', { ascending: false })
        .limit(1000),
      context.admin
        .from('account_credits')
        .select('camper_id,remaining_amount,reason,source_reference,status')
        .order('created_at', { ascending: false })
        .limit(1000),
    ])

    const failed = [camperResult, invoiceResult, paymentResult, creditResult].find((result) => result.error)
    if (failed?.error) throw failed.error

    const invoices = invoiceResult.data || []
    const manualPayments = paymentResult.data || []
    const credits = creditResult.data || []
    const accounts = (camperResult.data || [])
      .filter(isOperationalCamper)
      .map((camper) => {
        const camperInvoices = invoices.filter((invoice) => String(invoice.camper_id) === String(camper.id))
        const openInvoices = camperInvoices.filter(isInvoiceOutstanding)
        const nextInvoice = [...openInvoices]
          .sort((left, right) => String(left.due_date || '9999-99-99').localeCompare(String(right.due_date || '9999-99-99')))[0]
        const camperManualPayments = manualPayments.filter((payment) => String(payment.camper_id) === String(camper.id))
        const paidInvoiceRows = camperInvoices
          .filter((invoice) => String(invoice.status || '').toLowerCase() === 'paid')
          .map((invoice) => ({
            amount: invoiceRecordedTotal(invoice),
            method: invoice.payment_method,
            reference: invoice.payment_reference,
            date: invoice.paid_at || invoice.created_at,
          }))
        const manualPaymentRows = camperManualPayments.map((payment) => ({
          amount: Number(payment.amount || 0),
          method: payment.payment_method,
          reference: payment.payment_reference,
          date: paymentDate(payment),
        }))
        const latestPayment = [...manualPaymentRows, ...paidInvoiceRows]
          .sort((left, right) => String(right.date || '').localeCompare(String(left.date || '')))[0] || null
        const camperCredits = credits.filter((credit) => String(credit.camper_id) === String(camper.id))
        const names = unique([
          camper.first_name,
          camper.last_name,
          camper.second_profile_first_name,
          camper.second_profile_last_name,
        ])
        const contacts = unique([
          camper.email,
          camper.secondary_email,
          camper.phone,
          camper.alternate_phone,
          camper.second_profile_phone,
        ])
        const invoiceTerms = camperInvoices.flatMap((invoice) => [
          invoice.invoice_number,
          invoice.invoice_type,
          invoice.payment_reference,
        ])
        const paymentTerms = camperManualPayments.flatMap((payment) => [payment.payment_reference, payment.payment_method])
        const creditTerms = camperCredits.flatMap((credit) => [credit.reason, credit.source_reference])

        return {
          id: camper.id,
          active: camper.active !== false,
          lotNumber: camper.lot_number,
          name: [camper.first_name, camper.last_name].filter(Boolean).join(' ') || 'Camper',
          secondName: [camper.second_profile_first_name, camper.second_profile_last_name].filter(Boolean).join(' '),
          email: camper.email,
          phone: camper.phone,
          openBalance: Number(openInvoices.reduce((sum, invoice) => sum + Number(invoice.total_due || 0), 0).toFixed(2)),
          openInvoices: openInvoices.length,
          nextDue: nextInvoice?.due_date || null,
          nextDueAmount: nextInvoice ? Number(nextInvoice.total_due || 0) : 0,
          nextDueFor: nextInvoice?.invoice_type || null,
          unusedCredit: Number(camperCredits
            .filter((credit) => credit.status === 'active')
            .reduce((sum, credit) => sum + Number(credit.remaining_amount || 0), 0)
            .toFixed(2)),
          lastPayment: latestPayment,
          lookupTerms: unique([camper.lot_number, ...names, ...contacts, ...invoiceTerms, ...paymentTerms, ...creditTerms]).join(' '),
        }
      })

    return NextResponse.json({ accounts }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error: unknown) {
    const requestId = reportOperationalFailure(request, {
      operation: 'admin-camper-lookup',
      actorRole: String(context.camper.role || 'admin'),
      identifiers: { camperId: context.camper.id },
    }, error)
    return NextResponse.json({
      error: supportReferenceMessage('Camper lookup is temporarily unavailable. Please try again.', requestId),
      requestId,
    }, { status: 500 })
  }
}
