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
  const rateLimit = await checkRateLimit(request, 'sign-document', 10, 60_000)

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

    const requiresTwoSignatures = document.requires_two_signatures === true
    const currentUserEmail = String(context.user.email || '').trim().toLowerCase()
    const firstSignerEmail = String(document.signed_email || '').trim().toLowerCase()
    const secondSignerEmail = String(document.second_signed_email || '').trim().toLowerCase()

    if (document.signature_status === 'signed') {
      return NextResponse.json({ error: 'This document has already been signed.' }, { status: 409 })
    }

    if (firstSignerEmail === currentUserEmail || secondSignerEmail === currentUserEmail) {
      return NextResponse.json({ error: 'You have already signed this document.' }, { status: 409 })
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
    const { data: signatureRows, error: updateError } = await context.admin.rpc(
      'record_document_signature_atomic',
      {
        p_document_id: document.id,
        p_camper_id: context.camper.id,
        p_user_id: context.user.id,
        p_email: context.user.email,
        p_name: cleanName,
        p_signed_at: signedAt,
        p_ip: signatureIp,
        p_user_agent: signatureUserAgent,
        p_consent: consentText,
        p_record_hash: signatureRecordHash,
      }
    )

    if (updateError) {
      const conflict = updateError.code === '23505'
      return NextResponse.json(
        { error: conflict ? updateError.message : 'Unable to record the signature safely. Please try again.' },
        { status: conflict ? 409 : updateError.code === 'P0002' ? 404 : 500 }
      )
    }

    const signatureResult = Array.isArray(signatureRows) ? signatureRows[0] : signatureRows
    const nextSignatureStatus = signatureResult?.result_status || 'signed'
    const signedSlot = signatureResult?.signed_slot || 'first'

    return NextResponse.json({
      success: true,
      signedAt,
      signatureRecordHash,
      consentText,
      signatureStatus: nextSignatureStatus,
      signedSlot,
      requiresTwoSignatures: signatureResult?.requires_two ?? requiresTwoSignatures,
    })
  } catch (error) {
    console.error('Unable to sign document:', error)
    return NextResponse.json({ error: 'Unable to sign document.' }, { status: 500 })
  }
}
