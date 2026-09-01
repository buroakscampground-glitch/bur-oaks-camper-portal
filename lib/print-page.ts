export function printPageWithFlag(attribute: string) {
  if (typeof window === 'undefined' || typeof document === 'undefined') return

  const body = document.body
  body.setAttribute(attribute, 'true')
  let finished = false
  let timer = 0
  const media = window.matchMedia?.('print')

  const cleanup = () => {
    if (finished) return
    finished = true
    body.removeAttribute(attribute)
    window.removeEventListener('afterprint', cleanup)
    media?.removeEventListener?.('change', onMediaChange)
    window.clearTimeout(timer)
  }
  const onMediaChange = (event: MediaQueryListEvent) => {
    if (!event.matches) cleanup()
  }

  window.addEventListener('afterprint', cleanup)
  media?.addEventListener?.('change', onMediaChange)
  timer = window.setTimeout(cleanup, 120_000)
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => window.print()))
}
