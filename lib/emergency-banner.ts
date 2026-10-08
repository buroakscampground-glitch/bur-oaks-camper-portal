export function emergencyBannerMessage(value: string | undefined) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, 500)
}

export function emergencyBannerLevel(value: string | undefined): 'urgent' | 'notice' {
  return String(value || '').trim().toLowerCase() === 'notice' ? 'notice' : 'urgent'
}
