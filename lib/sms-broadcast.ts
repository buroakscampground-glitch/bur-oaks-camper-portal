import { formatSmsPhone } from './twilio-sms.ts'

export type SmsBroadcastCandidate = {
  camper: any
  phones: string[]
}

export type SmsBroadcastRecipient = {
  camper: any
  phone: string
  matchedCamperIds: string[]
}

export function uniqueSmsBroadcastRecipients(candidates: SmsBroadcastCandidate[]) {
  const recipients = new Map<string, SmsBroadcastRecipient>()
  let candidateCount = 0

  for (const candidate of candidates) {
    for (const value of candidate.phones) {
      const phone = formatSmsPhone(value)
      if (!phone) continue

      candidateCount += 1
      const camperId = String(candidate.camper?.id || '')
      const existing = recipients.get(phone)

      if (existing) {
        if (camperId && !existing.matchedCamperIds.includes(camperId)) {
          existing.matchedCamperIds.push(camperId)
        }
        continue
      }

      recipients.set(phone, {
        camper: candidate.camper,
        phone,
        matchedCamperIds: camperId ? [camperId] : [],
      })
    }
  }

  return {
    recipients: Array.from(recipients.values()),
    candidateCount,
    duplicateCount: candidateCount - recipients.size,
  }
}

export function maskSmsPhone(value: unknown) {
  const phone = formatSmsPhone(value)
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 4 ? `***-***-${digits.slice(-4)}` : 'Phone unavailable'
}

export function validSmsBroadcastRequestId(value: unknown) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ''))
}
