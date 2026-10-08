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

async function installSyntheticAdminSession(page: Page) {
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

test('health endpoint identifies the release without caching or customer data', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.ok()).toBeTruthy()
  expect(response.headers()['cache-control']).toContain('no-store')
  expect(response.headers()['x-request-id']).toMatch(/^[0-9a-f-]{36}$/)

  const payload = await response.json()
  expect(payload).toMatchObject({ ok: true, service: 'bur-oaks-portal' })
  expect(JSON.stringify(payload)).not.toMatch(/camper|invoice|payment|email|phone/i)
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

test('weak-connection recovery is actionable and contained on priority camper screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One required phone width covers synthetic failure recovery without touching production data.')
  const synthetic = await installSyntheticCamperSession(page)

  const recoveryChecks = [
    { path: '/messages', message: 'We could not open your conversation' },
    { path: '/documents', message: 'We could not open your documents' },
    { path: '/maintenance', message: 'We could not open your maintenance requests' },
    { path: '/invoices', message: 'We could not open your billing account' },
    { path: '/portal', message: 'Some portal information could not be loaded' },
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

test('office money and operations screens fail closed on a synthetic outage', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone-360', 'One required phone width covers the isolated office outage without contacting production.')
  test.setTimeout(90_000)
  const synthetic = await installSyntheticAdminSession(page)

  const recoveryChecks = [
    { path: '/admin/invoices', heading: 'Billing is temporarily unavailable' },
    { path: '/admin/system-health', heading: 'System Health is temporarily unavailable' },
    { path: '/admin/open-balance', heading: 'Open balances are temporarily unavailable' },
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
