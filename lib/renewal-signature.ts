export type RenewalSignatureRecord = {
  signature_status?: string | null
  signed_at?: string | null
  signed_name?: string | null
  second_signed_name?: string | null
  requires_two_signatures?: boolean | null
  signature_record_hash?: string | null
  second_signature_record_hash?: string | null
}

export function hasSecureRenewalSignature(document?: RenewalSignatureRecord | null) {
  if (!document || String(document.signature_status || '').toLowerCase() !== 'signed') return false
  if (!String(document.signed_name || '').trim()) return false
  if (!String(document.signed_at || '').trim()) return false
  if (!String(document.signature_record_hash || '').trim()) return false
  if (document.requires_two_signatures) {
    if (!String(document.second_signed_name || '').trim()) return false
    if (!String(document.second_signature_record_hash || '').trim()) return false
  }
  return true
}
