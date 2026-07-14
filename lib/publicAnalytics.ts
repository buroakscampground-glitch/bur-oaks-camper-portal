type AnalyticsWindow = Window & {
  gtag?: (command: string, eventName: string, parameters?: Record<string, string | number | boolean>) => void
}

export function trackPublicEvent(eventName: string, parameters: Record<string, string | number | boolean> = {}) {
  if (typeof window === 'undefined') return
  ;(window as AnalyticsWindow).gtag?.('event', eventName, parameters)
}
