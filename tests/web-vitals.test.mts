import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { webVitalBudgets, webVitalParameters, webVitalRouteGroup } from '../lib/web-vitals.ts'

test('performance budgets match the good Core Web Vitals targets', () => {
  assert.deepEqual(webVitalBudgets, { CLS: 0.1, FCP: 1800, INP: 200, LCP: 2500, TTFB: 800 })
})

test('private and dynamic paths collapse into privacy-safe workspace groups', () => {
  assert.equal(webVitalRouteGroup('/admin/invoices/private-record-id'), 'admin')
  assert.equal(webVitalRouteGroup('/invoices/private-record-id'), 'camper')
  assert.equal(webVitalRouteGroup('/maintenance/dashboard/private-record-id'), 'maintenance_staff')
  assert.equal(webVitalRouteGroup('/community/talk/private-record-id'), 'community')
  assert.equal(webVitalRouteGroup('/availability'), 'public')
})

test('reported metrics contain no URL, record, or identity value', () => {
  const result = webVitalParameters({ name: 'LCP', value: 2499.6, rating: 'good', navigationType: 'navigate' }, '/admin/invoices/secret-record')
  assert.deepEqual(result, {
    metric_name: 'LCP',
    metric_value: 2500,
    metric_rating: 'good',
    route_group: 'admin',
    within_budget: true,
    navigation_type: 'navigate',
  })
  assert.doesNotMatch(JSON.stringify(result), /secret-record|invoices|admin\/invoices/)
})

test('unknown or invalid metrics are ignored', () => {
  assert.equal(webVitalParameters({ name: 'UNKNOWN', value: 10 }, '/'), null)
  assert.equal(webVitalParameters({ name: 'LCP', value: Number.NaN }, '/'), null)
})

test('the root layout installs the browser reporter beside configured analytics', () => {
  const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
  const reporter = readFileSync(new URL('../components/WebVitalsReporter.tsx', import.meta.url), 'utf8')
  assert.match(layout, /<WebVitalsReporter \/>/)
  assert.match(reporter, /trackPublicEvent\('web_vital'/)
  assert.doesNotMatch(reporter, /email|phone|invoice|userId|camperId/)
})
