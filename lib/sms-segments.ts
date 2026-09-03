export const SMS_SINGLE_SEGMENT_LIMIT = 160

const GSM_BASIC = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
)
const GSM_EXTENDED = new Set('^{}\\[~]|€')

const punctuationReplacements: Record<string, string> = {
  '‘': "'",
  '’': "'",
  '“': '"',
  '”': '"',
  '–': '-',
  '—': '-',
  '…': '...',
  '\u00a0': ' ',
}

export function normalizeGsmSms(value: unknown) {
  const normalized = String(value || '')
    .replace(/[‘’“”–—…\u00a0]/g, (character) => punctuationReplacements[character] || ' ')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()

  return Array.from(normalized)
    .map((character) => GSM_BASIC.has(character) || GSM_EXTENDED.has(character) ? character : '')
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
}

export function gsm7Units(value: unknown) {
  return Array.from(normalizeGsmSms(value)).reduce(
    (total, character) => total + (GSM_EXTENDED.has(character) ? 2 : 1),
    0
  )
}

function truncateGsmSms(value: string, maxUnits: number) {
  if (gsm7Units(value) <= maxUnits) return value
  if (maxUnits <= 3) return ''.padEnd(Math.max(0, maxUnits), '.')

  let result = ''
  for (const character of Array.from(value)) {
    const next = `${result}${character}`
    if (gsm7Units(`${next}...`) > maxUnits) break
    result = next
  }

  const clean = result.trim().replace(/[,:;\-]+$/, '').trim()
  return `${clean}...`
}

export function singleSegmentSms({
  message,
  url,
  action = 'View',
  brand = 'Bur Oaks account',
  includeOptOut = true,
}: {
  message: string
  url?: string
  action?: string
  brand?: string
  includeOptOut?: boolean
}) {
  const cleanBrand = normalizeGsmSms(brand)
  const cleanMessage = normalizeGsmSms(message)
  const cleanAction = normalizeGsmSms(action)
  const cleanUrl = normalizeGsmSms(url)
  const prefix = cleanBrand ? `${cleanBrand}: ` : ''
  const link = cleanUrl ? ` ${cleanAction || 'View'}: ${cleanUrl}` : ''
  const optOut = includeOptOut ? ' Reply STOP to opt out.' : ''
  // Count the complete scaffold so spaces at each boundary are included.
  // The placeholder represents the message body and is subtracted afterward.
  const reservedUnits = gsm7Units(`${prefix}X${link}${optOut}`) - 1
  const body = truncateGsmSms(cleanMessage, Math.max(0, SMS_SINGLE_SEGMENT_LIMIT - reservedUnits))
  return `${prefix}${body}${link}${optOut}`.trim()
}
