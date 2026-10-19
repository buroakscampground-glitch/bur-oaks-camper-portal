import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { renewalResponseDueDate } from '../../../lib/renewal-timeline'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const [{ data, error }, { data: renewals, error: renewalError }] = await Promise.all([
    context.admin.from('documents').select('*'),
    context.admin
      .from('season_renewals')
      .select('renewal_document_id,contract_end_date')
      .not('renewal_document_id', 'is', null),
  ])

  if (error || renewalError) {
    return NextResponse.json({ error: error?.message || renewalError?.message }, { status: 500 })
  }

  const renewalDueDateByDocumentId = new Map(
    (renewals || []).map((renewal) => [
      String(renewal.renewal_document_id),
      renewal.contract_end_date ? renewalResponseDueDate(String(renewal.contract_end_date)) : null,
    ])
  )
  const documents = (data || []).map((document) => ({
    ...document,
    response_due_date: renewalDueDateByDocumentId.get(String(document.id)) || null,
  })).sort((a, b) => {
    const signedAtA = a.signed_at ? new Date(a.signed_at).getTime() : 0
    const signedAtB = b.signed_at ? new Date(b.signed_at).getTime() : 0
    if (signedAtA !== signedAtB) return signedAtB - signedAtA
    return String(a.document_name || '').localeCompare(String(b.document_name || ''))
  })

  return NextResponse.json({ documents })
}

export async function DELETE(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context || String(context.camper.role || '').toLowerCase() !== 'admin') {
    return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const documentId = url.searchParams.get('id')

  if (!documentId) {
    return NextResponse.json({ error: 'Missing document id.' }, { status: 400 })
  }

  const { data: document, error: documentError } = await context.admin
    .from('documents')
    .select('id,document_name,file_url')
    .eq('id', documentId)
    .single()

  if (documentError || !document) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
  }

  let bucket = 'camper-documents'
  let storagePath = String(document.file_url || '')

  if (/^https?:\/\//i.test(storagePath)) {
    try {
      const parsedUrl = new URL(storagePath)
      const marker = '/storage/v1/object/public/'
      const markerIndex = parsedUrl.pathname.indexOf(marker)
      if (markerIndex >= 0) {
        const combinedPath = decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length))
        const separatorIndex = combinedPath.indexOf('/')
        bucket = combinedPath.slice(0, separatorIndex)
        storagePath = combinedPath.slice(separatorIndex + 1)
      } else {
        storagePath = ''
      }
    } catch {
      storagePath = ''
    }
  }

  if (storagePath && ['Documents', 'camper-documents'].includes(bucket)) {
    const { error: storageError } = await context.admin.storage
      .from(bucket)
      .remove([storagePath])

    if (storageError) {
      return NextResponse.json({ error: storageError.message }, { status: 500 })
    }
  }

  const { error: deleteError } = await context.admin
    .from('documents')
    .delete()
    .eq('id', documentId)

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    removed: {
      id: document.id,
      document_name: document.document_name,
    },
  })
}
