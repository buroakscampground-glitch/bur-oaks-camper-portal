import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { renewalDocumentHasRequiredDetails } from '../../../lib/renewal-document-readiness'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const auditToken = 'clarice_signing_audit_38ce4ffb0f2f48a9'
const camperIds = [
  '88736667-0d96-4db4-ae47-0069b7002de1',
  '6a113155-c153-48b7-ac9f-b6680535845a',
]

export async function GET(request: Request) {
  if (request.headers.get('x-one-time-token') !== auditToken) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 })
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return NextResponse.json({ error: 'Database is not configured.' }, { status: 500 })

  const admin = createClient(url, key)
  const [{ data: campers, error: camperError }, { data: documents, error: documentError }, { data: renewals, error: renewalError }] = await Promise.all([
    admin.from('campers').select('id,lot_number,first_name,last_name,email,secondary_email,active,role').in('id', camperIds),
    admin.from('documents').select('id,camper_id,document_name,document_type,signature_status,requires_two_signatures,signed_at,signed_email,second_signed_at,second_signed_email,created_at').in('camper_id', camperIds).order('created_at', { ascending: false }),
    admin.from('season_renewals').select('id,camper_id,lot_number,contract_start_date,contract_end_date,annual_rent,rent_payment_plan,status,renewal_document_id,decision_recorded_at').in('camper_id', camperIds),
  ])

  if (camperError || documentError || renewalError) {
    return NextResponse.json({ error: camperError?.message || documentError?.message || renewalError?.message }, { status: 500 })
  }

  const camperById = new Map((campers || []).map((camper) => [String(camper.id), camper]))
  return NextResponse.json({
    campers,
    documents,
    renewals: (renewals || []).map((renewal) => ({
      ...renewal,
      signingReady: renewalDocumentHasRequiredDetails(renewal, camperById.get(String(renewal.camper_id))),
    })),
  })
}
