import { after, NextResponse } from 'next/server'
import { createWorker, PSM } from 'tesseract.js'
import sharp from 'sharp'
import path from 'node:path'
import { isOperationalCamper } from '../../../lib/camper-records'
import { chooseBestMeterRecognition, extractMeterReading, meterLabelCode, normalizeLotKey } from '../../../lib/meter-reading'
import { checkRateLimit } from '../../../lib/rate-limit'
import { getAuthenticatedContext } from '../../../lib/server-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_PHOTO_SIZE = 8 * 1024 * 1024
const allowedRoles = new Set(['admin', 'maintenance'])

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

async function prepareRecognitionImages(bytes: ArrayBuffer) {
  const oriented = await sharp(Buffer.from(bytes), { failOn: 'none', limitInputPixels: 40_000_000 })
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: false })
    .jpeg({ quality: 92 })
    .toBuffer()

  const metadata = await sharp(oriented).metadata()
  const width = metadata.width || 1200
  const height = metadata.height || 900
  const { data: scanData, info: scanInfo } = await sharp(oriented)
    .resize({ width: 500 })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let detectedRegion = { left: 0.23, top: 0.13, width: 0.46, height: 0.18 }
  let bestScore = Number.POSITIVE_INFINITY
  for (let top = 0.04; top <= 0.35; top += 0.015) {
    for (let left = 0.16; left <= 0.38; left += 0.015) {
      const scanWidth = Math.floor(scanInfo.width * 0.46)
      const scanHeight = Math.floor(scanInfo.height * 0.18)
      const scanLeft = Math.floor(scanInfo.width * left)
      const scanTop = Math.floor(scanInfo.height * top)
      if (scanLeft + scanWidth > scanInfo.width || scanTop + scanHeight > scanInfo.height) continue
      let brightness = 0
      let darkPixels = 0
      let pixelCount = 0
      for (let y = scanTop; y < scanTop + scanHeight; y += 2) {
        for (let x = scanLeft; x < scanLeft + scanWidth; x += 2) {
          const value = scanData[(y * scanInfo.width) + x]
          brightness += value
          if (value < 70) darkPixels += 1
          pixelCount += 1
        }
      }
      const score = (brightness / pixelCount) - ((darkPixels / pixelCount) * 90) + (Math.abs((left + 0.23) - 0.48) * 20)
      if (score < bestScore) {
        bestScore = score
        detectedRegion = { left, top, width: 0.46, height: 0.18 }
      }
    }
  }

  const regions = [
    { ...detectedRegion, pageMode: PSM.SINGLE_LINE, thresholds: [60, 70, 80, 90] },
    { left: 0.29, top: 0.21, width: 0.46, height: 0.20, pageMode: PSM.SINGLE_BLOCK, thresholds: [50, 60, 80, 120] },
    { left: 0.27, top: 0.18, width: 0.50, height: 0.26, pageMode: PSM.SINGLE_BLOCK, thresholds: [50, 60, 80, 120] },
  ]
  const images: { image: Buffer; pageMode: PSM }[] = []

  for (const region of regions) {
    const crop = {
      left: Math.max(0, Math.floor(width * region.left)),
      top: Math.max(0, Math.floor(height * region.top)),
      width: Math.min(width, Math.max(1, Math.floor(width * region.width))),
      height: Math.min(height, Math.max(1, Math.floor(height * region.height))),
    }
    crop.width = Math.min(crop.width, width - crop.left)
    crop.height = Math.min(crop.height, height - crop.top)

    for (const threshold of region.thresholds) {
      images.push({ image: await sharp(oriented)
        .extract(crop)
        .resize({ width: 1200 })
        .grayscale()
        .normalize()
        .threshold(threshold)
        .negate()
        .png()
        .toBuffer(), pageMode: region.pageMode })
    }
  }
  return images
}

async function recognizeReading(bytes: ArrayBuffer, previousReading: number | null = null) {
  const images = await prepareRecognitionImages(bytes)
  // Keep the language model in the deployment so live requests never wait on
  // an outside download. This is essential on short-lived serverless workers.
  const worker = await createWorker('eng', undefined, {
    langPath: path.join(process.cwd(), 'public', 'tesseract'),
    gzip: false,
    cacheMethod: 'none',
    cachePath: '/tmp',
  })
  try {
    await worker.setParameters({
      tessedit_char_whitelist: '0123456789,.- ',
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
    })
    const candidates = []
    let currentPageMode: PSM | null = null
    for (const prepared of images) {
      if (prepared.pageMode !== currentPageMode) {
        await worker.setParameters({ tessedit_pageseg_mode: prepared.pageMode })
        currentPageMode = prepared.pageMode
      }
      const result = await worker.recognize(prepared.image)
      candidates.push({
        ...extractMeterReading(result.data.text),
        confidence: Number.isFinite(result.data.confidence) ? Math.round(result.data.confidence) : null,
        text: result.data.text.slice(0, 2000),
      })
    }
    const best = chooseBestMeterRecognition(candidates, previousReading)
    return {
      reading: best?.reading ?? null,
      rawCandidate: best?.rawCandidate || '',
      confidence: best?.confidence ?? null,
      text: candidates.map((candidate) => candidate.text.trim()).filter(Boolean).join('\n---\n').slice(0, 4000),
    }
  } finally {
    await worker.terminate()
  }
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
  if (url.searchParams.get('sites') === '1') {
    const [{ data: lots }, { data: campers }] = await Promise.all([
      context.admin.from('lots').select('lot_number,meter_number,camper_id'),
      context.admin.from('campers').select('id,lot_number,role,active'),
    ])
    const siteMap = new Map<string, { lot_number: string; meter_number: string | null }>()
    for (const camper of campers || []) {
      if (camper.active === false || !isOperationalCamper(camper) || !normalizeLotKey(camper.lot_number)) continue
      const lot = (lots || []).find((item: any) => normalizeLotKey(item.lot_number) === normalizeLotKey(camper.lot_number))
      siteMap.set(normalizeLotKey(camper.lot_number), {
        lot_number: String(camper.lot_number),
        meter_number: lot?.meter_number || null,
      })
    }
    const sites = [...siteMap.values()].sort((a, b) =>
      a.lot_number.localeCompare(b.lot_number, undefined, { numeric: true })
    )
    return NextResponse.json({ sites })
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
  const limit = await checkRateLimit(request, 'meter-photo', 30, 10 * 60_000)
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
  let recognition = { reading: null as number | null, rawCandidate: '', confidence: null as number | null, text: '' }
  if (analyzeOnly) {
    try {
      const lotNumber = String(form.get('lotNumber') || '').trim()
      let previousReading: number | null = null
      if (normalizeLotKey(lotNumber)) {
        const { camper } = await findSiteCamper(context, lotNumber)
        previousReading = await latestReadingForCamper(context, camper?.id)
      }
      recognition = await recognizeReading(bytes, previousReading)
    } catch (error) {
      console.error('Meter OCR failed:', error)
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
    confidence: Number.isFinite(clientConfidence) ? clientConfidence : null,
    text: '',
  }

  const lotNumber = String(form.get('lotNumber') || '').trim()
  const submittedText = String(form.get('reading') || '').trim()
  const submittedReading = submittedText ? Number(submittedText) : null
  if (!normalizeLotKey(lotNumber)) return NextResponse.json({ error: 'Choose the meter site first.' }, { status: 400 })
  if (submittedReading !== null && (!Number.isFinite(submittedReading) || submittedReading < 0)) {
    return NextResponse.json({ error: 'Confirm the meter number shown in the photo.' }, { status: 400 })
  }

  const { lot, camper } = await findSiteCamper(context, lotNumber)
  if (!camper) return NextResponse.json({ error: `No active camper billing record was found for Lot ${lotNumber}.` }, { status: 404 })

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

  // Return the saved photo immediately so the phone never waits on OCR. Vercel
  // keeps this task alive after the response and fills the office review field.
  if (recognition.reading === null) {
    after(async () => {
      try {
        const previousReading = await latestReadingForCamper(context, camper.id)
        const detected = await recognizeReading(bytes, previousReading)
        if (detected.reading === null) return
        const { error: updateError } = await context.admin
          .from('meter_reading_submissions')
          .update({
            detected_reading: detected.reading,
            ocr_confidence: detected.confidence,
            ocr_text: detected.text,
            updated_at: new Date().toISOString(),
          })
          .eq('id', data.id)
        if (updateError) console.error('Meter OCR result could not be saved:', updateError)
      } catch (ocrError) {
        console.error('Background meter OCR failed:', ocrError)
      }
    })
  }

  return NextResponse.json({ success: true, submission: await signedSubmission(context, data) })
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
      const recognition = await recognizeReading(await photo.arrayBuffer(), previousReading)
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
