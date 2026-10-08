import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('office billing never presents failed reads as current zero totals', () => {
  const page = read('app/admin/invoices/page.tsx')
  assert.match(page, /if \(error\) throw error/)
  assert.match(page, /if \(camperResult\.error\) throw camperResult\.error/)
  assert.match(page, /finally \{\s*setLoading\(false\)/)
  assert.match(page, /No totals on this screen should be treated as current/)
  assert.match(page, /Billing is temporarily unavailable/)
})

test('System Health always leaves loading and refuses stale-looking totals after failure', () => {
  const page = read('app/admin/system-health/page.tsx')
  assert.match(page, /if \(!response\.ok \|\| !result\.snapshot\) throw/)
  assert.match(page, /setSnapshot\(null\)/)
  assert.match(page, /finally \{\s*setLoading\(false\)/)
  assert.match(page, /No totals below should be treated as current/)
  assert.match(page, /role="alert"/)
})

test('open balances cannot turn a failed billing read into zero dollars', () => {
  const page = read('app/admin/open-balance/page.tsx')
  assert.match(page, /if \(error\) throw error/)
  assert.match(page, /No totals on this screen should be treated as current/)
  assert.match(page, /Open balances are temporarily unavailable/)
  assert.match(page, /onClick=\{loadBalances\}>Try again/)
})

test('maintenance only clears attention after tickets load successfully', () => {
  const page = read('app/admin/maintenance/page.tsx')
  const readGuard = page.indexOf('if (error) throw error')
  const markSeen = page.indexOf("await markAdminAlertsSeen(supabase, 'maintenance_request')")
  assert.ok(readGuard >= 0 && markSeen > readGuard)
  assert.match(page, /Counts and empty states are hidden/)
  assert.match(page, /Maintenance is temporarily unavailable/)
})

test('camper management requires both core records and health reads', () => {
  const page = read('app/admin/campers/page.tsx')
  assert.match(page, /if \(error\) throw error/)
  assert.match(page, /if \(failedResult\?\.error\) throw failedResult\.error/)
  assert.match(page, /Camper management is temporarily unavailable/)
})

test('document center blocks false empty states after any required read fails', () => {
  const page = read('app/admin/documents/page.tsx')
  assert.match(page, /if \(camperResult\.error\) throw camperResult\.error/)
  assert.match(page, /if \(!documentResponse\.ok\) throw/)
  assert.match(page, /Documents are temporarily unavailable/)
  assert.match(page, /finally \{\s*setLoading\(false\)/)
})

test('account credits never present a failed read as a zero credit balance', () => {
  const page = read('app/admin/credits/page.tsx')
  assert.match(page, /if \(creditResult\.error\) throw creditResult\.error/)
  assert.match(page, /The credit balance and history are hidden/)
  assert.match(page, /Account credits are temporarily unavailable/)
})

test('reports block printing and exports unless all six source reads succeed', () => {
  const page = read('app/admin/reports/page.tsx')
  assert.match(page, /yearPumpOutResult\]\s*\.find\(\(result\) => result\.error\)/)
  assert.match(page, /printing, and exports are blocked/)
  assert.match(page, /Reports are temporarily unavailable/)
})

test('renewal forecast does not show a failed read as an empty action list', () => {
  const page = read('app/admin/renewals/page.tsx')
  assert.match(page, /Renewal records could not be loaded completely/)
  assert.match(page, /Renewals are temporarily unavailable/)
  assert.match(page, /onClick=\{loadPage\}>Try again/)
})

test('pump-out attention is acknowledged only after the full queue loads', () => {
  const page = read('app/admin/pump-outs/page.tsx')
  assert.match(page, /if \(requestsLoaded && optionsLoaded\) await markPumpOutAlertsViewed\(\)/)
  assert.match(page, /Pump-outs are temporarily unavailable/)
  assert.match(page, /Counts and actions are hidden/)
})

test('site service totals and charge actions require both core reads', () => {
  const page = read('app/admin/site-services/page.tsx')
  assert.match(page, /Promise\.all\(\[loadCampers\(\), loadCharges\(\), loadSettings\(\)\]\)/)
  assert.match(page, /Site service charges are temporarily unavailable/)
  assert.match(page, /Totals and charge actions are hidden/)
})

test('Stripe deposits block empty deposit and health views after a failed load', () => {
  const page = read('app/admin/stripe-deposits/page.tsx')
  assert.match(page, /setHealth\(null\)/)
  assert.match(page, /Deposit totals and printing are hidden/)
  assert.match(page, /Stripe deposits are temporarily unavailable/)
})

test('income projection blocks initial failures but preserves the last healthy refresh', () => {
  const page = read('app/admin/income-projection/page.tsx')
  assert.match(page, /if \(initialLoad\) setLoadError/)
  assert.match(page, /The last healthy projection is still shown/)
  assert.match(page, /Forecast totals, printing, and downloads are hidden/)
})

test('bulk invoice creation requires a successfully loaded complete camper roster', () => {
  const page = read('app/admin/individual-invoices/page.tsx')
  assert.match(page, /Bulk invoice creation is blocked so nobody is accidentally skipped/)
  assert.match(page, /if \(loading \|\| loadError\) return/)
})

test('monthly electric reports cannot print or export a failed partial read', () => {
  const page = read('app/admin/electric/monthly-report/page.tsx')
  assert.match(page, /Printing and CSV download are blocked/)
  assert.match(page, /Monthly electric report is temporarily unavailable/)
})

test('meter review requires both its API queue and recorded readings', () => {
  const page = read('app/admin/electric/meter-readings/page.tsx')
  assert.match(page, /if \(!response\.ok \|\| readingResult\.error\)/)
  assert.match(page, /The last healthy queue is still shown/)
  assert.match(page, /Meter review is temporarily unavailable/)
})

test('site availability blocks false opening counts after any source fails', () => {
  const page = read('app/admin/site-availability/page.tsx')
  assert.match(page, /Opening counts are hidden until lots, campers, and renewals all load/)
})

test('electric billing requires all money and operational sources before enabling writes', () => {
  const page = read('app/admin/electric/page.tsx')
  assert.match(page, /results\.some\(\(loaded\) => loaded === false\)/)
  assert.match(page, /Billing actions are blocked so no charge is omitted/)
  assert.match(page, /Electric billing is temporarily unavailable/)
  assert.match(page, /finally \{\s*setInitialLoading\(false\)/)
})

test('remaining office rosters and action queues fail closed instead of looking empty', () => {
  const checks = [
    ['app/admin/settings/page.tsx', /app_settings.*select\('key'\)/s, /Campground settings are temporarily unavailable/],
    ['app/admin/lots/page.tsx', /lotResult\.error \|\| camperResult\.error/, /Lots and sites are temporarily unavailable/],
    ['app/admin/waitlist/page.tsx', /waitlistResult\.error \|\| lotResult\.error \|\| camperResult\.error/, /Waitlist is temporarily unavailable/],
    ['app/admin/site-care/page.tsx', /camperResult\.error \|\| noticeResult\.error/, /Site care is temporarily unavailable/],
    ['app/admin/notifications/page.tsx', /Handling controls are blocked/, /Notifications are temporarily unavailable/],
    ['app/admin/directory/page.tsx', /No roster is being shown as empty/, /Camper directory is temporarily unavailable/],
    ['app/admin/waitlist-removals/page.tsx', /Review controls are blocked/, /Waitlist opt-outs are temporarily unavailable/],
    ['app/admin/archived-campers/page.tsx', /invoiceResult\.error \|\| pumpOutResult\.error/, /Camper archive is temporarily unavailable/],
    ['app/admin/maintenance/archive/page.tsx', /No totals are being shown as zero/, /Maintenance archive is temporarily unavailable/],
    ['app/admin/maintenance/inventory/page.tsx', /Stock totals and editing controls are blocked/, /Maintenance inventory is temporarily unavailable/],
    ['app/admin/maintenance/supplies/page.tsx', /Queue totals and update controls are blocked/, /Supply requests are temporarily unavailable/],
  ] as const

  for (const [path, readGuard, recoveryHeading] of checks) {
    const page = read(path)
    assert.match(page, readGuard, path)
    assert.match(page, recoveryHeading, path)
    assert.match(page, /role="alert"/, path)
    assert.match(page, /portal-loading-retry/, path)
  }
})

test('waitlist conversion does not invite a duplicate retry after an unknown network result', () => {
  const page = read('app/admin/waitlist/page.tsx')
  assert.match(page, /The result could not be confirmed\. Check the camper list and waitlist before trying again\./)
  assert.doesNotMatch(page, /Nothing was sent—please try again/)
})

test('communications, events, access, and field operations hide false empty states', () => {
  const checks = [
    ['app/admin/announcements/page.tsx', /Posting and archive controls are blocked/, /Announcements are temporarily unavailable/],
    ['app/admin/events/page.tsx', /Event changes are blocked/, /Events are temporarily unavailable/],
    ['app/admin/dinners/page.tsx', /Headcounts are hidden/, /Dinner planner is temporarily unavailable/],
    ['app/admin/rsvps/page.tsx', /RSVP totals are hidden/, /Event responses are temporarily unavailable/],
    ['app/admin/thanksgiving/page.tsx', /Attendance and food totals are hidden/, /Thanksgiving planner is temporarily unavailable/],
    ['app/admin/birthdays/page.tsx', /prevent duplicate or missed actions/, /Birthdays are temporarily unavailable/],
    ['app/admin/gatecards/page.tsx', /Card changes are blocked/, /Gate cards are temporarily unavailable/],
    ['app/admin/texts/page.tsx', /delivery service status could not be loaded/, /Text alerts are temporarily unavailable/],
    ['app/maintenance/dashboard/page.tsx', /Queue totals and field actions are hidden/, /Maintenance work orders are temporarily unavailable/],
    ['app/maintenance/dashboard/inventory/page.tsx', /Stock totals are hidden/, /Field inventory is temporarily unavailable/],
    ['app/maintenance/dashboard/meter-readings/page.tsx', /Progress totals and photo submission are blocked/, /Meter route is temporarily unavailable/],
  ] as const

  for (const [path, safetyCopy, recoveryHeading] of checks) {
    const page = read(path)
    assert.match(page, safetyCopy, path)
    assert.match(page, recoveryHeading, path)
    assert.match(page, /role="alert"/, path)
    assert.match(page, /portal-loading-retry/, path)
  }
})

test('an interrupted meter-photo write is treated as unknown instead of definitely unsaved', () => {
  const page = read('app/maintenance/dashboard/meter-readings/page.tsx')
  assert.match(page, /The result could not be confirmed/)
  assert.match(page, /check the meter review queue before submitting this lot again/i)
  assert.doesNotMatch(page, /Nothing was saved—tap Retake/)
})

test('command, intelligence, and record-detail screens require authoritative reads', () => {
  const checks = [
    ['app/admin/page.tsx', /Totals and action queues are hidden to prevent false zeroes/, /Admin command center is temporarily unavailable/],
    ['app/admin/camper-standing/page.tsx', /Standing totals are hidden/, /Camper standing is temporarily unavailable/],
    ['app/admin/camper-usage/page.tsx', /Usage totals and review signals are hidden/, /Camper usage is temporarily unavailable/],
    ['app/admin/map/page.tsx', /Occupied and vacant labels are hidden/, /Campground map is temporarily unavailable/],
    ['app/admin/campers/[id]/page.tsx', /invoice ledger, or document record could not be loaded completely/, /Camper profile is temporarily unavailable/],
    ['app/admin/open-balance/[id]/page.tsx', /Payment, reminder, printing, and deletion controls are blocked/, /Account statement is temporarily unavailable/],
    ['app/admin/maintenance/[id]/page.tsx', /Editing and alert acknowledgement are blocked/, /Maintenance ticket is temporarily unavailable/],
    ['app/maintenance/dashboard/[id]/page.tsx', /Field updates are blocked/, /Field work order is temporarily unavailable/],
  ] as const

  for (const [path, safetyCopy, recoveryHeading] of checks) {
    const page = read(path)
    assert.match(page, safetyCopy, path)
    assert.match(page, recoveryHeading, path)
    assert.match(page, /role="alert"/, path)
    assert.match(page, /portal-loading-retry/, path)
  }
})

test('maintenance detail acknowledges attention only after the ticket loads', () => {
  const page = read('app/admin/maintenance/[id]/page.tsx')
  const readGuard = page.indexOf("if (error) {")
  const markSeen = page.indexOf("await markAdminAlertsSeen(supabase, 'maintenance_request'")
  assert.ok(readGuard >= 0 && markSeen > readGuard)
})

test('remaining launch, document, billing, and community views fail closed', () => {
  const checks = [
    ['app/admin/invoices/[id]/page.tsx', /Editing, payment, printing, texting, and deletion controls are blocked/, /Invoice detail is temporarily unavailable/],
    ['app/admin/documents/templates/[id]/page.tsx', /No document contents are being presented as current/, /Library document is temporarily unavailable/],
    ['app/admin/launch/page.tsx', /Readiness totals are hidden/, /Launch checklist is temporarily unavailable/],
    ['components/CommunityFeed.tsx', /Posts, member access, reports, and posting controls are hidden/, /Campground Messenger is temporarily unavailable/],
  ] as const

  for (const [path, safetyCopy, recoveryHeading] of checks) {
    const page = read(path)
    assert.match(page, safetyCopy, path)
    assert.match(page, recoveryHeading, path)
    assert.match(page, /role="alert"/, path)
    assert.match(page, /portal-loading-retry/, path)
  }
})

test('camper account and maintenance history views never present failed reads as empty', () => {
  const checks = [
    ['app/profile/page.tsx', /Editing and upload controls are blocked/, /Profile is temporarily unavailable/],
    ['app/electric/page.tsx', /Usage totals, charges, and meter photos are hidden/, /Electric history is temporarily unavailable/],
    ['app/directory/page.tsx', /phone numbers, and search controls are hidden/, /Camper directory is temporarily unavailable/],
    ['app/maintenance/history/page.tsx', /Completion totals, work orders, and notes are hidden/, /Maintenance history is temporarily unavailable/],
  ] as const

  for (const [path, safetyCopy, recoveryHeading] of checks) {
    const page = read(path)
    assert.match(page, safetyCopy, path)
    assert.match(page, recoveryHeading, path)
    assert.match(page, /role="alert"/, path)
    assert.match(page, /portal-loading-retry/, path)
  }

  assert.match(read('app/profile/page.tsx'), /upload result could not be confirmed/)
})
