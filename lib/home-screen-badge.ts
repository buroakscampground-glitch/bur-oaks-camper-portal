type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export async function syncHomeScreenBadge(count: number) {
  const badgeNavigator = navigator as BadgeNavigator

  try {
    if (count > 0 && badgeNavigator.setAppBadge) {
      await badgeNavigator.setAppBadge(count)
    } else if (count === 0 && badgeNavigator.clearAppBadge) {
      await badgeNavigator.clearAppBadge()
    }
  } catch {
    // iPhone only displays Home Screen badges after notification permission is granted.
  }
}
