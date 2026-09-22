import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { adminNotificationHref } from '../lib/admin-notification-links.ts'

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('renewal attention notices open the exact camper decision record', () => {
  const camperId = 'camper id/with spaces'

  for (const type of ['renewal_review', 'nonrenewal_letter_review', 'renewal_declined', 'renewal_document_incomplete', 'renewal_rent_schedule', 'renewal_rent_schedule_error']) {
    assert.equal(
      adminNotificationHref({ type, camper_id: camperId }, '/admin'),
      '/admin/renewals?camper=camper%20id%2Fwith%20spaces&record=history',
    )
  }
})

test('renewal record deep link opens the complete history and decision panel', () => {
  const notifications = source('app/admin/notifications/page.tsx')
  const renewals = source('app/admin/renewals/page.tsx')
  const historyRoute = source('app/api/admin-site-history/route.ts')

  assert.match(notifications, /adminNotificationHref\(notification, config\.href\)/)
  assert.match(renewals, /new URLSearchParams\(window\.location\.search\)\.get\('camper'\)/)
  assert.match(renewals, /openSiteHistory\(camper\)/)
  assert.match(renewals, /Renew this camper’s site\?/)
  assert.match(renewals, /Times late/)
  assert.match(renewals, /Invoice & payment history/)
  assert.match(historyRoute, /office_messages/)
  assert.match(historyRoute, /maintenance_tickets/)
  assert.match(historyRoute, /electric_readings/)
  assert.match(historyRoute, /season_renewals/)
})
