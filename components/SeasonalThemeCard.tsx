import type { SeasonalTheme } from '../lib/seasonal-theme'

export default function SeasonalThemeCard({ theme }: { theme: SeasonalTheme }) {
  return (
    <div className="seasonal-theme-card" aria-label={`${theme.label}. ${theme.detail}.`}>
      <span aria-hidden="true">{theme.symbol}</span>
      <div>
        <strong>{theme.label}</strong>
        <small>{theme.detail}</small>
      </div>
    </div>
  )
}
