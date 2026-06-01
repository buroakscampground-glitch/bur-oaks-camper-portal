import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { createServerClient } from '@supabase/auth-helpers-nextjs'

export async function requireAdminUser() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    redirect('/login')
  }

  const supabase = createServerClient(
    supabaseUrl,
    supabaseKey,
    {
      cookies: {
        getAll: async () => {
          const cookieStore = await cookies()
          return cookieStore.getAll().map((cookie) => ({
            name: cookie.name,
            value: cookie.value,
            options: {},
          }))
        },
      },
    }
  )

  const {
    data: { session },
    error: authError,
  } = await supabase.auth.getSession()

  if (authError || !session?.user?.email) {
    redirect('/login')
  }

  const { data: camper, error } = await supabase
    .from('campers')
    .select('role')
    .eq('email', session.user.email)
    .single()

  if (error || camper?.role !== 'admin') {
    redirect('/login')
  }

  return camper
}
