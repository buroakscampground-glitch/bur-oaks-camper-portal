import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('admin navigation shows live red counts for sections needing attention', async () => {
  const source = await readFile(new URL('../components/AdminChrome.tsx', import.meta.url), 'utf8')
  assert.match(source, /\/api\/admin-sidebar-attention/)
  assert.match(source, /\/api\/admin-birthdays/)
  assert.match(source, /admin-attention-badge/)
  assert.match(source, /admin-mobile-alerts/)
  assert.match(source, /Tap to see exactly what the red badge means/)
  assert.match(source, /birthdayPreview/)
  assert.match(source, /setInterval\(loadAttentionCounts, 15_000\)/)
  assert.match(source, /table: 'admin_notifications'/)
  assert.match(source, /table: 'waitlist'/)
  assert.match(source, /removeChannel\(liveChanges\)/)
  assert.match(source, /admin-attention-changed/)
  assert.doesNotMatch(source, /totalAttention/)
  assert.match(source, /attentionCount > 0/)
})

test('sidebar attention endpoint counts unresolved work by destination page', async () => {
  const source = await readFile(new URL('../app/api/admin-sidebar-attention/route.ts', import.meta.url), 'utf8')
  const destinations = [
    '/admin/notifications',
    '/admin/messages',
    '/admin/open-balance',
    '/admin/documents',
    '/admin/waitlist',
    '/admin/maintenance',
    '/admin/maintenance/supplies',
    '/admin/pump-outs',
    '/admin/site-care',
  ]
  destinations.forEach((destination) => assert.match(source, new RegExp(destination.replaceAll('/', '\\/'))))
  assert.match(source, /Cache-Control': 'no-store/)
  assert.match(source, /standaloneNotificationCount/)
  assert.match(source, /'\/admin\/open-balance': \(invoiceResult\.data \|\| \[\]\)\.filter\(\(item: any\) => isOpen\(item\.status\)\)\.length/)
})

test('birthday alerts can reach the Admin Home Screen while the app is closed', async () => {
  const [route, schedule] = await Promise.all([
    readFile(new URL('../app/api/cron/admin-birthday-alert/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../vercel.json', import.meta.url), 'utf8'),
  ])
  assert.match(route, /sendStaffWebPush/)
  assert.match(route, /admin-birthdays-/)
  assert.match(route, /admin: '\/admin\/birthdays'/)
  assert.match(route, /hour < 6 \|\| hour > 11/)
  assert.match(route, /retryLater: !delivered/)
  assert.equal((schedule.match(/\/api\/cron\/admin-birthday-alert/g) || []).length, 7)
  assert.match(schedule, /\/api\/cron\/admin-birthday-alert/)
})

test('handled notifications, opened messages, and birthday greetings refresh badges immediately', async () => {
  const sources = await Promise.all([
    '../app/admin/notifications/page.tsx',
    '../app/admin/messages/page.tsx',
    '../app/admin/birthdays/page.tsx',
    '../app/admin/pump-outs/page.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  sources.forEach((source) => assert.match(source, /dispatchEvent\(new Event\('admin-attention-changed'\)\)/))
})

test('opening pump-outs clears only its unseen alerts while service requests remain in the queue', async () => {
  const [page, endpoint] = await Promise.all([
    readFile(new URL('../app/admin/pump-outs/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin-sidebar-attention/route.ts', import.meta.url), 'utf8'),
  ])
  assert.match(page, /markPumpOutAlertsViewed\(\)/)
  assert.match(page, /\.eq\('type', 'sewer_pump_out'\)/)
  assert.match(page, /\.is\('read_at', null\)/)
  assert.match(endpoint, /'\/admin\/pump-outs': notifications\.filter\(\(item: any\) => item\.type === 'sewer_pump_out'\)\.length/)
  assert.doesNotMatch(endpoint, /isPumpOutWaitingForService/)
})

test('opening maintenance clears only unseen alerts while active tickets remain available', async () => {
  const [page, endpoint] = await Promise.all([
    readFile(new URL('../app/admin/maintenance/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin-sidebar-attention/route.ts', import.meta.url), 'utf8'),
  ])
  assert.match(page, /markAdminAlertsSeen\(supabase, 'maintenance_request'\)/)
  assert.match(page, /dispatchEvent\(new Event\('admin-attention-changed'\)\)/)
  assert.match(endpoint, /'\/admin\/maintenance': notifications\.filter\(\(item: any\) => item\.type === 'maintenance_request'\)\.length/)
  assert.doesNotMatch(endpoint, /'\/admin\/maintenance': \(maintenanceResult\.data/)
})

test('desktop counts remain visible without requiring hover', async () => {
  const styles = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.doesNotMatch(styles, /admin-sidebar-group a:hover \.admin-attention-badge/)
  assert.doesNotMatch(styles, /admin-sidebar-group a:focus-visible \.admin-attention-badge/)
  assert.doesNotMatch(styles, /admin-sidebar-group a \.admin-attention-badge[\s\S]*?opacity: 0/)
  assert.equal((styles.match(/^\.admin-attention-badge \{/gm) || []).length, 1)
  assert.doesNotMatch(styles, /^\.admin-attention-badge \{[^}]*position: absolute/m)
})
