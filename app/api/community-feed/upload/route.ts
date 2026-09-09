import { NextResponse } from 'next/server'
import sharp from 'sharp'
import { checkRateLimit } from '../../../../lib/rate-limit'
import { getAuthenticatedContext } from '../../../../lib/server-auth'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const limit = await checkRateLimit(request, 'community-photo', 12, 10 * 60_000)
  if (!limit.allowed) return NextResponse.json({ error: 'Too many photo uploads. Please wait and try again.' }, { status: 429 })
  const context = await getAuthenticatedContext(request)
  if (!context || String(context.camper.role || '').toLowerCase() === 'maintenance') return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

  const form = await request.formData().catch(() => null)
  const file = form?.get('photo')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Choose a photo first.' }, { status: 400 })
  if (!file.type.startsWith('image/') || file.size > 8 * 1024 * 1024) return NextResponse.json({ error: 'Choose a JPG, PNG, or WebP photo smaller than 8 MB.' }, { status: 400 })

  const image = await sharp(Buffer.from(await file.arrayBuffer()))
    .rotate()
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer()
  const path = `${context.camper.id}/${crypto.randomUUID()}.jpg`

  const { error: bucketError } = await context.admin.storage.createBucket('community-media', { public: false, fileSizeLimit: 8 * 1024 * 1024 }).catch((error) => ({ error }))
  if (bucketError && !String((bucketError as any).message || bucketError).toLowerCase().includes('already exists')) {
    return NextResponse.json({ error: 'The private photo area could not be opened.' }, { status: 500 })
  }
  const { error } = await context.admin.storage.from('community-media').upload(path, image, { contentType: 'image/jpeg', upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { data } = await context.admin.storage.from('community-media').createSignedUrl(path, 60 * 60)
  return NextResponse.json({ success: true, path, url: data?.signedUrl || null })
}
