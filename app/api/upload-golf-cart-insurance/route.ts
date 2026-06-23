import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'

const MAX_INSURANCE_SIZE = 20 * 1024 * 1024

function isAllowedInsuranceFile(file: File) {
  return (
    /\.(pdf|docx|doc|png|jpe?g|webp|heic)$/i.test(file.name) ||
    [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/webp',
      'image/heic',
    ].includes(file.type)
  )
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, 'golf-cart-insurance-upload', 8, 10 * 60_000)
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

    if (!isAllowedInsuranceFile(file)) {
      return NextResponse.json(
        { error: 'Golf cart insurance must be a PDF, Word document, or image.' },
        { status: 400 }
      )
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

    const { error: uploadError } = await context.admin.storage
      .from('camper-documents')
      .upload(filePath, bytes, {
        contentType: file.type || undefined,
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
