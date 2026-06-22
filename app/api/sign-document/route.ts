import { createHash } from 'crypto'
import { NextResponse } from 'next/server'
import { getAuthenticatedContext } from '../../../lib/server-auth'
import { checkRateLimit } from '../../../lib/rate-limit'

const consentText =
  'I agree to use electronic records and signatures for this Bur Oaks Campground document. I understand that typing my full legal name and selecting Sign Document is my electronic signature and shows my intent to sign this document.'

function getIpAddress(request: Request) {
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0]?.trim() || null
  return request.headers.get('x-real-ip') || null
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(request, 'sign-document', 10, 60_000)

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many signing attempts. Please wait a moment.' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfter) } }
    )
  }

  try {
    const context = await getAuthenticatedContext(request)

    if (!context) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { documentId, typedName, consentAccepted } = await request.json()
    const cleanName = String(typedName || '').trim().replace(/\s+/g, ' ')

    if (!documentId || typeof documentId !== 'string') {
      return NextResponse.json({ error: 'Missing document.' }, { status: 400 })
    }

    if (!consentAccepted) {
      return NextResponse.json({ error: 'Electronic signature consent is required.' }, { status: 400 })
    }

    if (cleanName.length < 3) {
      return NextResponse.json({ error: 'Please type your full legal name.' }, { status: 400 })
    }

    const { data: document, error: documentError } = await context.admin
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .single()

    if (documentError || !document || String(document.camper_id) !== String(context.camper.id)) {
      return NextResponse.json({ error: 'Document not found.' }, { status: 404 })
    }

    if (document.signature_status === 'signed') {
      return NextResponse.json({ error: 'This document has already been signed.' }, { status: 409 })
    }

    const signedAt = new Date().toISOString()
    const signatureIp = getIpAddress(request)
    const signatureUserAgent = request.headers.get('user-agent')
    const signaturePayload = [
      document.id,
      document.camper_id,
      document.document_name,
      document.document_type,
      document.file_url,
      context.user.id,
      context.user.email,
      cleanName,
      signedAt,
      signatureIp || '',
      signatureUserAgent || '',
      consentText,
    ].join('|')

    const signatureRecordHash = createHash('sha256').update(signaturePayload).digest('hex')

    const { error: updateError } = await context.admin
      .from('documents')
      .update({
        signature_status: 'signed',
        signed_at: signedAt,
        signed_name: cleanName,
        signed_email: context.user.email,
        signed_user_id: context.user.id,
        signature_ip: signatureIp,
        signature_user_agent: signatureUserAgent,
        signature_consent_text: consentText,
        signature_record_hash: signatureRecordHash,
      })
      .eq('id', document.id)
      .eq('camper_id', context.camper.id)
      .neq('signature_status', 'signed')

    if (updateError) {
      return NextResponse.json(
        { error: 'Signature fields are not ready yet. Please run the latest Supabase migration.' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      signedAt,
      signatureRecordHash,
      consentText,
    })
  } catch (error) {
    console.error('Unable to sign document:', error)
    return NextResponse.json({ error: 'Unable to sign document.' }, { status: 500 })
  }
}
