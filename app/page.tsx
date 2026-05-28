"use client"

import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export default function HomePage() {
  const [camper, setCamper] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadCamper() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data, error } = await supabase
        .from('campers')
        .select('*')
        .eq('email', user.email)
        .single()

      if (error) {
        console.error(error)
      } else {
        setCamper(data)
      }

      setLoading(false)
    }

    loadCamper()
  }, [])

  if (loading) {
    return <p style={{ padding: '40px' }}>Loading...</p>
  }

  if (!camper) {
    return <p style={{ padding: '40px' }}>No camper account found.</p>
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>Welcome {camper.first_name}</h1>

      <div
        style={{
          border: '1px solid #ccc',
          padding: '20px',
          borderRadius: '10px',
          maxWidth: '500px',
        }}
      >
        <h2>Camper Information</h2>

        <p>
          <strong>Name:</strong> {camper.first_name} {camper.last_name}
        </p>

        <p>
          <strong>Email:</strong> {camper.email}
        </p>

        <p>
          <strong>Phone:</strong> {camper.phone}
        </p>

        <p>
          <strong>Lot Number:</strong> {camper.lot_number}
        </p>
      </div>
    </main>
  )
}
