"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError(null);

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

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

      const { data: camper, error: camperError } =
        await supabase
          .from("campers")
          .select("role")
          .eq("email", email.toLowerCase())
          .single();

      if (camperError) {
        console.error(camperError);
      }

      if (
        camper?.role &&
        camper.role.toLowerCase() === "admin"
      ) {
        window.location.href = "/admin";
      } else {
        window.location.href = "/";
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Login failed"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        padding: "40px",
        fontFamily: "Arial, sans-serif",
        maxWidth: "400px",
        margin: "0 auto",
      }}
    >
      <h1>Bur Oaks Login</h1>

      <div style={{ marginBottom: "10px" }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            padding: "10px",
            width: "100%",
          }}
        />
      </div>

      <div style={{ marginBottom: "10px" }}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            padding: "10px",
            width: "100%",
          }}
        />
      </div>

      {error && (
        <p
          style={{
            color: "red",
            marginBottom: "15px",
          }}
        >
          {error}
        </p>
      )}

      <button
        onClick={handleLogin}
        disabled={loading}
        style={{
          padding: "10px 20px",
          background: loading
            ? "#999"
            : "#1f5130",
          color: "white",
          border: "none",
          borderRadius: "6px",
          cursor: loading
            ? "not-allowed"
            : "pointer",
        }}
      >
        {loading ? "Signing In..." : "Login"}
      </button>
    </main>
  );
}