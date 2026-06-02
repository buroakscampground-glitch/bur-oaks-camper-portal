'use client'

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function SetPasswordPage() {
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState('')

  async function savePassword() {
    const { error } = await supabase.auth.updateUser({
      password,
    })

    if (error) {
      setMessage(error.message)
      return
    }

    setMessage('Password saved successfully!')

    setTimeout(() => {
      window.location.href = '/login'
    }, 1500)
  }

  return (
    <main
      style={{
        padding: '40px',
        fontFamily: 'Arial',
      }}
    >
      <h1>Create Your Password</h1>

      <input
        type="password"
        placeholder="New Password"
        value={password}
        onChange={(e) =>
          setPassword(e.target.value)
        }
        style={{
          width: '300px',
          padding: '10px',
        }}
      />

      <br />
      <br />

      <button onClick={savePassword}>
        Save Password
      </button>

      {message && (
        <p>{message}</p>
      )}
    </main>
  )
}