"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function LoginPage() {
  const [loginType, setLoginType] = useState<"camper" | "admin">("camper");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleLogin() {
    setError("");

    if (!email || !password) {
      setError("Please enter both email and password.");
      return;
    }

    setLoading(true);

    try {
      const { error: authError } = await supabase.auth.signInWithPassword({
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

      const isAdmin = camper?.role?.toLowerCase() === "admin";

      if (loginType === "admin") {
        if (!isAdmin) {
          await supabase.auth.signOut();
          setError("This account does not have admin access.");
          return;
        }

        window.location.href = "/admin";
      } else {
        window.location.href = "/portal";
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        padding: "40px",
        maxWidth: "500px",
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <h1 style={{ textAlign: "center" }}>Bur Oaks Campground</h1>

      <div
        style={{
          display: "flex",
          gap: "10px",
          marginBottom: "20px",
        }}
      >
        <button
          type="button"
          onClick={() => setLoginType("camper")}
        >
          Camper Login
        </button>

        <button
          type="button"
          onClick={() => setLoginType("admin")}
        >
          Admin Login
        </button>
      </div>

      <div style={{ marginBottom: "10px" }}>
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>

      <div style={{ marginBottom: "10px" }}>
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      {error && <p style={{ color: "red" }}>{error}</p>}

      <button
        type="button"
        onClick={handleLogin}
        disabled={loading}
      >
        {loading ? "Signing In..." : "Login"}
      </button>
    </main>
  );
}