export type OperationalControlKey = 'billingCheckout' | 'renewalDecisions' | 'manualTextBroadcasts'

type Environment = Record<string, string | undefined>

const disabledValues = new Set(['0', 'false', 'off', 'disabled', 'paused'])

export function operationalFeatureEnabled(value: string | undefined) {
  return !disabledValues.has(String(value || '').trim().toLowerCase())
}

export function getOperationalControls(environment: Environment = process.env) {
  return [
    { key: 'billingCheckout' as const, label: 'Online billing checkout', enabled: operationalFeatureEnabled(environment.BUR_OAKS_BILLING_CHECKOUT_ENABLED) },
    { key: 'renewalDecisions' as const, label: 'Camper renewal decisions', enabled: operationalFeatureEnabled(environment.BUR_OAKS_RENEWAL_DECISIONS_ENABLED) },
    { key: 'manualTextBroadcasts' as const, label: 'Manual text sends', enabled: operationalFeatureEnabled(environment.BUR_OAKS_MANUAL_TEXTS_ENABLED) },
  ]
}

export function operationalControlEnabled(key: OperationalControlKey, environment: Environment = process.env) {
  return getOperationalControls(environment).find((control) => control.key === key)?.enabled !== false
}
