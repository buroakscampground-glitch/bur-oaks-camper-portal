export async function generatePortalSetupUrl(admin: any, email: string, origin: string) {
  let linkResult = await admin.auth.admin.generateLink({
    type: 'invite',
    email,
    options: { redirectTo: `${origin}/set-password` },
  })

  if (linkResult.error) {
    linkResult = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${origin}/set-password` },
    })
  }

  const properties = linkResult.data?.properties
  const tokenHash = properties?.hashed_token
  const verificationType = properties?.verification_type
  const setupUrl = tokenHash && verificationType
    ? `${origin}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=${encodeURIComponent(verificationType)}`
    : ''

  if (linkResult.error || !setupUrl) {
    throw new Error(linkResult.error?.message || 'Unable to create setup link.')
  }

  return setupUrl
}
