"use client"

import { useState } from 'react'
import { supabase } from '../../lib/supabase'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleLogin() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      console.log('Logged in user:', user?.email)
      window.location.href = '/'
    }
  }

  return (
    <main style={{ padding: '40px', fontFamily: 'Arial' }}>
      <h1>Camper Login</h1>

      <div style={{ marginBottom: '10px' }}>
        <input
          type='email'
          placeholder='Email'
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{ padding: '10px', width: '300px' }}
        />
      </div>

      <div style={{ marginBottom: '10px' }}>
        <input
          type='password'
          placeholder='Password'
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{ padding: '10px', width: '300px' }}
        />
      </div>

      <button
        onClick={handleLogin}
        style={{
          padding: '10px 20px',
          background: 'black',
          color: 'white',
          border: 'none',
          borderRadius: '6px',
        }}
      >
        Login
      </button>
    </main>
  )
}
