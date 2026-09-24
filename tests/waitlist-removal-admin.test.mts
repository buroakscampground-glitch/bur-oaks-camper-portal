import assert from 'node:assert/strict'
import test from 'node:test'
import { readFile } from 'node:fs/promises'

test('email waitlist removals have a dedicated admin workflow', async () => {
  const [manageRoute, removalPage, adminChrome, sidebarRoute] = await Promise.all([
    readFile(new URL('../app/api/waitlist/manage/route.ts', import.meta.url), 'utf8'),
    readFile(new URL('../app/admin/waitlist-removals/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../components/AdminChrome.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/api/admin-sidebar-attention/route.ts', import.meta.url), 'utf8'),
  ])

  assert.match(manageRoute, /type: 'waitlist_removal'/)
  assert.match(manageRoute, /Yes, I am no longer interested/)
  assert.match(removalPage, /only people who used the No Longer Interested option/i)
  assert.match(adminChrome, /Waitlist Opt-Outs/)
  assert.match(sidebarRoute, /\/admin\/waitlist-removals/)
})
