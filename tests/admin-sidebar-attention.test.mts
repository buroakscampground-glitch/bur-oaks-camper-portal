import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('admin navigation shows live red counts for sections needing attention', async () => {
  const source = await readFile(new URL('../components/AdminChrome.tsx', import.meta.url), 'utf8')
  assert.match(source, /\/api\/admin-sidebar-attention/)
  assert.match(source, /\/api\/admin-birthdays/)
  assert.match(source, /admin-attention-badge/)
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
  assert.match(source, /'\/admin\/open-balance': \(invoiceResult\.data \|\| \[\]\)\.filter\(\(item: any\) => isOpen\(item\.status\)\)\.length/)
})

test('handled notifications, opened messages, and birthday greetings refresh badges immediately', async () => {
  const sources = await Promise.all([
    '../app/admin/notifications/page.tsx',
    '../app/admin/messages/page.tsx',
    '../app/admin/birthdays/page.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  sources.forEach((source) => assert.match(source, /dispatchEvent\(new Event\('admin-attention-changed'\)\)/))
})

test('desktop counts remain visible without requiring hover', async () => {
  const styles = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.doesNotMatch(styles, /admin-sidebar-group a:hover \.admin-attention-badge/)
  assert.doesNotMatch(styles, /admin-sidebar-group a:focus-visible \.admin-attention-badge/)
  assert.doesNotMatch(styles, /admin-sidebar-group a \.admin-attention-badge[\s\S]*?opacity: 0/)
  assert.equal((styles.match(/^\.admin-attention-badge \{/gm) || []).length, 1)
  assert.doesNotMatch(styles, /^\.admin-attention-badge \{[^}]*position: absolute/m)
})
