import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'

const MAX_INSURANCE_SIZE = 20 * 1024 * 1024

const safeFileTypes: Record<string, { extensions: string[]; mime: string }> = {
  pdf: { extensions: ['pdf'], mime: 'application/pdf' },
  doc: { extensions: ['doc'], mime: 'application/msword' },
  docx: { extensions: ['docx'], mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  png: { extensions: ['png'], mime: 'image/png' },
  jpg: { extensions: ['jpg', 'jpeg'], mime: 'image/jpeg' },
  webp: { extensions: ['webp'], mime: 'image/webp' },
  heic: { extensions: ['heic'], mime: 'image/heic' },
}

function detectInsuranceFile(bytes: ArrayBuffer) {
  const buffer = Buffer.from(bytes)
  if (buffer.subarray(0, 5).toString() === '%PDF-') return 'pdf'
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg'
  if (buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'webp'
  if (buffer.subarray(4, 8).toString() === 'ftyp' && /heic|heix|hevc|mif1/i.test(buffer.subarray(8, 16).toString())) return 'heic'
  if (buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) return 'doc'
  if (
    buffer[0] === 0x50 && buffer[1] === 0x4b &&
    buffer.includes(Buffer.from('[Content_Types].xml')) &&
    buffer.includes(Buffer.from('word/'))
  ) return 'docx'
  return ''
}

function validateInsuranceFile(file: File, bytes: ArrayBuffer) {
  const detected = detectInsuranceFile(bytes)
  const details = safeFileTypes[detected]
  const extension = file.name.split('.').pop()?.toLowerCase() || ''
  const genericMime = !file.type || file.type === 'application/octet-stream'

  return details && details.extensions.includes(extension) && (genericMime || file.type === details.mime)
    ? details
    : null
}

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'golf-cart-insurance-upload', 8, 10 * 60_000)
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many uploads. Please wait before trying again.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  try {
    const context = await getAuthenticatedContext(request)

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file')

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Choose a golf cart insurance file first.' }, { status: 400 })
    }

    if (file.size > MAX_INSURANCE_SIZE) {
      return NextResponse.json(
        { error: 'Golf cart insurance files must be 20 MB or smaller.' },
        { status: 400 }
      )
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-')
    const filePath = `${context.camper.id}/golf-cart-insurance/${crypto.randomUUID()}-${safeName}`
    const bytes = await file.arrayBuffer()
    const validatedType = validateInsuranceFile(file, bytes)

    if (!validatedType) {
      return NextResponse.json(
        { error: 'That file content does not match a supported PDF, Word document, or image.' },
        { status: 400 }
      )
    }

    const { error: uploadError } = await context.admin.storage
      .from('camper-documents')
      .upload(filePath, bytes, {
        contentType: validatedType.mime,
        upsert: false,
      })

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 })
    }

    const camperName = `${context.camper.first_name || ''} ${context.camper.last_name || ''}`.trim()
    const { data, error: rowError } = await context.admin
      .from('documents')
      .insert({
        camper_id: context.camper.id,
        document_name: `Golf Cart Insurance${camperName ? ` - ${camperName}` : ''}`,
        document_type: 'Golf Cart Insurance',
        file_url: filePath,
        signature_status: 'not_required',
      })
      .select('*')
      .single()

    if (rowError) {
      await context.admin.storage.from('camper-documents').remove([filePath])
      return NextResponse.json({ error: rowError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, document: data })
  } catch (error) {
    console.error('Unable to upload golf cart insurance:', error)
    return NextResponse.json(
      { error: 'Unable to upload golf cart insurance.' },
      { status: 500 }
    )
  }
}
