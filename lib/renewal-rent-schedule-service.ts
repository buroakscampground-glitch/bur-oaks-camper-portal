import type { SupabaseClient } from '@supabase/supabase-js'
import type { AuthCamperRecord } from './auth-account-match'
import { isLotRentExemptCamper, isNoBillingLot } from './billing-exemptions'
import {
  buildRenewalRentSchedule,
  hasExistingLotRentForTargetMonth,
  normalizeRentPaymentPlan,
  type PriorLotRentInvoice,
} from './renewal-rent-schedule'

type SeasonRenewalRow = {
  id: string
  status: string | null
  lot_number: string | null
  contract_end_date: string | null
  rent_payment_plan: string | null
  annual_rent: number | string | null
}

type CreatedInvoiceRow = { id: string }

function invoiceNumber(lotNumber: unknown, dueDate: string) {
  const lot = String(lotNumber || 'SITE').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'SITE'
  return `RENT-${lot}-${dueDate.replaceAll('-', '')}`
}

function centralDate(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value))
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((entry) => entry.type === type)?.value || ''
  return `${part('year')}-${part('month')}-${part('day')}`
}

export async function continueSignedRenewalRentSchedule({
  client,
  camperId,
  documentId,
  signedAt,
}: {
  client: SupabaseClient
  camperId: string
  documentId: string
  signedAt: string
}) {
  const { data: renewal, error: renewalError } = await client
    .from('season_renewals')
    .select('*')
    .eq('camper_id', camperId)
    .eq('renewal_document_id', documentId)
    .maybeSingle()

  if (renewalError) throw renewalError
  if (!renewal) return { status: 'not-renewal', created: 0, skipped: 0 }
  const renewalRow = renewal as SeasonRenewalRow
  if (renewalRow.status === 'Campground Not Renewing') {
    return { status: 'campground-not-renewing', created: 0, skipped: 0 }
  }

  const { error: renewalUpdateError } = await client.from('season_renewals').update({
    status: 'Renewing',
    decision_recorded_at: centralDate(signedAt),
    last_automation_at: signedAt,
    automation_error: null,
  }).eq('id', renewalRow.id)
  if (renewalUpdateError) throw renewalUpdateError

  if (!renewalRow.contract_end_date || isNoBillingLot(renewalRow.lot_number)) {
    return {
      status: isNoBillingLot(renewalRow.lot_number) ? 'no-billing-site' : 'missing-contract-date',
      created: 0,
      skipped: 0,
    }
  }

  const { data: camper, error: camperError } = await client
    .from('campers')
    .select('rent_payment_plan,lot_number,first_name,last_name')
    .eq('id', camperId)
    .maybeSingle()
  if (camperError) throw camperError
  const camperRow = camper as AuthCamperRecord | null

  if (isLotRentExemptCamper(camperRow || {})) {
    return { status: 'lot-rent-exempt', created: 0, skipped: 0 }
  }

  // Use the immutable values printed on the signed renewal. A later lot-rate
  // edit must never change the payment schedule created from this signature.
  const paymentPlan = normalizeRentPaymentPlan(renewalRow.rent_payment_plan || camperRow?.rent_payment_plan)
  const annualRent = Number(renewalRow.annual_rent || 0)

  const { data: invoices, error: invoiceError } = await client
    .from('invoices')
    .select('id,invoice_number,invoice_type,subtotal,total_due,late_fee,due_date,status,created_at,invoice_items(description,quantity,unit_price,total)')
    .eq('camper_id', camperId)
    .order('due_date', { ascending: true })
  if (invoiceError) throw invoiceError

  const invoiceRows = (invoices || []) as PriorLotRentInvoice[]
  const schedule = buildRenewalRentSchedule(
    invoiceRows,
    renewalRow.contract_end_date,
    paymentPlan,
    annualRent,
  )
  let created = 0
  let skipped = 0

  for (const installment of schedule) {
    // Some legacy schedules used the first of the month while the renewal
    // anniversary used a later day. Treat an existing rent installment in the
    // same month as the scheduled installment so reconciliation cannot create
    // a second charge merely because those day numbers differ.
    if (hasExistingLotRentForTargetMonth(invoiceRows, installment.dueDate)) {
      skipped += 1
      continue
    }

    const number = invoiceNumber(renewalRow.lot_number, installment.dueDate)
    const { data: newInvoice, error: createError } = await client.from('invoices').insert({
      camper_id: camperId,
      invoice_number: number,
      invoice_type: installment.invoiceType,
      subtotal: installment.amount,
      late_fee: 0,
      total_due: installment.amount,
      due_date: installment.dueDate,
      status: 'sent',
    }).select('id').single()

    if (createError) {
      if (createError.code === '23505') {
        skipped += 1
        continue
      }
      throw createError
    }
    const createdInvoice = newInvoice as CreatedInvoiceRow | null
    if (!createdInvoice?.id) throw new Error('The renewal invoice was not returned after creation.')

    const { error: itemError } = await client.from('invoice_items').insert(
      installment.items.map((item) => ({ ...item, invoice_id: createdInvoice.id })),
    )
    if (itemError) {
      await client.from('invoices').delete().eq('id', createdInvoice.id)
      throw itemError
    }

    invoiceRows.push({
      id: createdInvoice.id,
      invoice_type: installment.invoiceType,
      due_date: installment.dueDate,
      status: 'sent',
      total_due: installment.amount,
    })
    created += 1
  }

  const status = schedule.length ? 'continued' : 'no-prior-schedule'
  await client.from('admin_notifications').insert({
    type: 'renewal_rent_schedule',
    title: schedule.length
      ? `Lot ${renewalRow.lot_number || '—'} rent schedule continued`
      : `Lot ${renewalRow.lot_number || '—'} needs a rent schedule`,
    message: schedule.length
      ? `${created} future ${paymentPlan === 'quarterly' ? 'quarterly' : 'half-and-half'} lot-rent invoice${created === 1 ? '' : 's'} created; ${skipped} already existed. Notices remain held until 30 days before each due date.`
      : `The renewal was signed, but the annual lot rent is not saved and a complete prior ${paymentPlan === 'quarterly' ? 'four-payment' : 'two-payment'} schedule was not found. Please review this camper’s rent schedule.`,
    lot_number: renewalRow.lot_number || null,
    camper_id: camperId,
    source_table: 'season_renewals',
    source_id: renewalRow.id,
    read_at: schedule.length ? new Date().toISOString() : null,
  })

  return { status, created, skipped, scheduleLength: schedule.length, paymentPlan, annualRent }
}
