import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'

const enabled = process.env.BUR_OAKS_STAGING_WRITE_E2E === '1'
const stagingHost = 'pgstmfovnzsgrkawzivc.supabase.co'
const camperId = '10000000-0000-4000-8000-000000000001'
const documentId = '10000000-0000-4000-8000-000000000060'
const fixturePumpOutId = '10000000-0000-4000-8000-000000000090'
test.use({ screenshot: 'off', trace: 'off' })

function required(name: string) {
  const value = process.env[name]
  if (!value) throw new Error(`${name} is required for isolated staging journeys.`)
  return value
}

function clients() {
  const url = required('NEXT_PUBLIC_SUPABASE_URL')
  if (new URL(url).hostname !== stagingHost) throw new Error(`Refusing non-staging Supabase host: ${new URL(url).hostname}`)
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  return {
    anon: createClient(url, required('NEXT_PUBLIC_SUPABASE_ANON_KEY'), options),
    admin: createClient(url, required('SUPABASE_SERVICE_ROLE_KEY'), options),
  }
}

async function tokenFor(client: SupabaseClient, email: string, passwordName: string) {
  const { data, error } = await client.auth.signInWithPassword({ email, password: required(passwordName) })
  if (error || !data.session?.access_token) throw error || new Error(`Staging sign-in failed for ${email}.`)
  return data.session.access_token
}

async function deleteNotifications(admin: SupabaseClient, sourceTable: string, sourceIds: string[]) {
  if (!sourceIds.length) return
  const result = await admin.from('admin_notifications').delete().eq('source_table', sourceTable).in('source_id', sourceIds)
  if (result.error) throw result.error
}

async function cleanupMaintenance(admin: SupabaseClient) {
  const rows = await admin.from('maintenance_tickets').select('id').ilike('title', 'STAGING WRITE %')
  if (rows.error) throw rows.error
  const ids = (rows.data || []).map((row) => String(row.id))
  await deleteNotifications(admin, 'maintenance_tickets', ids)
  if (ids.length) {
    const deleted = await admin.from('maintenance_tickets').delete().in('id', ids)
    if (deleted.error) throw deleted.error
  }
}

async function cleanupPumpOut(admin: SupabaseClient) {
  const rows = await admin.from('sewer_pump_out_requests').select('id').eq('lot_number', 'TEST-01').ilike('notes', '%STAGING-WRITE-%')
  if (rows.error) throw rows.error
  const ids = (rows.data || []).map((row) => String(row.id))
  await deleteNotifications(admin, 'sewer_pump_out_requests', ids)
  if (ids.length) {
    const deleted = await admin.from('sewer_pump_out_requests').delete().in('id', ids)
    if (deleted.error) throw deleted.error
  }
  const restored = await admin.from('sewer_pump_out_requests').update({ status: 'requested', billed_at: null, billed_invoice_id: null }).eq('id', fixturePumpOutId)
  if (restored.error) throw restored.error
}

async function cleanupDocument(admin: SupabaseClient) {
  const reset = await admin.from('documents').update({
    signature_status: 'not_sent',
    signed_at: null,
    signed_name: null,
    signed_email: null,
    signed_user_id: null,
    signature_ip: null,
    signature_user_agent: null,
    signature_consent_text: null,
    signature_record_hash: null,
    second_signed_at: null,
    second_signed_name: null,
    second_signed_email: null,
    second_signed_user_id: null,
    second_signature_ip: null,
    second_signature_user_agent: null,
    second_signature_consent_text: null,
    second_signature_record_hash: null,
  }).eq('id', documentId)
  if (reset.error) throw reset.error
}

async function cleanupCredits(admin: SupabaseClient) {
  const rows = await admin.from('account_credits').select('id').eq('camper_id', camperId).ilike('reason', 'STAGING WRITE %')
  if (rows.error) throw rows.error
  const ids = (rows.data || []).map((row) => String(row.id))
  if (!ids.length) return
  const applications = await admin.from('account_credit_applications').delete().in('credit_id', ids)
  if (applications.error) throw applications.error
  const deleted = await admin.from('account_credits').delete().in('id', ids)
  if (deleted.error) throw deleted.error
}

test.describe.serial('reversible staging write journeys', () => {
  test.skip(!enabled, 'Runs only against the isolated Bur Oaks staging project')

  test.beforeEach(async () => {
    const { admin } = clients()
    await cleanupMaintenance(admin)
    await cleanupPumpOut(admin)
    await cleanupDocument(admin)
    await cleanupCredits(admin)
  })

  test.afterEach(async () => {
    const { admin } = clients()
    await cleanupMaintenance(admin)
    await cleanupPumpOut(admin)
    await cleanupDocument(admin)
    await cleanupCredits(admin)
  })

  test('maintenance submission saves once and rejects a rapid duplicate', async ({ request }) => {
    const { anon, admin } = clients()
    const token = await tokenFor(anon, 'camper.one@staging.buroaks.invalid', 'BUR_OAKS_STAGING_CAMPER_PASSWORD')
    const body = {
      title: 'STAGING WRITE maintenance duplicate proof',
      description: 'STAGING-WRITE-MAINTENANCE fictional request; never dispatch.',
      category: 'Water',
      photoUrls: [],
    }
    const first = await request.post('/api/maintenance-request', { headers: { Authorization: `Bearer ${token}` }, data: body })
    expect(first.status()).toBe(200)
    const firstBody = await first.json()
    expect(firstBody).toMatchObject({ success: true })
    expect(firstBody.duplicate).not.toBe(true)

    const replay = await request.post('/api/maintenance-request', { headers: { Authorization: `Bearer ${token}` }, data: body })
    expect(replay.status()).toBe(200)
    expect(await replay.json()).toMatchObject({ success: true, duplicate: true, ticketId: firstBody.ticketId })

    const saved = await admin.from('maintenance_tickets').select('id,camper_id,lot_number,admin_approved').eq('id', firstBody.ticketId).single()
    expect(saved.error).toBeNull()
    expect(saved.data).toMatchObject({ camper_id: camperId, lot_number: 'TEST-01', admin_approved: false })
  })

  test('pump-out submission creates one charge candidate and replays safely', async ({ request }) => {
    const { anon, admin } = clients()
    const parked = await admin.from('sewer_pump_out_requests').update({ status: 'completed' }).eq('id', fixturePumpOutId)
    expect(parked.error).toBeNull()
    const token = await tokenFor(anon, 'camper.one@staging.buroaks.invalid', 'BUR_OAKS_STAGING_CAMPER_PASSWORD')
    const body = { serviceLot: 'TEST-01', notes: 'STAGING-WRITE-PUMP fictional request; never dispatch.' }

    const first = await request.post('/api/sewer-pump-out', { headers: { Authorization: `Bearer ${token}` }, data: body })
    expect(first.status()).toBe(200)
    const firstBody = await first.json()
    expect(firstBody).toMatchObject({ success: true, serviceLot: 'TEST-01', billingLot: 'TEST-01' })
    expect(firstBody.duplicate).not.toBe(true)
    expect(firstBody.request?.id).toBeTruthy()

    const replay = await request.post('/api/sewer-pump-out', { headers: { Authorization: `Bearer ${token}` }, data: body })
    expect(replay.status()).toBe(200)
    const replayBody = await replay.json()
    expect(replayBody).toMatchObject({ success: true, duplicate: true })
    expect(replayBody.request?.id).toBe(firstBody.request.id)

    const saved = await admin.from('sewer_pump_out_requests').select('camper_id,lot_number,status,charge_amount,billed_at').eq('id', firstBody.request.id).single()
    expect(saved.error).toBeNull()
    expect(saved.data).toMatchObject({ camper_id: camperId, lot_number: 'TEST-01', status: 'requested', billed_at: null })
    expect(Number(saved.data?.charge_amount)).toBeGreaterThan(0)
  })

  test('document signature records one proof and refuses a replay', async ({ request }) => {
    const { anon, admin } = clients()
    const token = await tokenFor(anon, 'camper.one@staging.buroaks.invalid', 'BUR_OAKS_STAGING_CAMPER_PASSWORD')
    const body = { documentId, typedName: 'Casey Camper', consentAccepted: true, renewalDecision: null }

    const first = await request.post('/api/sign-document', { headers: { Authorization: `Bearer ${token}` }, data: body })
    expect(first.status()).toBe(200)
    const firstBody = await first.json()
    expect(firstBody).toMatchObject({ success: true, signatureStatus: 'signed', signedSlot: 'first' })
    expect(firstBody.signatureRecordHash).toMatch(/^[a-f0-9]{64}$/)

    const replay = await request.post('/api/sign-document', { headers: { Authorization: `Bearer ${token}` }, data: body })
    expect(replay.status()).toBe(409)

    const saved = await admin.from('documents').select('signature_status,signed_name,signed_email,signature_record_hash').eq('id', documentId).single()
    expect(saved.error).toBeNull()
    expect(saved.data).toMatchObject({
      signature_status: 'signed',
      signed_name: 'Casey Camper',
      signed_email: 'camper.one@staging.buroaks.invalid',
      signature_record_hash: firstBody.signatureRecordHash,
    })
  })

  test('browser roles cannot call the server-only credit function directly', async () => {
    const { anon } = clients()
    const args = {
      p_camper_id: camperId,
      p_amount: 0,
      p_reason: 'STAGING WRITE permission probe',
      p_notes: null,
      p_actor_email: 'permission-probe@staging.buroaks.invalid',
    }
    const anonymousAttempt = await anon.rpc('create_account_credit_audited', args)
    expect(anonymousAttempt.error).toBeTruthy()
    expect(['42501', 'PGRST202']).toContain(anonymousAttempt.error?.code)

    await tokenFor(anon, 'camper.one@staging.buroaks.invalid', 'BUR_OAKS_STAGING_CAMPER_PASSWORD')
    const camperAttempt = await anon.rpc('create_account_credit_audited', args)
    expect(camperAttempt.error).toBeTruthy()
    expect(['42501', 'PGRST202']).toContain(camperAttempt.error?.code)
  })

  test('administrator creates and voids a fictional credit with an audit trail', async ({ request }) => {
    const { anon, admin } = clients()
    const token = await tokenFor(anon, 'office.admin@staging.buroaks.invalid', 'BUR_OAKS_STAGING_ADMIN_PASSWORD')
    const reason = 'STAGING WRITE reversible credit proof'
    const created = await request.post('/api/admin-account-credits', {
      headers: { Authorization: `Bearer ${token}` },
      data: { action: 'create', camperId, amount: 12.34, reason, notes: 'STAGING-WRITE-CREDIT fictional adjustment.' },
    })
    expect(created.status()).toBe(200)
    const createdBody = await created.json()
    expect(createdBody).toMatchObject({ success: true, appliedNow: 0 })
    expect(createdBody.credit?.id).toBeTruthy()

    const voided = await request.post('/api/admin-account-credits', {
      headers: { Authorization: `Bearer ${token}` },
      data: { action: 'void', creditId: createdBody.credit.id, reason: 'STAGING WRITE cleanup after proof' },
    })
    expect(voided.status()).toBe(200)
    expect(await voided.json()).toMatchObject({ success: true, voidedAmount: 12.34 })

    const credit = await admin.from('account_credits').select('status,remaining_amount').eq('id', createdBody.credit.id).single()
    expect(credit.error).toBeNull()
    expect(credit.data).toMatchObject({ status: 'voided', remaining_amount: 0 })
    const audit = await admin.from('admin_audit_events').select('action,reason').eq('entity_id', createdBody.credit.id).eq('action', 'account_credit_voided').single()
    expect(audit.error).toBeNull()
    expect(audit.data).toMatchObject({ action: 'account_credit_voided', reason: 'STAGING WRITE cleanup after proof' })
  })
})
