import { expect, test, type Page } from '@playwright/test'

async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    document: document.documentElement.scrollWidth,
  }))
  expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1)
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
