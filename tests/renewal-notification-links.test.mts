import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { adminNotificationHref, adminNotificationStaysOpenUntilResolved, resolutionRequiredAdminNotificationTypes } from '../lib/admin-notification-links.ts'

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
  assert.match(notifications, /staysOpenUntilResolved/)
  assert.match(notifications, /Review & choose/)
  assert.match(renewals, /new URLSearchParams\(window\.location\.search\)\.get\('camper'\)/)
  assert.match(renewals, /openSiteHistory\(camper\)/)
  assert.match(renewals, /Annual renewal decision/)
  assert.match(renewals, /Approve renewal/)
  assert.match(renewals, /Do not approve renewal/)
  assert.match(renewals, /Annual lot rent/)
  assert.match(renewals, /Times late/)
  assert.match(renewals, /Invoice & payment history/)
  assert.match(renewals, /height:100dvh/)
  assert.match(renewals, /-webkit-overflow-scrolling:touch/)
  assert.match(renewals, /createPortal\(<div className="site-history-overlay">/)
  assert.match(renewals, /body\.style\.position = 'fixed'/)
  assert.match(renewals, /root\.style\.overflow = 'hidden'/)
  assert.match(renewals, /\.site-history-scroll\{[^}]*overflow-y:auto/)
  assert.match(renewals, /\.site-history-panel\{[^}]*overflow:hidden/)
  assert.match(historyRoute, /office_messages/)
  assert.match(historyRoute, /maintenance_tickets/)
  assert.match(historyRoute, /electric_readings/)
  assert.match(historyRoute, /season_renewals/)
})

test('delivered and completed renewals cannot be pushed back into the approval queue', () => {
  const renewals = source('app/admin/renewals/page.tsx')
  const renewalApi = source('app/api/admin-renewals/route.ts')
  const renewalCron = source('app/api/cron/season-renewals/route.ts')

  assert.match(renewals, /current\?\.status === 'Renewing'/)
  assert.match(renewals, /current\?\.renewal_sent_at/)
  assert.match(renewals, /selectedDecisionLocked/)
  assert.match(renewalApi, /existing\?\.status === 'Renewing'/)
  assert.match(renewalApi, /existing\?\.status === 'Camper Leaving'/)
  assert.match(renewalApi, /existing\?\.renewal_sent_at/)
  assert.match(renewalApi, /no duplicate renewal was created/)
  assert.match(renewalCron, /status: 'Awaiting Response',[\s\S]*auto_send_approved: false,[\s\S]*auto_send_approved_at: null/)
})

test('opening a renewal record never clears the decision alert', () => {
  for (const type of ['renewal_review', 'nonrenewal_letter_review', 'renewal_declined', 'renewal_document_incomplete', 'renewal_rent_schedule', 'renewal_rent_schedule_error']) {
    assert.equal(adminNotificationStaysOpenUntilResolved(type), true)
  }
  assert.equal(adminNotificationStaysOpenUntilResolved('maintenance_request'), false)

  const notifications = source('app/admin/notifications/page.tsx')
  const renewalApi = source('app/api/admin-renewals/route.ts')
  assert.match(notifications, /notification\.read_at \|\| staysOpenUntilResolved/)
  assert.match(renewalApi, /action === 'approve' \|\| action === 'decline'/)
  assert.match(renewalApi, /\.eq\('type', 'renewal_review'\)/)
})

test('renewal alerts cannot be cleared by routine or individual handling controls', () => {
  assert.deepEqual(resolutionRequiredAdminNotificationTypes, [
    'renewal_review',
    'nonrenewal_letter_review',
    'renewal_declined',
    'renewal_document_incomplete',
    'renewal_rent_schedule',
    'renewal_rent_schedule_error',
  ])

  const notifications = source('app/admin/notifications/page.tsx')
  assert.match(notifications, /\.not\('type', 'in', `\(\$\{resolutionRequiredAdminNotificationTypes\.join\(','\)\}\)`\)/)
  assert.match(notifications, /!notification\.read_at && !staysOpenUntilResolved/)
  assert.match(notifications, /Mark routine handled/)
  assert.match(notifications, /Open until resolved/)
})

test('complete and signed renewals automatically resolve stale correction alerts', () => {
  const renewalCron = source('app/api/cron/season-renewals/route.ts')
  const reminders = source('lib/document-reminders.ts')
  const signing = source('app/api/sign-document/route.ts')
  const renewals = source('app/admin/renewals/page.tsx')

  const linkPosition = renewalCron.indexOf('renewal_document_id: document.id')
  const reminderPosition = renewalCron.indexOf('runPendingDocumentSignatureReminders(admin, [String(document.id)])')
  assert.ok(linkPosition >= 0 && reminderPosition > linkPosition)
  assert.match(reminders, /\.eq\('type', 'renewal_document_incomplete'\)[\s\S]*\.eq\('source_id', document\.id\)[\s\S]*\.is\('read_at', null\)/)
  assert.match(signing, /\.update\(\{ read_at: signedAt \}\)[\s\S]*\.eq\('type', 'renewal_document_incomplete'\)/)
  assert.match(renewals, /Lot \{row\.camper\.lot_number \|\| '—'\} · \{renewalResponseCountdownLabel\(row\.responseDaysRemaining\)\}/)
})
