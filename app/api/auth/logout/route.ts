import { cookies } from 'next/headers'

export async function POST() {
  const cookieStore = await cookies()
  cookieStore.set({ name: 'sb-access-token', value: '', path: '/', maxAge: 0 })
  cookieStore.set({ name: 'sb-refresh-token', value: '', path: '/', maxAge: 0 })

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}
