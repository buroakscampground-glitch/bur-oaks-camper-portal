export const thanksgivingDinnerDate = '2026-11-07'

export type ThanksgivingFoodOption = {
  id: string
  label: string
  limit: number
  servingGuide: string
  group: 'Traditional sides' | 'Vegetables & salads' | 'Bread & extras' | 'Desserts'
}

export const thanksgivingFoodOptions: ThanksgivingFoodOption[] = [
  { id: 'mashed-potatoes', label: 'Mashed potatoes', limit: 3, servingGuide: 'Large roaster or crockpot · about 30 servings', group: 'Traditional sides' },
  { id: 'stuffing', label: 'Stuffing or dressing', limit: 3, servingGuide: 'Large pan · about 25 servings', group: 'Traditional sides' },
  { id: 'gravy', label: 'Turkey gravy', limit: 2, servingGuide: 'Large crockpot · about 30 servings', group: 'Traditional sides' },
  { id: 'sweet-potatoes', label: 'Sweet potatoes', limit: 2, servingGuide: 'Large pan · about 25 servings', group: 'Traditional sides' },
  { id: 'mac-cheese', label: 'Macaroni & cheese', limit: 2, servingGuide: 'Large pan · about 25 servings', group: 'Traditional sides' },
  { id: 'green-beans', label: 'Green beans or green bean casserole', limit: 3, servingGuide: 'Large pan · about 25 servings', group: 'Vegetables & salads' },
  { id: 'corn', label: 'Corn', limit: 2, servingGuide: 'Large pan or crockpot · about 25 servings', group: 'Vegetables & salads' },
  { id: 'vegetable-side', label: 'Other hot vegetable side', limit: 3, servingGuide: 'Large pan · about 20 servings', group: 'Vegetables & salads' },
  { id: 'salad', label: 'Large salad', limit: 2, servingGuide: 'Large party bowl · about 20 servings', group: 'Vegetables & salads' },
  { id: 'deviled-eggs', label: 'Deviled eggs', limit: 3, servingGuide: 'Three dozen egg halves', group: 'Bread & extras' },
  { id: 'cranberry', label: 'Cranberry dish', limit: 2, servingGuide: 'Large serving dish · about 20 servings', group: 'Bread & extras' },
  { id: 'rolls', label: 'Dinner rolls', limit: 3, servingGuide: 'Three dozen rolls', group: 'Bread & extras' },
  { id: 'pie', label: 'Pies', limit: 4, servingGuide: 'Two full-size pies', group: 'Desserts' },
  { id: 'dessert', label: 'Other large dessert', limit: 2, servingGuide: 'One large dessert · about 20 servings', group: 'Desserts' },
]

export const thanksgivingFoodLabels = thanksgivingFoodOptions.map((option) => option.label)

export function thanksgivingFoodOption(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase()
  return thanksgivingFoodOptions.find((option) => option.label.toLowerCase() === normalized)
}

export function thanksgivingClaimCounts(signups: Array<{ bringing?: unknown; attending_status?: unknown; camper_id?: unknown }>, excludeCamperId = '') {
  const counts = new Map<string, number>()
  signups.forEach((signup) => {
    if (String(signup.camper_id || '') === excludeCamperId) return
    if (String(signup.attending_status || '') === 'Not Going') return
    const option = thanksgivingFoodOption(signup.bringing)
    if (!option) return
    counts.set(option.id, (counts.get(option.id) || 0) + 1)
  })
  return counts
}
