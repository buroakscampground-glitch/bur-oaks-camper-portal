import { NextResponse } from 'next/server'
import { isOperationalCamper } from '../../../lib/camper-records'
import { meterLabelCode, normalizeLotKey } from '../../../lib/meter-reading'
import { recognizeMeterWithVision } from '../../../lib/meter-vision'
import { checkRateLimit } from '../../../lib/rate-limit'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_PHOTO_SIZE = 8 * 1024 * 1024
const allowedRoles = new Set(['admin', 'maintenance'])

function currentMonthStart() {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
}

function staffRole(context: any) {
  return String(context?.camper?.role || '').trim().toLowerCase()
}

function safePhotoType(bytes: ArrayBuffer) {
  const buffer = Buffer.from(bytes)
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: 'jpg', mime: 'image/jpeg' }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { extension: 'png', mime: 'image/png' }
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return { extension: 'webp', mime: 'image/webp' }
  return null
}

async function findSiteCamper(context: any, lotNumber: string) {
  const normalizedLot = normalizeLotKey(lotNumber)
  const [{ data: lotRows }, { data: camperRows }] = await Promise.all([
    context.admin.from('lots').select('id,lot_number,meter_number,camper_id'),
    context.admin.from('campers').select('id,first_name,last_name,lot_number,role,active'),
  ])

  const lot = (lotRows || []).find((row: any) => normalizeLotKey(row.lot_number) === normalizedLot) || null
  const operational = (camperRows || []).filter((camper: any) =>
    camper.active !== false &&
    isOperationalCamper(camper) &&
    normalizeLotKey(camper.lot_number) === normalizedLot
  )
  const camper = operational.find((item: any) => item.id === lot?.camper_id) || operational[0] || null
  return { lot, camper }
}

async function latestReadingForCamper(context: any, camperId: string | null | undefined) {
  if (!camperId) return null
  const { data } = await context.admin
    .from('electric_readings')
    .select('current_reading')
    .eq('camper_id', camperId)
    .order('reading_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  const value = Number(data?.current_reading)
  return Number.isFinite(value) ? value : null
}

async function signedSubmission(context: any, submission: any) {
  if (!submission?.photo_path) return submission
  const { data } = await context.admin.storage
    .from('meter-reading-photos')
    .createSignedUrl(submission.photo_path, 60 * 30)
  return { ...submission, photo_url: data?.signedUrl || null }
}

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)
  const role = staffRole(context)
  if (!context || !allowedRoles.has(role)) {
    return NextResponse.json({ error: 'Staff access is required.' }, { status: 403 })
  }

  const url = new URL(request.url)
  if (url.searchParams.get('checklist') === '1') {
    if (role !== 'admin') {
      return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
    }

    const monthStart = currentMonthStart()
    const [{ data: lots }, { data: campers }, { data: submissions }, { data: invoices }] = await Promise.all([
      context.admin.from('lots').select('lot_number,meter_number,camper_id'),
      context.admin.from('campers').select('id,first_name,last_name,lot_number,role,active'),
      context.admin
        .from('meter_reading_submissions')
        .select('id,camper_id,lot_number,status,detected_reading,submitted_reading,reviewed_reading,captured_at,invoice_id')
        .gte('captured_at', monthStart)
        .neq('status', 'cancelled')
        .order('captured_at', { ascending: false }),
      context.admin
        .from('invoices')
        .select('id,camper_id,status,created_at,paid_at,invoice_type')
        .gte('created_at', monthStart)
        .ilike('invoice_type', '%Electric%')
        .order('created_at', { ascending: false }),
    ])

    const lotsByKey = new Map((lots || []).map((lot: any) => [normalizeLotKey(lot.lot_number), lot]))
    const campersByLot = new Map<string, any[]>()
    for (const camper of campers || []) {
      const key = normalizeLotKey(camper.lot_number)
      if (!key || camper.active === false || !isOperationalCamper(camper)) continue
      campersByLot.set(key, [...(campersByLot.get(key) || []), camper])
    }

    const submissionsByLot = new Map<string, any[]>()
    for (const submission of submissions || []) {
      const key = normalizeLotKey(submission.lot_number)
      if (key) submissionsByLot.set(key, [...(submissionsByLot.get(key) || []), submission])
    }

    const invoicesByCamper = new Map<string, any[]>()
    for (const invoice of invoices || []) {
      const key = String(invoice.camper_id || '')
      if (key) invoicesByCamper.set(key, [...(invoicesByCamper.get(key) || []), invoice])
    }

    const entries = [...campersByLot.entries()].map(([lotKey, siteCampers]) => {
      const lot = lotsByKey.get(lotKey)
      const camper = siteCampers.find((item) => item.id === lot?.camper_id) || siteCampers[0]
      const siteSubmissions = submissionsByLot.get(lotKey) || []
      const latestSubmission = siteSubmissions[0] || null
      const siteInvoices = siteCampers
        .flatMap((item) => invoicesByCamper.get(String(item.id)) || [])
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      const linkedInvoice = latestSubmission?.invoice_id
        ? (invoices || []).find((invoice: any) => invoice.id === latestSubmission.invoice_id) || null
        : null
      const invoice = linkedInvoice || siteInvoices[0] || null
      const reading = [latestSubmission?.reviewed_reading, latestSubmission?.submitted_reading, latestSubmission?.detected_reading]
        .find((value) => value !== null && value !== undefined && Number.isFinite(Number(value)) && Number(value) > 0)

      let status = 'not_read'
      if (invoice?.status === 'paid') status = 'paid'
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
    }, { not_read: 0, photo_ready: 0, needs_retake: 0, invoice_created: 0, paid: 0 })

    return NextResponse.json({ entries, counts, monthStart })
  }

  if (url.searchParams.get('sites') === '1') {
    const [{ data: lots }, { data: campers }, { data: capturedRows }] = await Promise.all([
      context.admin.from('lots').select('lot_number,meter_number,camper_id'),
      context.admin.from('campers').select('id,lot_number,role,active'),
      context.admin
        .from('meter_reading_submissions')
        .select('id,lot_number,status,detected_reading,submitted_reading,reviewed_reading,captured_at,captured_by_email')
        .gte('captured_at', currentMonthStart())
        .neq('status', 'cancelled')
        .order('captured_at', { ascending: false }),
    ])
    const capturedByLot = new Map<string, any>()
    for (const row of capturedRows || []) {
      const key = normalizeLotKey(row.lot_number)
      if (key && !capturedByLot.has(key)) capturedByLot.set(key, row)
    }
    const siteMap = new Map<string, { lot_number: string; meter_number: string | null; captured: any }>()
    for (const camper of campers || []) {
      if (camper.active === false || !isOperationalCamper(camper) || !normalizeLotKey(camper.lot_number)) continue
      const lot = (lots || []).find((item: any) => normalizeLotKey(item.lot_number) === normalizeLotKey(camper.lot_number))
      siteMap.set(normalizeLotKey(camper.lot_number), {
        lot_number: String(camper.lot_number),
        meter_number: lot?.meter_number || null,
        captured: capturedByLot.get(normalizeLotKey(camper.lot_number)) || null,
      })
    }
    const sites = [...siteMap.values()].sort((a, b) =>
      a.lot_number.localeCompare(b.lot_number, undefined, { numeric: true })
    )
    return NextResponse.json({ sites, monthStart: currentMonthStart() })
  }

  const id = String(url.searchParams.get('id') || '').trim()
  let query = context.admin
    .from('meter_reading_submissions')
    .select('*')
    .order('captured_at', { ascending: false })

  if (id) {
    query = query.eq('id', id).limit(1)
    if (role === 'maintenance') query = query.eq('captured_by', context.user.id)
  }
  else if (role === 'maintenance') query = query.eq('captured_by', context.user.id).limit(100)
  else query = query.in('status', ['pending', 'ready', 'retake']).limit(200)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const submissions = await Promise.all((data || []).map((item: any) => signedSubmission(context, item)))
  return NextResponse.json(id ? { submission: submissions[0] || null } : { submissions })
}

export async function POST(request: Request) {
  const limit = await checkRateLimit(request, 'meter-photo', 150, 30 * 60_000)
  if (!limit.allowed) return NextResponse.json({ error: 'Too many meter photos. Please wait and try again.' }, { status: 429 })

  const context = await getAuthenticatedContext(request)
  const role = staffRole(context)
  if (!context || !allowedRoles.has(role)) {
    return NextResponse.json({ error: 'Staff access is required.' }, { status: 403 })
  }

  const form = await request.formData()
  const file = form.get('photo')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Take or choose a meter photo first.' }, { status: 400 })
  if (file.size > MAX_PHOTO_SIZE) return NextResponse.json({ error: 'Meter photos must be 8 MB or smaller.' }, { status: 400 })

  const bytes = await file.arrayBuffer()
  const photoType = safePhotoType(bytes)
  if (!photoType) return NextResponse.json({ error: 'Use a clear JPG, PNG, or WebP meter photo.' }, { status: 400 })

  const analyzeOnly = new URL(request.url).searchParams.get('analyze') === '1'
  let recognition = { reading: null as number | null, rawCandidate: '', visibleLot: null as string | null, confidence: null as number | null, text: '' }
  if (analyzeOnly) {
    try {
      const lotNumber = String(form.get('lotNumber') || '').trim()
      let previousReading: number | null = null
      if (normalizeLotKey(lotNumber)) {
        const { camper } = await findSiteCamper(context, lotNumber)
        previousReading = await latestReadingForCamper(context, camper?.id)
      }
      recognition = await recognizeMeterWithVision(bytes, { lotNumber, previousReading })
    } catch (error) {
      console.error('Meter vision failed:', error)
    }
    return NextResponse.json({ recognition })
  }

  const detectedText = String(form.get('detectedReading') || '').trim()
  const confidenceText = String(form.get('ocrConfidence') || '').trim()
  const clientDetected = detectedText ? Number(detectedText) : Number.NaN
  const clientConfidence = confidenceText ? Number(confidenceText) : Number.NaN
  recognition = {
    reading: Number.isFinite(clientDetected) && clientDetected >= 0 ? clientDetected : null,
    rawCandidate: '',
    visibleLot: null,
    confidence: Number.isFinite(clientConfidence) ? clientConfidence : null,
    text: '',
  }

  const lotNumber = String(form.get('lotNumber') || '').trim()
  const routeMode = String(form.get('routeMode') || '') === '1'
  const submittedText = String(form.get('reading') || '').trim()
  const submittedReading = submittedText ? Number(submittedText) : null
  if (!normalizeLotKey(lotNumber)) return NextResponse.json({ error: 'Choose the meter site first.' }, { status: 400 })
  if (submittedReading !== null && (!Number.isFinite(submittedReading) || submittedReading < 0)) {
    return NextResponse.json({ error: 'Confirm the meter number shown in the photo.' }, { status: 400 })
  }

  const { lot, camper } = await findSiteCamper(context, lotNumber)
  if (!camper) return NextResponse.json({ error: `No active camper billing record was found for Lot ${lotNumber}.` }, { status: 404 })

  if (routeMode) {
    const { data: currentMonthRows } = await context.admin
      .from('meter_reading_submissions')
      .select('id,lot_number,status,captured_at')
      .gte('captured_at', currentMonthStart())
      .not('status', 'in', '(cancelled,retake)')
      .order('captured_at', { ascending: false })
    const existing = (currentMonthRows || []).find((row: any) => normalizeLotKey(row.lot_number) === normalizeLotKey(lotNumber))
    if (existing) {
      return NextResponse.json({
        error: `Lot ${lotNumber} already has a meter photo for this month.`,
        alreadyCaptured: true,
        submissionId: existing.id,
      }, { status: 409 })
    }
  }

  if (recognition.reading === null) {
    try {
      const previousReading = await latestReadingForCamper(context, camper.id)
      recognition = await recognizeMeterWithVision(bytes, { lotNumber, previousReading })
    } catch (visionError) {
      // Never lose a field photo because the reader is temporarily unavailable.
      // Save it for office review, where the same managed reader can be retried.
      console.error('Meter vision could not complete during submission:', visionError)
    }
  }

  if (routeMode) {
    if (!recognition.visibleLot) {
      return NextResponse.json({
        error: 'The Bur Oaks lot label was not clear. Retake one photo showing both the meter digits and the QR/lot label.',
        needsRetake: true,
      }, { status: 422 })
    }
    if (normalizeLotKey(recognition.visibleLot) !== normalizeLotKey(lotNumber)) {
      return NextResponse.json({
        error: `This photo shows Lot ${recognition.visibleLot}, but the route expected Lot ${lotNumber}. Nothing was saved.`,
        needsRetake: true,
        visibleLot: recognition.visibleLot,
      }, { status: 409 })
    }
  }

  const meterNumber = String(lot?.meter_number || '').trim() || null
  const photoPath = `${normalizeLotKey(lotNumber)}/${Date.now()}-${crypto.randomUUID()}.${photoType.extension}`
  const { error: uploadError } = await context.admin.storage
    .from('meter-reading-photos')
    .upload(photoPath, bytes, { contentType: photoType.mime, upsert: false })
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data, error } = await context.admin
    .from('meter_reading_submissions')
    .insert({
      camper_id: camper.id,
      lot_number: lotNumber,
      meter_number: meterNumber,
      meter_code: meterLabelCode(lotNumber, meterNumber),
      photo_path: photoPath,
      detected_reading: recognition.reading,
      submitted_reading: submittedReading,
      ocr_confidence: recognition.confidence,
      ocr_text: recognition.text,
      status: 'pending',
      captured_by: context.user.id,
      captured_by_email: context.user.email || null,
    })
    .select('*')
    .single()

  if (error) {
    await context.admin.storage.from('meter-reading-photos').remove([photoPath])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    submission: await signedSubmission(context, data),
    verification: {
      visibleLot: recognition.visibleLot,
      lotMatched: recognition.visibleLot ? normalizeLotKey(recognition.visibleLot) === normalizeLotKey(lotNumber) : null,
    },
  })
}

export async function DELETE(request: Request) {
  const context = await getAuthenticatedContext(request)
  if (!context || staffRole(context) !== 'admin') {
    return NextResponse.json({ error: 'Admin access is required.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Meter submission ID is required.' }, { status: 400 })

  const { data: submission, error: findError } = await context.admin
    .from('meter_reading_submissions')
    .select('id,lot_number,photo_path,status,invoice_id')
    .eq('id', id)
    .maybeSingle()
  if (findError) return NextResponse.json({ error: findError.message }, { status: 500 })
  if (!submission) return NextResponse.json({ error: 'This meter photo was already removed.' }, { status: 404 })
  if (submission.status === 'used' || submission.invoice_id) {
    return NextResponse.json({ error: 'This reading has already been used for billing and cannot be deleted here.' }, { status: 409 })
  }

  if (submission.photo_path) {
    const { error: photoError } = await context.admin.storage
      .from('meter-reading-photos')
      .remove([submission.photo_path])
    if (photoError) return NextResponse.json({ error: `The photo could not be removed: ${photoError.message}` }, { status: 500 })
  }

  const { error: deleteError } = await context.admin
    .from('meter_reading_submissions')
    .delete()
    .eq('id', id)
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  return NextResponse.json({ success: true, lotNumber: submission.lot_number })
}

export async function PATCH(request: Request) {
  const context = await getAuthenticatedContext(request)
  const role = staffRole(context)
  if (!context || !allowedRoles.has(role)) {
    return NextResponse.json({ error: 'Staff access is required.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const id = String(body.id || '').trim()
  if (!id) return NextResponse.json({ error: 'Meter submission ID is required.' }, { status: 400 })

  if (role === 'admin' && body.reanalyze === true) {
    const { data: submission, error: findError } = await context.admin
      .from('meter_reading_submissions')
      .select('*')
      .eq('id', id)
      .maybeSingle()
    if (findError) return NextResponse.json({ error: findError.message }, { status: 500 })
    if (!submission?.photo_path) return NextResponse.json({ error: 'The meter photo is unavailable.' }, { status: 404 })

    const { data: photo, error: photoError } = await context.admin.storage
      .from('meter-reading-photos')
      .download(submission.photo_path)
    if (photoError || !photo) return NextResponse.json({ error: photoError?.message || 'The meter photo could not be opened.' }, { status: 500 })

    try {
      const previousReading = await latestReadingForCamper(context, submission.camper_id)
      const recognition = await recognizeMeterWithVision(await photo.arrayBuffer(), {
        lotNumber: submission.lot_number,
        previousReading,
      })
      if (recognition.reading === null || recognition.reading <= 0) {
        return NextResponse.json({ error: 'The number could not be read clearly from this photo.' }, { status: 422 })
      }
      const { data: updated, error: updateError } = await context.admin
        .from('meter_reading_submissions')
        .update({
          detected_reading: recognition.reading,
          reviewed_reading: null,
          ocr_confidence: recognition.confidence,
          ocr_text: recognition.text,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single()
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })
      return NextResponse.json({ success: true, submission: await signedSubmission(context, updated) })
    } catch (error) {
      console.error('Meter photo reanalysis failed:', error)
      return NextResponse.json({ error: 'The meter photo reader could not finish.' }, { status: 500 })
    }
  }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (role === 'admin') {
    if (body.reviewedReading !== undefined) {
      const reviewed = Number(body.reviewedReading)
      if (!Number.isFinite(reviewed) || reviewed < 0) return NextResponse.json({ error: 'Enter a valid reviewed reading.' }, { status: 400 })
      updates.reviewed_reading = reviewed
      updates.reviewed_by = context.user.email || null
      updates.reviewed_at = new Date().toISOString()
    }
    if (['pending', 'retake', 'ready', 'used', 'cancelled'].includes(body.status)) updates.status = body.status
    if (body.invoiceId) updates.invoice_id = String(body.invoiceId)
  } else {
    if (body.status !== 'cancelled') return NextResponse.json({ error: 'The office must review this reading.' }, { status: 403 })
    updates.status = 'cancelled'
  }

  let query = context.admin.from('meter_reading_submissions').update(updates).eq('id', id)
  if (role === 'maintenance') query = query.eq('captured_by', context.user.id)
  const { data, error } = await query.select('*').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, submission: data })
}
