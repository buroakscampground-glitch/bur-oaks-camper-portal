import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getPlatformAssurance } from '../lib/platform-assurance.ts'

const page = readFileSync(new URL('../app/admin/system-health/page.tsx', import.meta.url), 'utf8')
const route = readFileSync(new URL('../app/api/admin-operations/route.ts', import.meta.url), 'utf8')
const retention = readFileSync(new URL('../docs/operations/data-protection-and-retention.md', import.meta.url), 'utf8')

test('platform assurance exposes no raw secrets and reports only safe configuration state', () => {
  const assurance = getPlatformAssurance('2026-10-08', {
    NEXT_PUBLIC_GA_MEASUREMENT_ID: 'G-TEST123',
    VERCEL_GIT_COMMIT_SHA: 'abcdef1234567890',
  } as NodeJS.ProcessEnv)

  assert.equal(assurance.monitoring.find((item) => item.key === 'performance')?.status, 'active')
  assert.match(assurance.monitoring.find((item) => item.key === 'release')?.detail || '', /abcdef123456/)
  assert.doesNotMatch(JSON.stringify(assurance), /G-TEST123/)
})

test('dated recovery evidence becomes a visible review item after the quarterly deadline', () => {
  const current = getPlatformAssurance('2027-01-08', {} as NodeJS.ProcessEnv)
  const overdue = getPlatformAssurance('2027-01-09', {} as NodeJS.ProcessEnv)
  assert.ok(current.protection.slice(0, 3).every((item) => item.status === 'protected'))
  assert.ok(overdue.protection.slice(0, 3).every((item) => item.status === 'review'))
})

test('System Health shows monitoring, recovery, and the archive-first policy', () => {
  assert.match(route, /platformAssurance: getPlatformAssurance/)
  assert.match(page, /What protects the campground platform/)
  assert.match(page, /Monitoring coverage/)
  assert.match(page, /Data protection/)
  assert.match(retention, /does not automatically\s+delete camper, billing, payment/)
  assert.match(retention, /never cascade through financial or signed/)
})
