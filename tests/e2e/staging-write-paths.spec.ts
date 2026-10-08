import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import Stripe from 'stripe'

const enabled = process.env.BUR_OAKS_STAGING_WRITE_E2E === '1'
const stripeTestEnabled = process.env.BUR_OAKS_STRIPE_TEST_E2E === '1'
const stagingHost = 'pgstmfovnzsgrkawzivc.supabase.co'
const camperId = '10000000-0000-4000-8000-000000000001'
const documentId = '10000000-0000-4000-8000-000000000060'
const fixturePumpOutId = '10000000-0000-4000-8000-000000000090'
const meterInvoiceNumber = 'STAGING-METER-WRITE-0001'
const meterOperationKey = 'staging-meter-write-0001'
const meterReading = 987654
const prospectId = '10000000-0000-4000-8000-000000000099'
let stripeInvoiceId = ''
let stripeInvoiceItemId = ''
let stripeEventId = ''
let stripePaymentReference = ''
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

async function cleanupProspect(admin: SupabaseClient) {
  const deleted = await admin.from('waitlist').delete().eq('id', prospectId)
  if (deleted.error) throw deleted.error
}

async function cleanupMeterBilling(admin: SupabaseClient) {
  const submissions = await admin.from('meter_reading_submissions').select('id,photo_path').eq('lot_number', 'TEST-01').eq('submitted_reading', meterReading)
  if (submissions.error) throw submissions.error
  const photoPaths = (submissions.data || []).map((row) => String(row.photo_path || '')).filter(Boolean)
  if (photoPaths.length) {
    const photos = await admin.storage.from('meter-reading-photos').remove(photoPaths)
    if (photos.error) throw photos.error
  }
  const submissionIds = (submissions.data || []).map((row) => String(row.id))
  if (submissionIds.length) {
    const deleted = await admin.from('meter_reading_submissions').delete().in('id', submissionIds)
    if (deleted.error) throw deleted.error
  }

  const invoices = await admin.from('invoices').select('id').eq('invoice_number', meterInvoiceNumber)
  if (invoices.error) throw invoices.error
  const invoiceIds = (invoices.data || []).map((row) => String(row.id))
  if (invoiceIds.length) {
    for (const table of ['account_credit_applications', 'electric_readings', 'invoice_items']) {
      const deleted = await admin.from(table).delete().in('invoice_id', invoiceIds)
      if (deleted.error) throw deleted.error
    }
    const deletedInvoices = await admin.from('invoices').delete().in('id', invoiceIds)
    if (deletedInvoices.error) throw deletedInvoices.error
  }
  const operation = await admin.from('billing_operation_keys').delete().eq('operation_key', meterOperationKey)
  if (operation.error) throw operation.error
}

async function cleanupStripeBilling(admin: SupabaseClient) {
  const invoices = await admin.from('invoices').select('id,payment_reference').ilike('invoice_number', 'STAGING-STRIPE-%')
  if (invoices.error) throw invoices.error
  const invoiceIds = (invoices.data || []).map((row) => String(row.id))
  const paymentReferences = (invoices.data || []).map((row) => String(row.payment_reference || '')).filter(Boolean)
  if (stripePaymentReference) paymentReferences.push(stripePaymentReference)
  if (paymentReferences.length) {
    const notifications = await admin.from('admin_notifications').delete().eq('source_table', 'stripe_payment_intents').in('source_id', [...new Set(paymentReferences)])
    if (notifications.error) throw notifications.error
  }
  if (stripeEventId) {
    const ledger = await admin.from('stripe_webhook_events').delete().eq('event_id', stripeEventId)
    if (ledger.error) throw ledger.error
  }
  if (invoiceIds.length) {
    const items = await admin.from('invoice_items').delete().in('invoice_id', invoiceIds)
    if (items.error) throw items.error
    const deleted = await admin.from('invoices').delete().in('id', invoiceIds)
    if (deleted.error) throw deleted.error
  }
  stripeInvoiceId = ''
  stripeInvoiceItemId = ''
  stripeEventId = ''
  stripePaymentReference = ''
}

test.describe.serial('reversible staging write journeys', () => {
  test.skip(!enabled, 'Runs only against the isolated Bur Oaks staging project')

  test.beforeEach(async () => {
    const { admin } = clients()
    await cleanupMaintenance(admin)
    await cleanupPumpOut(admin)
    await cleanupDocument(admin)
    await cleanupCredits(admin)
    await cleanupProspect(admin)
    await cleanupMeterBilling(admin)
    await cleanupStripeBilling(admin)
  })

  test.afterEach(async () => {
    const { admin } = clients()
    await cleanupMaintenance(admin)
    await cleanupPumpOut(admin)
    await cleanupDocument(admin)
    await cleanupCredits(admin)
    await cleanupProspect(admin)
    await cleanupMeterBilling(admin)
    await cleanupStripeBilling(admin)
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

  test('administrator logs one prospect follow-up while browser roles remain read-only', async ({ request }) => {
    const { anon, admin } = clients()
    const seeded = await admin.from('waitlist').insert({
      id: prospectId,
      first_name: 'Staging',
      last_name: 'Prospect',
      email: 'staging.prospect@staging.buroaks.invalid',
      status: 'Waiting',
      notes: 'STAGING-WRITE-PROSPECT fictional record; never contact.',
    })
    expect(seeded.error).toBeNull()

    const token = await tokenFor(anon, 'office.admin@staging.buroaks.invalid', 'BUR_OAKS_STAGING_ADMIN_PASSWORD')
    const followUpOn = new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10)
    const saved = await request.post('/api/admin-waitlist-activity', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        waitlistId: prospectId,
        activityType: 'call',
        occurredAt: new Date().toISOString(),
        followUpOn,
        newStatus: 'Contacted',
        detail: 'STAGING WRITE spoke with fictional prospect.',
      },
    })
    expect(saved.status()).toBe(200)
    expect(await saved.json()).toMatchObject({ success: true })

    const prospect = await admin.from('waitlist').select('status,last_contact_at,next_follow_up_on').eq('id', prospectId).single()
    expect(prospect.error).toBeNull()
    expect(prospect.data?.status).toBe('Contacted')
    expect(prospect.data?.last_contact_at).toBeTruthy()
    expect(prospect.data?.next_follow_up_on).toBe(followUpOn)
    const history = await admin.from('waitlist_activities').select('activity_type,detail').eq('waitlist_id', prospectId)
    expect(history.error).toBeNull()
    expect(history.data).toEqual([{ activity_type: 'call', detail: 'STAGING WRITE spoke with fictional prospect.' }])

    const browserWrite = await anon.from('waitlist_activities').insert({ waitlist_id: prospectId, activity_type: 'note', detail: 'must be blocked' })
    expect(browserWrite.error).toBeTruthy()
    expect(browserWrite.error?.code).toBe('42501')
  })

  test('meter photo produces one review record and one reversible electric bill', async ({ request }) => {
    const { anon: maintenanceClient, admin } = clients()
    const maintenanceToken = await tokenFor(maintenanceClient, 'maintenance.staff@staging.buroaks.invalid', 'BUR_OAKS_STAGING_MAINTENANCE_PASSWORD')
    const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
    const captured = await request.post('/api/meter-readings', {
      headers: { Authorization: `Bearer ${maintenanceToken}` },
      multipart: {
        photo: { name: 'staging-meter.png', mimeType: 'image/png', buffer: pixel },
        lotNumber: 'TEST-01',
        reading: String(meterReading),
        detectedReading: String(meterReading),
        ocrConfidence: '1',
        routeMode: '0',
      },
    })
    expect(captured.status()).toBe(200)
    const capturedBody = await captured.json()
    expect(capturedBody).toMatchObject({ success: true })
    expect(capturedBody.submission?.id).toBeTruthy()

    const { anon: officeClient } = clients()
    const adminToken = await tokenFor(officeClient, 'office.admin@staging.buroaks.invalid', 'BUR_OAKS_STAGING_ADMIN_PASSWORD')
    const due = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
    const readingDate = new Date().toISOString().slice(0, 10)
    const bundle = await officeClient.rpc('create_invoice_bundle_atomic', {
      p_operation_key: meterOperationKey,
      p_invoice: {
        camper_id: camperId,
        invoice_number: meterInvoiceNumber,
        invoice_type: 'Electric',
        subtotal: 7.2,
        late_fee: 0,
        total_due: 7.2,
        due_date: due,
      },
      p_items: [{ description: 'STAGING WRITE 10 kWh electric usage', quantity: 10, unit_price: 0.72, total: 7.2 }],
      p_readings: [{ reading_date: readingDate, previous_reading: meterReading - 10, current_reading: meterReading, kwh_used: 10, rate_per_kwh: 0.72, amount_due: 7.2 }],
      p_pump_out_ids: [],
      p_site_service_ids: [],
      p_new_credit: null,
      p_applied_by: 'office.admin@staging.buroaks.invalid',
    })
    expect(bundle.error).toBeNull()
    expect(bundle.data?.invoice?.id).toBeTruthy()

    const connected = await request.patch('/api/meter-readings', {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: { id: capturedBody.submission.id, status: 'used', invoiceId: bundle.data.invoice.id },
    })
    expect(connected.status()).toBe(200)

    const invoice = await admin.from('invoices').select('invoice_number,total_due,status').eq('id', bundle.data.invoice.id).single()
    expect(invoice.error).toBeNull()
    expect(invoice.data).toMatchObject({ invoice_number: meterInvoiceNumber, total_due: 7.2, status: 'sent' })
    const submission = await admin.from('meter_reading_submissions').select('status,invoice_id,photo_path').eq('id', capturedBody.submission.id).single()
    expect(submission.error).toBeNull()
    expect(submission.data).toMatchObject({ status: 'used', invoice_id: bundle.data.invoice.id })
    expect(submission.data?.photo_path).toBeTruthy()
  })

  test('checkout fails closed without a test Stripe provider and leaves billing unchanged', async ({ request }) => {
    test.skip(stripeTestEnabled, 'The explicit Stripe sandbox journey replaces this no-provider check.')
    const { anon, admin } = clients()
    const before = await admin.from('invoices').select('id,status,total_due,payment_method,payment_reference').eq('id', '10000000-0000-4000-8000-000000000020').single()
    expect(before.error).toBeNull()
    const token = await tokenFor(anon, 'camper.one@staging.buroaks.invalid', 'BUR_OAKS_STAGING_CAMPER_PASSWORD')
    const response = await request.post('/api/create-checkout-session', {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoiceIds: [before.data?.id], paymentMethod: 'card' },
    })
    expect(response.status()).toBe(500)
    expect(await response.json()).toMatchObject({ success: false, error: 'Unable to start secure checkout.' })

    const after = await admin.from('invoices').select('status,total_due,payment_method,payment_reference').eq('id', before.data?.id).single()
    expect(after.error).toBeNull()
    expect(after.data).toEqual({
      status: before.data?.status,
      total_due: before.data?.total_due,
      payment_method: before.data?.payment_method,
      payment_reference: before.data?.payment_reference,
    })
  })

  test('Stripe sandbox checkout posts one signed payment and rejects the webhook replay', async ({ page, request }) => {
    test.skip(!stripeTestEnabled, 'Requires the explicit Stripe sandbox runner and Keychain credential.')
    test.setTimeout(90_000)
    const { anon, admin } = clients()
    stripeInvoiceId = randomUUID()
    stripeInvoiceItemId = randomUUID()
    const invoiceNumber = `STAGING-STRIPE-${Date.now()}`
    const dueDate = new Date(Date.now() + 14 * 86_400_000).toISOString().slice(0, 10)
    const invoice = await admin.from('invoices').insert({
      id: stripeInvoiceId,
      camper_id: camperId,
      invoice_number: invoiceNumber,
      invoice_type: 'Staging Stripe proof',
      subtotal: 1,
      late_fee: 0,
      total_due: 1,
      due_date: dueDate,
      status: 'sent',
    })
    expect(invoice.error).toBeNull()
    const item = await admin.from('invoice_items').insert({
      id: stripeInvoiceItemId,
      invoice_id: stripeInvoiceId,
      description: 'STAGING Stripe sandbox proof',
      quantity: 1,
      unit_price: 1,
      total: 1,
    })
    expect(item.error).toBeNull()

    const token = await tokenFor(anon, 'camper.one@staging.buroaks.invalid', 'BUR_OAKS_STAGING_CAMPER_PASSWORD')
    const checkout = await request.post('/api/create-checkout-session', {
      headers: { Authorization: `Bearer ${token}` },
      data: { invoiceIds: [stripeInvoiceId], paymentMethod: 'card' },
    })
    expect(checkout.status()).toBe(200)
    const checkoutBody = await checkout.json()
    expect(checkoutBody).toMatchObject({ success: true })
    expect(checkoutBody.id).toMatch(/^cs_test_/)
    expect(checkoutBody.url).toContain('checkout.stripe.com')

    await page.goto(checkoutBody.url)
    await page.locator('input[name="cardNumber"]').fill('4242424242424242')
    await page.locator('input[name="cardExpiry"]').fill('1234')
    await page.locator('input[name="cardCvc"]').fill('123')
    await page.getByRole('textbox', { name: 'Phone number', exact: true }).fill('2015550123')
    const billingName = page.locator('input[name="billingName"]')
    if (await billingName.count()) await billingName.fill('Casey Camper')
    await page.getByRole('textbox', { name: 'ZIP', exact: true }).fill('62025')
    await page.getByRole('button', { name: /pay/i }).click()
    await page.waitForURL(/^https:\/\/www\.buroakscampground\.com\/success/, { timeout: 30_000 })

    const stripe = new Stripe(required('STRIPE_SECRET_KEY'))
    const session = await stripe.checkout.sessions.retrieve(checkoutBody.id, { expand: ['payment_intent'] })
    expect(session.payment_status).toBe('paid')
    stripePaymentReference = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || ''
    expect(stripePaymentReference).toMatch(/^pi_/)

    stripeEventId = `evt_buroaks_staging_${randomUUID().replaceAll('-', '')}`
    const payload = JSON.stringify({
      id: stripeEventId,
      object: 'event',
      api_version: null,
      created: Math.floor(Date.now() / 1000),
      data: { object: session },
      livemode: false,
      pending_webhooks: 1,
      request: null,
      type: 'checkout.session.completed',
    })
    const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: required('STRIPE_WEBHOOK_SECRET') })
    const firstWebhook = await request.post('/api/stripe-webhook', {
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      data: payload,
    })
    expect(firstWebhook.status()).toBe(200)
    expect(await firstWebhook.json()).toMatchObject({ received: true })

    const paid = await admin.from('invoices').select('status,payment_method,payment_reference,paid_at').eq('id', stripeInvoiceId).single()
    expect(paid.error).toBeNull()
    expect(paid.data?.status).toBe('paid')
    expect(paid.data?.payment_method).toBe('Online card')
    expect(paid.data?.payment_reference).toBe(stripePaymentReference)
    expect(paid.data?.paid_at).toBeTruthy()

    const replay = await request.post('/api/stripe-webhook', {
      headers: { 'content-type': 'application/json', 'stripe-signature': signature },
      data: payload,
    })
    expect(replay.status()).toBe(200)
    expect(await replay.json()).toMatchObject({ received: true, duplicate: true })
    const ledger = await admin.from('stripe_webhook_events').select('event_id').eq('event_id', stripeEventId)
    expect(ledger.error).toBeNull()
    expect(ledger.data).toHaveLength(1)
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
