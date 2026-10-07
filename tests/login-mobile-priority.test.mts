import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

test('mobile login puts the sign-in form before the promotional story', async () => {
  const css = await readFile(new URL('../app/globals.css', import.meta.url), 'utf8')
  assert.match(css, /@media \(max-width: 900px\)[\s\S]*?\.signin-form-side \{ order: -1;/)
})
