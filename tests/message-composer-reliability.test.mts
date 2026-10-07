import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

test('camper and office message composers resist duplicate submissions and preserve uncertain drafts', () => {
  for (const path of ['app/messages/page.tsx', 'app/admin/messages/page.tsx']) {
    const source = read(path)

    assert.match(source, /if \(sendingRef\.current\) return/)
    assert.match(source, /sendingRef\.current = true/)
    assert.match(source, /sendingRef\.current = false/)
    assert.match(source, /Your draft is still here/)
    assert.match(source, /<form className="office-message-compose"/)
    assert.match(source, /type="submit"/)
    assert.match(source, /maxLength=\{1200\}/)
    assert.match(source, /form\?\.requestSubmit\(\)/)
    assert.match(source, /role="status" aria-live="polite"/)
  }
})

test('office bulk messages require an exact recipient-count preview before sending', () => {
  const source = read('app/admin/messages/page.tsx')

  assert.match(source, /Send this message to exactly/)
  assert.match(source, /selectedCamperIds\.length/)
  assert.match(source, /const confirmed = window\.confirm/)
  assert.match(source, /if \(!confirmed\) return/)
})
