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

      const { data: camper } = await supabase
        .from('campers')
        .select('role,active')
        .ilike('email', user.email)
        .single()

      const role = String(camper?.role || 'camper').toLowerCase()

      if (camper?.active === false || !allowedRolesKey.split(',').includes(role)) {
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
