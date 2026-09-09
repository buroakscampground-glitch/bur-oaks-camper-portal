import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('admin navigation shows live red counts for sections needing attention', async () => {
  const source = await readFile(new URL('../components/AdminChrome.tsx', import.meta.url), 'utf8')
  assert.match(source, /\/api\/admin-sidebar-attention/)
  assert.match(source, /\/api\/admin-birthdays/)
  assert.match(source, /admin-attention-badge/)
  assert.match(source, /setInterval\(loadAttentionCounts, 30_000\)/)
  assert.match(source, /admin-attention-changed/)
  assert.match(source, /totalAttention/)
})

test('sidebar attention endpoint counts unresolved work by destination page', async () => {
  const source = await readFile(new URL('../app/api/admin-sidebar-attention/route.ts', import.meta.url), 'utf8')
  const destinations = [
    '/admin/notifications',
    '/admin/messages',
    '/admin/open-balance',
    '/admin/documents',
    '/admin/maintenance',
    '/admin/maintenance/supplies',
    '/admin/pump-outs',
    '/admin/site-care',
  ]
  destinations.forEach((destination) => assert.match(source, new RegExp(destination.replaceAll('/', '\\/'))))
  assert.match(source, /Cache-Control': 'no-store/)
})

test('handled notifications, opened messages, and birthday greetings refresh badges immediately', async () => {
  const sources = await Promise.all([
    '../app/admin/notifications/page.tsx',
    '../app/admin/messages/page.tsx',
    '../app/admin/birthdays/page.tsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')))
  sources.forEach((source) => assert.match(source, /dispatchEvent\(new Event\('admin-attention-changed'\)\)/))
})
