import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1)
}

async function installSyntheticCamperSession(page: Page) {
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
    await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: 'Synthetic release-check read failure' }) })
  })

  for (const endpoint of ['/api/messages', '/api/camper-documents']) {
    await page.route(endpoint, (route) => route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Synthetic release-check outage' }),
    }))
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
  await installSyntheticCamperSession(page)

  const recoveryChecks = [
    { path: '/messages', message: 'We could not open your conversation' },
    { path: '/documents', message: 'We could not open your documents' },
    { path: '/maintenance', message: 'We could not open your maintenance requests' },
  ]

  for (const recovery of recoveryChecks) {
    await page.goto(recovery.path)
    await expect(page.getByRole('alert').filter({ hasText: recovery.message })).toBeVisible()
    const retry = page.getByRole('button', { name: 'Try again' })
    await expect(retry).toBeVisible()
    expect((await retry.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(42)
    await expectNoHorizontalOverflow(page)
  }
})
