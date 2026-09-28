import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('mobile event totals use one aligned two-column row', async () => {
  const [page, styles] = await Promise.all([
    readFile(new URL('../app/admin/events/page.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../app/globals.css', import.meta.url), 'utf8'),
  ])

  assert.match(page, /className="admin-event-counts"/)
  assert.match(page, /<span>RSVPs<\/span>\s*<strong>/)
  assert.match(page, /<span>Going<\/span>\s*<strong>/)
  assert.match(page, /className="admin-event-delete"/)
  assert.match(styles, /\.admin-event-counts\{display:grid;grid-template-columns:repeat\(2,minmax\(110px,150px\)\)/)
  assert.match(styles, /@media\(max-width:600px\)\{\.admin-event-counts\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);width:100%\}/)
  assert.match(styles, /font-variant-numeric:tabular-nums/)
})
