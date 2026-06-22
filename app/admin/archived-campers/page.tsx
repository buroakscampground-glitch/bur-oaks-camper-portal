'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '../../../lib/supabase'

export default function ArchivedCampersPage() {
  const [campers, setCampers] = useState<any[]>([])
  const [message, setMessage] = useState('')
  const [checkingAuth, setCheckingAuth] = useState(true)
  const router = useRouter()

  useEffect(() => {
    checkAdmin()
  }, [])

  async function checkAdmin() {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      window.location.href = '/login'
      return
    }

    const { data: camper } = await supabase
      .from('campers')
      .select('role')
      .or(`email.ilike.${user.email?.trim().toLowerCase()},secondary_email.ilike.${user.email?.trim().toLowerCase()}`)
      .single()

    if (
      !camper ||
      camper.role?.toLowerCase() !== 'admin'
    ) {
      window.location.href = '/portal'
      return
    }

    await loadCampers()
    setCheckingAuth(false)
  }

  async function loadCampers() {
    const { data } = await supabase
      .from('campers')
      .select('*')
      .eq('active', false)
      .order('lot_number', { ascending: true })

    setCampers(data || [])
  }

  async function restoreCamper(id: string) {
    const { error } = await supabase
      .from('campers')
      .update({ active: true })
      .eq('id', id)

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Camper restored!')
    loadCampers()
  }

  if (checkingAuth) {
    return (
      <main style={{ padding: '40px' }}>
        <h2>Checking permissions...</h2>
      </main>
    )
  }

  return (
    <main style={{ padding: '40px' }}>
      <a
  href="/admin"
  style={{
    display: 'inline-block',
    marginBottom: '20px',
    textDecoration: 'none',
    fontWeight: 'bold',
  }}
>
  ← Back to Dashboard
</a>
<button
  onClick={() => router.push('/admin')}
  style={{
    marginBottom: '20px',
    background: '#6b7280',
    color: 'white',
    border: 'none',
    padding: '10px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
  }}
>
  ← Back to Dashboard
</button>
      <h1>Archived Campers</h1>

      {message && <p>{message}</p>}

      {campers.length === 0 && (
        <p>No archived campers found.</p>
      )}

      {campers.map((camper) => (
        <div
          key={camper.id}
          style={{ marginBottom: '15px' }}
        >
          Lot {camper.lot_number} -{' '}
          {camper.first_name} {camper.last_name}

          <br />

          <button
            onClick={() =>
              restoreCamper(camper.id)
            }
          >
            Restore Camper
          </button>
        </div>
      ))}
    </main>
  )
}
