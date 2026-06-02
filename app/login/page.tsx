"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError("");
    setLoading(true);

    try {
      const { error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError) {
        setError(authError.message);
        return;
      }

      const { data: camper } = await supabase
        .from("campers")
        .select("role")
        .eq("email", email.toLowerCase())
        .single();

      const isAdmin =
        camper?.role?.toLowerCase() === "admin";

      if (isAdmin) {
        window.location.href = "/admin";
      } else {
        window.location.href = "/portal";
      }
    } catch (err) {
      console.error(err);
      setError("Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        maxWidth: "500px",
        margin: "50px auto",
        padding: "30px",
        border: "1px solid #ddd",
        borderRadius: "10px",
      }}
    >
      <h1>Bur Oaks Campground</h1>

      <input
        type="email"
        placeholder="Email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        style={{
          width: "100%",
          padding: "10px",
          marginBottom: "10px",
        }}
      />

      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        style={{
          width: "100%",
          padding: "10px",
          marginBottom: "10px",
        }}
      />

      {error && (
        <p style={{ color: "red" }}>
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleLogin}
        disabled={loading}
        style={{
          width: "100%",
          padding: "12px",
        }}
      >
        {loading ? "Signing In..." : "Login"}
      </button>
    </main>
  );
}