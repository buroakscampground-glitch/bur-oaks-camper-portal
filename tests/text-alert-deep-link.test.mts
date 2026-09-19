import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('general operational alerts open their exact Communication Center record', async () => {
  const links = await readFile(new URL('../lib/portal-sms-links.ts', import.meta.url), 'utf8')
  const route = await readFile(new URL('../app/api/text-alerts/route.ts', import.meta.url), 'utf8')
  const updates = await readFile(new URL('../app/updates/page.tsx', import.meta.url), 'utf8')
  const loginPaths = await readFile(new URL('../lib/login-return-path.ts', import.meta.url), 'utf8')

  assert.match(links, /return '\/updates'/)
  assert.match(route, /`\/updates\?alert=\$\{encodeURIComponent\(broadcastId\)\}`/)
  assert.match(route, /\.eq\('broadcast_id', broadcastId\)/)
  assert.match(route, /\.eq\('camper_id', context\.camper\.id\)/)
  assert.match(updates, /OPENED FROM YOUR TEXT ALERT/)
  assert.match(updates, /linkedAlert\.message/)
  assert.match(updates, /login\?returnTo=/)
  assert.match(loginPaths, /'\/updates'/)
})
