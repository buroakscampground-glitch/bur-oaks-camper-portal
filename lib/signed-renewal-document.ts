import { stampPersonalizedRenewalPdf } from './personalized-renewal-pdf'

function storedDocumentLocation(fileUrl: unknown) {
  let bucket = 'camper-documents'
  let objectPath = String(fileUrl || '')

  if (/^https?:\/\//i.test(objectPath)) {
    const parsedUrl = new URL(objectPath)
    const marker = '/storage/v1/object/public/'
    const markerIndex = parsedUrl.pathname.indexOf(marker)
    if (markerIndex === -1) throw new Error('Unsupported renewal document location.')
    const storagePath = decodeURIComponent(parsedUrl.pathname.slice(markerIndex + marker.length))
    const separatorIndex = storagePath.indexOf('/')
    bucket = storagePath.slice(0, separatorIndex)
    objectPath = storagePath.slice(separatorIndex + 1)
  }

  if (!['Documents', 'camper-documents'].includes(bucket) || !objectPath) {
    throw new Error('Unsupported renewal document location.')
  }
  return { bucket, objectPath }
}

export async function finalizeStoredPersonalizedRenewal(args: {
  client: any
  fileUrl: unknown
  signerName: string
  signedAt: string
}) {
  const { bucket, objectPath } = storedDocumentLocation(args.fileUrl)
  const { data: source, error: downloadError } = await args.client.storage.from(bucket).download(objectPath)
  if (downloadError || !source) throw new Error(downloadError?.message || 'The renewal PDF could not be downloaded.')

  const completed = await stampPersonalizedRenewalPdf(await source.arrayBuffer(), {
    decision: 'renew',
    signerName: args.signerName,
    signedAt: args.signedAt,
  })
  const { error: updateError } = await args.client.storage.from(bucket).update(objectPath, completed, {
    contentType: 'application/pdf',
    cacheControl: '0',
    upsert: true,
  })
  if (updateError) throw new Error(updateError.message)
  return { bucket, objectPath }
}
