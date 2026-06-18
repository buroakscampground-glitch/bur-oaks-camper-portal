
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

      const role = camper?.role?.toLowerCase();

if (role === "admin") {
  window.location.href = "/admin";
} else if (role === "maintenance") {
  window.location.href = "/maintenance";
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
        minHeight: "100vh",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        padding: "20px",
        background:
          "linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.55)), url('/campground.jpg')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "520px",
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(12px)",
          borderRadius: "24px",
          padding: "45px",
          boxShadow: "0 20px 50px rgba(0,0,0,.35)",
          border: "3px solid #2f5d3a",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: "30px",
          }}
        >
          <img
            src="/bur-oaks-logo.png"
            alt="Bur Oaks Campground"
            style={{
              width: "100%",
              maxWidth: "320px",
              marginBottom: "10px",
            }}
          />

          <p
            style={{
              color: "#666",
              margin: 0,
              fontSize: "15px",
              letterSpacing: "1px",
            }}
          >
            CAMPER PORTAL
          </p>
        </div>

        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #d1d5db",
            marginBottom: "15px",
            fontSize: "15px",
          }}
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          style={{
            width: "100%",
            padding: "16px",
            borderRadius: "12px",
            border: "1px solid #d1d5db",
            marginBottom: "15px",
            fontSize: "15px",
          }}
        />

        {error && (
          <div
            style={{
              background: "#fee2e2",
              color: "#b91c1c",
              padding: "12px",
              borderRadius: "10px",
              marginBottom: "15px",
            }}
          >
            {error}
          </div>
        )}

        <button
          onClick={handleLogin}
          disabled={loading}
          style={{
            width: "100%",
            padding: "16px",
            border: "none",
            borderRadius: "12px",
            background: "#2f5d3a",
            color: "white",
            fontWeight: "bold",
            fontSize: "16px",
          }}
        >
          {loading ? "Signing In..." : "Sign In"}
        </button>

        <div
          style={{
            textAlign: "center",
            marginTop: "25px",
            color: "#777",
            fontSize: "13px",
          }}
        >
          A Site To Remember • Est. 1972
        </div>
      </div>
    </main>
  );
}
``
