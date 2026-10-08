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
