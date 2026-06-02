"use client"

import { useState } from "react"
import { supabase } from "../../lib/supabase"

export default function LoginPage() {
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError("")
    setLoading(true)

    try {
      const { error: loginError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        })

      if (loginError) {
        setError(loginError.message)
        setLoading(false)
        return
      }

      const {
        data: { user },
      } = await supabase.auth.getUser()

      console.log("LOGGED IN USER:", user?.email)

      const { data: camper, error } = await supabase
        .from("campers")
        .select("role,email")
        .eq("email", user?.email || "")
        .single()

      console.log("CAMPER RECORD:", camper)
      console.log("CAMPER ERROR:", error)

      if (
        camper?.role &&
        camper.role.toLowerCase() === "admin"
      ) {
        window.location.href = "/admin"
      } else {
        window.location.href = "/"
      }

      return
    } catch (err) {
      console.error(err)
      setError("Login failed")
    }

    setLoading(false)
  }

  return (
    <main
      style={{
        padding: "40px",
        fontFamily: "Arial",
      }}
    >
      <h1>Bur Oaks Login</h1>

      <div style={{ marginBottom: "10px" }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
          style={{
            width: "300px",
            padding: "10px",
          }}
        />
      </div>

      <div style={{ marginBottom: "10px" }}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
          style={{
            width: "300px",
            padding: "10px",
          }}
        />
      </div>

      {error && (
        <p style={{ color: "red" }}>
          {error}
        </p>
      )}

      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          padding: "10px 20px",
          background: "#2f5d3a",
          color: "#fff",
          border: "none",
          borderRadius: "6px",
          cursor: "pointer",
        }}
      >
        {loading
          ? "Signing In..."
          : "Login"}
      </button>
    </main>
  )
}