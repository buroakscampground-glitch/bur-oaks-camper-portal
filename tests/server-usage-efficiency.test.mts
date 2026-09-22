import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('high-traffic portal refreshes are visibility-aware and use a slow safety interval', () => {
  const adminChrome = read('components/AdminChrome.tsx')
  const camperBadge = read('components/CamperAttentionBadge.tsx')
  const communityChrome = read('components/CommunityChrome.tsx')
  const invoiceList = read('app/invoices/page.tsx')
  const invoiceDetail = read('app/invoices/[id]/page.tsx')

  for (const source of [adminChrome, camperBadge, communityChrome, invoiceList, invoiceDetail]) {
    assert.match(source, /document\.visibilityState === 'visible'/)
  }

  assert.match(adminChrome, /5 \* 60_000/)
  assert.match(camperBadge, /5 \* 60_000/)
  assert.match(communityChrome, /5 \* 60_000/)
  assert.match(invoiceList, /2 \* 60_000/)
  assert.match(invoiceDetail, /2 \* 60_000/)
  assert.doesNotMatch(invoiceList, /setInterval[\s\S]{0,180}, 5_000\)/)
  assert.doesNotMatch(invoiceDetail, /setInterval[\s\S]{0,180}, 5_000\)/)
})

test('birthday alert cron keeps a daylight-saving retry without running all morning', () => {
  const config = JSON.parse(read('vercel.json')) as {
    crons: Array<{ path: string; schedule: string }>
  }
  const birthdayJobs = config.crons.filter((job) => job.path === '/api/cron/admin-birthday-alert')

  assert.deepEqual(birthdayJobs, [
    { path: '/api/cron/admin-birthday-alert', schedule: '0 12 * * *' },
    { path: '/api/cron/admin-birthday-alert', schedule: '0 13 * * *' },
  ])
})

test('admin attention endpoint does not query documents that are intentionally excluded', () => {
  const route = read('app/api/admin-sidebar-attention/route.ts')

  assert.doesNotMatch(route, /from\('documents'\)/)
  assert.match(route, /'\/admin\/documents': 0/)
})
