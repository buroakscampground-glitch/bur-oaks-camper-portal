export type SupportedWebVital = 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB'

export const webVitalBudgets: Record<SupportedWebVital, number> = {
  CLS: 0.1,
  FCP: 1800,
  INP: 200,
  LCP: 2500,
  TTFB: 800,
}

export function webVitalRouteGroup(pathname: string) {
  if (pathname.startsWith('/admin')) return 'admin'
  if (pathname.startsWith('/maintenance/dashboard')) return 'maintenance_staff'
  if (pathname.startsWith('/community')) return 'community'
  if (['/portal', '/invoices', '/documents', '/messages', '/maintenance', '/profile', '/electric', '/events', '/dinners', '/thanksgiving', '/updates'].some((path) => pathname === path || pathname.startsWith(`${path}/`))) return 'camper'
  return 'public'
}

export function webVitalParameters(metric: { name: string; value: number; rating?: string; navigationType?: string }, pathname: string) {
  const name = metric.name as SupportedWebVital
  if (!(name in webVitalBudgets) || !Number.isFinite(metric.value)) return null
  const value = name === 'CLS' ? Number(metric.value.toFixed(4)) : Math.round(metric.value)
  return {
    metric_name: name,
    metric_value: value,
    metric_rating: ['good', 'needs-improvement', 'poor'].includes(metric.rating || '') ? metric.rating! : 'unknown',
    route_group: webVitalRouteGroup(pathname),
    within_budget: value <= webVitalBudgets[name],
    navigation_type: String(metric.navigationType || 'unknown').slice(0, 40),
  }
}
