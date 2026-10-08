export type LoginAccountSwitchPrompt = {
  kicker: string
  heading: string
  message: string
  staffHint: string
}

export function loginAccountSwitchPrompt(reason: unknown, returnTo: unknown): LoginAccountSwitchPrompt | null {
  if (String(reason || '') !== 'wrong-account') return null

  const requested = String(returnTo || '')
  if (requested === '/admin' || requested.startsWith('/admin/')) {
    return {
      kicker: 'BUR OAKS ADMIN',
      heading: 'Administrator sign-in required',
      message: 'Use the email and password connected to the Bur Oaks administrator account.',
      staffHint: 'After sign-in, the Admin page you requested will reopen automatically.',
    }
  }
  if (requested === '/maintenance/dashboard' || requested.startsWith('/maintenance/dashboard/')) {
    return {
      kicker: 'BUR OAKS MAINTENANCE',
      heading: 'Maintenance sign-in required',
      message: 'Use the email and password assigned to the Bur Oaks maintenance account.',
      staffHint: 'After sign-in, the maintenance page you requested will reopen automatically.',
    }
  }
  if (requested === '/community' || requested.startsWith('/community/')) {
    return {
      kicker: 'BUR OAKS COMMUNITY STAFF',
      heading: 'Community staff sign-in required',
      message: 'Use the email and password assigned to an administrator or event coordinator.',
      staffHint: 'After sign-in, the Community page you requested will reopen automatically.',
    }
  }

  return {
    kicker: 'BUR OAKS SECURE SIGN-IN',
    heading: 'A different account is required',
    message: 'Use the email and password connected to the account assigned to this workspace.',
    staffHint: 'After sign-in, the portal will open the correct workspace for this account.',
  }
}
