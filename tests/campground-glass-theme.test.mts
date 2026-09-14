import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('camper, admin, and community workspaces share the campground scene', () => {
  const camper = source('../components/CamperChrome.tsx')
  const admin = source('../components/AdminChrome.tsx')
  const community = source('../components/CommunityChrome.tsx')

  for (const chrome of [camper, admin, community]) {
    assert.match(chrome, /className="seasonal-campground-scene" aria-hidden="true"/)
  }
})

test('the shared scene uses the Bur Oaks image and seasonal tint', () => {
  const styles = source('../app/globals.css')

  assert.match(styles, /\.seasonal-campground-scene\s*{[\s\S]*?var\(--season-deep\)[\s\S]*?url\('\/campground\.jpg'\)/)
  assert.match(styles, /\.seasonal-theme \.camper-sidebar[\s\S]*?backdrop-filter: blur\(22px\)/)
  assert.match(styles, /\.seasonal-theme \.admin-sidebar[\s\S]*?backdrop-filter: blur\(22px\)/)
})

test('financial and document surfaces remain highly opaque', () => {
  const styles = source('../app/globals.css')

  assert.match(styles, /\.seasonal-theme \.admin-billing-summary[\s\S]*?background-color: rgba\(255, 255, 252, \.94\) !important/)
  assert.match(styles, /prefers-reduced-transparency:reduce/)
})
