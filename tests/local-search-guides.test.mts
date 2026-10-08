import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const guidePages = [
  'seasonal-camping-near-st-louis',
  'seasonal-camping-near-edwardsville-il',
  'annual-rv-sites-metro-east',
  'members-only-seasonal-camping',
]

test('local camping guides use real-photo, visit, FAQ, and structured-data proof', async () => {
  const component = await readFile(new URL('../components/LocalGuideTrust.tsx', import.meta.url), 'utf8')
  assert.match(component, /'@type': 'BreadcrumbList'/)
  assert.match(component, /'@type': 'FAQPage'/)
  assert.match(component, /JSON\.stringify\(schema\)\.replace\(\/<\/g/)
  assert.match(component, /IMG_7996\.jpeg/)
  assert.match(component, /IMG_8008\.jpeg/)
  assert.match(component, /IMG_8012\.jpeg/)
  assert.match(component, /10303 Oaks Road, Alhambra, IL 62001/)
  assert.match(component, /google\.com\/maps\/dir/)
  assert.match(component, /Request a campground tour/)

  for (const path of guidePages) {
    const source = await readFile(new URL(`../app/${path}/page.tsx`, import.meta.url), 'utf8')
    assert.match(source, /LocalGuideTrust/)
    assert.match(source, /const questions = \[/)
    assert.match(source, /pagePath=/)
    assert.match(source, /questions=\{questions\}/)
  }
})
