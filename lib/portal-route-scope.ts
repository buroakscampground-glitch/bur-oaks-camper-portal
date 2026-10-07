const camperRouteRoots = [
  '/portal',
  '/invoices',
  '/profile',
  '/messages',
  '/campground-community',
  '/updates',
  '/documents',
  '/electric',
  '/calendar',
  '/dinners',
  '/directory',
  '/site',
]

export function isCamperOnlyPath(pathname: string) {
  if (pathname === '/maintenance' || pathname.startsWith('/maintenance/history')) return true
  return camperRouteRoots.some((path) => pathname === path || pathname.startsWith(`${path}/`))
}

export function isSharedDocumentViewerPath(pathname: string) {
  return pathname.startsWith('/documents/view/')
}
