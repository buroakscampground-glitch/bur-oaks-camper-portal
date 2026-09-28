export function camperProfileName(firstName: unknown, lastName: unknown, fallback = '') {
  return `${String(firstName || '').trim()} ${String(lastName || '').trim()}`.trim() || fallback
}

export function primaryCamperName(camper: any, fallback = 'Primary camper') {
  return camperProfileName(camper?.first_name, camper?.last_name, fallback)
}

export function secondaryCamperName(camper: any, fallback = 'Second camper') {
  return camperProfileName(camper?.second_profile_first_name, camper?.second_profile_last_name, fallback)
}

export function camperHouseholdName(camper: any, separator = ' & ') {
  const names = [
    camperProfileName(camper?.first_name, camper?.last_name),
    camperProfileName(camper?.second_profile_first_name, camper?.second_profile_last_name),
  ].filter(Boolean)
  return Array.from(new Set(names)).join(separator) || 'Camper'
}

function phoneKey(value: unknown) {
  return String(value || '').replace(/\D/g, '')
}

export function labeledCamperPhones(camper: any) {
  const primaryName = primaryCamperName(camper)
  const secondaryName = secondaryCamperName(camper)
  const candidates = [
    { key: 'primary', name: primaryName, label: `${primaryName}'s mobile number`, phone: String(camper?.phone || '').trim() },
    { key: 'secondary', name: secondaryName, label: `${secondaryName}'s mobile number`, phone: String(camper?.second_profile_phone || '').trim() },
    { key: 'alternate', name: primaryName, label: `${primaryName}'s additional phone`, phone: String(camper?.alternate_phone || '').trim() },
  ].filter((item) => item.phone)

  const seen = new Set<string>()
  return candidates.filter((item) => {
    const normalized = phoneKey(item.phone) || item.phone
    if (seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}
