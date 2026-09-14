import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

function source(path: string) {
  return readFileSync(new URL(path, import.meta.url), 'utf8')
}

test('camper interior pages skip repeated shell banners on phones', () => {
  const chrome = source('../components/CamperChrome.tsx')
  const styles = source('../app/globals.css')

  assert.match(chrome, /camper-workspace-interior-page/)
  assert.match(styles, /\.camper-workspace-interior-page \.camper-workspace-header[^}]*display:none/)
  assert.match(styles, /\.camper-workspace-interior-page \.camper-sidebar-feature/)
})

test('admin work pages lead with their task instead of repeated shell cards on phones', () => {
  const chrome = source('../components/AdminChrome.tsx')
  const styles = source('../app/globals.css')

  assert.match(chrome, /admin-workspace-interior-page/)
  assert.match(styles, /\.admin-workspace-interior-page \.admin-workspace-header[^}]*display:none/)
  assert.match(styles, /\.admin-workspace-interior-page \.admin-sidebar-create/)
  assert.match(styles, /\.admin-workspace-interior-page \.admin-mobile-alerts-toggle[^}]*min-height:48px/)
})

test('billing and documents retain a clear mobile page title', () => {
  const invoices = source('../app/admin/invoices/page.tsx')
  const documents = source('../app/admin/documents/page.tsx')

  assert.match(invoices, /mobile-inline-page-title[^>]*>[\s\S]*?<h1>Invoices<\/h1>/)
  assert.match(documents, /mobile-inline-page-title[^>]*>[\s\S]*?<h1>Document Center<\/h1>/)
})

test('the community workspace also removes repeated interior framing on phones', () => {
  const chrome = source('../components/CommunityChrome.tsx')
  const styles = source('../app/globals.css')

  assert.match(chrome, /community-workspace-interior-page/)
  assert.match(styles, /\.community-workspace-interior-page \.community-main>header[^}]*display:none/)
  assert.match(styles, /\.community-workspace-interior-page \.community-badge-help p[^}]*display:none/)
})
