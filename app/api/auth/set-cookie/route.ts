import { cookies } from 'next/headers'

export async function POST(req: Request) {
  console.log('SET COOKIE ROUTE HIT')

  try {
    const { accessToken, refreshToken, expiresAt } = await req.json()

    console.log('COOKIE DATA RECEIVED', {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      expiresAt,
    })

    const cookieStore = await cookies()

    const secure = process.env.NODE_ENV === 'production'
    const now = Math.floor(Date.now() / 1000)

    const accessMaxAge = expiresAt
      ? Math.max(0, expiresAt - now)
      : 60 * 60 * 24 * 7

    const refreshMaxAge = 60 * 60 * 24 * 30 * 6

    if (accessToken) {
      cookieStore.set({
        name: 'sb-access-token',
        value: accessToken,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure,
        maxAge: accessMaxAge,
      })
    }

    if (refreshToken) {
      cookieStore.set({
        name: 'sb-refresh-token',
        value: refreshToken,
        httpOnly: true,
        path: '/',
        sameSite: 'lax',
        secure,
        maxAge: refreshMaxAge,
      })
    }

    console.log('COOKIES SET SUCCESSFULLY')

    return new Response(
      JSON.stringify({
        ok: true,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  } catch (err) {
    console.error('SET COOKIE ERROR', err)

    return new Response(
      JSON.stringify({
        error: 'invalid request',
      }),
      {
        status: 400,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
  }
}