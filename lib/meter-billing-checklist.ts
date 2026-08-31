import { isOperationalCamper } from './camper-records.ts'
import { normalizeLotKey } from './meter-reading.ts'

export function buildMonthlyBillingChecklist({ lots = [], campers = [], submissions = [], invoices = [] }: any) {
  const lotsByKey = new Map(lots.map((lot: any) => [normalizeLotKey(lot.lot_number), lot]))
  const campersByLot = new Map<string, any[]>()
  for (const camper of campers) {
    const key = normalizeLotKey(camper.lot_number)
    if (!key || camper.active === false || !isOperationalCamper(camper)) continue
    campersByLot.set(key, [...(campersByLot.get(key) || []), camper])
  }

  const submissionsByLot = new Map<string, any[]>()
  for (const submission of submissions) {
    const key = normalizeLotKey(submission.lot_number)
    if (key) submissionsByLot.set(key, [...(submissionsByLot.get(key) || []), submission])
  }

  const invoicesByCamper = new Map<string, any[]>()
  for (const invoice of invoices) {
    const key = String(invoice.camper_id || '')
    if (key) invoicesByCamper.set(key, [...(invoicesByCamper.get(key) || []), invoice])
  }

  const entries = [...campersByLot.entries()].map(([lotKey, siteCampers]) => {
    const lot: any = lotsByKey.get(lotKey)
    const camper = siteCampers.find((item) => item.id === lot?.camper_id) || siteCampers[0]
    const siteSubmissions = submissionsByLot.get(lotKey) || []
    const latestSubmission = siteSubmissions[0] || null
    const siteInvoices = siteCampers
      .flatMap((item) => invoicesByCamper.get(String(item.id)) || [])
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
    const linkedInvoice = latestSubmission?.invoice_id
      ? invoices.find((invoice: any) => invoice.id === latestSubmission.invoice_id) || null
      : null
    const invoice = linkedInvoice || siteInvoices[0] || null
    const reading = [latestSubmission?.reviewed_reading, latestSubmission?.submitted_reading, latestSubmission?.detected_reading]
      .find((value) => value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) > 0)
    let noUsage = false
    try {
      noUsage = latestSubmission?.status === 'used' && JSON.parse(String(latestSubmission?.ocr_text || '{}'))?.office_completion === 'no_usage'
    } catch {
      noUsage = false
    }

    let status = 'not_read'
    if (noUsage) status = 'no_bill'
    else if (invoice?.status === 'paid') status = 'paid'
    else if (invoice || latestSubmission?.invoice_id || latestSubmission?.status === 'used') status = 'invoice_created'
    else if (latestSubmission?.status === 'retake' || (latestSubmission && reading === undefined)) status = 'needs_retake'
    else if (latestSubmission && reading !== undefined) status = 'photo_ready'

    return {
      lot_number: String(camper.lot_number),
      camper_id: camper.id,
      camper_name: `${camper.first_name || ''} ${camper.last_name || ''}`.trim() || 'Camper',
      status,
      submission_id: latestSubmission?.id || null,
      captured_at: latestSubmission?.captured_at || null,
      reading: reading === undefined ? null : Number(reading),
      invoice_id: invoice?.id || latestSubmission?.invoice_id || null,
      invoice_status: invoice?.status || null,
      invoiced_at: invoice?.created_at || null,
      paid_at: invoice?.paid_at || null,
    }
  }).sort((a, b) => a.lot_number.localeCompare(b.lot_number, undefined, { numeric: true }))

  const counts = entries.reduce((result: Record<string, number>, entry) => {
    result[entry.status] = (result[entry.status] || 0) + 1
    return result
  }, { not_read: 0, photo_ready: 0, needs_retake: 0, no_bill: 0, invoice_created: 0, paid: 0 })

  return { entries, counts }
}
