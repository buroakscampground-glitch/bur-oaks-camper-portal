import type { CSSProperties } from 'react'

type BadgeKind = 'status' | 'priority'

const statusColors: Record<string, string> = {
  Open: '#6b7280',
  'In Progress': '#2563eb',
  'Waiting Parts': '#f97316',
  Completed: '#16a34a',
}

const priorityColors: Record<string, string> = {
  Low: '#16a34a',
  Normal: '#2563eb',
  High: '#f97316',
  Emergency: '#dc2626',
}

const badgeStyle: CSSProperties = {
  display: 'inline-block',
  color: '#fff',
  padding: '4px 10px',
  borderRadius: '999px',
  fontSize: '12px',
  fontWeight: 700,
  lineHeight: 1.4,
}

export function MaintenanceBadge({
  kind,
  value,
}: {
  kind: BadgeKind
  value?: string | null
}) {
  const label = value || (kind === 'priority' ? 'Normal' : 'Open')
  const colors = kind === 'status' ? statusColors : priorityColors

  return (
    <span style={{ ...badgeStyle, background: colors[label] || '#6b7280' }}>
      {label}
    </span>
  )
}
