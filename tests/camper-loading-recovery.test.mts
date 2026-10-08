import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('priority camper screens always leave their initial loading state', () => {
  for (const path of [
    'app/invoices/page.tsx',
    'app/messages/page.tsx',
    'app/documents/page.tsx',
    'app/maintenance/page.tsx',
    'app/portal/page.tsx',
  ]) {
    const source = read(path)
    assert.match(source, /finally \{\s*setLoading\(false\)/)
  }
})

test('failed startup loads provide safe retry guidance without implying a write', () => {
  const invoices = read('app/invoices/page.tsx')
  const messages = read('app/messages/page.tsx')
  const documents = read('app/documents/page.tsx')
  const maintenance = read('app/maintenance/page.tsx')
  const portal = read('app/portal/page.tsx')

  assert.match(invoices, /No payment was started/)
  assert.match(messages, /No message was sent or changed/)
  assert.match(documents, /Nothing was signed or changed/)
  assert.match(maintenance, /Nothing was submitted or changed/)

  for (const source of [invoices, messages, documents, maintenance, portal]) {
    assert.match(source, />Try again</)
    assert.match(source, /role="alert"/)
  }
})

test('billing and home never mistake a failed read for an empty account', () => {
  const invoices = read('app/invoices/page.tsx')
  const portal = read('app/portal/page.tsx')

  assert.match(invoices, /if \(invoiceFallback\.error \|\| creditFallback\.error\)/)
  assert.match(invoices, /throw invoiceFallback\.error \|\| creditFallback\.error/)
  assert.match(portal, /const dashboardReadFailed =/)
  assert.match(portal, /if \(dashboardReadFailed\)/)
  assert.match(portal, /return \{ invoices: data \|\| \[\], error \}/)
  assert.match(portal, /!documentResult/)
  assert.match(portal, /!pumpOutResult/)
  assert.match(portal, /!authorizedBillingResult/)
  assert.match(portal, /if \(loadError\) \{/)
  assert.match(portal, /Balances, documents, messages, and service statuses are hidden/)
  assert.match(portal, /We could not verify the complete account/)
})

test('camper home renders verified account tasks before optional campground extras', () => {
  const portal = read('app/portal/page.tsx')
  const criticalBatch = portal.indexOf('const [invoiceResult, documentResult, maintenanceResult')
  const ready = portal.indexOf('setLoading(false)', criticalBatch)
  const optionalBatch = portal.indexOf('const [electricResult, eventResult, announcementResult', criticalBatch)

  assert.ok(criticalBatch >= 0)
  assert.ok(ready > criticalBatch)
  assert.ok(optionalBatch > ready)
  assert.match(portal, /Account tasks are current, but some campground extras could not be refreshed/)
  assert.match(portal, /billing, documents, messages, and services safely/)
  assert.match(portal, /return\s*\n\s*}/)
})

test('camper home offers a persistent low-data mode without hiding critical account work', () => {
  const portal = read('app/portal/page.tsx')
  const styles = read('app/globals.css')

  assert.match(portal, /bur-oaks-low-data-mode/)
  assert.match(portal, /connection\?\.saveData/)
  assert.match(portal, /slow-2g/)
  assert.match(portal, /Use less data/)
  assert.match(portal, /Account tasks and campground notices stay available/)
  assert.match(portal, /!lowDataMode && <PortalWeather/)
  assert.match(portal, /!lowDataMode && <EventFlyerShowcase/)
  assert.match(portal, /!lowDataMode && <section className="portal-birthday-club"/)
  assert.match(portal, /if \(!next\) window\.location\.reload\(\)/)
  assert.match(portal, /aria-pressed=\{lowDataMode\}/)
  assert.match(styles, /\.portal-data-saver/)
  assert.match(styles, /min-height:44px/)
})
