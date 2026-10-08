import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1)
}

async function installSyntheticCamperSession(page: Page) {
  let simulateReadFailure = true
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'release-check-user', email: 'release-check@example.invalid', role: 'authenticated', exp: now + 3600 })}.release-check`
  const user = {
    id: 'release-check-user',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'release-check@example.invalid',
    user_metadata: {},
    app_metadata: {},
    created_at: new Date(0).toISOString(),
  }

  await page.addInitScript(({ session }) => {
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = function getItem(key: string) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) return JSON.stringify(session)
      return originalGetItem.call(this, key)
    }
  }, {
    session: {
      access_token: accessToken,
      refresh_token: 'release-check-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      user,
    },
  })

  await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/user') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (url.pathname === '/auth/v1/logout') {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    if (url.pathname === '/rest/v1/campers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify([{ id: 'release-check-camper', lot_number: 'TEST', first_name: 'Release', last_name: 'Check', email: user.email, role: 'camper', active: true }]),
      })
      return
    }
    if (simulateReadFailure) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic release-check read failure' }) })
      return
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '*/0' },
      body: '[]',
    })
  })

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (simulateReadFailure && ['/api/messages', '/api/camper-documents', '/api/camper-invoices'].includes(pathname)) {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Synthetic release-check outage' }),
      })
      return
    }

    const payloads: Record<string, object> = {
      '/api/messages': { messages: [] },
      '/api/camper-documents': { documents: [], suggestedSignerName: 'Release Check' },
      '/api/camper-invoices': { invoices: [], accountCredit: 0, accountCreditDetails: { lotRent: 0, general: 0 } },
      '/api/authorized-billing': { accounts: [] },
      '/api/sewer-pump-out': { requests: [], serviceLots: ['TEST'], serviceAccounts: [] },
      '/api/birthdays': { success: true, birthdays: [], officeGreetings: [] },
    }
    const payload = payloads[pathname]
    await route.fulfill({
      status: payload ? 200 : 503,
      contentType: 'application/json',
      body: JSON.stringify(payload || { error: 'Synthetic release-check outage' }),
    })
  })

  return {
    recoverReads() {
      simulateReadFailure = false
    },
  }
}

async function installSyntheticAdminSession(page: Page, closeoutOverride?: object) {
  let simulateReadFailure = true
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'release-check-admin', email: 'admin-release-check@example.invalid', role: 'authenticated', exp: now + 3600 })}.release-check`
  const user = {
    id: 'release-check-admin',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'admin-release-check@example.invalid',
    user_metadata: {},
    app_metadata: {},
    created_at: new Date(0).toISOString(),
  }

  await page.addInitScript(({ session }) => {
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = function getItem(key: string) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) return JSON.stringify(session)
      return originalGetItem.call(this, key)
    }
  }, {
    session: {
      access_token: accessToken,
      refresh_token: 'release-check-admin-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: now + 3600,
      user,
    },
  })

  await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/user') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (simulateReadFailure) {
      await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic office release-check read failure' }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' })
  })

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/login-destination') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role: 'admin', destination: '/admin' }) })
      return
    }
    if (simulateReadFailure) {
      await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic office release-check outage' }) })
      return
    }
    const payloads: Record<string, object> = {
      '/api/admin-documents': { documents: [] },
      '/api/admin-stripe-payouts': { payouts: [], health: null },
      '/api/admin-daily-closeout': closeoutOverride || {
        date: '2026-10-08', generatedAt: '2026-10-08T18:45:30Z', balanced: true, readyToClose: true,
        checks: { paymentAllocation: true, paidInvoicesClassified: true, depositsClear: true, moneyExceptionsClear: true },
        totals: { received: 675, onlineReceived: 525, manualReceived: 150, invoiceAllocations: 600, savedCredit: 75, creditsApplied: 40, bankDeposits: 575, difference: 0 },
        counts: { onlineInvoices: 1, manualPayments: 1, creditsCreated: 2, creditsApplied: 1, bankDeposits: 1, payoutProblems: 0, unclassifiedInvoices: 0, moneyExceptions: 0 },
        onlineInvoices: [{ id: 'online', invoice_number: 'TEST-300', total_due: 500, payment_method: 'Online card', paid_at: '2026-10-08T15:00:00Z', campers: { first_name: 'Online', last_name: 'Camper', lot_number: 'T1' } }],
        manualPayments: [{ id: 'manual', amount: 150, payment_method: 'Check', created_at: '2026-10-08T16:00:00Z', result: { appliedTotal: 100, creditAmount: 50 }, campers: { first_name: 'Office', last_name: 'Camper', lot_number: 'T2' } }],
        manualAllocations: [{ payment_id: 'manual', invoice_id: 'manual-invoice', amount_applied: 100, invoices: { invoice_number: 'TEST-302', invoice_type: 'Lot rent' } }],
        onlineExtraCredits: [{ id: 'extra', original_amount: 25, remaining_amount: 25, applies_to: 'lot_rent', campers: { lot_number: 'T1' } }],
        creditApplications: [{ id: 'application', amount_applied: 40, applied_at: '2026-10-08T17:00:00Z', invoices: { invoice_number: 'TEST-301', invoice_type: 'Electric' }, campers: { first_name: 'Credit', last_name: 'Camper', lot_number: 'T3' } }],
        payouts: [{ id: 'payout', amount: 57500, status: 'paid', automatic: true }], unclassifiedInvoices: [], moneyExceptions: [],
        history: [
          { date: '2026-10-02', readyToClose: true, received: 0, bankDeposits: 0, reviewCount: 0 },
          { date: '2026-10-03', readyToClose: true, received: 0, bankDeposits: 0, reviewCount: 0 },
          { date: '2026-10-04', readyToClose: true, received: 0, bankDeposits: 0, reviewCount: 0 },
          { date: '2026-10-05', readyToClose: true, received: 0, bankDeposits: 0, reviewCount: 0 },
          { date: '2026-10-06', readyToClose: true, received: 0, bankDeposits: 0, reviewCount: 0 },
          { date: '2026-10-07', readyToClose: true, received: 0, bankDeposits: 0, reviewCount: 0 },
          { date: '2026-10-08', readyToClose: true, received: 675, bankDeposits: 575, reviewCount: 0 },
        ],
      },
      '/api/meter-readings': { submissions: [], entries: [], counts: {}, monthStart: '2026-10-01' },
      '/api/admin-sidebar-attention': { counts: {}, appBadgeCount: 0 },
      '/api/admin-birthdays': { counts: {}, birthdays: [] },
      '/api/community-feed': { unreadCount: 0, directCount: 0 },
      '/api/admin-renewals': { success: true },
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payloads[pathname] || {}),
    })
  })

  return {
    recoverReads() {
      simulateReadFailure = false
    },
  }
}

async function installSyntheticRoleRouter(page: Page, role = 'camper', destination = '/portal') {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'role-check-user', email: 'role-check@example.invalid', role: 'authenticated', exp: now + 3600 })}.role-check`
  const user = { id: 'role-check-user', aud: 'authenticated', role: 'authenticated', email: 'role-check@example.invalid', user_metadata: {}, app_metadata: {}, created_at: new Date(0).toISOString() }

  await page.addInitScript(({ session }) => {
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = function getItem(key: string) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) return JSON.stringify(session)
      return originalGetItem.call(this, key)
    }
  }, { session: { access_token: accessToken, refresh_token: 'role-check-refresh', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user } })

  await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/user') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (url.pathname === '/auth/v1/logout') {
      await route.fulfill({ status: 204, body: '' })
      return
    }
    if (url.pathname === '/rest/v1/campers') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify([{
          id: `role-check-${role}`,
          lot_number: role === 'camper' ? 'TEST' : '',
          first_name: 'Role',
          last_name: 'Check',
          email: user.email,
          role,
          active: true,
        }]),
      })
      return
    }
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic role-route read boundary' }) })
  })

  await page.route('**/api/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/api/login-destination') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ role, destination }) })
      return
    }
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Synthetic role-route boundary' }) })
  })
}

async function installSyntheticDeepLinkLogin(page: Page) {
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'deep-link-user', email: 'deep-link@example.invalid', role: 'authenticated', exp: now + 3600 })}.deep-link`
  const user = { id: 'deep-link-user', aud: 'authenticated', role: 'authenticated', email: 'deep-link@example.invalid', user_metadata: {}, app_metadata: {}, created_at: new Date(0).toISOString() }

  await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/token') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: accessToken, refresh_token: 'deep-link-refresh', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user }) })
      return
    }
    if (url.pathname === '/auth/v1/user') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (url.pathname === '/rest/v1/campers') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify([{ id: 'deep-link-camper', first_name: 'Deep', last_name: 'Link', email: user.email, lot_number: 'TEST', role: 'camper', active: true }]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' })
  })

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    const payloads: Record<string, object> = {
      '/api/login-destination': { role: 'camper', destination: '/portal' },
      '/api/camper-invoices': { invoices: [], accountCredit: 0, accountCreditDetails: { lotRent: 0, general: 0 } },
      '/api/authorized-billing': { accounts: [] },
      '/api/autopay': { enabled: false },
    }
    await route.fulfill({ status: payloads[pathname] ? 200 : 503, contentType: 'application/json', body: JSON.stringify(payloads[pathname] || { error: 'Synthetic deep-link boundary' }) })
  })
}

async function installSyntheticCamperWriteSession(page: Page) {
  type Outcome = 'success' | 'duplicate' | 'rejected' | 'unknown'
  let maintenanceOutcome: Outcome = 'success'
  let pumpOutcome: Outcome = 'success'
  let maintenancePosts = 0
  let pumpPosts = 0
  let maintenanceTickets: object[] = []
  let pumpRequests: object[] = []
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'write-check-user', email: 'write-check@example.invalid', role: 'authenticated', exp: now + 3600 })}.write-check`
  const user = { id: 'write-check-user', aud: 'authenticated', role: 'authenticated', email: 'write-check@example.invalid', user_metadata: {}, app_metadata: {}, created_at: new Date(0).toISOString() }
  const camper = { id: 'write-check-camper', lot_number: 'TEST', first_name: 'Write', last_name: 'Check', email: user.email, role: 'camper', active: true }

  await page.addInitScript(({ session }) => {
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = function getItem(key: string) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) return JSON.stringify(session)
      return originalGetItem.call(this, key)
    }
  }, { session: { access_token: accessToken, refresh_token: 'write-check-refresh', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user } })

  await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/user') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (url.pathname === '/rest/v1/campers') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify([camper]) })
      return
    }
    if (url.pathname === '/rest/v1/maintenance_tickets') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': maintenanceTickets.length ? `0-${maintenanceTickets.length - 1}/${maintenanceTickets.length}` : '*/0' }, body: JSON.stringify(maintenanceTickets) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' })
  })

  await page.route('**/api/**', async (route) => {
    const request = route.request()
    const pathname = new URL(request.url()).pathname

    if (pathname === '/api/maintenance-request' && request.method() === 'POST') {
      maintenancePosts += 1
      if (maintenanceOutcome === 'unknown') {
        await route.abort('connectionfailed')
        return
      }
      if (maintenanceOutcome === 'rejected') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The office request queue is temporarily unavailable.' }) })
        return
      }
      const duplicate = maintenanceOutcome === 'duplicate'
      const ticket = { id: 'synthetic-ticket-1', camper_id: camper.id, lot_number: camper.lot_number, title: 'Synthetic water check', description: 'Synthetic browser test only', category: 'Water', status: 'Open', admin_approved: false, created_at: new Date().toISOString() }
      maintenanceTickets = [ticket]
      await new Promise((resolve) => setTimeout(resolve, 150))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, duplicate, ticketId: ticket.id, emailStatus: duplicate ? 'skipped' : 'daily_summary' }) })
      return
    }

    if (pathname === '/api/sewer-pump-out' && request.method() === 'POST') {
      pumpPosts += 1
      if (pumpOutcome === 'unknown') {
        await route.abort('connectionfailed')
        return
      }
      if (pumpOutcome === 'rejected') {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'The pump-out queue is temporarily unavailable.' }) })
        return
      }
      const duplicate = pumpOutcome === 'duplicate'
      const pumpRequest = { id: 'synthetic-pump-1', camper_id: camper.id, lot_number: camper.lot_number, status: 'Requested', requested_at: new Date().toISOString() }
      pumpRequests = [pumpRequest]
      await new Promise((resolve) => setTimeout(resolve, 150))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, duplicate, request: pumpRequest, serviceLot: camper.lot_number, billingLot: camper.lot_number, chargeAmount: 10, emailStatus: duplicate ? 'skipped' : 'daily_summary' }) })
      return
    }

    const payloads: Record<string, object> = {
      '/api/messages': { messages: [] },
      '/api/camper-documents': { documents: [
        { id: 'doc-action', document_name: 'Rules acknowledgment', document_type: 'Rules', signature_status: 'pending', requires_two_signatures: false, signed_email: null, second_signed_email: null },
        { id: 'doc-waiting', document_name: 'Two-signer agreement', document_type: 'Agreement', signature_status: 'pending_second_signature', requires_two_signatures: true, signed_name: 'Write Check', signed_email: user.email, second_signed_email: null },
        { id: 'doc-complete', document_name: 'Completed lease', document_type: 'Lease', signature_status: 'signed', requires_two_signatures: false, signed_name: 'Write Check', signed_email: user.email, signed_at: '2026-10-07T15:15:00.000Z' },
        { id: 'doc-renewal', document_name: '2027 Seasonal Renewal', document_type: 'Renewal', signature_status: 'signed', requires_two_signatures: false, signed_name: 'Write Check', signed_email: user.email, signed_at: '2026-10-07T15:15:00.000Z' },
        { id: 'doc-insurance', document_name: 'Golf cart insurance', document_type: 'Insurance', signature_status: 'not_required', requires_two_signatures: false },
      ], suggestedSignerName: 'Write Check' },
      '/api/camper-invoices': { invoices: [], accountCredit: 0, accountCreditDetails: { lotRent: 0, general: 0 } },
      '/api/authorized-billing': { accounts: [] },
      '/api/sewer-pump-out': { success: true, requests: pumpRequests, serviceLots: [camper.lot_number], serviceAccounts: [{ serviceLot: camper.lot_number, billingLot: camper.lot_number }] },
      '/api/birthdays': { success: true, birthdays: [], officeGreetings: [] },
    }
    const payload = payloads[pathname]
    await route.fulfill({ status: payload ? 200 : 503, contentType: 'application/json', body: JSON.stringify(payload || { error: 'Synthetic write-check boundary' }) })
  })

  return {
    maintenancePosts: () => maintenancePosts,
    pumpPosts: () => pumpPosts,
    setMaintenanceOutcome: (outcome: Outcome) => { maintenanceOutcome = outcome },
    setPumpOutcome: (outcome: Outcome) => { pumpOutcome = outcome },
  }
}

async function installSyntheticPaymentReceiptSession(page: Page) {
  let paymentState: 'paid' | 'credited' | 'processing' | 'open' = 'paid'
  let checkoutPosts = 0
  let checkoutBody: Record<string, unknown> | null = null
  const now = Math.floor(Date.now() / 1000)
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url')
  const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: 'receipt-check-user', email: 'receipt-check@example.invalid', role: 'authenticated', exp: now + 3600 })}.receipt-check`
  const user = { id: 'receipt-check-user', aud: 'authenticated', role: 'authenticated', email: 'receipt-check@example.invalid', user_metadata: {}, app_metadata: {}, created_at: new Date(0).toISOString() }
  const camper = { id: 'receipt-check-camper', lot_number: 'TEST', first_name: 'Receipt', last_name: 'Check', email: user.email, role: 'camper', active: true }

  function invoice() {
    return {
      id: 'receipt-check-invoice',
      camper_id: camper.id,
      invoice_number: 'TEST-100',
      invoice_type: 'Quarterly Lot Rent',
      subtotal: 500,
      late_fee: 0,
      total_due: paymentState === 'credited' ? 0 : 500,
      due_date: '2026-10-01',
      status: paymentState === 'processing' ? 'processing' : paymentState === 'open' ? 'open' : 'paid',
      paid_at: paymentState === 'processing' || paymentState === 'open' ? null : '2026-10-07T15:15:00.000Z',
      payment_method: paymentState === 'paid' ? 'Online card' : paymentState === 'credited' ? 'Paid by account credit' : paymentState === 'processing' ? 'Online ACH processing' : null,
      ach_expected_date: paymentState === 'processing' ? '2026-10-12' : null,
      invoice_items: [{ id: 'receipt-check-item', description: 'Quarterly Lot Rent', quantity: 1, unit_price: 500, total: 500 }],
    }
  }

  function receipt() {
    if (paymentState === 'processing' || paymentState === 'open') return null
    if (paymentState === 'credited') return {
      kind: 'account_credit', totalReceived: 500, receivedOn: '2026-10-07T15:15:00.000Z', method: 'Paid by account credit',
      allocations: [{ invoiceId: 'receipt-check-invoice', invoiceNumber: 'TEST-100', invoiceType: 'Quarterly Lot Rent', amount: 500 }], savedCredit: null,
    }
    return {
      kind: 'online', totalReceived: 650, receivedOn: '2026-10-07T15:15:00.000Z', method: 'Online card',
      allocations: [
        { invoiceId: 'receipt-check-invoice', invoiceNumber: 'TEST-100', invoiceType: 'Quarterly Lot Rent', amount: 500 },
        { invoiceId: 'receipt-check-second', invoiceNumber: 'TEST-101', invoiceType: 'Electric', amount: 100 },
      ],
      savedCredit: { amount: 50, remainingAmount: 50, destination: 'lot_rent' },
    }
  }

  await page.addInitScript(({ session }) => {
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = function getItem(key: string) {
      if (key.startsWith('sb-') && key.endsWith('-auth-token')) return JSON.stringify(session)
      return originalGetItem.call(this, key)
    }
  }, { session: { access_token: accessToken, refresh_token: 'receipt-check-refresh', token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, user } })

  await page.route(/https:\/\/[^/]+\.supabase\.co\/.*/, async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname === '/auth/v1/user') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) })
      return
    }
    if (url.pathname === '/rest/v1/campers') {
      await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/1' }, body: JSON.stringify([camper]) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '*/0' }, body: '[]' })
  })

  await page.route('**/api/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname
    if (pathname === '/api/create-checkout-session') {
      checkoutPosts += 1
      checkoutBody = route.request().postDataJSON()
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'cs_test_payment_review', url: '/cancel' }) })
      return
    }
    const payloads: Record<string, object> = {
      '/api/camper-invoices': { camper, invoice: invoice(), receipt: receipt(), invoices: [invoice()], accountCredit: 0, accountCreditDetails: { lotRent: 0, general: 0 } },
      '/api/authorized-billing': { accounts: [] },
      '/api/camper-meter-photos': { photos: [] },
    }
    await route.fulfill({ status: payloads[pathname] ? 200 : 503, contentType: 'application/json', body: JSON.stringify(payloads[pathname] || { error: 'Synthetic receipt-check boundary' }) })
  })

  return {
    showCredited() {
      paymentState = 'credited'
    },
    showProcessing() {
      paymentState = 'processing'
    },
    showOpen() {
      paymentState = 'open'
    },
    checkoutPosts: () => checkoutPosts,
    checkoutBody: () => checkoutBody,
  }
}

test('health endpoint identifies the release without caching or customer data', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.ok()).toBeTruthy()
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(response.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)

  const payload = await response.json()
  expect(payload).toMatchObject({ ok: true, service: 'bur-oaks-portal' })
  expect(JSON.stringify(payload)).not.toMatch(/camper|invoice|payment|email|phone/i)
})

test('keyboard users can skip repeated navigation at every release width', async ({ page }) => {
  const response = await page.goto('/login')
  expect(response?.ok()).toBeTruthy()

  await page.keyboard.press('Tab')
  const skipLink = page.getByRole('link', { name: 'Skip to main content' })
  await expect(skipLink).toBeFocused()
  await expect(skipLink).toBeVisible()

  await page.keyboard.press('Enter')
  await expect(page.locator('#main-content')).toBeFocused()
  await expect(page).toHaveURL(/#main-content$/)
  await expectNoHorizontalOverflow(page)
})

test('connection loss and recovery give safe global guidance', async ({ page }, testInfo) => {
  test.skip(!['phone-360', 'desktop'].includes(testInfo.project.name), 'Phone and desktop prove both status-banner positions.')
  await page.goto('/login')
  await expect(page.locator('.global-connection-monitor')).toHaveAttribute('data-ready', 'true')

  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  const lost = page.locator('.global-connection-status')
  await expect(lost).toHaveAttribute('role', 'status')
  await expect(lost).toContainText('Connection lost')
  await expect(lost).toContainText('Unsaved changes may not have reached Bur Oaks')
  await expectNoHorizontalOverflow(page)

  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(lost).toContainText('Connection restored')
  await expect(lost).toContainText('before repeating a payment, message, or request')
})

test('public homepage stays accessible and action-ready at every release width', async ({ page, isMobile }) => {
  const response = await page.goto('/')
  expect(response?.ok()).toBeTruthy()

  await expect(page.getByRole('heading', { level: 1, name: /Claim your summers/i })).toBeVisible()
  await expect(page.locator('main h1')).toHaveCount(1)
  expect(await page.locator('main h2').count()).toBeGreaterThan(0)
  await expectNoHorizontalOverflow(page)

  const accessibilityGaps = await page.evaluate(() => ({
    imagesWithoutAlt: [...document.images].filter((image) => !image.hasAttribute('alt')).length,
    unnamedControls: [...document.querySelectorAll('a[href],button')].filter((element) => {
      return !((element.getAttribute('aria-label') || element.textContent || '').trim())
    }).length,
    unsafeNewTabs: [...document.querySelectorAll('a[target="_blank"]')].filter((link) => {
      const rel = (link.getAttribute('rel') || '').split(/\s+/)
      return !rel.includes('noreferrer')
    }).length,
  }))
  expect(accessibilityGaps).toEqual({ imagesWithoutAlt: 0, unnamedControls: 0, unsafeNewTabs: 0 })

  for (const action of await page.locator('.public-hero-actions a').all()) {
    const box = await action.boundingBox()
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44)
  }

  if (isMobile) {
    const spacing = await page.evaluate(() => {
      const note = document.querySelector('.public-prospect-note')?.getBoundingClientRect()
      const facts = document.querySelector('.public-home-facts')?.getBoundingClientRect()
      return note && facts ? facts.top - note.bottom : -1
    })
    expect(spacing).toBeGreaterThanOrEqual(24)
  }
})

test('local camping guide proves the real place, visit path, and structured answers', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the shared local-guide section used by all four pages.')
  await page.goto('/seasonal-camping-near-st-louis')
  await expect(page.getByRole('heading', { name: 'See the campground you are asking about.' })).toBeVisible()
  await expect(page.locator('.public-local-proof img')).toHaveCount(3)
  await expect(page.getByText('These are current photographs of the seasonal sites and lake at Bur Oaks—not stock campground images.')).toBeVisible()
  const directions = page.getByRole('link', { name: 'Get driving directions' })
  await expect(directions).toHaveAttribute('href', /google\.com\/maps\/dir/)
  await expect(directions).toHaveAttribute('target', '_blank')
  await expect(page.getByRole('heading', { name: 'Straight answers about seasonal camping.' })).toBeVisible()
  await expect(page.locator('.public-local-faq details')).toHaveCount(4)
  const structuredTypes = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts.flatMap((script) => {
    const value = JSON.parse(script.textContent || '{}')
    return value['@graph']?.map((entry: { '@type'?: string }) => entry['@type']) || [value['@type']]
  }))
  expect(structuredTypes).toContain('Campground')
  expect(structuredTypes).toContain('BreadcrumbList')
  expect(structuredTypes).toContain('FAQPage')
  await expectNoHorizontalOverflow(page)
})

test('public interest form submits once and confirms the result without using production', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the intercepted public conversion journey.')
  let submissions = 0
  await page.route('**/api/public-waitlist', async (route) => {
    submissions += 1
    await new Promise((resolve) => setTimeout(resolve, 250))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'x-request-id': 'synthetic-waitlist-check' },
      body: JSON.stringify({ success: true, emailStatus: 'skipped', confirmationEmailStatus: 'skipped' }),
    })
  })

  await page.goto('/availability#membership-inquiry')
  const form = page.locator('form#membership-inquiry')
  await form.getByLabel('First name').fill('Release')
  await form.getByLabel('Last name').fill('Check')
  await form.getByLabel(/Email/).fill('release-check@example.invalid')
  await expect(form).toHaveAttribute('aria-busy', 'false')

  await page.evaluate(() => {
    const target = document.querySelector('form#membership-inquiry')
    target?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
    target?.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }))
  })

  await expect(form).toHaveAttribute('aria-busy', 'true')
  await expect(form.getByRole('status')).toContainText('membership inquiry was received')
  expect(submissions).toBe(1)
  await expectNoHorizontalOverflow(page)
})

test('sign-in stays visible, keyboard-ready, and contained at every release width', async ({ page, isMobile }) => {
  const response = await page.goto('/login')
  expect(response?.ok()).toBeTruthy()
  expect(response?.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)

  const form = page.locator('form.signin-form-card')
  const identity = page.getByLabel('Email address or mobile number')
  const password = page.getByLabel('Password')
  const submit = page.getByRole('button', { name: 'Sign in' })

  await expect(page.getByRole('heading', { name: 'Sign in to continue' })).toBeVisible()
  await expect(form).toBeVisible()
  await expect(identity).toBeVisible()
  await expect(password).toHaveAttribute('type', 'password')
  await expect(submit).toBeDisabled()
  await expectNoHorizontalOverflow(page)

  await identity.fill('release-check@example.invalid')
  await password.fill('not-a-real-password')
  await expect(submit).toBeEnabled()

  const submitBox = await submit.boundingBox()
  expect(submitBox?.height ?? 0).toBeGreaterThanOrEqual(44)

  if (isMobile) {
    const formTop = await page.locator('.signin-form-side').evaluate((element) => element.getBoundingClientRect().top)
    const storyTop = await page.locator('.signin-story').evaluate((element) => element.getBoundingClientRect().top)
    expect(formTop).toBeLessThan(storyTop)
  }
})

test('password recovery stays readable and ready without sending a request', async ({ page }) => {
  const response = await page.goto('/forgot-password')
  expect(response?.ok()).toBeTruthy()
  expect(response?.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)

  const identity = page.getByLabel('Email address or mobile number')
  const submit = page.getByRole('button', { name: 'Send reset link' })

  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible()
  await expect(identity).toBeVisible()
  await expect(submit).toBeDisabled()
  await expect(page.getByRole('link', { name: 'Return to sign in' })).toBeVisible()
  await expect(page.locator('.account-recovery-card')).toHaveCSS('animation-name', 'none')
  await expectNoHorizontalOverflow(page)

  await identity.fill('release-check@example.invalid')
  await expect(submit).toBeEnabled()
  const submitBox = await submit.boundingBox()
  expect(submitBox?.height ?? 0).toBeGreaterThanOrEqual(44)
})

test('the wrong signed-in account is explained without exposing the admin workspace', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the authenticated role boundary and account-switch recovery.')
  const cases = [
    { role: 'camper', destination: '/portal' },
    { role: 'maintenance', destination: '/maintenance/dashboard' },
  ]

  for (const item of cases) {
    const rolePage = await context.newPage()
    await installSyntheticRoleRouter(rolePage, item.role, item.destination)
    await rolePage.goto('/admin')
    await expect(rolePage.getByRole('heading', { name: new RegExp(`This ${item.role} account cannot open this page`, 'i') })).toBeVisible()
    await expect(rolePage.getByRole('link', { name: 'Return to this account’s home' })).toHaveAttribute('href', item.destination)
    await expect(rolePage.getByRole('button', { name: 'Sign out and use an administrator account' })).toBeVisible()
    await expect(rolePage.locator('.admin-sidebar')).toHaveCount(0)
    expect(new URL(rolePage.url()).pathname).toBe('/admin')
    await rolePage.close()
  }

  const adminPage = await context.newPage()
  await installSyntheticRoleRouter(adminPage, 'admin', '/admin')
  await adminPage.goto('/admin')
  await expect(adminPage.locator('.admin-sidebar')).toBeVisible()
  await expect(adminPage.locator('.role-mismatch-card')).toHaveCount(0)
  await adminPage.close()

  await installSyntheticRoleRouter(page, 'event_coordinator', '/community')
  await page.goto('/admin')
  await expect(page.getByRole('heading', { name: /This event coordinator account cannot open this page/i })).toBeVisible()
  await page.getByRole('button', { name: 'Sign out and use an administrator account' }).click()
  await page.waitForURL((url) => url.pathname === '/login' && url.searchParams.get('reason') === 'wrong-account')
  await expect(page.getByRole('heading', { name: 'Administrator sign-in required' })).toBeVisible()
  await expect(page.getByText('The previous account was signed out.')).toBeVisible()
  expect(new URL(page.url()).searchParams.get('returnTo')).toBe('/admin')
})

test('camper sign-in preserves an authorized billing deep link', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the complete synthetic sign-in handoff.')
  await installSyntheticDeepLinkLogin(page)
  await page.goto('/login?returnTo=%2Finvoices%3Fview%3Ddue-7')
  await page.getByLabel('Email address or mobile number').fill('deep-link@example.invalid')
  await page.getByLabel('Password').fill('synthetic-password')
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.waitForURL((url) => url.pathname === '/invoices' && url.searchParams.get('view') === 'due-7')
  await expect(page.getByRole('heading', { name: 'Your account, all in one place.' })).toBeVisible()
})

test('signed-out visitors are returned to login with their private destination preserved', async ({ page }, testInfo) => {
  test.skip(!['phone-360', 'desktop'].includes(testInfo.project.name), 'One phone width and desktop cover the auth boundary.')

  const privateDestinations = [
    { destination: '/portal', login: '/login' },
    { destination: '/invoices?view=due', login: '/login' },
    { destination: '/documents', login: '/login' },
    { destination: '/maintenance/history', login: '/login' },
    { destination: '/admin', login: '/login' },
    { destination: '/maintenance/dashboard', login: '/login' },
    { destination: '/community', login: '/community-login' },
  ]

  for (const { destination, login } of privateDestinations) {
    await page.goto(destination)
    await page.waitForURL((url) =>
      url.pathname === login && url.searchParams.get('returnTo') === destination,
    )
    await expect(page.getByRole('heading', { name: /sign in/i })).toBeVisible()
  }
})

test('camper maintenance success blocks duplicate taps and shows the saved request', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the isolated write journey.')
  const synthetic = await installSyntheticCamperWriteSession(page)
  await page.goto('/maintenance')
  await page.getByLabel('Issue title').fill('Synthetic water check')
  await page.getByLabel('Category').selectOption('Water')
  await page.getByLabel('Description').fill('Synthetic browser test only')
  const submit = page.getByRole('button', { name: 'Submit Request' })
  await submit.evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(page.getByRole('status')).toContainText('Maintenance request submitted')
  expect(synthetic.maintenancePosts()).toBe(1)
  await expect(page.getByRole('heading', { name: 'Synthetic water check' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('camper maintenance preserves the draft when delivery cannot be confirmed', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the isolated unknown-result journey.')
  const synthetic = await installSyntheticCamperWriteSession(page)
  synthetic.setMaintenanceOutcome('unknown')
  await page.goto('/maintenance')
  await page.getByLabel('Issue title').fill('Synthetic uncertain request')
  await page.getByLabel('Description').fill('Keep this synthetic draft visible')
  await page.getByRole('button', { name: 'Submit Request' }).click()
  await expect(page.getByRole('status')).toContainText('could not confirm whether your request was submitted')
  await expect(page.getByLabel('Issue title')).toHaveValue('Synthetic uncertain request')
  await expect(page.getByLabel('Description')).toHaveValue('Keep this synthetic draft visible')
  await expect(page.getByRole('button', { name: 'Submit Request' })).toBeEnabled()
  expect(synthetic.maintenancePosts()).toBe(1)
})

test('camper pump-out success blocks duplicate taps and announces the saved charge', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the isolated write journey.')
  const synthetic = await installSyntheticCamperWriteSession(page)
  await page.goto('/portal')
  await page.locator('.portal-premium-pump').click()
  const confirm = page.getByRole('dialog').getByRole('button', { name: 'Request pump-out' })
  await confirm.evaluate((button: HTMLButtonElement) => { button.click(); button.click() })
  await expect(page.getByRole('status')).toContainText('Sewer pump-out requested for Lot TEST')
  await expect(page.getByRole('status')).toContainText('$10.00')
  expect(synthetic.pumpPosts()).toBe(1)
  await page.goto('/maintenance')
  await expect(page.getByRole('heading', { name: 'My Service Timeline' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Service for Site TEST' })).toBeVisible()
  await expect(page.getByText('In office queue')).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('camper pump-out explains duplicate, rejection, and unknown results safely', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves isolated failure outcomes.')
  const synthetic = await installSyntheticCamperWriteSession(page)
  await page.goto('/portal')

  synthetic.setPumpOutcome('duplicate')
  await page.locator('.portal-premium-pump').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Request pump-out' }).click()
  await expect(page.getByRole('status')).toContainText('No duplicate charge was added')

  synthetic.setPumpOutcome('rejected')
  await page.locator('.portal-premium-pump').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Request pump-out' }).click()
  await expect(page.getByRole('status')).toContainText('pump-out queue is temporarily unavailable')

  synthetic.setPumpOutcome('unknown')
  await page.locator('.portal-premium-pump').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Request pump-out' }).click()
  await expect(page.getByRole('status')).toContainText('could not confirm whether your pump-out request was saved')
  await expect(page.locator('.portal-premium-pump')).toBeEnabled()
  expect(synthetic.pumpPosts()).toBe(3)
})

test('camper payment detail separates a confirmed receipt from a payment still processing', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the isolated receipt and processing states.')
  const synthetic = await installSyntheticPaymentReceiptSession(page)

  await page.goto('/invoices/receipt-check-invoice')
  await expect(page.locator('.camper-invoice-detail-summary').getByText('Paid', { exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Payment recorded' })).toBeVisible()
  await expect(page.getByText('Account payment').locator('..')).toContainText('$650.00')
  await expect(page.getByText('Paid on').locator('..')).toContainText('October 7, 2026')
  await expect(page.getByText('Method').locator('..')).toContainText('Online card')
  await expect(page.getByText('Applied to this invoice').locator('..')).toContainText('$500.00')
  await expect(page.getByRole('heading', { name: 'How this payment was applied' })).toBeVisible()
  await expect(page.getByText('Invoice #TEST-101')).toBeVisible()
  await expect(page.getByText('Saved as account credit')).toBeVisible()
  await expect(page.getByText('Reserved for future lot rent · $50.00 remaining')).toBeVisible()
  const printReceipt = page.getByRole('button', { name: 'Print receipt' })
  expect((await printReceipt.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expect(page.getByRole('button', { name: /Pay by/ })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)

  synthetic.showCredited()
  await page.reload()
  const creditReceipt = page.locator('.camper-payment-receipt')
  await expect(page.locator('.camper-invoice-detail-summary').getByText('Credited', { exact: true })).toBeVisible()
  await expect(creditReceipt.getByRole('heading', { name: 'Account credit applied' })).toBeVisible()
  await expect(creditReceipt.getByText('Amount credited').locator('..')).toContainText('$500.00')
  await expect(creditReceipt.getByText('Method').locator('..')).toContainText('Paid by account credit')
  await expect(page.getByRole('button', { name: /Pay by/ })).toHaveCount(0)

  synthetic.showProcessing()
  await page.reload()
  await expect(page.locator('.camper-invoice-detail-summary').getByText('Processing', { exact: true })).toBeVisible()
  await expect(page.locator('.camper-invoice-detail-summary')).toContainText('do not pay again')
  await expect(page.getByRole('heading', { name: 'This is not a receipt yet.' })).toBeVisible()
  await expect(page.getByText(/please do not pay this invoice again/i)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Payment recorded' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Pay by/ })).toHaveCount(0)
  await expectNoHorizontalOverflow(page)

  synthetic.showOpen()
  await page.reload()
  await page.getByLabel('Total payment amount').fill('550')
  await page.getByRole('button', { name: /Review and Pay by card/ }).click()
  const cardReview = page.getByRole('dialog', { name: 'Review your payment' })
  await expect(cardReview.getByText('Extra saved for future lot rent').locator('..')).toContainText('$50.00')
  await expect(cardReview.getByText('Total Stripe will charge today').locator('..')).toContainText('$567.32')
  expect(synthetic.checkoutPosts()).toBe(0)
  await cardReview.getByRole('button', { name: 'Go back' }).click()
  await page.getByLabel('Total payment amount').fill('500')
  await page.getByRole('button', { name: /Checking account \/ ACH/ }).click()
  await page.getByRole('button', { name: /Review and Pay by ACH/ }).click()
  const review = page.getByRole('dialog', { name: 'Review your payment' })
  await expect(review).toBeVisible()
  await expect(review.getByText('1 invoice').locator('..')).toContainText('$500.00')
  await expect(review.getByText('ACH processing fee').locator('..')).toContainText('$4.00')
  await expect(review.getByText('Total bank debit').locator('..')).toContainText('$504.00')
  await expect(review).toContainText('do not pay again')
  expect(synthetic.checkoutPosts()).toBe(0)
  await review.getByRole('button', { name: /Continue to Stripe/ }).click()
  await expect(page.getByRole('heading', { name: 'Checkout was closed.' })).toBeVisible()
  expect(synthetic.checkoutPosts()).toBe(1)
  expect(synthetic.checkoutBody()).toMatchObject({ invoiceIds: ['receipt-check-invoice'], paymentMethod: 'ach' })
})

test('document center separates my action from another signer’s action', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the actionable document grouping.')
  await installSyntheticCamperWriteSession(page)
  await page.goto('/documents')
  await expect(page.getByText('Your action').locator('..')).toContainText('1')
  await expect(page.getByText('Waiting on others').locator('..')).toContainText('1')
  await expect(page.getByRole('heading', { name: 'Documents waiting for your signature' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Waiting for another signer' })).toBeVisible()
  await expect(page.getByText('Your signature is saved — waiting for the other signer')).toBeVisible()
  await expect(page.getByText('Two-signer agreement').locator('..').getByRole('button', { name: 'Review & Sign' })).toHaveCount(0)
  await expect(page.getByText('Rules acknowledgment').locator('..').getByRole('button', { name: 'Review & Sign' })).toBeVisible()
  await page.getByRole('button', { name: 'Signed 2' }).click()
  await expect(page.getByText('Completed lease')).toBeVisible()
  await expect(page.getByText('Rules acknowledgment')).toHaveCount(0)
  await page.getByRole('button', { name: 'Renewals 1' }).click()
  await expect(page.getByText('2027 Seasonal Renewal')).toBeVisible()
  await expect(page.getByText('Completed lease')).toHaveCount(0)
  await page.getByRole('button', { name: 'Insurance 1' }).click()
  await expect(page.getByText('Golf cart insurance')).toBeVisible()
  await expect(page).toHaveURL(/view=insurance/)
  await expectNoHorizontalOverflow(page)
})

test('weak-connection recovery is actionable and contained on priority camper screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One required phone width covers synthetic failure recovery without touching production data.')
  const synthetic = await installSyntheticCamperSession(page)

  const recoveryChecks = [
    { path: '/messages', message: 'We could not open your conversation' },
    { path: '/documents', message: 'We could not open your documents' },
    { path: '/maintenance', message: 'We could not open your maintenance requests' },
    { path: '/invoices', message: 'We could not open your billing account' },
    { path: '/portal', message: 'Some portal information could not be loaded' },
    { path: '/profile', message: 'Profile is temporarily unavailable' },
    { path: '/electric', message: 'Electric history is temporarily unavailable' },
    { path: '/directory', message: 'Camper directory is temporarily unavailable' },
    { path: '/maintenance/history', message: 'Maintenance history is temporarily unavailable' },
    { path: '/site', message: 'My Site is temporarily unavailable' },
    { path: '/updates', message: 'Updates are temporarily unavailable' },
    { path: '/calendar', message: 'Calendar is temporarily unavailable' },
    { path: '/dinners', message: 'Saturday dinners are temporarily unavailable' },
    { path: '/thanksgiving', message: 'Thanksgiving signup is temporarily unavailable' },
  ]

  for (const recovery of recoveryChecks) {
    await page.goto(recovery.path)
    await expect(page.getByRole('alert').filter({ hasText: recovery.message })).toBeVisible()
    const retry = page.getByRole('button', { name: 'Try again' })
    await expect(retry).toBeVisible()
    expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(42)
    await expectNoHorizontalOverflow(page)
  }

  await page.goto('/messages')
  await expect(page.getByRole('alert').filter({ hasText: 'We could not open your conversation' })).toBeVisible()
  synthetic.recoverReads()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByText('No messages yet. Send the first note to the office.')).toBeVisible()
  await expect(page.getByRole('alert').filter({ hasText: 'We could not open your conversation' })).toHaveCount(0)
})

test('camper data saver keeps verified account tasks usable on a narrow connection', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One required phone width proves the persistent low-data portal mode.')
  const synthetic = await installSyntheticCamperSession(page)
  synthetic.recoverReads()
  await page.addInitScript(() => {
    if (!window.localStorage.getItem('bur-oaks-low-data-mode')) {
      window.localStorage.setItem('bur-oaks-low-data-mode', 'on')
    }
  })

  await page.goto('/portal')
  await expect(page.getByText('Data saver is on')).toBeVisible()
  await expect(page.getByText('Account tasks and campground notices stay available')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Needs your attention' })).toBeVisible()
  const fullPortal = page.getByRole('button', { name: 'Show full portal' })
  expect((await fullPortal.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44)
  await expect(page.locator('.portal-birthday-club')).toHaveCount(0)
  await expect(page.locator('.portal-weather')).toHaveCount(0)
  await expectNoHorizontalOverflow(page)

  await fullPortal.click()
  await expect(page.getByRole('button', { name: 'Use less data' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('office money and operations screens fail closed on a synthetic outage', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One required phone width covers the isolated office outage without contacting production.')
  test.setTimeout(90_000)
  const synthetic = await installSyntheticAdminSession(page)

  const recoveryChecks = [
    { path: '/admin/invoices', heading: 'Billing is temporarily unavailable' },
    { path: '/admin/system-health', heading: 'System Health is temporarily unavailable' },
    { path: '/admin/open-balance', heading: 'Open balances are temporarily unavailable' },
    { path: '/admin/daily-closeout', heading: 'Daily money closeout is temporarily unavailable' },
    { path: '/admin/maintenance', heading: 'Maintenance is temporarily unavailable' },
    { path: '/admin/campers', heading: 'Camper management is temporarily unavailable' },
    { path: '/admin/documents', heading: 'Documents are temporarily unavailable' },
    { path: '/admin/credits', heading: 'Account credits are temporarily unavailable' },
    { path: '/admin/reports', heading: 'Reports are temporarily unavailable' },
    { path: '/admin/renewals', heading: 'Renewals are temporarily unavailable' },
    { path: '/admin/pump-outs', heading: 'Pump-outs are temporarily unavailable' },
    { path: '/admin/site-services', heading: 'Site service charges are temporarily unavailable' },
    { path: '/admin/stripe-deposits', heading: 'Stripe deposits are temporarily unavailable' },
    { path: '/admin/income-projection', heading: 'Income projection is temporarily unavailable' },
    { path: '/admin/individual-invoices', heading: 'Bulk invoicing is temporarily unavailable' },
    { path: '/admin/electric/monthly-report', heading: 'Monthly electric report is temporarily unavailable' },
    { path: '/admin/electric/meter-readings', heading: 'Meter review is temporarily unavailable' },
    { path: '/admin/site-availability', heading: 'Site availability is temporarily unavailable' },
    { path: '/admin/electric', heading: 'Electric billing is temporarily unavailable' },
    { path: '/admin/settings', heading: 'Campground settings are temporarily unavailable' },
    { path: '/admin/lots', heading: 'Lots and sites are temporarily unavailable' },
    { path: '/admin/waitlist', heading: 'Waitlist is temporarily unavailable' },
    { path: '/admin/site-care', heading: 'Site care is temporarily unavailable' },
    { path: '/admin/notifications', heading: 'Notifications are temporarily unavailable' },
    { path: '/admin/archived-campers', heading: 'Camper archive is temporarily unavailable' },
    { path: '/admin/directory', heading: 'Camper directory is temporarily unavailable' },
    { path: '/admin/waitlist-removals', heading: 'Waitlist opt-outs are temporarily unavailable' },
    { path: '/admin/maintenance/archive', heading: 'Maintenance archive is temporarily unavailable' },
    { path: '/admin/maintenance/inventory', heading: 'Maintenance inventory is temporarily unavailable' },
    { path: '/admin/maintenance/supplies', heading: 'Supply requests are temporarily unavailable' },
    { path: '/admin/announcements', heading: 'Announcements are temporarily unavailable' },
    { path: '/admin/events', heading: 'Events are temporarily unavailable' },
    { path: '/admin/dinners', heading: 'Dinner planner is temporarily unavailable' },
    { path: '/admin/rsvps', heading: 'Event responses are temporarily unavailable' },
    { path: '/admin/thanksgiving', heading: 'Thanksgiving planner is temporarily unavailable' },
    { path: '/admin/birthdays', heading: 'Birthdays are temporarily unavailable' },
    { path: '/admin/gatecards', heading: 'Gate cards are temporarily unavailable' },
    { path: '/admin/texts', heading: 'Text alerts are temporarily unavailable' },
    { path: '/maintenance/dashboard', heading: 'Maintenance work orders are temporarily unavailable' },
    { path: '/maintenance/dashboard/inventory', heading: 'Field inventory is temporarily unavailable' },
    { path: '/maintenance/dashboard/meter-readings', heading: 'Meter route is temporarily unavailable' },
    { path: '/admin', heading: 'Admin command center is temporarily unavailable' },
    { path: '/admin/camper-standing', heading: 'Camper standing is temporarily unavailable' },
    { path: '/admin/camper-usage', heading: 'Camper usage is temporarily unavailable' },
    { path: '/admin/map', heading: 'Campground map is temporarily unavailable' },
    { path: '/admin/campers/release-check-camper', heading: 'Camper profile is temporarily unavailable' },
    { path: '/admin/open-balance/release-check-camper', heading: 'Account statement is temporarily unavailable' },
    { path: '/admin/maintenance/release-check-ticket', heading: 'Maintenance ticket is temporarily unavailable' },
    { path: '/maintenance/dashboard/release-check-ticket', heading: 'Field work order is temporarily unavailable' },
    { path: '/admin/invoices/release-check-invoice', heading: 'Invoice detail is temporarily unavailable' },
    { path: '/admin/documents/templates/release-check-template', heading: 'Library document is temporarily unavailable' },
    { path: '/admin/launch', heading: 'Launch checklist is temporarily unavailable' },
    { path: '/admin/community-feed', heading: 'Campground Messenger is temporarily unavailable' },
    { path: '/community/texts', heading: 'Event Texts are temporarily unavailable' },
  ]

  for (const recovery of recoveryChecks) {
    await page.goto(recovery.path)
    await expect(page.getByRole('alert').getByRole('heading', { name: recovery.heading })).toBeVisible()
    const retry = page.getByRole('button', { name: 'Try again' })
    await expect(retry).toBeVisible()
    expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(42)
    await expectNoHorizontalOverflow(page)
  }

  await page.goto('/admin/open-balance')
  await expect(page.getByRole('heading', { name: 'Open balances are temporarily unavailable' })).toBeVisible()
  synthetic.recoverReads()
  await page.getByRole('button', { name: 'Try again' }).click()
  await expect(page.getByRole('heading', { name: 'Amount Due This Month' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Open balances are temporarily unavailable' })).toHaveCount(0)
})

test('office waitlist turns a synthetic website inquiry into a clear follow-up task', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the isolated follow-up queue without reading production.')
  const synthetic = await installSyntheticAdminSession(page)
  synthetic.recoverReads()

  await page.route(/https:\/\/[^/]+\.supabase\.co\/rest\/v1\/waitlist.*/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: { 'content-range': '0-0/1' },
      body: JSON.stringify([{
        id: 'synthetic-waitlist-person', first_name: 'Future', last_name: 'Camper',
        phone: '618-555-0101', email: 'future@example.invalid', desired_site: 'Quiet area',
        status: 'Waiting', created_at: '2026-10-06T18:00:00Z', last_check_in_at: '2026-10-06T18:01:00Z',
        notes: 'Camper type: Fifth wheel\n\nCamper length: 35 ft\n\nCampground tour requested. Preferred date: 2026-10-12. Preferred time: Morning.\n\nSubmitted from public website availability form.',
      }]),
    })
  })

  await page.goto('/admin/waitlist')
  await expect(page.getByRole('heading', { name: 'Follow-up queue' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Future Camper' })).toBeVisible()
  await expect(page.getByText('Contact applicant')).toBeVisible()
  await expect(page.getByText(/Website inquiry.*Tour requested/)).toBeVisible()
  await expect(page.getByText('Fifth wheel · 35 ft')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:6185550101')
  await expect(page.getByRole('link', { name: 'Email' })).toHaveAttribute('href', 'mailto:future%40example.invalid')
  await page.getByLabel('Filter waitlist').selectOption('Needs follow-up')
  await expect(page.getByRole('heading', { name: 'Future Camper' })).toBeVisible()
  await expectNoHorizontalOverflow(page)
})

test('office quick text verifies exact recipients and links before send', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the read-only campaign preview without sending a text.')
  const synthetic = await installSyntheticAdminSession(page)
  synthetic.recoverReads()

  await page.route('**/api/text-alerts?**', async (route) => {
    expect(route.request().method()).toBe('GET')
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, matchedCamperCount: 6, recipientCount: 7, duplicateRecipientCount: 2 }),
    })
  })

  await page.goto('/admin/notifications')
  await expect(page.getByText('EXACT RECIPIENT PREVIEW')).toBeVisible()
  await expect(page.getByText('7 unique phones')).toBeVisible()
  await expect(page.getByText('6 matching camper accounts · 2 duplicate phone entries removed')).toBeVisible()
  await expect(page.getByText('Secure Bur Oaks portal link added automatically')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review & send to 7' })).toBeEnabled()

  await page.locator('.admin-quick-text textarea').fill('Open this shortened link: https://bit.ly/not-approved')
  await expect(page.getByText('Unsafe link blocked')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Review & send to 7' })).toBeDisabled()
  await expectNoHorizontalOverflow(page)
})

test('daily money closeout proves payment allocation without changing a ledger', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves the isolated closeout view.')
  const synthetic = await installSyntheticAdminSession(page)
  synthetic.recoverReads()
  await page.goto('/admin/daily-closeout')
  await expect(page.getByRole('heading', { name: 'Every payment dollar is explained' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Ready to close' })).toBeVisible()
  await expect(page.getByText('Last seven campground days')).toBeVisible()
  await expect(page.getByText('Live exception queue clear')).toBeVisible()
  await expect(page.getByRole('button', { name: /Thu, Oct 8/ })).toContainText('$675.00')
  await expect(page.getByText('Verified Oct 8, 1:45:30 PM CT')).toBeVisible()
  const totals = page.locator('.daily-closeout-kpis')
  await expect(totals.getByText('Total received').locator('..')).toContainText('$675.00')
  await expect(totals.getByText('Applied to invoices').locator('..')).toContainText('$600.00')
  await expect(totals.getByText('Saved as credit').locator('..')).toContainText('$75.00')
  await expect(totals.getByText('Arrived at bank').locator('..')).toContainText('$575.00')
  await expect(page.getByText('Receipts and bank deposits are intentionally separate.')).toBeVisible()
  await expect(page.getByRole('link', { name: /Applied to Invoice #TEST-302/ })).toContainText('$100.00')
  await expectNoHorizontalOverflow(page)
})

test('daily money closeout blocks closing and opens the exact money exception', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One phone width proves unresolved financial exceptions fail closed.')
  const synthetic = await installSyntheticAdminSession(page, {
    date: '2026-10-08', generatedAt: '2026-10-08T18:45:30Z', balanced: true, readyToClose: false,
    checks: { paymentAllocation: true, paidInvoicesClassified: true, depositsClear: true, moneyExceptionsClear: false },
    totals: { received: 500, onlineReceived: 500, manualReceived: 0, invoiceAllocations: 500, savedCredit: 0, creditsApplied: 0, bankDeposits: 500, difference: 0 },
    counts: { onlineInvoices: 1, manualPayments: 0, creditsCreated: 0, creditsApplied: 0, bankDeposits: 1, payoutProblems: 0, unclassifiedInvoices: 0, moneyExceptions: 1 },
    onlineInvoices: [], manualPayments: [], manualAllocations: [], onlineExtraCredits: [], creditApplications: [], payouts: [], unclassifiedInvoices: [],
    moneyExceptions: [{ id: 'dispute-dp_test', kind: 'dispute', severity: 'urgent', title: 'Card payment dispute · needs response', detail: 'Invoice #TEST-300 for Lot T1 is connected to this dispute.', amountCents: 50000, occurredAt: '2026-10-08T17:00:00Z', href: '/admin/invoices/test-invoice', lotNumber: 'T1' }],
    history: [{ date: '2026-10-08', readyToClose: true, received: 500, bankDeposits: 500, reviewCount: 0 }],
  })
  synthetic.recoverReads()
  await page.goto('/admin/daily-closeout')
  await expect(page.getByRole('heading', { name: 'Keep the day open for review' })).toBeVisible()
  await expect(page.getByText('1 unresolved money exception must be reviewed.')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Resolve these before closing' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Card payment dispute/ })).toHaveAttribute('href', '/admin/invoices/test-invoice')
  await expect(page.getByRole('link', { name: 'Open full queue →' })).toHaveAttribute('href', '/admin/money-exceptions')
  await expectNoHorizontalOverflow(page)
})
