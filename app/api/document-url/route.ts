import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'
import { loadAuthorizedDocumentCamper } from '../../../lib/authorized-billing'

export async function POST(request: Request) {
  const rateLimit = await checkRateLimit(request, 'document-url', 30, 60_000)

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many document requests. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  try {
    const context = await getAuthenticatedContext(request)

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { documentId } = await request.json()

    if (typeof documentId !== 'string' || !documentId) {
      return NextResponse.json({ error: 'Missing document ID.' }, { status: 400 })
    }

    const { data: document } = await context.admin
      .from('documents')
      .select('id,camper_id,file_url')
      .eq('id', documentId)
      .single()

    const isAdmin = String(context.camper.role || '').toLowerCase() === 'admin'
    const isOwnDocument = document && String(document.camper_id) === String(context.camper.id)
    const delegatedCamper = document && !isAdmin && !isOwnDocument
      ? await loadAuthorizedDocumentCamper(context.admin, context.user.email, document.camper_id)
      : null

    if (!document || (!isAdmin && !isOwnDocument && !delegatedCamper)) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    }

    let bucket = 'camper-documents'
    let objectPath = String(document.file_url || '')

    if (/^https?:\/\//i.test(objectPath)) {
      const parsedUrl = new URL(objectPath)
      const marker = '/storage/v1/object/public/'
      const markerIndex = parsedUrl.pathname.indexOf(marker)

      if (markerIndex === -1) {
        return NextResponse.json({ error: 'Unsupported document location.' }, { status: 400 })
      }

      const storagePath = decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length))
      const separatorIndex = storagePath.indexOf('/')
      bucket = storagePath.slice(0, separatorIndex)
      objectPath = storagePath.slice(separatorIndex + 1)
    }

    if (!['Documents', 'camper-documents'].includes(bucket) || !objectPath) {
      return NextResponse.json({ error: 'Unsupported document location.' }, { status: 400 })
    }

    const { data, error } = await context.admin.storage
      .from(bucket)
      .createSignedUrl(objectPath, 60)

    if (error || !data?.signedUrl) {
      return NextResponse.json({ error: 'Document could not be opened.' }, { status: 404 })
    }

    return NextResponse.json({ url: data.signedUrl, fileUrl: objectPath })
  } catch (error) {
    console.error('Unable to create document link:', error)
    return NextResponse.json({ error: 'Unable to open document.' }, { status: 500 })
  }
}
