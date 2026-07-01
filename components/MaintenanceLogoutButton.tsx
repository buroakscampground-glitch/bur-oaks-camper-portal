'use client'

import { LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'

export default function MaintenanceLogoutButton() {
  async function logout() {
    await supabase.auth.signOut()
    window.location.replace('/login')
  }

  return (
    <button
      type="button"
      className="maintenance-staff-logout"
      style={{
        position: 'fixed',
        top: 18,
        right: 18,
        zIndex: 60,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        minHeight: 42,
        padding: '0 16px',
        border: '1px solid rgba(255,255,255,.3)',
        borderRadius: 999,
        background: 'rgba(255,255,255,.92)',
        color: '#28432f',
        fontSize: 12,
        fontWeight: 900,
        boxShadow: '0 12px 28px rgba(31,55,39,.16)',
        backdropFilter: 'blur(10px)',
      }}
      onClick={logout}
      aria-label="Log out of maintenance portal"
    >
      <LogOut size={16} />
      Log out
    </button>
  )
}
