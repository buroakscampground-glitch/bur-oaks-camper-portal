import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ONE_TIME_KEY = '157bfca5023cb2a0375359ae21553902862997ebf314d9a0'

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-key') !== ONE_TIME_KEY) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Production database is unavailable.' }, { status: 500 })
  const admin = createClient(url, key)

  const { data: documents, error: documentError } = await admin
    .from('documents')
    .select('id,document_name,document_type,signature_status,camper_id,requires_two_signatures,created_at,file_url')
    .order('created_at', { ascending: false })
  if (documentError) return NextResponse.json({ error: documentError.message }, { status: 500 })

  const pending = (documents || []).filter((document: any) => {
    const status = String(document.signature_status || '').toLowerCase()
    return status !== 'signed' && status !== 'not_required'
  })
  const camperIds = Array.from(new Set(pending.map((document: any) => document.camper_id).filter(Boolean)))
  const { data: campers, error: camperError } = camperIds.length
    ? await admin
        .from('campers')
        .select('id,first_name,last_name,second_profile_first_name,second_profile_last_name,lot_number,active,role')
        .in('id', camperIds)
    : { data: [], error: null }
  if (camperError) return NextResponse.json({ error: camperError.message }, { status: 500 })

  const camperById = new Map((campers || []).map((camper: any) => [String(camper.id), camper]))
  const rows = pending.map((document: any) => {
    const camper: any = camperById.get(String(document.camper_id || ''))
    const documentLabel = `${document.document_name || ''} ${document.document_type || ''}`.toLowerCase()
    return {
      documentName: document.document_name,
      documentType: document.document_type,
      status: document.signature_status,
      requiresTwoSignatures: Boolean(document.requires_two_signatures),
      camperName: camper ? `${camper.first_name || ''} ${camper.last_name || ''}`.trim() : '',
      secondProfileName: camper ? `${camper.second_profile_first_name || ''} ${camper.second_profile_last_name || ''}`.trim() : '',
      lotNumber: camper?.lot_number || null,
      activeCamper: camper?.active !== false && Boolean(camper),
      hasFile: Boolean(document.file_url),
      visibleInCamperPortal: Boolean(camper && camper.active !== false && document.camper_id),
      appearsToBeRenewal: /renew|lease|contract/.test(documentLabel),
      createdAt: document.created_at,
    }
  })

  return NextResponse.json({
    pendingCount: rows.length,
    renewalCount: rows.filter((row) => row.appearsToBeRenewal).length,
    portalVisibleCount: rows.filter((row) => row.visibleInCamperPortal).length,
    rows,
  })
}
