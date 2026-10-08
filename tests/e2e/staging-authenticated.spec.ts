import { expect, test, type Page } from '@playwright/test'

const enabled = process.env.BUR_OAKS_STAGING_E2E === '1'
const stripeTestEnabled = process.env.BUR_OAKS_STRIPE_TEST_E2E === '1'
test.use({ screenshot: 'off', trace: 'off' })

async function signIn(page: Page, email: string, password: string, destination: RegExp) {
  await page.goto('/login')
  await page.getByLabel('Email address or mobile number').fill(email)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await page.getByLabel('Password').fill('').catch(() => {})
  await expect(page).toHaveURL(destination)
}

test.describe('authenticated synthetic staging journeys', () => {
  test.skip(!enabled, 'Runs only against the isolated Bur Oaks staging project')

  test('camper sees only the synthetic campsite account', async ({ page }) => {
    await signIn(
      page,
      'camper.one@staging.buroaks.invalid',
      process.env.BUR_OAKS_STAGING_CAMPER_PASSWORD || '',
      /\/portal(?:\?|$)/,
    )
    await expect(page.getByText('TEST-01', { exact: false }).first()).toBeVisible()

    await page.goto('/invoices')
    await page.getByRole('tab', { name: /Due in 8–30/ }).click()
    await expect(page.getByText('TEST-OPEN-0001', { exact: false }).first()).toBeVisible()
    await expect(page.getByText('$86.40', { exact: false }).first()).toBeVisible()
    if (!stripeTestEnabled) {
      await expect(page.getByText('Stripe is not configured.', { exact: true })).toBeVisible()
    }

    await page.goto('/documents')
    await expect(page.getByText('Synthetic Seasonal Agreement', { exact: false }).first()).toBeVisible()

    await page.goto('/admin')
    await expect(page.getByRole('alert', { name: /cannot open this page/i })).toBeVisible()
  })

  test('office administrator sees the synthetic billing and operations work', async ({ page }) => {
    await signIn(
      page,
      'office.admin@staging.buroaks.invalid',
      process.env.BUR_OAKS_STAGING_ADMIN_PASSWORD || '',
      /\/admin(?:\?|$)/,
    )

    await page.goto('/admin/invoices')
    await expect(page.getByText('TEST-OPEN-0001', { exact: false }).first()).toBeVisible()

    await page.goto('/admin/maintenance')
    await expect(page.getByText('Synthetic water hookup check', { exact: false }).first()).toBeVisible()

    await page.goto('/admin/renewals')
    await expect(page.getByText('TEST-01', { exact: false }).first()).toBeVisible()
  })

  test('maintenance staff sees approved synthetic work but not the office', async ({ page }) => {
    await signIn(
      page,
      'maintenance.staff@staging.buroaks.invalid',
      process.env.BUR_OAKS_STAGING_MAINTENANCE_PASSWORD || '',
      /\/maintenance\/dashboard(?:\?|$)/,
    )
    await expect(page.getByText('Synthetic water hookup check', { exact: false }).first()).toBeVisible()

    await page.goto('/admin')
    await expect(page.getByRole('alert', { name: /cannot open this page/i })).toBeVisible()
  })
})
