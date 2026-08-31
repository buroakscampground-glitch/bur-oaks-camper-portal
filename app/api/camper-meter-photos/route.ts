import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'

const SIGNED_PHOTO_SECONDS = 60 * 30

export async function GET(request: Request) {
  const context = await getAuthenticatedContext(request)

  if (!context) {
    return NextResponse.json({ error: 'Please sign in to view meter photos.' }, { status: 401 })
  }

  const invoiceId = new URL(request.url).searchParams.get('invoiceId')?.trim()

  let query = context.admin
    .from('meter_reading_submissions')
    .select('id,invoice_id,lot_number,detected_reading,submitted_reading,reviewed_reading,captured_at,photo_path')
    .eq('camper_id', context.camper.id)
    .not('invoice_id', 'is', null)
    .not('photo_path', 'is', null)
    .order('captured_at', { ascending: false })
    .limit(60)

  if (invoiceId) query = query.eq('invoice_id', invoiceId)

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Meter photos could not be loaded.' }, { status: 500 })
  }

  const photos = await Promise.all((data || []).map(async (photo: any) => {
    const { data: signedPhoto } = await context.admin.storage
      .from('meter-reading-photos')
      .createSignedUrl(photo.photo_path, SIGNED_PHOTO_SECONDS)

    return {
      id: photo.id,
      invoice_id: photo.invoice_id,
      lot_number: photo.lot_number,
      reading: photo.reviewed_reading ?? photo.submitted_reading ?? photo.detected_reading ?? null,
      captured_at: photo.captured_at,
      photo_url: signedPhoto?.signedUrl || null,
    }
  }))

  return NextResponse.json({ photos: photos.filter((photo) => photo.photo_url) })
}
