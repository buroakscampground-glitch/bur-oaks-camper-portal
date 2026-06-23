'use client'

import { useEffect, useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function RoleGuard({
  allowedRoles,
  children,
}: {
  allowedRoles: string[]
  children: React.ReactNode
}) {
  const [allowed, setAllowed] = useState(false)
  const allowedRolesKey = allowedRoles.join(',')

  useEffect(() => {
    async function checkRole() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user?.email) {
        window.location.replace('/login')
        return
      }

      const userEmail = user.email.trim().toLowerCase()
      const { data: camper } = await supabase
        .from('campers')
        .select('role,active')
        .or(`email.ilike.${userEmail},secondary_email.ilike.${userEmail}`)
        .maybeSingle()

      const role = String(camper?.role || '').toLowerCase()

      if (!role || camper?.active === false) {
        window.location.replace('/login')
        return
      }

      if (!allowedRolesKey.split(',').includes(role)) {
        window.location.replace(role === 'camper' ? '/portal' : '/login')
        return
      }

      setAllowed(true)
    }

    checkRole()
  }, [allowedRolesKey])

  if (!allowed) {
    return (
      <main className="page">
        <div className="admin-command-loading">
          <ShieldCheck size={34} />
          <p>Checking permissions…</p>
        </div>
      </main>
    )
  }

  return <>{children}</>
}
