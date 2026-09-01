import { isNoBillingLot } from './billing-exemptions'
import { buildContinuedRentSchedule, isLotRentInvoice, type PriorLotRentInvoice } from './renewal-rent-schedule'

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
  client: any
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
  if (renewal.status === 'Campground Not Renewing') {
    return { status: 'campground-not-renewing', created: 0, skipped: 0 }
  }

  const { error: renewalUpdateError } = await client.from('season_renewals').update({
    status: 'Renewing',
    decision_recorded_at: centralDate(signedAt),
    last_automation_at: signedAt,
    automation_error: null,
  }).eq('id', renewal.id)
  if (renewalUpdateError) throw renewalUpdateError

  if (!renewal.contract_end_date || isNoBillingLot(renewal.lot_number)) {
    return {
      status: isNoBillingLot(renewal.lot_number) ? 'no-billing-site' : 'missing-contract-date',
      created: 0,
      skipped: 0,
    }
  }

  const { data: invoices, error: invoiceError } = await client
    .from('invoices')
    .select('id,invoice_number,invoice_type,subtotal,total_due,late_fee,due_date,status,created_at,invoice_items(description,quantity,unit_price,total)')
    .eq('camper_id', camperId)
    .order('due_date', { ascending: true })
  if (invoiceError) throw invoiceError

  const schedule = buildContinuedRentSchedule(invoices || [], renewal.contract_end_date)
  const targetDates = schedule.map((installment) => installment.dueDate)
  const existingTargets = targetDates.length
    ? await client
        .from('invoices')
        .select('id,due_date,invoice_type')
        .eq('camper_id', camperId)
        .in('due_date', targetDates)
    : { data: [], error: null }
  if (existingTargets.error) throw existingTargets.error

  const existingDates = new Set(
    (existingTargets.data || [])
      .filter((invoice: PriorLotRentInvoice) => isLotRentInvoice(invoice))
      .map((invoice: PriorLotRentInvoice) => String(invoice.due_date)),
  )
  let created = 0
  let skipped = 0

  for (const installment of schedule) {
    if (existingDates.has(installment.dueDate)) {
      skipped += 1
      continue
    }

    const number = invoiceNumber(renewal.lot_number, installment.dueDate)
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

    const { error: itemError } = await client.from('invoice_items').insert(
      installment.items.map((item) => ({ ...item, invoice_id: newInvoice.id })),
    )
    if (itemError) {
      await client.from('invoices').delete().eq('id', newInvoice.id)
      throw itemError
    }

    existingDates.add(installment.dueDate)
    created += 1
  }

  const status = schedule.length ? 'continued' : 'no-prior-schedule'
  await client.from('admin_notifications').insert({
    type: 'renewal_rent_schedule',
    title: schedule.length
      ? `Lot ${renewal.lot_number || '—'} rent schedule continued`
      : `Lot ${renewal.lot_number || '—'} needs a rent schedule`,
    message: schedule.length
      ? `${created} future lot-rent invoice${created === 1 ? '' : 's'} created from the prior schedule; ${skipped} already existed. Notices remain held until 30 days before each due date.`
      : 'The renewal was signed, but no prior-term lot-rent invoices were found to copy. Please review this camper’s rent schedule.',
    lot_number: renewal.lot_number || null,
    camper_id: camperId,
    source_table: 'season_renewals',
    source_id: renewal.id,
  })

  return { status, created, skipped, scheduleLength: schedule.length }
}
