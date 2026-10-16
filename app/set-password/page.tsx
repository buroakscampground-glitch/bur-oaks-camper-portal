import SetPasswordForm from './password-form'

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function single(value: string | string[] | undefined) {
  return typeof value === 'string' ? value : ''
}

export default async function SetPasswordPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const tokenHash = single(params.token_hash).trim()
  const requestedType = single(params.type)
  const type = requestedType === 'invite' || requestedType === 'recovery'
    ? requestedType
    : null

  const error = single(params.error)
  const initialMessage = error === 'password-mismatch'
    ? 'The passwords did not match. Please reopen the newest email and try again.'
    : error
      ? 'This setup link is invalid or expired. Please ask the Bur Oaks office for a fresh setup link.'
      : ''

  return (
    <SetPasswordForm
      initialToken={tokenHash && type ? { tokenHash, type } : null}
      initialMessage={initialMessage}
    />
  )
}
