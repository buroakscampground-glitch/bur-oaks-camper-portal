import { AlertTriangle, Info } from 'lucide-react'
import { emergencyBannerLevel, emergencyBannerMessage } from '../lib/emergency-banner'

export default function EmergencyBanner() {
  const message = emergencyBannerMessage(process.env.BUR_OAKS_EMERGENCY_BANNER)
  if (!message) return null
  const level = emergencyBannerLevel(process.env.BUR_OAKS_EMERGENCY_BANNER_LEVEL)
  const Icon = level === 'urgent' ? AlertTriangle : Info

  return (
    <aside className={`global-emergency-banner ${level}`} role="alert" aria-live="assertive">
      <Icon aria-hidden="true" size={21} />
      <div><strong>{level === 'urgent' ? 'Bur Oaks emergency update' : 'Bur Oaks service notice'}</strong><span>{message}</span></div>
      <a href="tel:6184887927">Call 618-488-7927</a>
    </aside>
  )
}
